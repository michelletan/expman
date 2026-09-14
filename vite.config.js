import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    // README.md/TODO.md have called this an "installable PWA, fully
    // usable offline" since the start — this is what actually makes
    // that true. Without a manifest (display: 'standalone') + service
    // worker, "Add to Home Screen" just bookmarks the page, which opens
    // in a normal browser tab instead of launching standalone.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ExpMan',
        short_name: 'ExpMan',
        description: 'A local-first, offline budget tracker.',
        start_url: '.',
        display: 'standalone',
        background_color: '#F6EEDD',
        theme_color: '#1C2333',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // The two Google Fonts requests in index.html are cross-origin —
        // Workbox doesn't cache those by default, so without this the
        // display font silently reverts to the fallback stack offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  // GitHub Pages serves a project site at
  // https://<username>.github.io/<repo-name>/ — every asset path Vite
  // generates has to be prefixed with that repo name, or the deployed
  // page loads a blank white screen (assets requested from "/" 404
  // instead of "/<repo-name>/"). Assumes the GitHub repo will be named
  // "expman" — update this if you create it under a different name.
  base: '/expman/',
  // Svelte 5 ships separate browser/server builds; without this,
  // component tests under vitest resolve the server build even inside
  // jsdom, and mounting fails. Scoped to test runs only so it can't
  // affect how `dev`/`build` resolve things.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js']
  }
})
