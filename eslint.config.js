// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([globalIgnores(['dist']), {
  files: ['**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    reactHooks.configs.flat.recommended,
    reactRefresh.configs.vite,
  ],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
  },
}, {
  // The scraper is plain .js, so the block above — scoped to **/*.{ts,tsx} — never
  // matched it. `npx eslint scraper/scraper.js` reported zero problems because ZERO
  // RULES APPLIED, not because it was clean, and that false all-clear let a
  // ReferenceError run in production: commit() read `complete` from a scope it never
  // had, throwing on every SUCCESSFUL scrape and leaving the staleness sweep dead for
  // every store. node --check cannot catch it — the code is syntactically valid.
  //
  // Node AND browser globals, both deliberately. Large parts of this file are
  // page.evaluate() callbacks whose bodies execute in the page, not in Node, so
  // `window`/`document` are legitimately defined there — they accounted for 36 of the
  // 38 problems a Node-only config reported. Merging both costs the ability to catch
  // a browser global misused on the Node side, which is a far cheaper miss than
  // having no no-undef at all. The bug that motivated this is still caught, because
  // `complete` is a global in neither environment.
  files: ['scraper/**/*.js'],
  extends: [js.configs.recommended],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: { ...globals.node, ...globals.browser },
  },
}, ...storybook.configs["flat/recommended"]])
