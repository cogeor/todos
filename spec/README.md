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
do not run `serve:phone`. **The main agent is responsible for making
the complete QR visible to the user: it must render the entire QR
block (every row, untruncated) and the `*.trycloudflare.com` URL
beneath it in its own reply — not merely let `serve:phone`'s output
scroll past in a tool buffer.** A truncated, summarized, or "see
above" QR **has not shipped**. The process must also stay alive (tunnel
up) until the user stops it.

One invariant, two runtimes. The invariant: the full QR ends up in
front of the user, and the tunnel stays up until they install.
- **At a human terminal:** run `serve:phone` in the **foreground**,
  attached, with stdout not redirected away, so the QR renders
  directly to the screen. Stay attached until Ctrl-C.
- **In an agent / automation harness (no shared terminal):** the main
  agent **captures** `serve:phone`'s output, waits for the QR and URL
  to appear, **reprints the entire QR block verbatim** in its reply,
  and leaves the process running so the tunnel stays up. Capturing the
  output is **required** here, not forbidden — it is the only way the
  QR reaches the user.

What defeats the deliverable is the QR never becoming fully visible to
the user, a truncated QR, or the tunnel being torn down before the
user has installed.

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
9. `node scripts/smoke.mjs` — which frees its own dedicated port
   42730 (never 41730) and boots and tears down its own preview server
   there — adds, completes, and deletes a todo. Exit code 0.
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
    free-port.mjs           # freePort(port) helper + `npm run clean` CLI
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
2. Boots `vite preview` on port 41730.
3. Polls until the local server responds.
4. **Pre-flight:** fetches `/`, `/manifest.webmanifest`, and every
   icon URL from the manifest. All must return 200, the manifest must
   parse, and it must contain at least one 192 and one 512 icon. If
   any pre-flight check fails, the script aborts with a one-line
   message and never opens the tunnel — there is no broken QR to
   scan.
5. Boots `cloudflared tunnel --url http://localhost:41730`.
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

The work partitions into **nine independent agents**. They
**parallelize** — they run concurrently, have no execution order
between them, and never wait on each other. Within each agent, it
**fans out** its file writes: every file it owns is emitted in a
single message with parallel Write calls. There is no internal
ordering either.

The partition is balanced for **wall-clock**, not just for tidy
ownership. The batch finishes only when its *slowest* agent returns,
so the two heaviest concerns — the UI screen and the install scripts —
are split so that no single long agent gates everything. `ui` splits
into a **view** agent (markup + the binding Selector Contract) and a
**state** agent (hooks + styles). `scripts` splits **three** ways:
`free-port` owns the shared `free-port.mjs` helper, `serve-phone` owns
the install-flow orchestrator, and `smoke` owns the test. Carving
`free-port` out gives the one file *imported by two other agents* a
single owner instead of leaving the `freePort` helper implicit across
`serve-phone` and `smoke` (see `spec/infrastructure/README.md`
§ "Port reclaim"). The helper itself is small — a bind-probe plus a
kill-the-listener fallback on project-reserved ports — so this agent is
no longer the long pole; it must **not** pad its runtime by spinning up
live servers to test itself.

**This is a spec, not code.** TypeScript only resolves when types and
the build are checked at the end of the run. Until then, every agent is
just files on disk. The conflict boundary is the **file**, not the folder: two
agents writing *different files* — even in the same folder — cannot
conflict. That is exactly what lets the heavy folders (`src/ui/`,
`scripts/`) be split across more agents for more parallelism.

The **main agent** writes **no files at all**. It is the interactive
coding agent the user opened in the repo (Claude Code or equivalent).
Every file the run produces — all of `src/`, the root configs,
`scripts/`, `public/`, and `package.json` itself — belongs to the
module agents (`package.json` is the `configs` agent's, alongside the
other root configs). The main agent's job is: read the spec, spawn the
nine module agents, kick `npm install` in the background the moment
`package.json` lands on disk (see § "Main-agent orchestration",
step 3), run the final verification chain, and run
`npm run serve:phone` so the QR appears in its own terminal — in
contact with the user. Subagents do not run `serve:phone`. This is a
hard rule. A run where the main agent wrote **any** file itself has
failed the orchestration contract even if every gate passes and the QR
prints.

### The nine agents

| Agent | Owns | Files | Reads | Done when |
|---|---|---|---|---|
| **domain** | `src/domain/` | `errors.ts`, `ids.ts`, `types.ts`, `rules.ts`, `index.ts` (5) | `spec/domain/README.md` | All 5 exist. Barrel re-exports the other four. Zero DOM / React / Dexie imports. |
| **data** | `src/data/` | `db.ts`, `todo-repository.ts`, `index.ts` (3) | `spec/data/README.md` + domain types | All 3 exist. Repository exposes `list` / `create` / `setStatus` / `delete`. No Dexie types leak through the barrel. |
| **ui-view** | `src/App.tsx`, `src/main.tsx`, `src/ui/*.tsx` | `App.tsx`, `main.tsx`, `ui/todo-app.tsx`, `ui/todo-row.tsx`, `ui/todo-form.tsx` (5) | `spec/frontend/README.md` (whole file; Selector Contract is binding) | All 5 exist. Selectors, aria-labels, and DOM shape match § "Selector Contract" **verbatim** — smoke asserts literal strings. Imports the hooks + styles owned by **ui-state**. |
| **ui-state** | `src/ui/` hooks + styles | `ui/use-todos.ts`, `ui/use-install-prompt.ts`, `ui/styles.css` (3) | `spec/frontend/README.md` (§ hooks, § styles, § install button) | All 3 exist. `use-todos` exposes list/create/setStatus/delete; `use-install-prompt` exposes `{ canInstall, promptInstall }`; `styles.css` has the Tailwind directives + the CSS variables the tokens resolve against. |
| **free-port** | `scripts/free-port.mjs` | `free-port.mjs` (1) | `spec/infrastructure/README.md` § "Port reclaim" | Exists. Exports `freePort(port): Promise<boolean>` — bind-probes the port first (no subprocess when already free), and only if occupied finds the listener PID(s) and tree-kills them, returning `true` once bindable. Ports are project-reserved, so there is no "ours vs foreign" fingerprinting. Also runs as a CLI (`node scripts/free-port.mjs <port>`). Single owner of the `freePort` helper that `serve-phone` and `smoke` both import. **Just write the file from the spec — do NOT spawn live test servers to self-verify; the end-of-run typecheck/build/smoke chain validates it.** |
| **serve-phone** | `scripts/serve-phone.mjs` | `serve-phone.mjs` (1) | `spec/infrastructure/README.md` | Exists. **Sole owner of port 41730** — imports `freePort` from `free-port.mjs`, then `if (!(await freePort(41730))) abort`, builds, pre-flights, opens the tunnel, and prints exactly one QR. No other script touches 41730. |
| **smoke** | `scripts/smoke.mjs` | `smoke.mjs` (1) | `spec/infrastructure/README.md`, `spec/frontend/README.md` § Selector Contract | Exists. Runs on its **own dedicated port (42730), never 41730**: imports `freePort` from `free-port.mjs`, `if (!(await freePort(42730))) abort`, **boots and tears down its own preview** there (spawns `vite preview --port 42730 --strictPort` directly), and uses the native `HTMLInputElement` value setter for the React date input (`Object.getOwnPropertyDescriptor(proto, 'value').set` — direct `.value =` is swallowed by React). |
| **icons** | `public/icons/` | `make-icons.mjs` (writes itself, then runs to produce `icon-192.png` + `icon-512.png`) | `spec/frontend/README.md` § Icons | `make-icons.mjs` exists and has been run. `icon-192.png` and `icon-512.png` exist at the right path. Both PNGs decode at the exact pixel dimensions. The agent writes the helper from the spec, runs it once, and is done. |
| **configs** | repo root | `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.cjs`, `index.html` (6) | `spec/infrastructure/README.md` | All 6 exist. `package.json` matches the dependency + script surface in `spec/infrastructure/README.md` § "package.json" exactly. |

**Total: 26 files across the nine parallel agents.** (The icons agent
writes 1 helper plus 2 generated PNGs; only the helper is an agent
Write.)

The split groups (`ui-view`/`ui-state`, and `free-port`/`serve-phone`/
`smoke`) share import edges but never a file, so they fan out with zero
conflict risk; imports resolve at the typecheck/build step like every
other cross-agent edge. `serve-phone` and `smoke` both import `freePort`
from the `free-port` agent's file — that edge resolves at typecheck/build
time exactly like the others, and because `free-port` owns the helper,
neither importer has to reimplement it.

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
2. **Spawn the agents.** In one message, spawn all nine module agents
   with parallel Agent calls. Hand each agent its row from the table
   above. The main agent writes nothing itself.
3. **Start install when `package.json` lands.** The `configs` agent
   writes `package.json`; the moment it exists on disk, kick
   `npm install` as a background command so it overlaps the rest of the
   batch — `npm install` is the longest fixed cost in the run. If the
   harness can't watch for the file landing, kick `npm install` right
   after spawning the agents — it waits for `package.json` to appear on
   its own.
4. **Wait for the batch — it is asynchronous.** The nine agents run
   concurrently and each can take **several minutes**; the batch is done
   only when **every** agent has returned its report. Wait on those
   reports — do **not** infer progress by polling the filesystem. A
   missing, empty, or half-written tree mid-run is **normal**: it means
   agents are still working, not that they failed. Do **not** start
   writing module files yourself because files "aren't there yet" — that
   is the single most common way this run goes wrong (see § "Recovery").
5. **Verify — types + build.** Run `npm run typecheck` and
   `npm run build` (these may run concurrently). Both must pass. This is
   where the modules connect: any cross-module type mismatch, missing
   file, or wrong import surfaces here, not at write time.
6. **Smoke.** Run `npm run smoke`; assert exit 0. The smoke script
   runs entirely on its **own dedicated port (42730), never 41730**: it
   frees 42730 and boots **and tears down** its own preview there
   (free → preview → puppeteer → tree-kill), so the orchestrator
   does **not** start a preview for it. The old `npm run preview &`
   step is gone — that stray ampersand is what orphaned a port and
   blocked the next run. Because smoke never touches 41730, the smoke
   gate and the final serve step can never contend for the deliverable
   port, and a stale smoke preview can never orphan it.
7. **Ship.** Run `npm run serve:phone`. Its stdout carries the QR. The
   main agent must get the **complete** QR in front of the user and
   keep the tunnel up — see § "Deliverable" for the invariant and the
   two runtime modes:
   - **At a human terminal:** run it in the **foreground**, attached,
     stdout not redirected, and stay attached until Ctrl-C.
   - **In an agent harness (no shared TTY):** start it, watch its
     output until the `*.trycloudflare.com` URL and QR block appear,
     then **reprint the entire QR block (all rows) and the URL verbatim
     in your reply**, and leave the process running so the tunnel stays
     up.

   Either way: never tear the process down before the user has
   installed, and never show a partial or truncated QR. The main agent
   launches `serve:phone` itself and shows the QR; it does **not** hand
   this step to the user. **Do not declare success until the full QR is
   on screen in your reply.**

### Recovery — when an agent fails or output looks wrong

The steps above are the happy path. The moment reality deviates, there is
exactly one correct response, and one tempting wrong one. **The wrong one
— the main agent picking up a module and implementing it inline — is what
fails the orchestration contract** (the main agent writes no files
itself; see § "Implementation Plan"). Do not take it, even under time
pressure, even if it looks faster.

- **An agent is slow or silent.** It is still working (§ step 4). Wait.
  Do not implement its files.
- **An agent returns an error, times out, or reports a question.** Read
  its own sub-spec (lazily, only now), then **re-dispatch that one agent**
  with the error or the answer. Re-running one agent is cheap; becoming
  the implementer is not.
- **typecheck or build fails (a type mismatch, a missing file, an
  unexpected import, or an invented path).** This is a cross-module
  contract gap, not a cue to rewrite a module by hand. Identify the
  owning agent from the table and re-dispatch it with the error. If an
  agent invented a file the partition does not include, delete the stray
  file and re-dispatch the owning agent with its exact file list — do
  not "adopt" the invented layout.

Never substitute a different design (a different storage layer, an extra
feature, renamed selectors) for what an agent was supposed to produce —
the smoke test's Selector Contract and the Non-Goals list are binding, and
a hand-substituted module silently breaks both.

**Shell discipline (Windows).** Don't hand-roll readiness or port-check shell commands — the scripts own that lifecycle; and never pipe PowerShell syntax (`for (…)`, `Invoke-WebRequest`) into a bash shell or vice-versa. Run every command from the repo root (the cloned `todos/` directory, where `package.json` lives) — not its parent — so `npm install` / `build` / `smoke` resolve `package.json` without a `--prefix` and don't fire twice.

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
