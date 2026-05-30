# Infrastructure

> Build, dev loop, install flow, smoke test. Everything that isn't
> source code but makes the app run.

## package.json scripts

```jsonc
{
  "scripts": {
    "dev":         "vite",
    "build":       "vite build",
    "preview":     "vite preview --host 0.0.0.0 --port 4173 --strictPort",
    "typecheck":   "tsc --noEmit",
    "serve:phone": "node scripts/serve-phone.mjs",
    "smoke":       "node scripts/smoke.mjs",
    "clean":       "node scripts/free-port.mjs 4173"
  }
}
```

`clean` frees port 4173 if a previous `serve:phone` / `smoke` left an
orphan behind. It is the manual escape hatch; `serve:phone` and
`smoke` also reclaim the port automatically on start (see § "Port
reclaim — `free-port.mjs`"), so you rarely need to run it by hand.

No `prebuild`. The PNG icons are not generated at build time — they
are emitted by the `icons` agent's helper (`public/icons/make-icons.mjs`,
specified verbatim in `spec/frontend/README.md` § "Icons"). The agent
writes the helper once and runs it once. Nothing rasterizes during
`npm run build`.

## Dependencies

```jsonc
{
  "dependencies": {
    "dexie":     "^4",
    "react":     "^18",
    "react-dom": "^18",
    "ulid":      "^2"
  },
  "devDependencies": {
    "@types/react":          "^18",
    "@types/react-dom":      "^18",
    "@vitejs/plugin-react":  "^4",
    "autoprefixer":          "^10",
    "postcss":               "^8",
    "puppeteer-core":        "^25",
    "qrcode-terminal":       "^0.12",
    "tailwindcss":           "^3",
    "typescript":            "^5",
    "vite":                  "^5",
    "vite-plugin-pwa":       "^0.20"
  }
}
```

Pin majors; let minors and patches float. The total of 4 production
and 11 development dependencies is the entire dependency surface for
this product.

## TypeScript

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({ /* see spec/frontend/README.md */ }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server:  { host: '0.0.0.0', port: 5173 },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    // Vite 5 preview rejects unknown Host headers by default. The
    // cloudflared tunnel rewrites the Host to *.trycloudflare.com,
    // which would trip "Blocked request. This host is not allowed."
    // and the phone sees a blank page after a successful scan.
    // Allowing the suffix keeps the install path green without
    // disabling the check entirely.
    allowedHosts: ['.trycloudflare.com'],
  },
  build:   { target: 'es2022', sourcemap: true },
})
```

## Icons

`scripts/` does not own icon generation. The two PNGs Chrome's
installability check requires (`/icons/icon-192.png`,
`/icons/icon-512.png`) are emitted by `public/icons/make-icons.mjs`, a
pure-Node helper specified in full in `spec/frontend/README.md`
§ "Icons". The `icons` agent writes the helper once from the spec
and runs it once. No `prebuild` hook, no puppeteer rasterization, no
external rasterizer dependency. `puppeteer-core` stays in
`devDependencies` because the smoke test uses it; it is not used for
icons.

## Tailwind

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        border:  'hsl(var(--border) / <alpha-value>)',
        text:    'hsl(var(--text) / <alpha-value>)',
        muted:   'hsl(var(--muted) / <alpha-value>)',
        accent:  'hsl(var(--accent) / <alpha-value>)',
        danger:  'hsl(var(--danger) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

`postcss.config.cjs`:

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`darkMode` is not set; the spec uses `prefers-color-scheme` directly
via CSS variables defined in `src/ui/styles.css`. The Tailwind tokens
above resolve to whichever side of the media query is active.

## Install flow — `serve:phone`

`scripts/serve-phone.mjs` is the **only** install-flow orchestrator
(it may import the shared `reclaimPort` helper from `free-port.mjs`).
It contains the orchestration, the pre-flight validation, and the QR
print. There is no second test script. If the QR prints, the install
path is good; if any pre-flight check fails, the QR never prints and
the implementer sees a one-line error.

**Must run in the foreground.** The script's QR output is rendered to
stdout via `qrcode-terminal`. If the main agent backgrounds the
process or routes its stdout through a non-terminal pipe, the QR is
not visible to the user. Run it as a foreground command, attached to
the user's terminal, until the user terminates with Ctrl-C.

The user-side narrative (which phone browser, install gesture) is in
`spec/README.md` § "Phone side — what the user does beyond scanning."
Operator-facing troubleshooting (tunnel caveats, Wi-Fi blocks, etc.)
is in the root `README.md` § "Troubleshooting" and is not spec
material.

### Port reclaim — `free-port.mjs`

`scripts/free-port.mjs` exports `reclaimPort(port)` and also runs as a
CLI (`node scripts/free-port.mjs 4173`, wired to `npm run clean`). Both
`serve-phone.mjs` and `smoke.mjs` call `reclaimPort(4173)` as their
**first action**, before build or preview.

`reclaimPort(port)`:

1. Finds the PID(s) listening on `port`. Windows: parse `netstat -ano`
   (or `Get-NetTCPConnection`); POSIX: `lsof -ti tcp:<port>` (fall back
   to `fuser -k <port>/tcp`).
2. For each PID, inspects its command line. If it is **ours** — a
   `vite preview`, a `cloudflared` tunnel, or a `node` process running
   under this project path — kill the whole **tree** (`taskkill /pid
   <pid> /T /F` on Windows; process-group `kill` on POSIX).
3. If the listener is **not** ours, leave it untouched and return a
   "foreign process on `<port>`" result. The caller aborts with the
   usual pre-flight message instead of killing an unrelated app.
4. No-op and silent when the port is already free.

This is what makes `--strictPort` safe to keep: a stale preview from a
prior run is reclaimed automatically, while a genuinely foreign
process on 4173 still produces the clear hard error. **Reclaim-on-start,
not teardown-on-exit, is the durable fix** — it does not depend on the
previous run having shut down cleanly (a hard kill, a closed terminal,
or a closed editor / agent session all skip exit teardown; the next
run reclaims regardless).

### Behaviour

0. **Reclaim the port.** Before anything else, `await
   reclaimPort(4173)` (§ "Port reclaim"). After this, 4173 is either
   free or held by a foreign process; in the latter case abort
   immediately with `[serve:phone] pre-flight failed: port 4173 is
   occupied by another process — stop it and retry` and never build or
   open the tunnel.
1. **Build.** Always run `npm run build` as a subprocess and wait
   for exit 0 before continuing. Stream its output. If build fails,
   exit non-zero with the build's exit code and a one-line hint. The
   user may have edited the spec since the last run — never serve a
   stale `dist/`.
2. **Boot preview.** `spawn('npm', ['run', 'preview'])` (the project's
   own preview script, so port/host stay consistent). The preview
   script runs `vite preview --port 4173 --strictPort` so an occupied
   port is a hard error instead of a silent bump to 4174. Step 0
   already reclaimed any orphan of *ours*, so if the preview child
   still emits `Port 4173 is in use` (or never reports listening on
   4173 within the timeout), the occupant is foreign; abort with
   `[serve:phone] pre-flight failed: port 4173 is occupied by another
   process — stop it and retry` and never open the tunnel. The tunnel
   and pre-flight target the same port the preview actually bound.
3. **Wait for localhost.** Poll `http://localhost:4173/` with `fetch`
   until it returns 200. Time out at 30 s with a clear error. Scan the
   preview child's stdout for the `localhost:4173` ready line; treat a
   `Port 4173 is in use` line (or a 30 s timeout without the ready
   line) as a pre-flight failure per step 2.
4. **Pre-flight.** Run, against `http://localhost:4173`, in order:
   - **`GET /`** → 200, body contains `<link rel="manifest"`.
   - **`GET /manifest.webmanifest`** → 200, response is JSON, parsed
     manifest contains:
     - non-empty `name`,
     - `start_url`,
     - `display: 'standalone'`,
     - `icons` array with at least one entry whose `sizes` includes
       `192x192` and at least one whose `sizes` includes `512x512`.
   - **For each icon in `manifest.icons`:** `GET <resolved-url>` → 200.
   - Any failure: print `[serve:phone] pre-flight failed: <reason>`,
     send `SIGTERM` to the preview child, exit code 1. Do not start
     the tunnel.
5. **Boot tunnel.** `spawn('cloudflared', ['tunnel', '--url',
   'http://localhost:4173'])`.
6. **Capture URL.** Pipe cloudflared's stdout and stderr. On each
   line, test against the regex
   `https:\/\/[a-z0-9.-]+\.trycloudflare\.com`. On the first match,
   capture the URL and set a `printed` flag. Subsequent matches in
   the same run are dropped (the user sees one QR, not several).
7. **Print, exactly once per run:**
   - A blank line.
   - The QR rendered by `qrcode-terminal`:
     `qrcode.generate(url, { small: true })`.
   - The URL on its own line, in case the QR cannot be scanned.
   - A two-line phone reminder:
     ```
     iOS:     Safari → Share → Add to Home Screen
     Android: Chrome → Install banner, or menu → Install app
     ```
8. Forward all child output to this process's stdout/stderr.
9. **Teardown — kill the whole tree.** Spawn the preview and tunnel so
   the whole tree can be torn down: track each child's PID. On `SIGINT`
   / `SIGTERM` (and on any fatal path that calls the script's
   `fail()`), kill the **process tree**, not just the direct child:
   - **Windows:** `spawn('taskkill', ['/pid', String(child.pid), '/T',
     '/F'])` — `/T` kills the child and all descendants.
   - **POSIX:** spawn the child with `detached: true`, then
     `process.kill(-child.pid, 'SIGTERM')` to signal the whole process
     group.

   The intended stop is **Ctrl-C in the foreground terminal**; after
   it, no `vite`/`cloudflared`/`node` process from this run remains and
   ports 4173/4174 are free.

   **Exit teardown is best-effort; reclaim-on-start is the guarantee.**
   A hard kill of this process — or closing the terminal, editor, or
   agent session that owns it — skips these handlers, and on Windows
   the `vite`/`cloudflared` grandchildren are not in a kill-on-close
   job, so they can survive as orphans holding 4173. That is tolerated:
   step 0's `reclaimPort` clears them on the next run before binding.
   Do **not** rely on exit teardown alone to keep successive runs
   unblocked — that is exactly the assumption that left the port busy
   before.

The script must work on Windows (PowerShell), macOS, and Linux. Use
`shell: true` when spawning `npm run preview` and `npm run build` so
Windows resolves the `.cmd` shim correctly; use `shell: false` for
`cloudflared` so signals propagate cleanly.

Required external: the `cloudflared` binary must be on the user's PATH
(`winget install Cloudflare.cloudflared` on Windows; `brew install
cloudflared` on macOS; release binary on Linux). The spec does not
bundle cloudflared. If `cloudflared` is missing, the spawn fails and
the script exits with the spawn's error and a one-line install hint.

### Why pre-flight, not a separate `verify:install` script

Earlier drafts of this spec specified a second script,
`verify-install.mjs`, that ran against the public tunnel URL. It was
removed because:

- The implementer would write two install-flow scripts in a one-shot
  run instead of one.
- The checks it ran (manifest reachable, icons 200, root references
  manifest) all pass identically against `localhost:4173` — there is
  no `trycloudflare.com`-specific failure mode that matters at this
  scope (service-worker registration works on `localhost` and on
  HTTPS tunnel equally).
- Running them as a pre-flight in `serve:phone` means a failure
  surfaces *before* the QR prints, which is exactly when the
  implementer wants to know.

If a future failure mode appears that only manifests over the public
tunnel (e.g. a CSP that breaks on real hostnames), a second oracle
can be reintroduced. Until then, one script is enough.

## Smoke test — `scripts/smoke.mjs`

The smoke test is the verification oracle for success criteria #1–#9
in `spec/README.md`. It **owns its own preview lifecycle**: on start it
`await reclaimPort(4173)`, spawns `npm run preview`, waits for 4173 to
answer 200, runs the puppeteer steps below, and on exit (success,
failure, or signal) tears the preview down with the same tree-kill as
`serve-phone.mjs`. The orchestrator must **not** start a preview for
it — there is no `npm run preview &` step, and that stray ampersand was
the orphan that left 4173 busy.

**Selector contract.** Every selector and assertion below maps 1:1 to
the table in `spec/frontend/README.md` § "Selector Contract." That
table is the single source of truth for the strings, aria-labels,
and DOM shapes this script depends on. If the script and the
contract disagree, the contract wins and the script is wrong.

Behaviour:

0. `await reclaimPort(4173)`, then spawn `npm run preview`, poll
   `http://localhost:4173/` until 200 (30 s timeout), and register a
   tree-kill teardown that fires on every exit path.
1. Launch `puppeteer-core` against the system Chrome.
   Default path on Windows:
   `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`.
   Override with `CHROME_PATH`.
2. `page.goto('http://localhost:4173')`.
3. Delete IndexedDB `todos-app` and reload, so each run is
   deterministic.
4. Wait for the Add button (see Selector Contract).
5. Click the Add button. Type `smoke-test-todo` into the Title input.
   Set the Due-date input value to today + 7 days and fire `change`.
   Click Save.
6. Assert a row with title `smoke-test-todo` appears in the list (the
   title `<span>` per the contract).
7. Click that row's checkbox (per the contract: `aria-label` starts
   with `Mark "smoke-test-todo"`). Assert the title span now has the
   `line-through` class.
8. Click the row's delete button (`aria-label='Delete
   "smoke-test-todo"'`). Auto-accept the `window.confirm` dialog.
   Assert the row is gone.
9. Reload. Assert the empty-state text `Nothing to do.` is visible
   again (persistence held: the delete survived reload).
10. Exit 0 if every step held; exit 1 otherwise. Any `pageerror` or
    non-`ERR_ABORTED` `requestfailed` fails the run.

The script is the contract between the spec and any implementer:
"does the prototype work?" is answered by this exit code. The
selectors above are exact and must match `spec/frontend/README.md`
§ "Selector Contract" verbatim.

## Quality gates

| Gate | Command | Required |
|---|---|---|
| Types | `npm run typecheck` | Must pass |
| Build | `npm run build` | Must pass |
| Smoke | `npm run smoke` (boots and tears down its own preview) | Must pass |
| Install flow | `npm run serve:phone` prints a QR | Must pass |
| Bundle size | check `dist/` | < 250 KB gzipped JS |
| Lighthouse PWA | manual, Chrome DevTools | "Installable" — PNG icons present, SW registered, manifest valid. If Lighthouse marks the site "Not installable" the manifest icons are almost certainly still SVG; check `dist/icons/*.png`. |

Vitest, Playwright, ESLint, and Prettier are **not** required to ship
v1. If the implementer wants them, they may add them; they are not
delivery blockers.

## CI (suggested, not required)

```yaml
# .github/workflows/ci.yml (sketch)
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm run smoke   # boots and tears down its own preview
```

## Boundary Rules

This folder owns build, dev-loop, and verification. It does not own
runtime behaviour. If `serve-phone.mjs` or `smoke.mjs` ever needs to
import application code, it is doing too much.
