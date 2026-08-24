// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // the site's canonical origin — used for absolute share-card and canonical URLs.
  // troylabs.vc redirects here at the DNS/Vercel level (decision 2026-08-24).
  site: 'https://usctroylabs.com',
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [react()]
});