// Réglages du site, en un seul endroit.
export const SITE_NAME = "Artisan Arena";
export const SITE_URL = (import.meta.env.SITE_URL || process.env.SITE_URL || "").replace(/\/$/, "");
// NOINDEX=1 : site publié mais fermé aux moteurs de recherche (phase de relecture).
export const INDEXABLE = Boolean(SITE_URL) && (import.meta.env.NOINDEX || process.env.NOINDEX) !== "1";
export const CONTACT = "contact@artisanarena.fr";
// Mesure d'audience Cloudflare Web Analytics (sans cookie). Jeton à créer dans Cloudflare ; vide = mesure désactivée.
export const ANALYTICS_TOKEN = process.env.CF_BEACON || "";
