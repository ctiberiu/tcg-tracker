import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(u: string): string {
  try {
    const p = new URL(u)
    return p.protocol === 'http:' || p.protocol === 'https:' ? u : '#'
  } catch {
    return '#'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!gmailUser || !gmailPass) {
    return res.status(500).json({ error: 'Email not configured (set GMAIL_USER and GMAIL_APP_PASSWORD in Vercel)' })
  }
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  // Require an authenticated admin: verify the caller's Supabase access token.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Only send to an actual subscriber (RLS lets the authenticated admin read this).
  const { data: sub } = await supabase
    .from('subscribers')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  if (!sub) {
    return res.status(403).json({ error: 'That email is not a subscriber' })
  }

  // All in-stock products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('store_name, title, price, url')
    .eq('in_stock', true)
    .order('store_name')
    .order('title')
  if (prodErr) {
    return res.status(500).json({ error: prodErr.message })
  }

  const list = products ?? []
  const rows = list
    .map(
      (p) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(p.store_name ?? '')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">
        <a href="${safeUrl(p.url ?? '#')}" style="color:#0066cc;text-decoration:none">${escapeHtml(p.title ?? '')}</a>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">
        ${p.price != null ? `${Number(p.price).toFixed(2)} RON` : 'N/A'}
      </td>
    </tr>`
    )
    .join('\n')

  const html = `
    <h2 style="font-family:sans-serif;color:#333">🃏 TCG Tracker — TEST email (${list.length} in stock)</h2>
    <p style="font-family:sans-serif;color:#666;font-size:13px">This is a test of your stock alerts. It lists every product currently in stock.</p>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Store</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Product</th>
          <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    })
    await transporter.sendMail({
      from: `TCG Tracker <${gmailUser}>`,
      to: email,
      subject: `TCG Tracker: TEST — ${list.length} products in stock`,
      html,
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send email' })
  }

  return res.status(200).json({ ok: true, count: list.length })
}
