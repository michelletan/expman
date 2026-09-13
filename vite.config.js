import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // GitHub Pages serves a project site at
  // https://<username>.github.io/<repo-name>/ — every asset path Vite
  // generates has to be prefixed with that repo name, or the deployed
  // page loads a blank white screen (assets requested from "/" 404
  // instead of "/<repo-name>/"). Assumes the GitHub repo will be named
  // "expman" — update this if you create it under a different name.
  base: '/expman/',
})
