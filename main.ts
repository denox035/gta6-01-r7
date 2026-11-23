// SOLMAR — Streets of Gold, a gta6-01 entry (Node 22, standard library only).
// The game is plain static files under game/ (three.js vendored, ES modules,
// no network request) and this program hands it in: it copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json
// with the vendored make.fun library. Outside the grader, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve it locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Fail fast with a readable message when the screenshots are missing: the
// dossier builder would refuse them anyway, but only after the copy.
import { readdirSync } from 'node:fs';
const shotFiles = readdirSync(join(out, 'screenshots')).filter((f) => /\.(png|jpe?g)$/i.test(f));
if (shotFiles.length === 0) {
  throw new Error('no screenshots in screenshots/ — take them with tools/cdp-shot.mjs first');
}

// The scorer's own caps: at most 4 screenshots of 256 KiB each, at most 993
// files / 48 MiB in game/, paths under game/ at most 1000 bytes. game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log('wrote', join(out, 'dossier.json'));
console.log(`game/ + ${shotFiles.length} screenshot(s) handed in to ${out}`);
