// Packages the unpacked Snipe extension into public/snipe-extension.zip so the
// dashboard can serve it for Chrome "Load unpacked". The zip contains a single
// top-level `snipe-extension/` folder (the folder the user selects after unzip).
//
// KISS: uses the system `zip` CLI and stages a copy so entries are prefixed with
// `snipe-extension/`. Re-run after changing anything in extension/:
//   npm run package:extension
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, cpSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extDir = join(root, 'extension')
const outDir = join(root, 'public')
const outZip = join(outDir, 'snipe-extension.zip')

if (!existsSync(join(extDir, 'manifest.json'))) {
  console.error('✗ extension/manifest.json not found — nothing to package.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const stage = mkdtempSync(join(tmpdir(), 'snipe-ext-'))
try {
  cpSync(extDir, join(stage, 'snipe-extension'), { recursive: true })
  rmSync(outZip, { force: true })
  // -r recurse, -X drop extra file attributes (more deterministic), skip junk.
  execSync(`zip -r -X "${outZip}" snipe-extension -x '*.DS_Store'`, { cwd: stage, stdio: 'inherit' })
  console.log(`✓ Packaged extension → ${outZip}`)
} finally {
  rmSync(stage, { recursive: true, force: true })
}
