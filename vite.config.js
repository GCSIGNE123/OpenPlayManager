import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injects the SW registration script into index.html at build time —
      // no changes needed in src/main.jsx to wire this up
      injectRegister: "auto",
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
      ],
      // keep in sync with src/lib/brand.js (APP_NAME/TAGLINE) — vite.config.js
      // runs outside the app bundle, so this is a second duplicate of it
      manifest: {
        name: "PickleKing",
        short_name: "PickleKing",
        description: "Everything a pickleball club needs in one platform. Powered by CONNECT.PH.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // CONNECT.PH brand palette (keep in sync with styles.js's
        // --color-primary / --color-bg)
        theme_color: "#16355E",
        background_color: "#F5F7FA",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // precache the built app shell (JS/CSS/HTML) and static assets so
        // the app can still open with no connection; navigateFallback
        // serves the cached shell for any in-app navigation while offline
        // (the app has no server-side routes — everything past the shell
        // is client-side state, so this is enough for the whole app)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Google Fonts stylesheet — small, changes rarely, safe to
            // cache-first so offline loads don't wait on (or fail without)
            // the network
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // the actual font files themselves
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // deliberately no runtime caching rule for Supabase requests —
          // session/score data must always come from the network when
          // available, never served stale from cache
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
