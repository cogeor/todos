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
do not run `serve:phone`. The QR appears in the terminal of the agent
that is in contact with the user.

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
9. `node scripts/smoke.mjs` against the running preview server adds,
   completes, and deletes a todo. Exit code 0.
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
    favicon.svg
    icons/
      icon-192.svg            # geometry source of truth
      icon-512.svg
      icon-192.png            # decoded from base64 in spec/frontend/README.md
      icon-512.png            # decoded from base64 in spec/frontend/README.md

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

The work partitions into **six independent modules**. Each module is
one agent. The six agents **parallelize** — they run concurrently,
have no execution order between them, and never wait on each other.
Within each module, the agent **fans out** its file writes: every
file the module owns is emitted in a single message with parallel
Write calls. There is no internal ordering inside a module either.

**This is a spec, not code.** TypeScript only resolves at the verify
step at the end of the run. Until then, every module is just files on
disk in a separate folder. Two agents writing files in different
folders cannot conflict, so they fan out concurrently.

The **main agent** does not write source files. It is the interactive
coding agent the user opened in the repo (Claude Code or equivalent).
Its job: read the spec, spawn the six module agents, kick `npm install`
in the background, run the final verification chain, and run
`npm run serve:phone` so the QR appears in its own terminal — in
contact with the user. Subagents do not run `serve:phone`.

### The six modules

| Agent | Owns | Files | Reads | Done when |
|---|---|---|---|---|
| **domain** | `src/domain/` | `errors.ts`, `ids.ts`, `types.ts`, `rules.ts`, `index.ts` (5) | `spec/domain/README.md` | All 5 exist. Barrel re-exports the other four. Zero DOM / React / Dexie imports. |
| **data** | `src/data/` | `db.ts`, `todo-repository.ts`, `index.ts` (3) | `spec/data/README.md` + domain types | All 3 exist. Repository exposes `list` / `create` / `setStatus` / `delete`. No Dexie types leak through the barrel. |
| **ui** | `src/App.tsx`, `src/main.tsx`, `src/ui/` | `App.tsx`, `main.tsx`, `ui/styles.css`, `ui/use-todos.ts`, `ui/use-install-prompt.ts`, `ui/todo-row.tsx`, `ui/todo-form.tsx`, `ui/todo-app.tsx` (8) | `spec/frontend/README.md` (whole file; Selector Contract is binding) | All 8 exist. Selectors, aria-labels, and DOM shape match § "Selector Contract" **verbatim** — smoke asserts literal strings. |
| **scripts** | `scripts/` | `serve-phone.mjs`, `smoke.mjs` (2) | `spec/infrastructure/README.md`, `spec/frontend/README.md` § Selector Contract | Both exist. `serve-phone.mjs` = build + pre-flight + cloudflared + exactly one QR print. `smoke.mjs` uses the native `HTMLInputElement` value setter for the React date input (`Object.getOwnPropertyDescriptor(proto, 'value').set` — direct `.value =` is swallowed by React). |
| **icons** | `public/`, `public/icons/` | `favicon.svg`, `icons/icon-192.svg`, `icons/icon-512.svg`, `icons/icon-192.png`, `icons/icon-512.png` (5) | `spec/frontend/README.md` § Icons | All 5 exist. SVGs match the canonical geometry (dark square + two light bars). PNGs are decoded byte-for-byte from the base64 blocks in the spec and land at 2 232 / 6 464 bytes respectively. |
| **configs** | repo root | `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.cjs`, `index.html` (6) | `spec/README.md`, `spec/infrastructure/README.md` | All 6 exist. `package.json` dependency list matches the infrastructure spec exactly. |

**Total: 29 files across 6 parallel agents.**

### Main-agent orchestration

1. **Read the spec.** In one message, read all 5 files under `spec/`
   (`spec/README.md`, `domain/`, `data/`, `frontend/`,
   `infrastructure/`) with parallel Read calls. Do not read anything
   else.
2. **Spawn the modules.** In one message, spawn all 6 module agents
   with parallel Agent calls. Hand each agent its row from the table
   above.
3. **Install in the background.** The moment `package.json` exists on
   disk, kick `npm install` as a background command. It takes 30–90 s
   and runs concurrently with the module agents. If the harness can't
   watch for the file landing, kick `npm install` immediately after
   step 2 — it waits for `package.json` to appear on its own.
4. **Wait** for all 6 module agents and `npm install` to return.
5. **Verify — concurrent.** In one message, run `npm run typecheck`
   and `npm run build`. Both must pass. This is where the modules
   connect: any cross-module type mismatch surfaces here, not at
   write time.
6. **Smoke.** Boot `npm run preview` in the background; run
   `npm run smoke`; assert exit 0.
7. **Ship.** Run `npm run serve:phone`. **One QR must print** — in the
   main agent's terminal, where the user can see it. Do not declare
   success until the QR is on screen. See § "Deliverable".

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
