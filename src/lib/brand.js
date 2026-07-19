// Single source of truth for every user-facing brand string — see
// PROJECT.md's PickleKing Branding section. Every component that shows the
// app name, tagline, or footer text imports from here instead of
// hardcoding it, so a future white-label edition, custom logo, or
// club-branded variant only needs to swap this file (plus a logo asset) —
// no component logic changes. Color theming (including a future dark mode)
// already has its own seam: every color in styles.js reads from CSS custom
// properties (--color-*), not hardcoded values, so a themed/branded variant
// swaps those instead of this file.
export const APP_NAME = "PickleKing";
export const TAGLINE = "Everything a pickleball club needs in one platform.";
export const FOOTER_TEXT = "Powered by CONNECT.PH";
