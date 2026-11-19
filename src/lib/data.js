// Données lues à la construction (data/build/site.json, produit par scripts/prepare_data.py).
import fs from "node:fs";
import path from "node:path";
import TRAVAUX from "./travaux.json" with { type: "json" };

let cache;
export function load() {
  if (cache) return cache;
  const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/build/site.json"), "utf-8"));
  for (const c of Object.values(s.communes)) if (c.parent && s.communes[c.parent]) c.parentRef = s.communes[c.parent];
  cache = s;
  return s;
}
export const entOf = (ids) => { const { ent } = load(); return ids.map((i) => ent[i]); };
export const T = Object.fromEntries(TRAVAUX.map((t) => [t.slug, t]));
export { TRAVAUX };
// Seuil de publication d'une page « travaux dans un département » et d'une page commune ouverte aux moteurs
export const MIN_INDEX = 2;
