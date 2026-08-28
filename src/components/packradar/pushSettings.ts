/**
 * The channel anything on the page uses to open the push settings sheet.
 *
 * A custom DOM event rather than context or a store: there is exactly one
 * listener (PushPrompt, mounted once in App.tsx) and a handful of publishers
 * scattered across unrelated components — the footer today, plausibly a game
 * page CTA later. The alternative is drilling an opener callback through routes
 * that have nothing to do with notifications.
 *
 * Split out of PushPrompt.tsx because a module that exports both a component and
 * plain functions breaks React Fast Refresh — the whole module reloads and the
 * component's state is lost on every edit. Same reason filterStyles.ts and
 * adminKit.ts sit beside their components rather than inside them.
 */
export const OPEN_PUSH_SETTINGS_EVENT = 'packradar:open-push-settings'

export function openPushSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_PUSH_SETTINGS_EVENT))
}
