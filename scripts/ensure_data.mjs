// Avant la construction : télécharge et prépare les données si elles ne sont pas déjà là.
// - En local ou sur GitHub Actions (npm run data:fetch puis data:prepare lancés avant) : rien à faire.
// - Sur un service qui ne lance que « npm run build » (Cloudflare) : le dépôt n'a pas data/build/, donc tout est
//   fait ici : environnement Python .venv avec pyarrow, téléchargement des sources officielles, préparation.
// DATA_REFRESH=1 force un nouveau téléchargement même si les données existent.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error) { console.error(`Impossible de lancer ${cmd} : ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (fs.existsSync("data/build/site.json") && process.env.DATA_REFRESH !== "1") {
  console.log("Données déjà préparées (data/build/site.json) : pas de téléchargement.");
  process.exit(0);
}

const t0 = Date.now();
const py = process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python";
if (!fs.existsSync(py)) run(process.env.PYTHON || "python3", ["-m", "venv", ".venv"]);
const hasArrow = spawnSync(py, ["-c", "import pyarrow"], { stdio: "ignore" }).status === 0;
if (!hasArrow) run(py, ["-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", "requirements.txt"]);

run(py, ["scripts/fetch_data.py"]);
run(py, ["scripts/prepare_data.py"]);
run(py, ["scripts/prix_snapshots.py"]);
console.log(`Données téléchargées et préparées en ${Math.round((Date.now() - t0) / 1000)} s.`);
