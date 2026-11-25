// Copies the compiled server (server/dist) into the Supabase Edge Function folder.
// Run via `npm run edge:build` (builds first). The copy is generated, so it's git-ignored.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const target = join(here, '..', '..', 'supabase', 'functions', 'api', 'server');

if (!existsSync(join(dist, 'app.js'))) {
  console.error('server/dist/app.js not found. Run "npm run build" first.');
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true, filter: (src) => !src.endsWith('.map') && !src.endsWith('index.js') });
console.log(`Copied ${dist} -> ${target}`);
