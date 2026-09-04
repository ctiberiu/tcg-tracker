/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { renderSitemap } from './src/lib/sitemap';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Emits dist/sitemap.xml from the route registry at build time.
//
// It has to be a REAL FILE in the build output, not a route. Vercel serves
// static files from the output directory before applying the vercel.json
// rewrites, so a file here escapes the catch-all
// `/((?!storybook).*) -> /index.html`. That catch-all is why /robots.txt used
// to answer HTTP 200 with the SPA shell and `content-type: text/html` — present
// by status code, useless to a crawler — and it is why robots.txt lives in
// public/ today.
//
// `emitFile` rather than writing into public/: public/ is checked in, and a
// generated file sitting in a checked-in directory invites someone to edit it
// by hand, which is the exact failure the "generate it" requirement exists to
// prevent. This way the only copy is built.
//
// `apply: 'build'` — `vite dev` does not run generateBundle, so /sitemap.xml is
// a 404 in the dev server. That is a real gap in local verification and the
// reason the acceptance check below fetches from a `vite preview` of dist/
// rather than from the dev server.
function sitemapPlugin() {
  return {
    name: 'packradar-sitemap',
    apply: 'build' as const,
    generateBundle(this: { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap() });
    },
  };
}

/**
 * Emits dist/version.json naming the hashed entry bundle, so a running app can
 * tell whether it is out of date.
 *
 * ── Why this is needed at all ────────────────────────────────────────────────
 * An installed iOS web app is not a browser tab. iOS suspends and RESTORES it
 * rather than reloading, so a phone can keep executing the bundle it was
 * installed with across days of use — through as many deploys as happen in that
 * time. Nothing in the normal web update model applies: there is no navigation
 * to trigger a fetch, and the user has no reload button.
 *
 * This was not theoretical. Two fixes to the notification-tap path were shipped,
 * verified live on the server, and still failed on the device — the most likely
 * reason being that the phone was never running either of them.
 *
 * The version is the ENTRY CHUNK'S CONTENT HASH, not a build timestamp. A
 * timestamp changes on every build, so a rebuild with identical output would
 * reload every installed app for nothing. The hash changes only when the code
 * does, which is exactly when a reload is warranted.
 *
 * Emitted as a real file for the same reason sitemap.xml and robots.txt are:
 * Vercel serves static files from the output directory BEFORE applying the
 * vercel.json catch-all rewrite, so this escapes `/(.*) -> /index.html`. Fetched
 * as JSON, it would otherwise return the SPA shell and never parse.
 */
function versionPlugin() {
  return {
    name: 'packradar-version',
    apply: 'build' as const,
    generateBundle(
      this: { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void },
      _options: unknown,
      bundle: Record<string, { type: string; isEntry?: boolean; fileName: string }>,
    ) {
      const entry = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry)
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: entry?.fileName ?? 'unknown' }),
      })
    },
  }
}

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react(), tailwindcss(), sitemapPlugin(), versionPlugin()],
  test: {
    projects: [
      // Node-environment project. Added ALONGSIDE the browser/Storybook project
      // below rather than replacing it — they need different environments and
      // neither can host the other's tests.
      //
      // This is what was missing: the scraper's logic is already pure and
      // exported (classifyOutcome, applyFailureOutcome, capOnePerDomain,
      // resolveAlertChannel, the digest selectors), but there was nowhere for a
      // plain .test.js to run, so assertions were written as throwaway scripts
      // and discarded. Roughly nine of them. The barrier was config, not design.
      //
      // `scraper/` is a separate package with its own package.json and no vitest
      // of its own, but it is plain ESM with no build step, so this project can
      // load its files directly. Tests live next to the code they cover.
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['scraper/**/*.test.{js,mjs,ts}', 'src/**/*.node.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        plugins: [
        // The plugin will run tests for the stories defined in your Storybook config
        // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
        storybookTest({
          configDir: path.join(dirname, '.storybook')
        })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{
              browser: 'chromium'
            }]
          }
        }
      },
    ]
  }
});