// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves project sites (repo not named <user>.github.io) from
// https://<user>.github.io/<repo>/, so site + base must match the repo name.
export default defineConfig({
  site: 'https://redfearn-group.github.io',
  base: '/civic-log',
});
