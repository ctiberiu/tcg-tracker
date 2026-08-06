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

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react(), tailwindcss(), sitemapPlugin()],
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