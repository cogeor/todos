# Spec Review — Failure Modes the Spec Should Have Caught

> Companion document to `spec/`. Records the gaps in the current spec that
> let an implementer build the wrong product in one shot. Reading the spec
> together with this review should be enough to avoid the same misses next time.

---

## What the spec told an implementer to build

Seven routes (Today, Upcoming, Inbox, Lists/:id, Completed, Todos/:id, Settings),
four entities (Todo, List, Tag, Settings), five services (todos, lists, tags,
reminders, settings), priority + reminder + tag fields on Todo, a notification
permission flow, a theme picker, a default-list picker, a sidebar + mobile
tab bar, and a five-layer architecture with ports, repositories, unit of work,
and clock injection.

## What the product actually needs

A single screen that shows a list of todos with due dates and one Add control
that accepts a title and a date. Items can be checked off. That is the entire
user-facing surface.

## Failure modes in the spec

### 1. No core user story at the top
`spec/README.md:7-21`. The spec opens with Goals → Non-goals → Tech Stack →
Architecture. There is no one-paragraph "the user opens the app and ..."
statement that the rest of the spec must be measured against. Without it,
every later section is free to invent features that look reasonable in
isolation but aren't tied to user value.

**Fix the spec by adding:** a "Core User Story" section as the first
substantive section, no more than one paragraph, naming the user action,
the screen, and the outcome.

### 2. Goals confuse user outcomes with engineering preferences
`spec/README.md:8-14`. Five goals are listed. Only "Installable on phone"
and "Offline-first" describe user-visible behaviour. "Educational: clean
layered architecture so the structure itself teaches good patterns" and
"Extendable" are engineering preferences. Mixed together, they implicitly
license the five-layer architecture and a wide entity model.

**Fix the spec by:** splitting "User goals" and "Engineering preferences"
into separate lists, and marking engineering preferences as scope-bearing
only when the user goal already requires them.

### 3. Non-goals are too narrow
`spec/README.md:16-20`. Excludes only server sync, push-while-closed,
sub-tasks, recurrence, attachments, sharing, multi-account. Does not
exclude multi-list, tags, priorities, reminders, notifications, themes,
default-list pickers, or multiple navigation destinations — none of which
the user actually wanted.

**Fix the spec by:** making non-goals aggressive. Default everything to
out-of-scope; promote features back in only with a written user-value
note attached.

### 4. Tech stack is chosen before scope is pinned
`spec/README.md:24-41`. TanStack Query, Zustand, React Router, Zod,
date-fns, ulid, Vitest, Playwright are picked up front. A single-screen
list-of-todos product does not need most of these. The tech list
implicitly grew the product to justify itself.

**Fix the spec by:** moving the tech stack table AFTER the user story and
success criteria, and listing only libraries that an explicit user-story
feature needs.

### 5. Architecture is presented as a given, not a choice
`spec/README.md:44-94`. Five strict layers with inward-pointing
dependency rules, ports/adapters between application and platform, a
unit-of-work abstraction, clock injection. The spec never asks whether
the cost of this is warranted by the product. For one screen and one
entity, it is not.

**Fix the spec by:** picking a weight class explicitly. Options should
include "single-file React component," "two layers (model + view),"
and "five layers." The chosen weight class should be justified by the
scale of the product, not assumed.

### 6. Domain types declare features the user story does not ask for
`spec/domain/README.md:44-110`. `Todo` has `priority`, `reminderAt`,
`reminderFiredAt`, `tagIds`, `position`, `description`. `List`, `Tag`,
`Settings`, `Theme`, `NotificationPermissionState` exist as first-class
domain types. None of these come from the user story.

**Fix the spec by:** annotating every domain type and every Todo field
with the user-story sentence that requires it. Fields with no annotation
are removed from v1.

### 7. A feature is documented as broken and built anyway
`spec/application/reminders.md:8-19`. A table states that reminders
"do not fire" when the app is installed but not running, which is the
expected state for an installed PWA almost all the time. The spec
acknowledges that the feature does not work in the intended deployment
shape, then builds it anyway under the label "best-effort." The right
spec-level move is to cut the feature, not to invent a fallback.

**Fix the spec by:** adding a rule that any feature whose own spec
flags a "does not work" case for the target deployment is automatically
moved to v2.

### 8. Multi-list infra around an admitted singleton
`spec/README.md:274`. "Ship with seed data: one 'Inbox' list, zero
todos." A singleton seed combined with a Lists CRUD surface, a
ListRepository, a ListService, a sidebar, a list page, a default-list
setting, and a list-deletion-moves-todos-to-Inbox policy is a heavy
abstraction around a feature that ships with one row. The spec did
not test the assumption that a user wants more than one list.

**Fix the spec by:** requiring a justification line whenever a CRUD
surface is added for an entity whose seed count is one. If no user
story creates a second row, the CRUD is cut.

### 9. Pages defined without per-route user justification
`spec/frontend/pages.md:38-49`. A seven-row route table. There is no
column tying each route to a user task. Today / Upcoming / Inbox /
Completed are four slices of one underlying list — slicing is a UX
choice, not a requirement.

**Fix the spec by:** giving the route table a "user task" column and
refusing routes that don't fill it. Sliced views of the same data are
collapsed into one route with optional filters.

### 10. Settings page is a feature dump
`spec/frontend/pages.md:158-176`. Seven sections (Appearance,
Notifications, Default list, Lists, Tags, Data, About). The existence
of a settings page is never justified against the user story. Each
section was effectively added because a corresponding feature exists,
not because the user needs the control.

**Fix the spec by:** treating settings as a feature like any other.
A settings page is included only if a user-story sentence requires
user control over something. With the actual user story above, no
settings page is warranted.

### 11. No Success Criteria section
`spec/README.md` has no "Success Criteria" section in the source spec.
A Success Criteria section, written immediately after the user story
and before architecture, forces "user sees todos with due dates and
can add one" to be criterion #1. The rest of the spec then has to
defend itself against that bar — which most of it cannot.

**Fix the spec by:** making a Success Criteria section a required
top-level section of the spec, before architecture, populated by
sentences that map 1:1 to user-story actions. (One was added
post-implementation; it should have been present from the start, and
its scope should have been narrower.)

### 12. No explicit MVP cut
The spec uses "v1" as a scope label but never defines a subset of v1
that, on its own, ships the user story. Without that cut, the
implementer treats the whole spec as the minimum target.

**Fix the spec by:** including an "MVP cut" subsection that names
the minimum subset of the spec which alone solves the user story.
Everything outside the cut is post-MVP, even if labelled v1.

### 13. PWA install flow conflicts with the rest of the spec
`user_flow.md` plus `spec/frontend/pwa.md`. The user-install flow
ends with "tap icon, app launches, works offline." A spec that
asserts offline-first single-user usage combined with a Settings
page including "Default list, Lists, Tags, Notifications" creates
control surfaces that have no offline-only meaning. The spec did
not check that every page is sensible under its own install
assumptions.

**Fix the spec by:** validating every page against the install flow.
If the install flow is "single device, tap icon, offline," then
notifications-permission and multi-list management are visible
surface for capabilities the user is not asked to manage.

## Spec hygiene checklist (apply to any future spec in this repo)

- [ ] Has a one-paragraph "Core User Story" as the first substantive section.
- [ ] Has a "Success Criteria" section before architecture, mapping 1:1 to user-story actions.
- [ ] Has aggressive "Non-Goals." Features not required by the user story are listed by name.
- [ ] Splits user goals from engineering preferences in the Goals list.
- [ ] Tech stack is chosen after the user story; each library names the user-story feature that requires it.
- [ ] Architecture weight class is chosen explicitly and justified by product scale.
- [ ] Every entity type and every field is annotated with the user-story sentence that requires it.
- [ ] Every route has a "user task" column entry. Sliced views of the same data are one route.
- [ ] CRUD surfaces over singleton-seeded entities require an explicit user-story for the second row.
- [ ] A "Settings" page exists only if the user story requires user control over something.
- [ ] Any feature whose own spec flags a "does not work in target deployment" case is moved to v2.
- [ ] An "MVP cut" subsection names the minimum subset that, on its own, ships the user story.
- [ ] Every page is sanity-checked against the install/deployment flow.

## How to read this review

When implementing from `spec/`, read this file alongside `spec/README.md`.
Where the checklist items above are not satisfied, treat the corresponding
spec content as suspect — implement only the part that is required by the
Core User Story, and flag the gap for the spec author rather than building
the over-spec'd version.
