import type { ReactNode } from 'react'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { NavBar, PageHeader, PackRadarFooter, MobileTabBar } from '../components/packradar'

const LAST_UPDATED = '30 JUL 2026'

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--pr-signal)',
          letterSpacing: 1.5,
          margin: '0 0 12px',
          paddingBottom: 8,
          borderBottom: '1px solid var(--pr-border)',
        }}
      >
        {label}
      </h2>
      {children}
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--pr-text-mid)', margin: '0 0 12px' }}>
      {children}
    </p>
  )
}

/** Inline emphasis for the claims a reader most needs to be able to trust. */
function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: 'var(--pr-text-bright)', fontWeight: 700 }}>{children}</strong>
}

export function PrivacyPage() {
  useDocumentMeta({
    title: 'Privacy policy | PackRadar',
    description: 'How PackRadar handles data, analytics and email subscriptions.',
    path: '/privacy',
  })

  return (
    <div className="packradar pr-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <NavBar active="landing" />

      <PageHeader
        title="Privacy"
        crumbCurrent="PRIVACY"
        meta={`LAST UPDATED ${LAST_UPDATED} · COOKIELESS ANALYTICS · NO CONSENT BANNER`}
      />

      <div style={{ padding: '0 var(--pr-gutter)', flex: 1 }}>
        <div style={{ maxWidth: 760 }}>
          <P>
            PackRadar tracks trading-card-game stock across Romanian retailers. This page describes
            everything the site collects and why. It is short because the site collects very little.
          </P>

          <Section label="ANALYTICS">
            <P>
              We use Vercel Web Analytics to count page views and see which parts of the site get
              used. It is <Strong>cookieless</Strong> — it sets no cookies and writes nothing to your
              device. Visitors are counted using a hash derived from the incoming request, which is{' '}
              <Strong>discarded after 24 hours</Strong> and cannot be used to identify you or to
              follow you across other websites.
            </P>
            <P>
              What we see is aggregated: counts and trends, never an individual browsing history.
              Because nothing is stored on your device and no personal data is collected, no consent
              banner is legally required — so we do not show one.
            </P>
          </Section>

          <Section label="CLICK EVENTS">
            <P>
              Alongside page views we record exactly one custom event,{' '}
              <code style={{ color: 'var(--pr-text-bright)' }}>outbound_click</code>, when you click
              through from a signal to a retailer's site. It records three things: which store you
              went to, which game the product belongs to, and whether that product was in stock at
              the time.
            </P>
            <P>
              It records <Strong>no product title, no product URL, and no identifier for you</Strong>.
              Its only purpose is to tell us which stores and which games are actually useful to
              people.
            </P>
          </Section>

          <Section label="EMAIL">
            <P>
              PackRadar can send restock alert emails. There is{' '}
              <Strong>no signup form on this site</Strong> and no email address is ever collected
              from visitors. Addresses are added manually by the operator through an authenticated
              admin area.
            </P>
            <P>
              For each one we store the address, whether it is active, and the date it was added.
              Nothing else — no name, no tracking, no open or click logging. As of the date at the
              top of this page, sending is gated to a non-production mode and the audience is the
              operator plus two testers.
            </P>
          </Section>

          <Section label="RETAILER DATA">
            <P>
              The substance of PackRadar is publicly available stock and price information, collected
              automatically from retailer websites: product titles, prices, availability and links.
            </P>
            <P>
              That data is <Strong>about products, not people</Strong>. Nothing behind a login, and
              no customer or account data, is collected from those sites.
            </P>
          </Section>

          <Section label="YOUR RIGHTS">
            <P>
              Under the GDPR you can ask what personal data we hold about you, ask for it to be
              deleted, or object to it being processed. Write to the address below and we will action
              it.
            </P>
            <P>
              In practice the only personal data PackRadar holds is an email address, and only if the
              operator added yours to the alert list. Analytics data is anonymous and aggregated, so
              there is nothing in it to identify, export or delete for any one person.
            </P>
          </Section>

          <Section label="CONTACT">
            <P>
              Questions or data requests:{' '}
              <a href="mailto:hello@packradar.info" style={{ color: 'var(--pr-signal)' }}>
                hello@packradar.info
              </a>
            </P>
          </Section>
        </div>
      </div>

      <PackRadarFooter />
      <MobileTabBar active="landing" />
    </div>
  )
}
