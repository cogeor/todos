# Infrastructure

> Build, dev loop, install flow, smoke test. Everything that isn't
> source code but makes the app run.

## package.json scripts

```jsonc
{
  "scripts": {
    "dev":         "vite",
    "build":       "vite build",
    "prebuild":    "node scripts/gen-icons.mjs",
    "preview":     "vite preview --host 0.0.0.0 --port 4173",
    "typecheck":   "tsc --noEmit",
    "gen:icons":   "node scripts/gen-icons.mjs",
    "serve:phone": "node scripts/serve-phone.mjs",
    "smoke":       "node scripts/smoke.mjs"
  }
}
```

`prebuild` runs automatically before `build` (npm convention) so
`npm run build` and `npm run serve:phone` always have fresh PNGs.
`gen-icons.mjs` short-circuits when the PNGs already exist and are
newer than the SVG source, so it's effectively free after the first
run.

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

## Icon generation — `scripts/gen-icons.mjs`

Chrome's PWA install prompt requires PNG icons; SVG-only manifests
do not pass the installability check. The QR scans, the app loads,
no install banner appears. To deliver the **final artifact** (a
scannable QR whose destination is installable), the PNGs must exist
before `vite build` runs.

The script:

1. Reads `public/icons/icon-192.svg` and `public/icons/icon-512.svg`.
2. Skips work if `icon-{192,512}.png` already exist and their mtime
   is newer than the matching SVG.
3. Otherwise launches `puppeteer-core` against the system Chrome
   (same resolver as `scripts/smoke.mjs` — `CHROME_PATH` env
   override, Windows/macOS/Linux default paths), sets the viewport
   to the target size, loads the SVG inline with `margin: 0`, takes
   a same-size `screenshot({ type: 'png', omitBackground: false })`,
   and writes the result alongside the SVG.
4. Exits 0 on success. On failure (Chrome not found, screenshot
   error) exits non-zero with a one-line message; this fails
   `prebuild` which fails `build`.

No new dependency: `puppeteer-core` is already required for the
smoke test. Cloning Chrome is not needed; the rasterizer is the
user's existing Chrome install.

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

`scripts/serve-phone.mjs` is the **only** install-flow artefact. It
contains the orchestration, the pre-flight validation, and the QR
print. There is no second test script. If the QR prints, the install
path is good; if any pre-flight check fails, the QR never prints and
the implementer sees a one-line error.

The user-side narrative (which phone browser, install gesture, tunnel
caveats) lives in `user_flow.md` and is summarised in
`spec/README.md` § "Phone side — what the user does beyond scanning."

### Behaviour

1. **Build.** Always run `npm run build` as a subprocess and wait
   for exit 0 before continuing. Stream its output. If build fails,
   exit non-zero with the build's exit code and a one-line hint. The
   user may have edited the spec since the last run — never serve a
   stale `dist/`.
2. **Boot preview.** `spawn('npm', ['run', 'preview'])` (the project's
   own preview script, so port/host stay consistent).
3. **Wait for localhost.** Poll `http://localhost:4173/` with `fetch`
   until it returns 200. Time out at 30 s with a clear error.
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
9. On `SIGINT` / `SIGTERM`: send `SIGTERM` to both children, then
   exit.

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
in `spec/README.md`. Run it against a running preview server.

**Selector contract.** Every selector and assertion below maps 1:1 to
the table in `spec/frontend/README.md` § "Selector Contract." That
table is the single source of truth for the strings, aria-labels,
and DOM shapes this script depends on. If the script and the
contract disagree, the contract wins and the script is wrong.

Behaviour:

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
| Smoke | `npm run smoke` (after `npm run preview &`) | Must pass |
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
      - run: npm run preview &
      - run: |
          for i in $(seq 1 30); do
            curl -sf http://localhost:4173 && break || sleep 1
          done
      - run: npm run smoke
```

## Boundary Rules

This folder owns build, dev-loop, and verification. It does not own
runtime behaviour. If `serve-phone.mjs` or `smoke.mjs` ever needs to
import application code, it is doing too much.
