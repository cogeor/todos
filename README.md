# Todos

> A spec for a personal todo PWA. Hand the repo to Claude Code and it
> produces a working app on your phone in about five minutes.

**Start here:** [`spec/README.md`](./spec/README.md) is the entry point
for the implementer (you or your coding agent). It defines the
deliverable — a scannable QR code that installs the PWA on your phone —
and the rules for working the spec in parallel.

The rest of this file is just the local setup needed to get to that
point.

---

## 1. One-time install on your laptop

Node 20+, git, and `cloudflared`.

**Windows (PowerShell):**

```powershell
winget install OpenJS.NodeJS
winget install Git.Git
winget install Cloudflare.cloudflared
```

**macOS:**

```bash
brew install node git cloudflared
```

**Linux:** install Node 20+ and git from your distro's package manager.
Grab `cloudflared` from
<https://github.com/cloudflare/cloudflared/releases>.

## 2. Clone and point Claude Code at the spec

```bash
git clone https://github.com/cogeor/todos.git
cd todos
```

Open Claude Code in this directory and tell it:

> Implement the spec in `spec/`. **The deliverable is a scannable QR
> code printed by `npm run serve:phone`. Do not declare success until
> that QR is on screen.**
>
> Read **only** `spec/README.md` — nothing else. Do **not** read the
> per-folder sub-specs (`spec/domain`, `spec/data`, `spec/frontend`,
> `spec/infrastructure`); each module agent reads its own. Do NOT read
> any `.md` at repo root other than this one — they are not for
> implementers. Keeping your context tight at spawn time is what lets
> the six agents do the real work in parallel.
>
> Then follow `spec/README.md` § "Implementation Plan": six modules,
> one agent per module, **spawn all six in a single message** with
> parallel Agent calls — this is REQUIRED, not optional. You are the
> orchestrator: you do **not** write source files yourself. Each agent
> reads its own sub-spec, writes its files, and reports back. Kick
> `npm install` in the background the moment `package.json` lands.
> Verify with typecheck ∥ build (concurrent) → preview + `npm run
> smoke` → `npm run serve:phone` printing the QR.

The agent will write `src/`, `package.json`, the Vite/Tailwind/TS
configs, `scripts/serve-phone.mjs`, and `scripts/smoke.mjs`. None of
those are in the repo on purpose — they are regenerated from the spec.

Expect roughly five minutes of work and one `npm install`.

## 3. Build and put it on your phone

```powershell
npm install
npm run build
npm run serve:phone
```

`serve:phone` boots a local preview at `http://localhost:4173`, opens
a Cloudflare tunnel to it, and prints a QR code in the terminal whose
payload is the public `https://*.trycloudflare.com` URL.

Scan the QR with your phone's camera:

- **Android:** open the link in **Chrome** → tap the "Install app"
  banner (or menu → *Install app*).
- **iPhone:** open the link in **Safari** (Chrome on iOS cannot install
  PWAs) → Share → *Add to Home Screen*.

Keep the terminal open until the install finishes — the phone needs
the tunnel up to fetch and cache the bundle. After that, the laptop
can be shut down and the app keeps working offline on the phone.

## Troubleshooting

- **`cloudflared` not found.** `winget install Cloudflare.cloudflared`
  (or `brew install cloudflared`), then restart the shell so PATH
  picks it up.
- **iPhone won't install.** iOS only supports PWA install from
  **Safari**. Chrome on iOS can't do it — copy the link into Safari
  and use Share → Add to Home Screen.
- **Install fails halfway through.** The laptop terminal must stay
  open until the phone finishes caching. `Ctrl+C` too early and the
  install ends with a broken icon.
- **Phone can't load the URL.** Some corporate, school, and
  captive-portal Wi-Fi networks block `*.trycloudflare.com`. Switch
  to mobile data.
- **No install prompt even though the URL loads.** PWAs need HTTPS.
  A raw LAN address like `http://192.168.x.x:4173` won't prompt —
  always go through the tunnel.
- **`npm run dev` shows no install banner.** The service worker is
  disabled in dev (`devOptions.enabled: false`). Use
  `npm run serve:phone`.
- **Re-installing on the same phone lost my data.** Each
  `serve:phone` run produces a fresh `*.trycloudflare.com` URL,
  which is technically a different origin and gets its own
  IndexedDB. The old install (if still present) keeps its data.
- **PWA can't see Safari's data on iOS.** iOS sandboxes each
  home-screen install's storage. Intentional, but surprising.

## 4. Customize it

The spec is small and lives in `spec/`. Edit the Markdown to taste —
add a field, change the palette, add a tab — and re-run your agent
with the new spec.

---

## What's in this repo

```
spec/
  README.md                  core user story, success criteria, architecture
  domain/README.md           types + validation (one entity, one rule)
  data/README.md             Dexie + repository (one table)
  frontend/README.md         one screen, grey + white palette, PWA
  infrastructure/README.md   build, serve:phone, smoke
README.md                    this file
.gitignore
```

Everything else (`src/`, `node_modules/`, `dist/`, `package.json`, the
configs) is git-ignored. The spec writes those.
