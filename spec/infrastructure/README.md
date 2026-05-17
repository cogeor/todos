# Infrastructure

> Build, dev loop, install flow, smoke test. Everything that isn't
> source code but makes the app run.

## package.json scripts

```jsonc
{
  "scripts": {
    "dev":         "vite",
    "build":       "vite build",
    "preview":     "vite preview --host 0.0.0.0 --port 4173",
    "typecheck":   "tsc --noEmit",
    "serve:phone": "node scripts/serve-phone.mjs",
    "smoke":       "node scripts/smoke.mjs"
  }
}
```

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
  preview: { host: '0.0.0.0', port: 4173 },
  build:   { target: 'es2022', sourcemap: true },
})
```

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

`scripts/serve-phone.mjs` is the dev-side install orchestrator. The
user-side narrative lives in `user_flow.md`.

Behaviour:

1. `spawn('npm', ['run', 'preview'])` (uses the project's preview
   script so port and host stay consistent).
2. Poll `http://localhost:4173/` with `fetch` until it returns 200,
   timing out at 30 s with a clear error.
3. `spawn('cloudflared', ['tunnel', '--url', 'http://localhost:4173'])`.
4. Pipe cloudflared's stdout and stderr. On each line, test against
   the regex `https:\/\/[a-z0-9-]+\.trycloudflare\.com`. On the first
   match, capture the URL.
5. Print to the terminal:
   - A blank line.
   - The QR rendered by `qrcode-terminal`:
     `qrcode.generate(url, { small: true })`.
   - The URL on its own line, in case the QR cannot be scanned.
   - A reminder line: "Open this URL on your phone, then install the
     app to the home screen."
6. Forward all child output to this process's stdout/stderr.
7. On `SIGINT` / `SIGTERM`: send `SIGTERM` to both children, then
   exit.

The script must work on Windows (PowerShell), macOS, and Linux. Use
`shell: true` when spawning `npm run preview` so Windows resolves the
`.cmd` shim correctly; use `shell: false` for `cloudflared` so signals
propagate cleanly.

Required external: the `cloudflared` binary must be on the user's PATH
(installed via `winget install Cloudflare.cloudflared` on Windows or
the equivalent on macOS/Linux). The spec does not bundle cloudflared.

## Smoke test — `scripts/smoke.mjs`

The smoke test is the verification oracle for the success criteria in
`spec/README.md`. Run it against a running preview server.

Behaviour:

1. Launch `puppeteer-core` against the system Chrome.
   Default path on Windows:
   `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`.
   Override with `CHROME_PATH`.
2. `page.goto('http://localhost:4173')`.
3. Delete IndexedDB `todos-app` and reload, so each run is
   deterministic.
4. Wait for the **Add** button.
5. Click Add. Type a title `smoke-test-todo`. Pick a future date
   (set the `<input type="date">` value to today + 7 days, fire `change`).
   Click Save.
6. Assert a row with that title appears in the list.
7. Click that row's checkbox. Assert the row gains a strikethrough
   class (e.g., `line-through` or a class the spec settles on).
8. Click the row's delete control. Auto-accept the `window.confirm`
   dialog. Assert the row is gone.
9. Reload. Assert the empty state is back.
10. Exit 0 if every step held; exit 1 otherwise. Any `pageerror` or
    non-`ERR_ABORTED` `requestfailed` fails the run.

The script is the contract between the spec and any implementer:
"does the prototype work?" is answered by this exit code.

## Quality gates

| Gate | Command | Required |
|---|---|---|
| Types | `npm run typecheck` | Must pass |
| Build | `npm run build` | Must pass |
| Smoke | `npm run smoke` (after `npm run preview &`) | Must pass |
| Bundle size | check `dist/` | < 250 KB gzipped JS |
| Lighthouse PWA | manual, Chrome DevTools | "Installable" |

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
