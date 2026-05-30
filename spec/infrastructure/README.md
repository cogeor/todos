# Infrastructure

> Build, dev loop, install flow, smoke test. Everything that isn't
> source code but makes the app run.

## package.json

The **canonical `package.json`** — scripts plus the full pinned
dependency list — is the **checked-in file `spec/package.json`**, and the
**main agent** copies it to the repo root verbatim, not a module agent
(it is the install manifest, written first so `npm install` can start
at t=0; see `spec/README.md` § "Main-agent orchestration" and § "Canonical
`package.json`"). It is a real file, not a fenced block, so `npm run
verify` can diff the repo-root copy against it and reject a hand-authored
substitute. This section records the rules that file must satisfy; it does
not duplicate it.

- **Scripts:** `dev`, `build`, `preview`
  (`vite preview --host 0.0.0.0 --port 41730 --strictPort`), `typecheck`
  (`tsc --noEmit`), `verify` (`node spec/verify.mjs`; see § "File-set
  verification"), `serve:phone`, `smoke`, and `clean`
  (`node scripts/free-port.mjs 41730`). `clean` is the manual
  port-reclaim escape hatch for the deliverable port; `serve:phone`
  frees 41730 automatically on start and `smoke` frees its own
  port 42730 (§ "Port reclaim — `free-port.mjs`"), so you rarely need it
  by hand. **Ports 41730 (serve) and 42730 (smoke) are project-reserved
  and deliberately not Vite's defaults (5173 dev, 4173 preview)** — that
  is what lets `free-port` treat any listener on them as a stale prior
  run, with no need to fingerprint the process (§ "Port reclaim").
- **Dependencies:** pin majors, let minors and patches float. 4
  production (`dexie`, `react`, `react-dom`, `ulid`) + 11 development
  is the entire dependency surface for this product.
- **No `prebuild`.** The PNG icons are not generated at build time —
  they are emitted by the `icons` agent's helper
  (`public/icons/make-icons.mjs`, specified verbatim in
  `spec/frontend/README.md` § "Icons"). The agent writes the helper
  once and runs it once. Nothing rasterizes during `npm run build`.

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
    port: 41730,
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
(it imports the shared `freePort` helper from `free-port.mjs`).
It contains the orchestration, the pre-flight validation, and the QR
print. There is no second test script. If the QR prints, the install
path is good; if any pre-flight check fails, the QR never prints and
the implementer sees a one-line error.

**Surfacing the QR — the deliverable is that the *full* QR reaches the
user.** The script renders the QR to stdout via `qrcode-terminal`; how
the main agent gets it in front of the user depends on the runtime
(see `spec/README.md` § "Deliverable"):

- **At a human terminal:** run it in the **foreground**, attached, with
  stdout not redirected away, until the user terminates with Ctrl-C.
  The QR renders directly to the screen.
- **In an agent / automation harness (no shared terminal):** the main
  agent **captures** the script's stdout, waits for the QR and the
  `*.trycloudflare.com` URL to appear, **reprints the complete QR block
  (every row) and the URL verbatim** in its reply, and leaves the
  process running so the tunnel stays up. Capturing the output is
  required here — it is the only path by which the QR reaches the user.

Either way the QR must appear **in full**. A discarded, piped-away,
truncated, or summarized QR **has not shipped**, and the tunnel must
stay up until the user has installed.

The user-side narrative (which phone browser, install gesture) is in
`spec/README.md` § "Phone side — what the user does beyond scanning."
Operator-facing troubleshooting (tunnel caveats, Wi-Fi blocks, etc.)
is in the root `README.md` § "Troubleshooting" and is not spec
material.

### Port reclaim — `free-port.mjs`

`scripts/free-port.mjs` exports `freePort(port)` and also runs as a
CLI (`node scripts/free-port.mjs 41730`, wired to `npm run clean`).
`freePort` is a **parameterised** helper — the port is an argument,
not a hard-coded constant — so each caller frees only its own port.

**The ports are project-reserved (41730 serve, 42730 smoke), so any
listener is a stale prior run.** Because these are uncommon, fixed
ports — *not* Vite's shared defaults (5173 dev, 4173 preview) — nothing
else on the machine is expected to bind them. `freePort` therefore does
**not** fingerprint the process ("is this one *ours*?"). It frees the
port and lets the caller proceed. This is the whole simplification: the
old `reclaimPort` spawned a PowerShell `Get-CimInstance` per PID and ran
a `vite`/`cloudflared`/project-path heuristic purely to avoid killing an
unrelated app on the *shared* default port 4173. Reserving distinctive
ports removes that need, and with it the per-PID process inspection, the
`{ reclaimed, foreign, free }` contract, and the `foreign`-vs-`free`
branching footgun.

**41730 is freed in exactly one place: `serve-phone.mjs`, as its first
action.** It is the single install-flow orchestrator, run by the main
agent as the **last** step of a run, so all handling of the deliverable
port lives at the end, in the one step that owns serving. `smoke.mjs`
does **not** touch 41730 — it runs against its own dedicated port
**42730** (§ "Smoke test"), calling `freePort(42730)` as its first
action. Decoupling the ports means the smoke gate and the final serve
can never contend for the same port.

`freePort(port)` — returns `Promise<boolean>` (`true` once the port is
bindable, `false` if something still holds it):

1. **Probe first (cheap, common case).** Try to bind the port in-process
   (`net.createServer().listen({ port, host: '0.0.0.0' })`). If it binds,
   close it and return `true` immediately — **no subprocess is spawned
   when the port is already free.** This is the dominant path.
2. **Only if occupied:** find the listener PID(s). Windows: parse
   `netstat -ano -p TCP` (exact-port match on the LISTENING rows); POSIX:
   `lsof -ti tcp:<port> -sTCP:LISTEN`.
3. Kill each PID's whole **tree** — `taskkill /pid <pid> /T /F` on
   Windows; process-group `SIGKILL` on POSIX. Log each killed PID
   (`[free-port] killing pid <pid> on :<port>`) so the action is visible.
4. Poll the bind-probe (≈100 ms × up to ~3 s) until the socket releases.
   Return `true` when bindable, `false` on timeout.

**Canonical primitives — transcribe these two.** The bind-probe and the
`netstat`/`lsof` parse are the bug-prone, non-obvious core (exact-port
match across IPv4/IPv6 forms, LISTENING-only); re-deriving them is what
makes this otherwise-tiny file slow to write. The rest of `freePort` —
wiring probe → `pidsOnPort` → `taskkill /T /F` → re-poll, and the CLI
wrapper — is mechanical and follows the prose above.

```js
import net from 'node:net'
import { execSync } from 'node:child_process'

// Probe: can this port be bound right now? No subprocess. The common path.
function canBind(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen({ port, host: '0.0.0.0' })
  })
}

// Listener PIDs on the EXACT port. Match the port as a number (not a
// substring), LISTENING state only, across IPv4 (0.0.0.0:/127.0.0.1:)
// and IPv6 ([::]:) local-address forms.
function pidsOnPort(port) {
  const pids = new Set()
  if (process.platform === 'win32') {
    let out = ''
    try { out = execSync('netstat -ano -p TCP', { encoding: 'utf8' }) } catch { return [] }
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i)
      if (m && Number(m[1]) === port) pids.add(Number(m[2]))
    }
  } else {
    try {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
      for (const tok of out.split(/\s+/)) if (tok) pids.add(Number(tok))
    } catch { /* no listener */ }
  }
  return [...pids]
}
```

**Callers guard on the boolean.** The correct usage is:

```js
if (!(await freePort(PORT))) {
  // something still holds the port — abort with the pre-flight message
}
```

There is no array to misread; the single boolean is the whole contract.

This is what makes `--strictPort` safe to keep: a stale preview from a
prior run is freed automatically before the bind, and if `freePort` ever
*can't* clear the port, the subsequent `vite preview --strictPort` fails
fast with `Port <n> is in use` — that hard error **is** the fallback, so
the script never silently bumps to the next port. **Free-on-start, not
teardown-on-exit, is the durable fix** — it does not depend on the
previous run having shut down cleanly (a hard kill, a closed terminal,
or a closed editor / agent session all skip exit teardown; the next run
frees the port regardless).

### Behaviour

0. **Free the port.** Before anything else, `if (!(await
   freePort(41730))) abort` (§ "Port reclaim"). After this, 41730 is
   bindable; if `freePort` returned `false` something still holds it, so
   abort immediately with `[serve:phone] pre-flight failed: port 41730 is
   occupied by another process — stop it and retry` and never build or
   open the tunnel.
1. **Build.** Always run `npm run build` as a subprocess and wait
   for exit 0 before continuing. Stream its output. If build fails,
   exit non-zero with the build's exit code and a one-line hint. The
   user may have edited the spec since the last run — never serve a
   stale `dist/`.
2. **Boot preview.** `spawn('npm', ['run', 'preview'])` (the project's
   own preview script, so port/host stay consistent). The preview
   script runs `vite preview --port 41730 --strictPort` so an occupied
   port is a hard error instead of a silent bump to the next port. Step
   0 already freed the port, so if the preview child still emits `Port
   41730 is in use` (or never reports listening on 41730 within the
   timeout), abort with `[serve:phone] pre-flight failed: port 41730 is
   occupied by another process — stop it and retry` and never open the
   tunnel. The tunnel and pre-flight target the same port the preview
   actually bound.
3. **Wait for localhost.** Poll `http://localhost:41730/` with `fetch`
   until it returns 200 — **the fetch is the sole readiness signal.**
   Time out at 30 s with a clear error. Do **not** gate readiness on
   parsing the preview's stdout: Vite prints its `Local:` line with ANSI
   color codes (`localhost:\x1b[1m41730\x1b[22m`), so a literal
   `localhost:41730` substring match is unreliable and has falsely failed
   otherwise-healthy runs with a 30 s timeout. You may still watch stdout
   for a `Port 41730 is in use` line as an early fail-fast per step 2, but
   the *absence* of a ready line is never itself a failure — only the
   `fetch` timeout is.
4. **Pre-flight.** Run, against `http://localhost:41730`, in order:
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
   'http://localhost:41730'])`.
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
   port 41730 is free.

**Canonical pre-flight (step 4) — transcribe this.** The icon-size
matching (`sizes` is a space-separated token list, not a substring) and
the relative-URL resolution against the manifest are the parts that are
easy to get subtly wrong; the surrounding orchestration (build, spawn,
capture, QR) is standard and stays prose. Throw a one-line reason; the
caller prints `[serve:phone] pre-flight failed: <reason>`, SIGTERMs the
preview, and exits 1 before any tunnel opens.

```js
async function preflight(base) {
  const root = await fetch(base + '/')
  if (!root.ok) throw new Error(`GET / -> ${root.status}`)
  if (!/<link[^>]+rel=["']?manifest/i.test(await root.text()))
    throw new Error('index.html has no <link rel="manifest">')

  const res = await fetch(base + '/manifest.webmanifest')
  if (!res.ok) throw new Error(`manifest -> ${res.status}`)
  let m
  try { m = JSON.parse(await res.text()) } catch { throw new Error('manifest is not valid JSON') }
  if (!m.name) throw new Error('manifest.name is empty')
  if (!m.start_url) throw new Error('manifest.start_url missing')
  if (m.display !== 'standalone') throw new Error("manifest.display must be 'standalone'")

  const icons = m.icons ?? []
  const has = (s) => icons.some((i) => String(i.sizes || '').split(/\s+/).includes(s))
  if (!has('192x192')) throw new Error('manifest has no 192x192 icon')
  if (!has('512x512')) throw new Error('manifest has no 512x512 icon')

  for (const icon of icons) {
    const url = new URL(icon.src, base + '/manifest.webmanifest').href
    const r = await fetch(url)
    if (!r.ok) throw new Error(`icon ${icon.src} -> ${r.status}`)
  }
}
```

   **Exit teardown is best-effort; free-on-start is the guarantee.**
   A hard kill of this process — or closing the terminal, editor, or
   agent session that owns it — skips these handlers, and on Windows
   the `vite`/`cloudflared` grandchildren are not in a kill-on-close
   job, so they can survive as orphans holding 41730. That is tolerated:
   step 0's `freePort` clears them on the next run before binding.
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
  manifest) all pass identically against `localhost:41730` — there is
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
in `spec/README.md`. It **owns its own preview lifecycle on a dedicated
port — 42730, never 41730**: on start it `if (!(await freePort(42730)))
abort`, spawns its own preview bound to 42730 (`vite preview --host
0.0.0.0 --port 42730 --strictPort` directly — *not* `npm run preview`,
which is hard-wired to the deliverable port 41730), waits for 42730 to
answer 200, runs the puppeteer steps below, and on exit (success,
failure, or signal) tears the preview down with the same tree-kill as
`serve-phone.mjs`. It never frees or binds 41730 — the deliverable
port belongs to the final serve step alone (§ "Port reclaim"). The
orchestrator must **not** start a preview for it — there is no
`npm run preview &` step, and that stray ampersand was the orphan that
left a port busy.

**Selector contract.** Every selector and assertion below maps 1:1 to
the table in `spec/frontend/README.md` § "Selector Contract." That
table is the single source of truth for the strings, aria-labels,
and DOM shapes this script depends on. If the script and the
contract disagree, the contract wins and the script is wrong.

Behaviour:

0. `if (!(await freePort(42730))) abort`, then spawn `vite preview
   --host 0.0.0.0 --port 42730 --strictPort`, poll
   `http://localhost:42730/` until 200 (30 s timeout), and register a
   tree-kill teardown that fires on every exit path. (Port 42730, never
   41730 — see § "Port reclaim".)
1. Launch `puppeteer-core` against the system Chrome.
   Default path on Windows:
   `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`.
   Override with `CHROME_PATH`.
2. `page.goto('http://localhost:42730')`.
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

**Canonical step 5 — the React-controlled date input. Transcribe this.**
A raw `el.value = …` is overwritten on React's next render, so the typed
date never reaches state and the todo is created with the wrong (or no)
due date — a silent smoke failure. Set via the native prototype setter,
then dispatch the events React listens for. This is the one puppeteer
step with a non-obvious form; every other step follows directly from the
Selector Contract and needs no canonical block.

```js
await page.$eval(
  'input[aria-label="Due date"]',
  (el, value) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  },
  dueDate, // 'YYYY-MM-DD', today + 7 days
)
```

The script is the contract between the spec and any implementer:
"does the prototype work?" is answered by this exit code. The
selectors above are exact and must match `spec/frontend/README.md`
§ "Selector Contract" verbatim.

## File-set verification — `npm run verify`

`spec/verify.mjs` is a checked-in, dependency-free Node script (built-ins
only, so it runs before `npm install` has even finished). It is the
mechanical counterpart to the prose "Done when" columns in `spec/README.md`
§ "The nine agents": instead of the main agent self-grading whether the
right files exist, the run *proves* it. The main agent runs it as the first
verify step, after the batch returns and the icons helper has run, before
typecheck/build (`spec/README.md` § "Main-agent orchestration", step 5).

It reads `spec/manifest.json` — the single list of every path a finished
run must produce — and fails (exit 1, naming each problem) on:

1. **A missing file** — a path in the manifest that does not exist. The
   owning agent did not finish or wrote to the wrong path.
2. **An unexpected source file** — any file under the scanned dirs
   (`src/`, `scripts/`, `public/`) that is **not** in the manifest. This
   is what catches an invented layout: a renamed component, a `components/`
   or `state/` folder the partition never specified, an extra tsconfig.
3. **A `package.json` mismatch** — the repo-root `package.json` differs
   from `spec/package.json` in any script, dependency, devDependency, or
   top-level field.

This is distinct from `serve:phone`'s install pre-flight (§ "Install flow")
and from `smoke.mjs` (§ "Smoke test"): `verify` is a static check of *what
files exist and what the manifest says*, run before anything is built;
those two exercise *runtime behaviour* against a live preview. They are
complementary gates, not substitutes.

`spec/manifest.json` and `spec/package.json` are the contract. When the
partition in `spec/README.md` changes, update both alongside it — a stale
manifest makes `verify` reject a correct run, and a stale `spec/package.json`
lets a wrong dependency set through.

## Quality gates

| Gate | Command | Required |
|---|---|---|
| File set | `npm run verify` (manifest + `package.json` match) | Must pass |
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
      - run: npm run verify  # manifest + package.json match
      - run: npm run typecheck
      - run: npm run build
      - run: npm run smoke   # boots and tears down its own preview
```

## Boundary Rules

This folder owns build, dev-loop, and verification. It does not own
runtime behaviour. If `serve-phone.mjs` or `smoke.mjs` ever needs to
import application code, it is doing too much.
