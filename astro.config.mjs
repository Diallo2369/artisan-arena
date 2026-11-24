import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Adresse définitive du site, à fournir au moment de la publication (variable SITE_URL).
// Sans elle, le site se construit sans plan du site ni adresses canoniques, et toutes les pages portent « noindex ».
const SITE_URL = process.env.SITE_URL || "";

// Pages jamais proposées aux moteurs : la recherche et les fiches (calculées dans le navigateur), la page 404.
const EXCLUDE = new Set(["/404/", "/recherche/", "/artisan/"]);

export default defineConfig({
  site: SITE_URL || undefined,
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "never" },
  compressHTML: true,
  prefetch: false,
  integrations: SITE_URL ? [sitemap({ filter: (p) => !EXCLUDE.has(new URL(p).pathname) })] : [],
  vite: { build: { assetsInlineLimit: 0 } },
});
