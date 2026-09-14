// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // the site's canonical origin — used for absolute share-card and canonical URLs.
  // troylabs.vc redirects here at the DNS/Vercel level (decision 2026-08-24).
  site: 'https://usctroylabs.com',
  // /portal was the placeholder gate while the alumni portal was being built (Charlotte Chang's
  // troylabs-alumni-network). The footer now links there directly; this keeps any shared or indexed
  // /portal link landing on the real thing.
  redirects: { '/portal': 'https://troylabs-alumni-network.vercel.app' },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [react()]
});