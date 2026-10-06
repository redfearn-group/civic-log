// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves project sites under the user site's custom domain:
// https://redfearn.group/<repo>/, so base must match the repo name.
export default defineConfig({
  site: 'https://redfearn.group',
  base: '/civic-log',
});
