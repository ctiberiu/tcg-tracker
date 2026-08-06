import type { Preview } from '@storybook/react-vite'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    },

    // The app is a dark-only neon design (see src/index.css) — match Storybook's
    // own canvas to it so components aren't previewed against a mismatched grey.
    backgrounds: {
      default: 'app',
      values: [{ name: 'app', value: 'oklch(0.16 0.045 300)' }],
    },
  },
};

export default preview;