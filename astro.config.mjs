import { defineConfig, fontProviders } from 'astro/config';

// Absolute URLs (canonical, Open Graph) need the public origin. On Vercel the production URL is
// picked up automatically; set SITE_URL once the client's own domain is live.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = process.env.SITE_URL ?? (vercel ? `https://${vercel}` : 'http://localhost:4321');

const poppins = (weight) => ({ src: [`./src/assets/fonts/poppins-${weight}.woff2`], weight, style: 'normal' });

export default defineConfig({
  site,
  // The stylesheet is small: inlined, the first paint needs no extra round trip.
  build: { inlineStylesheets: 'always' },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Poppins',
      cssVariable: '--font-sans',
      fallbacks: ['system-ui', 'sans-serif'],
      options: { variants: [poppins('400'), poppins('600'), poppins('800')] },
    },
  ],
});
