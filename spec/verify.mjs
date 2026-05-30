#!/usr/bin/env node
// File-set + manifest verifier. Checked into the spec on purpose: it is part
// of the contract, not regenerated app code, so it cannot drift with the run.
//
// Run from the repo root (npm run verify) AFTER the agent batch returns and the
// icons helper has run, BEFORE typecheck/build. It fails the run if:
//   1. any path in spec/manifest.json is missing,
//   2. any source file exists under a scanned dir but is NOT in the manifest
//      (catches invented files / a wrong partition), or
//   3. the repo-root package.json does not match spec/package.json
//      (catches a hand-authored manifest with the wrong deps or scripts).
//
// Node built-ins only — no dependency on npm install having succeeded.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const specDir = dirname(fileURLToPath(import.meta.url))
const root = process.cwd()
const errors = []

const manifest = JSON.parse(readFileSync(join(specDir, 'manifest.json'), 'utf8'))
const expected = new Set(manifest.files)

// 1. Every expected file exists.
for (const f of manifest.files) {
  if (!existsSync(join(root, f))) errors.push(`missing: ${f}`)
}

// 2. No unexpected source files under the scanned dirs.
const toPosix = (p) => p.split(sep).join('/')
function walk(rel) {
  const abs = join(root, rel)
  if (!existsSync(abs)) return []
  const out = []
  for (const name of readdirSync(abs)) {
    const childRel = `${rel}/${name}`
    if (statSync(join(root, childRel)).isDirectory()) out.push(...walk(childRel))
    else out.push(toPosix(childRel))
  }
  return out
}
for (const dir of manifest.scanDirs ?? []) {
  for (const f of walk(dir)) {
    if (!expected.has(f)) errors.push(`unexpected source file (not in manifest): ${f}`)
  }
}

// 3. Repo-root package.json matches the canonical spec/package.json.
const rootPkgPath = join(root, 'package.json')
if (!existsSync(rootPkgPath)) {
  errors.push('missing: package.json (copy spec/package.json to the repo root verbatim — do not author one)')
} else {
  const got = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
  const want = JSON.parse(readFileSync(join(specDir, 'package.json'), 'utf8'))
  for (const key of ['name', 'private', 'version', 'type']) {
    if (JSON.stringify(got[key]) !== JSON.stringify(want[key]))
      errors.push(`package.json ${key}: ${JSON.stringify(got[key])} != ${JSON.stringify(want[key])}`)
  }
  for (const section of ['scripts', 'dependencies', 'devDependencies']) {
    const a = got[section] ?? {}
    const b = want[section] ?? {}
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === undefined) errors.push(`package.json ${section}.${k} missing (expected ${JSON.stringify(b[k])})`)
      else if (b[k] === undefined) errors.push(`package.json ${section}.${k} is unexpected (${JSON.stringify(a[k])})`)
      else if (a[k] !== b[k]) errors.push(`package.json ${section}.${k}: ${JSON.stringify(a[k])} != ${JSON.stringify(b[k])}`)
    }
  }
}

if (errors.length) {
  console.error(`verify: FAIL (${errors.length} problem${errors.length === 1 ? '' : 's'})`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log(`verify: OK — ${manifest.files.length} files present; package.json matches spec/package.json`)
