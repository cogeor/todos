# Todos — Specification

> An installable, offline-first PWA that shows a list of todos with due
> dates. Spec-first: an implementer reading this folder should be able to
> ship a working app in one shot.

This is the v0.2 spec. v0.1 over-spec'd the product; see `spec/REVIEW.md`
for the failure modes the rewrite is meant to fix.

---

## Core User Story

The user opens the app and sees their todo items, each showing a title
and a due date. They tap **Add**, enter a title and a date, and the new
item appears in the list, sorted by due date. They tick items off as
they finish them. They can delete items they no longer want. Data
persists locally, survives reloads, and works offline.

That is the entire user-facing surface.

## Success Criteria

A build is considered done when every item passes.

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
   worker, 192/512 icons.
9. `node scripts/smoke.mjs` against the running preview server adds,
   completes, and deletes a todo. Exit code 0.

## Non-Goals (everything not above is out of scope)

Cut by name, so an implementer can't accidentally rebuild them:

- Multiple lists. There is one list.
- Tags, priorities, descriptions, attachments, sub-tasks, recurrence,
  drag-to-reorder, sharing, multi-user.
- Notifications, reminders, push, badges, install-prompt button.
- Theme toggle. The app follows the system colour scheme automatically.
- Settings page. There is no settings page.
- Search, filtering, day grouping, "Today / Upcoming / Inbox" views.
- Editing a todo's title or date. To correct a mistake, delete and
  re-add.
- Server sync, accounts, auth.
- Full test suite. A single `scripts/smoke.mjs` is the verification
  oracle. Vitest may be added later but is not required for delivery.

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

See `spec/REVIEW.md` for why heavier architectures were rejected.

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

## Project Layout

```
todos/
  spec/                            (this folder)
    README.md
    REVIEW.md
    domain/README.md
    data/README.md
    frontend/README.md
    infrastructure/README.md

  public/
    favicon.svg
    icons/
      icon-192.svg
      icon-512.svg

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
    serve-phone.mjs         # vite preview + cloudflared + terminal QR
    smoke.mjs               # headless smoke (puppeteer-core)

  index.html
  package.json
  vite.config.ts
  tailwind.config.ts
  postcss.config.cjs
  tsconfig.json
  user_flow.md
  README.md
```

## Install Flow (developer side)

The user installs the PWA by scanning a QR. The developer runs one
command to make that QR appear.

```powershell
npm install
npm run serve:phone
```

`scripts/serve-phone.mjs` (described in `spec/infrastructure/README.md`):

1. Boots `vite preview` on port 4173.
2. Polls until the local server responds.
3. Boots `cloudflared tunnel --url http://localhost:4173`.
4. Watches cloudflared's stdout for a `https://*.trycloudflare.com` URL.
5. Renders that URL as a terminal QR via `qrcode-terminal` and prints
   the URL underneath.
6. Forwards both child logs; on Ctrl+C, terminates both children.

The user-side narrative (which phone browser to use, the Android vs.
iOS install gestures, the "tunnel URL is single-use" caveat) lives in
`user_flow.md` and is unchanged from v0.1.

## Implementation Order

1. `domain/` — types, IDs, validation, errors. No dependencies.
2. `data/` — Dexie schema and the singleton repository.
3. `ui/` — App, form, row, hook, styles.
4. `scripts/serve-phone.mjs` — install flow.
5. `scripts/smoke.mjs` — verify the success criteria.

Each layer is complete before the next starts.

## MVP Cut

The "smallest subset that still ships the user story":

Required: form, list, repository, persistence, PWA install path.

Could be dropped if running out of time and still call it shipped:

- Delete control on rows (users could complete instead).
- Terminal QR (could print the tunnel URL as plain text and the
  developer pastes it into a QR generator).

Everything else in this spec is part of the MVP cut.

## Decisions and Future Work

- **Decision (v1):** Single-screen, single-list. No multi-list types.
- **Decision (v1):** No edit. Misspellings are fixed by delete + re-add.
- **Decision (v1):** Completed items stay in the same list with
  strikethrough, not under a separate "Done" page.
- **Decision (v1):** No update toast. `vite-plugin-pwa` registers in
  `autoUpdate` mode and updates silently on next reload.
- 📌 **Future:** Inline edit on tap.
- 📌 **Future:** "Clear completed" bulk action.
- 📌 **Future:** Search / filtering.

## Companion Documents

- `user_flow.md` — user-side install narrative.
- `spec/REVIEW.md` — memento on failure modes from the v0.1 spec. Apply
  the checklist there to keep this spec honest.
