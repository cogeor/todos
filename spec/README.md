# Todos — Specification

> An installable, offline-first PWA that shows a list of todos with due
> dates. Spec-first: an implementer reading this folder should be able to
> ship a working app in one shot.

---

## Deliverable — REQUIRED

**The deliverable is a scannable QR code printed by `npm run serve:phone`
that resolves to an installable PWA on the implementer's phone.** That QR
is the finish line. Everything else in this spec — types, tables,
components, smoke test — exists to protect it.

A run that passes typecheck, build, and smoke but never prints the QR
**has not shipped**. A run that prints a QR pointing at a tunnel the
phone cannot install from **has not shipped**. The QR must print, and
its target must be installable. Both are required.

This requirement is restated under § "Success Criteria" (#10),
§ "Quality Bar", § "MVP Cut", § "Implementation Plan", and
`spec/infrastructure/README.md` § "Install flow — `serve:phone`".
If you find this repetitive, that is the intent.

The **main agent** — the interactive coding agent the user opened in
the repo (Claude Code or equivalent) — owns this final step. Subagents
do not run `serve:phone`. The main agent runs it **in the foreground**
so its stdout (which contains the QR) reaches the user's terminal.
Backgrounding the process, redirecting its output, or wrapping it in
a captured-output harness all defeat the deliverable.

## Core User Story

The user opens the app and sees their todo items, each showing a title
and a due date. They tap **Add**, enter a title and a date, and the new
item appears in the list, sorted by due date. They tick items off as
they finish them. They can delete items they no longer want. Data
persists locally, survives reloads, and works offline.

That is the entire user-facing surface.

## Success Criteria

A build is considered done when every item passes. Items 1–9 are gates
that protect item 10. **Item 10 — the QR — is the deliverable.** If
1–9 pass and 10 fails, the run failed. If 10 passes and 1–9 are
unverified, you skipped the gates.

1. `npm install`, `npm run build`, and `npm run preview` complete with
   no TypeScript or bundler errors.
2. On first open, the app shows an empty state and an **Add** affordance.
3. Tapping Add reveals an inline form (title input + date input + Save).
   Submitting with a non-empty title and a valid date creates the todo.
4. The list shows all todos sorted: open items first by earliest due
   date; completed items below by most-recently-completed first.
   Completed items render with strikethrough.
5. Each row's checkbox toggles the item between open and completed.
6. Each row's delete control removes the todo after a confirmation.
7. Todos persist across reloads. The app loads with the network
   disconnected after the first visit (service worker).
8. The app is installable as a PWA: valid manifest, registered service
   worker, **PNG** icons at 192×192 and 512×512 served from
   `/icons/icon-192.png` and `/icons/icon-512.png`. Chrome's
   installability check rejects SVG-only manifests — the QR will
   scan and the app will load, but the "Install app" affordance
   never appears. PNG is mandatory; SVG is fine as a supplementary
   `<link rel="icon">` and apple-touch-icon.
9. `node scripts/smoke.mjs` — which reclaims port 4173 and boots and
   tears down its own preview server — adds, completes, and deletes a
   todo. Exit code 0.
10. `npm run serve:phone` produces exactly one terminal QR and one
    `https://*.trycloudflare.com` URL underneath it. The script
    always runs `npm run build` first (never serve stale), then
    verifies as a **pre-flight** that the root document is served
    200 with a `<link rel="manifest">`, that the manifest is valid
    JSON with at least one 192 and one 512 icon entry, and that
    every icon URL returns 200. If any pre-flight check fails, no QR
    is printed and the script exits non-zero with a clear one-line
    message. **The QR appearing is the install-flow gate.**

## Non-Goals (everything not above is out of scope)

Cut by name, so an implementer can't accidentally rebuild them:

- Multiple lists. There is one list.
- Tags, priorities, descriptions, attachments, sub-tasks, recurrence,
  drag-to-reorder, sharing, multi-user.
- Notifications, reminders, push, badges.
- Theme toggle. The app follows the system colour scheme automatically.
- Settings page. There is no settings page.
- Search, filtering, day grouping, "Today / Upcoming / Inbox" views.
- Editing a todo's title or date. To correct a mistake, delete and
  re-add.
- Server sync, accounts, auth.
- Full test suite. `scripts/smoke.mjs` (per-screen behaviour) is the
  verification oracle for in-page UX. The install-flow check is built
  into `scripts/serve-phone.mjs` as a pre-flight; if the QR prints,
  the install path is good. Vitest may be added later but is not
  required for delivery.

## Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 5 | Fast, first-class PWA plugin |
| UI | React 18 + TypeScript 5 (strict) | Standard, low-friction |
| Styling | Tailwind 3 | Utility-first; no bespoke CSS |
| Storage | Dexie 4 | Typed IndexedDB wrapper |
| PWA | vite-plugin-pwa (Workbox) | SW + manifest generation |
| IDs | ulid | Sortable, client-generated |
| Smoke | puppeteer-core | Against the system Chrome |

Explicitly **not** in the stack: TanStack Query, Zustand, React Router,
Zod, react-hook-form, lucide-react, date-fns, workbox-window, @dnd-kit,
Playwright. Each was un-justified by the user story.

## Architecture

Three layers, dependencies pointing inward.

```
   ┌──────────────────────────────────────────┐
   │  ui/      React app. One screen.         │
   └──────────────────┬───────────────────────┘
                      │ depends on
                      ▼
   ┌──────────────────────────────────────────┐
   │  data/    Dexie schema + repository.     │
   │           Returns/accepts domain types.  │
   └──────────────────┬───────────────────────┘
                      │ depends on
                      ▼
   ┌──────────────────────────────────────────┐
   │  domain/  Types, validation, IDs.        │
   │           Pure TypeScript.               │
   └──────────────────────────────────────────┘
```

Rules:

- `domain/` is pure. Imports only `ulid`. No DOM, no React, no Dexie,
  no `Date.now()` (callers pass `now: number` if needed).
- `data/` imports `@/domain` and `dexie`. Exposes a singleton
  `todoRepository` from its barrel.
- `ui/` imports `@/data` and `@/domain` types only. No direct Dexie
  access; all persistence goes through the repository.

There is no `application/` layer. There are no use-case services. There
is no `platform/` layer because the app uses no browser capabilities
beyond what React itself needs. The architectural weight class is
matched to the product's actual size.

## Quality Bar

- TypeScript `strict: true`, plus `noUnusedLocals` and
  `noUnusedParameters`.
- All form controls have an associated label or `aria-label`.
- Tap targets are at least 44×44 px (`min-h-11`).
- `:focus-visible` ring on every focusable control.
- Mobile-first: layout works at 360 px viewport width.
- Safe-area padding for notched devices
  (`env(safe-area-inset-top/bottom)`).
- Light/dark via `prefers-color-scheme` CSS only — no JS toggle.
- Bundle: under 250 KB gzipped JS for `dist/`.
- Smoke test passes against `npm run preview`.
- **REQUIRED:** `npm run serve:phone` prints a QR. Pre-flight gates
  the install path; see `spec/infrastructure/README.md` § "Install
  flow — `serve:phone`". **No QR, no ship.**

## Project Layout

```
todos/
  spec/                            (this folder)
    README.md
    domain/README.md
    data/README.md
    frontend/README.md
    infrastructure/README.md

  public/
    icons/
      make-icons.mjs          # pure-Node PNG writer; emits the two PNGs
      icon-192.png            # produced by make-icons.mjs (solid dark square)
      icon-512.png            # produced by make-icons.mjs

  src/
    main.tsx
    App.tsx

    domain/
      types.ts              # Todo, TodoStatus, TodoInput
      ids.ts                # TodoId (branded), newTodoId, parseTodoId
      rules.ts              # validateTodoInput
      errors.ts             # DomainError, ValidationError, NotFoundError
      index.ts              # barrel

    data/
      db.ts                 # Dexie schema (one table)
      todo-repository.ts    # singleton repo
      index.ts              # barrel: todoRepository + re-exported types

    ui/
      todo-app.tsx          # the whole screen
      todo-form.tsx         # collapsed "Add" → inline form
      todo-row.tsx          # one row with checkbox + title + date + delete
      use-todos.ts          # list + create + setStatus + delete
      styles.css            # Tailwind directives + CSS variables

  scripts/
    serve-phone.mjs         # build + preview + pre-flight + cloudflared + QR
    smoke.mjs               # headless smoke (puppeteer-core)

  index.html
  package.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.cjs
  tsconfig.json
  README.md
```

## Install Flow

The PWA reaches the phone via one command on the laptop and one scan
on the phone.

### Laptop side

```powershell
npm install
npm run serve:phone
```

`scripts/serve-phone.mjs` (described fully in
`spec/infrastructure/README.md`):

1. Always runs `npm run build` first. The user may have edited the
   spec since the last run — never serve a stale `dist/`.
2. Boots `vite preview` on port 4173.
3. Polls until the local server responds.
4. **Pre-flight:** fetches `/`, `/manifest.webmanifest`, and every
   icon URL from the manifest. All must return 200, the manifest must
   parse, and it must contain at least one 192 and one 512 icon. If
   any pre-flight check fails, the script aborts with a one-line
   message and never opens the tunnel — there is no broken QR to
   scan.
5. Boots `cloudflared tunnel --url http://localhost:4173`.
6. Watches cloudflared's stdout for a `https://*.trycloudflare.com`
   URL. Captures the first one.
7. Renders that URL as a terminal QR via `qrcode-terminal`, prints
   the URL on its own line beneath it, and prints once per run (later
   matches in cloudflared output are suppressed).
8. Forwards both child logs; on Ctrl+C, terminates both children.

### Phone side — what the user does beyond scanning

Scanning the QR is not enough on its own. Browsers and operating
systems gate PWA install behind a few taps. **The spec cannot remove
these — they are imposed by iOS / Android, not the app.** What the
user does:

| Step | iOS (iPhone / iPad) | Android |
|---|---|---|
| 1. Scan QR | Camera app. Tap the URL banner. | Camera app (Android 8+). Tap the URL. |
| 2. Open in the right browser | Must open in **Safari**. Chrome on iOS cannot install PWAs. If the link opens in another app, copy it into Safari. | Must open in **Chrome**. |
| 3. Wait for load | First load needs the tunnel; subsequent launches are offline. | Same. |
| 4. Install | **Share (□↑) → Add to Home Screen → Add.** No automatic install banner on iOS. | "Install app" banner usually appears; tap it. If not: menu (⋮) → *Install app*. |
| 5. Launch | Tap the new home-screen icon. | Tap the new home-screen icon. |

Steps 2 and 4 are the only ones the spec cannot collapse. iOS
specifically requires the user to know about the Share → Add to Home
Screen path — there is no system prompt.

The laptop terminal must stay up until the install completes on the
phone. Operator-side caveats (single-use tunnel URLs, corporate Wi-Fi
blocking trycloudflare, etc.) live in the root `README.md`
§ "Troubleshooting" — they are user-facing, not spec material.

## Implementation Plan

The work partitions into **eight independent agents**. They
**parallelize** — they run concurrently, have no execution order
between them, and never wait on each other. Within each agent, it
**fans out** its file writes: every file it owns is emitted in a
single message with parallel Write calls. There is no internal
ordering either.

The partition is balanced for **wall-clock**, not just for tidy
ownership. The batch finishes only when its *slowest* agent returns,
so the two heaviest concerns — the UI screen and the install scripts —
are each split across **two** agents instead of letting one long agent
gate everything. `ui` splits into a **view** agent (markup + the
binding Selector Contract) and a **state** agent (hooks + styles);
`scripts` splits into a **serve-phone** agent and a **smoke** agent.

**This is a spec, not code.** TypeScript only resolves at the verify
step at the end of the run. Until then, every agent is just files on
disk. The conflict boundary is the **file**, not the folder: two
agents writing *different files* — even in the same folder — cannot
conflict. That is exactly what lets the heavy folders (`src/ui/`,
`scripts/`) be split across more agents for more parallelism.

The **main agent** writes exactly one file — `package.json` — and no
other. It is the interactive coding agent the user opened in the repo
(Claude Code or equivalent). `package.json` is carved out of the
"no-source-files" rule deliberately: it is the install manifest, not
application code, and it is the sole file gating `npm install` — the
longest fixed cost in the run. The main agent writing it **first** is
what lets install overlap the entire agent batch (see § "Main-agent
orchestration", step 2). Everything else — all of `src/`, the other
root configs, `scripts/`, `public/` — belongs to the module agents.
Beyond `package.json`, the main agent's job is: read the spec, write
`package.json` and kick `npm install` in the background, spawn the
module agents, run the final verification chain, and run
`npm run serve:phone` so the QR appears in its own terminal — in
contact with the user. Subagents do not run `serve:phone`. This is a
hard rule. A run where the main agent wrote any *source* file (anything
beyond `package.json`) has failed the orchestration contract even if
every gate passes and the QR prints.

### The eight agents

| Agent | Owns | Files | Reads | Done when |
|---|---|---|---|---|
| **domain** | `src/domain/` | `errors.ts`, `ids.ts`, `types.ts`, `rules.ts`, `index.ts` (5) | `spec/domain/README.md` | All 5 exist. Barrel re-exports the other four. Zero DOM / React / Dexie imports. |
| **data** | `src/data/` | `db.ts`, `todo-repository.ts`, `index.ts` (3) | `spec/data/README.md` + domain types | All 3 exist. Repository exposes `list` / `create` / `setStatus` / `delete`. No Dexie types leak through the barrel. |
| **ui-view** | `src/App.tsx`, `src/main.tsx`, `src/ui/*.tsx` | `App.tsx`, `main.tsx`, `ui/todo-app.tsx`, `ui/todo-row.tsx`, `ui/todo-form.tsx` (5) | `spec/frontend/README.md` (whole file; Selector Contract is binding) | All 5 exist. Selectors, aria-labels, and DOM shape match § "Selector Contract" **verbatim** — smoke asserts literal strings. Imports the hooks + styles owned by **ui-state**. |
| **ui-state** | `src/ui/` hooks + styles | `ui/use-todos.ts`, `ui/use-install-prompt.ts`, `ui/styles.css` (3) | `spec/frontend/README.md` (§ hooks, § styles, § install button) | All 3 exist. `use-todos` exposes list/create/setStatus/delete; `use-install-prompt` exposes `{ canInstall, promptInstall }`; `styles.css` has the Tailwind directives + the CSS variables the tokens resolve against. |
| **serve-phone** | `scripts/serve-phone.mjs`, `scripts/free-port.mjs` | `serve-phone.mjs`, `free-port.mjs` (2) | `spec/infrastructure/README.md` | Both exist. `free-port.mjs` exports `reclaimPort(port)` (reclaims a port held by *our own* prior run; foreign listener left untouched). `serve-phone.mjs` = reclaim + build + pre-flight + cloudflared + exactly one QR print. |
| **smoke** | `scripts/smoke.mjs` | `smoke.mjs` (1) | `spec/infrastructure/README.md`, `spec/frontend/README.md` § Selector Contract | Exists. Reclaims 4173, **boots and tears down its own preview**, imports `reclaimPort` from `free-port.mjs`, and uses the native `HTMLInputElement` value setter for the React date input (`Object.getOwnPropertyDescriptor(proto, 'value').set` — direct `.value =` is swallowed by React). |
| **icons** | `public/icons/` | `make-icons.mjs` (writes itself, then runs to produce `icon-192.png` + `icon-512.png`) | `spec/frontend/README.md` § Icons | `make-icons.mjs` exists and has been run. `icon-192.png` and `icon-512.png` exist at the right path. Both PNGs decode at the exact pixel dimensions. The agent writes the helper from the spec, runs it once, and is done. |
| **configs** | repo root | `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.cjs`, `index.html` (5) | `spec/infrastructure/README.md` | All 5 exist. (`package.json` is **not** here — the main agent writes it; see § "Main-agent orchestration", step 2.) |

**Total: 28 files — 27 across the eight parallel module agents, plus
`package.json` written by the main agent.** (The icons agent writes 1
helper plus 2 generated PNGs; only the helper is an agent Write.)

The split pairs (`ui-view`/`ui-state`, `serve-phone`/`smoke`) share an
import edge but never a file, so they fan out with zero conflict risk;
imports resolve at the verify step like every other cross-agent edge.

### Main-agent orchestration

1. **Read the central spec.** Read `spec/README.md` only. Do **not**
   eagerly read the per-folder sub-specs — each module agent reads its
   own. The Implementation Plan table below is the complete handoff
   context the main agent needs for orchestration. Read a sub-spec
   lazily, on demand, only if verification fails or a subagent
   reports a question that the central spec does not answer. The
   point is to keep the main agent's context tight at spawn time.
   Reading a sub-spec up front is a defect, not a shortcut: it
   collapses the parallel dispatch this plan exists to produce. If you
   have already read a sub-spec, you must **still** dispatch its agent
   — do not implement it inline.
2. **Write `package.json`, then start install at t=0.** Before
   spawning any agent, the main agent writes `package.json` itself from
   the canonical block below — a fixed, pinned transcription with no
   design decisions — and immediately kicks `npm install` as a
   background command. Because the manifest already exists, install
   begins at t=0 and runs concurrently with every module agent: no
   poll, no `ENOENT` race, no dependence on harness file-watch timing.
   This is the only file the main agent writes.
3. **Spawn the agents.** In one message, spawn all eight module agents
   with parallel Agent calls. Hand each agent its row from the table
   above.
4. **Wait** for all eight module agents and `npm install` to return.
   With install started at step 2 it is normally already done by the
   time the agents return.
5. **Verify — concurrent.** In one message, run `npm run typecheck`
   and `npm run build`. Both must pass. This is where the modules
   connect: any cross-module type mismatch surfaces here, not at
   write time.
6. **Smoke.** Run `npm run smoke`; assert exit 0. The smoke script
   reclaims port 4173 and boots **and tears down** its own preview
   (reclaim → preview → puppeteer → tree-kill), so the orchestrator
   does **not** start a preview for it. The old `npm run preview &`
   step is gone — that stray ampersand is what orphaned 4173 and
   blocked the next run.
7. **Ship.** Run `npm run serve:phone` **in the foreground.** Do not
   background it, do not redirect its stdout, do not wrap it in a
   harness that captures output. The script's stdout *is* the QR;
   backgrounding it means the QR never reaches the user's terminal.
   The main agent stays attached to the script until the user
   terminates it with Ctrl-C. The main agent launches `serve:phone`
   itself and surfaces the printed QR; it does **not** hand this step
   to the user. The process stays running (tunnel up) until the user
   terminates it. **Do not declare success until the QR is on screen.**
   See § "Deliverable".

**Shell discipline (Windows).** Don't hand-roll readiness or port-check shell commands — the scripts own that lifecycle; and never pipe PowerShell syntax (`for (…)`, `Invoke-WebRequest`) into a bash shell or vice-versa.

#### Canonical `package.json`

The main agent writes this verbatim in step 2. It is the single source
of truth for the dependency surface and scripts; `spec/infrastructure/`
records the *rules* it must satisfy but does not duplicate the block.

```json
{
  "name": "todos",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev":         "vite",
    "build":       "vite build",
    "preview":     "vite preview --host 0.0.0.0 --port 4173 --strictPort",
    "typecheck":   "tsc --noEmit",
    "serve:phone": "node scripts/serve-phone.mjs",
    "smoke":       "node scripts/smoke.mjs",
    "clean":       "node scripts/free-port.mjs 4173"
  },
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

## MVP Cut

The "smallest subset that still ships the user story":

Required: form, list, repository, persistence, PWA install path,
**terminal QR**. The QR is the user-visible finish line of an install
run; it is part of the MVP.

Could be dropped if running out of time and still call it shipped:

- Delete control on rows (users could complete instead).

Everything else in this spec is part of the MVP cut.

## Decisions and Future Work

- **Decision (v1):** Single-screen, single-list. No multi-list types.
- **Decision (v1):** No edit. Misspellings are fixed by delete + re-add.
- **Decision (v1):** Completed items stay in the same list with
  strikethrough, not under a separate "Done" page.
- **Decision (v1):** No update toast. `vite-plugin-pwa` registers in
  `autoUpdate` mode and updates silently on next reload.
- **Decision (v1):** A small **Install** button appears in the header
  on Android Chrome when `beforeinstallprompt` fires. Reason: the
  final artifact is a scannable QR whose destination is actually
  installable. Chrome's own install affordance (mini-infobar, menu
  entry) is unreliable — engagement heuristics, dismissal cooldowns,
  and Chrome-variant browsers can all hide it. An in-app button that
  calls `prompt()` from a user gesture is the documented reliable
  path. The button is invisible on iOS Safari (no event fires there)
  and after install completes.
- **Future:** Inline edit on tap.
- **Future:** "Clear completed" bulk action.
- **Future:** Search / filtering.

## Editing this spec

Keep a code block canonical if removing it would let an implementer
satisfy the contract with code that ships a different user
experience. Otherwise prefer prose, a table, or a partial snippet.
That rule decides what stays and what trims.
