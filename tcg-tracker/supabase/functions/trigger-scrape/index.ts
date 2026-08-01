import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') || 'https://tcg-tracker-kappa.vercel.app')
  .split(',')
  .map((o) => o.trim())

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // AUTHORISATION, not just authentication. getUser() proves only that *some*
    // valid Supabase JWT was presented, never whose — and public signup is
    // enabled, so anyone can obtain one. Without this check any self-registered
    // account could dispatch a GitHub Actions workflow on demand: unbounded CI
    // minutes, and forced scraper traffic to third-party shops from the
    // operator's runner IP, which is the burst profile the 2026-07-04 mass
    // auto-disable was attributed to.
    //
    // `admins` is the server-side notion of "the operator" (migration 033).
    // VITE_ALLOWED_EMAIL is inlined into the client bundle and is invisible here.
    // The self-read policy means a non-admin gets no rows rather than an error,
    // so absence is the denial.
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!adminRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { store_id, run_id } = await req.json()
    if (!store_id) {
      return new Response(JSON.stringify({ error: 'store_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Trigger GitHub Actions workflow
    const githubPat = Deno.env.get('GITHUB_PAT')
    const githubRepo = Deno.env.get('GITHUB_REPO') // format: owner/repo

    if (!githubPat || !githubRepo) {
      return new Response(JSON.stringify({ error: 'GitHub integration not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const dispatchRes = await fetch(
      `https://api.github.com/repos/${githubRepo}/actions/workflows/scraper.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            store_id,
            run_id: run_id ?? '',
          },
        }),
      }
    )

    if (!dispatchRes.ok) {
      const errorText = await dispatchRes.text()
      return new Response(JSON.stringify({ error: `GitHub dispatch failed: ${errorText}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, run_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
