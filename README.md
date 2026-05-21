# Todos

> A spec for a personal todo app. Hand the repo to a coding agent and
> it produces a working PWA on your phone in about five minutes.

There are many to-do mobile apps out there, but none of them were mine.

This was bothering me for a while. I downloaded one with ads, liked
some of the features from the paid ones but not the layout. It's just
never exactly what I need.

It's also very likely that my preferences will change over time. I want
to have the flexibility to change the app, without having to switch and
losing all my notes.

There's a French proverb that translates to *"You're never better
served than by yourself."* I think it's good advice.

AI gives people who are not senior devs the power to make their own
tools — that's why I think it's so powerful. You know your notes will
be confidential, because you can trust yourself.

In this post, I won't try to sell you my app, I want you to make yours.
This won't be the last thing I build; if you like this style please
consider subscribing.

---

There are a few technical choices that need to be made if you want to
go from a clean session to a working app on your phone. The mobile
landscape is… complicated, to say the least.

So I'm giving you a **spec**: a set of Markdown files in `spec/` that
translate directly into a working prototype when handed to a coding
agent.

Copy-paste this repo's URL into the coding agent of your choice, ask
questions if necessary, then ask it to implement the spec. You may need
to install a few things; nothing your agent can't handle.

It won't be exactly the same every time, but it will save you hours of
searching for the right technical choices and give you good structure
for making your app better. You will be able to install it simply by
scanning a QR code.

I chose a **Progressive Web App (PWA)**: a web app you install on your
phone like a native app. It has a few limitations, but the hard part is
going from 0 to 1 — everything can be made better after.

We are not vibecoding here. We use LLMs as word-to-code compilers. Feel
free to modify the spec until you have your ideal to-do app.

I hope you found this useful. I started posting a few days ago, and so
far it's the first social media platform I enjoy using. Thanks for
reading.

---

## Technical setup

### 1. One-time install on your laptop

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

### 2. Clone the spec and point your agent at it

```bash
git clone https://github.com/cogeor/todos.git
cd todos
```

Open the coding agent of your choice in this directory — Claude Code,
Cursor, Aider, whichever — and tell it:

> Implement everything in `spec/`. Follow the success criteria in
> `spec/README.md`. Verify by running `npm run smoke` against
> `npm run preview`.

The agent will write `src/`, `package.json`, the Vite/Tailwind/TS
configs, `scripts/serve-phone.mjs`, and `scripts/smoke.mjs`. None of
those are in the repo on purpose — they are regenerated from the spec.

Expect roughly five minutes of work and one `npm install`.

### 3. Build and put it on your phone

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

The full play-by-play and the eight install gotchas (tunnel URLs are
single-use, networks that block trycloudflare, etc.) are in
[`user_flow.md`](./user_flow.md).

### 4. Customize it

The spec is small and lives in `spec/`. Edit the Markdown to taste —
add a field, change the palette, add a tab — and re-run your agent
with the new spec.

Before adding scope, read
[`spec/_authoring/REVIEW.md`](./spec/_authoring/REVIEW.md): a memento
of failure modes from an earlier over-spec'd draft. Specs drift fast.

---

## What's in this repo

```
spec/
  README.md                  core user story, success criteria, architecture
  domain/README.md           types + validation (one entity, one rule)
  data/README.md             Dexie + repository (one table)
  frontend/README.md         one screen, grey + white palette, PWA
  infrastructure/README.md   build, serve:phone, smoke
  _authoring/REVIEW.md       optional: failure modes a spec should catch
user_flow.md                 phone install flow with QR
README.md                    this file
.gitignore
```

Everything else (`src/`, `node_modules/`, `dist/`, `package.json`, the
configs) is git-ignored. The spec writes those.

## Tech choices, in one paragraph

React 18 + TypeScript (strict) for the UI. Tailwind 3 for styling,
**dark grey and white only**, system theme via `prefers-color-scheme`.
Vite 5 for build, `vite-plugin-pwa` for the service worker and
manifest. Dexie 4 for IndexedDB. `ulid` for IDs. Three layers: pure
domain, single-table data, one-screen UI. No router, no global state
library, no form library, no service layer — the user story doesn't
need them. Smoke test via `puppeteer-core` against the system Chrome.

Full rationale: [`spec/README.md`](./spec/README.md).
