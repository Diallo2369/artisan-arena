// Avant la construction : écrit public/data/lieux.json, la liste des communes et des départements que la recherche
// reconnaît dans ce que tape le visiteur (« plombier Aurillac », « couvreur 15 », « électricien Cantal »).
// Source : @etalab/decoupage-administratif (découpage officiel, Licence Ouverte), déjà dans les dépendances.
// Format compact : c = [nom, code INSEE, population, codes postaux séparés par une espace], d = [code, nom].
import fs from "node:fs";
import COMMUNES from "@etalab/decoupage-administratif/data/communes.json" with { type: "json" };
import DEPS from "@etalab/decoupage-administratif/data/departements.json" with { type: "json" };

const c = COMMUNES.filter((x) => x.type === "commune-actuelle").map((x) => [x.nom, x.code, x.population || 0, (x.codesPostaux || []).join(" ")]);
const d = DEPS.map((x) => [x.code, x.nom]);
fs.mkdirSync("public/data", { recursive: true });
fs.writeFileSync("public/data/lieux.json", JSON.stringify({ c, d }));
console.log(`public/data/lieux.json : ${c.length} communes, ${d.length} départements.`);
