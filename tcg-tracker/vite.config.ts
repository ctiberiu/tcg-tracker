/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react(), tailwindcss()],
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