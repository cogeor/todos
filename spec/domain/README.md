# Domain Layer

> Pure types and validation for the Todo entity. Depends only on `ulid`.

This is the smallest layer the app needs and the only one with rules
that change least over time.

## Files

```
src/domain/
  types.ts
  ids.ts
  rules.ts
  errors.ts
  index.ts
```

## Dependencies

- `ulid` — for ID generation.

Nothing else. In particular, no DOM, no React, no Dexie, no `date-fns`,
no `zod`, no calls to `Date.now()`. If a function needs the current
time, it takes `now: number` as a parameter so tests are deterministic.

## Types

```ts
// src/domain/types.ts

import type { TodoId } from './ids'

export type TodoStatus = 'open' | 'completed'

export interface Todo {
  readonly id: TodoId
  title: string
  /** Epoch ms at local midnight on the due day. */
  dueAt: number
  status: TodoStatus
  readonly createdAt: number
  completedAt?: number
}

export interface TodoInput {
  title: string
  dueAt: number
}
```

The entity has six fields. Each is required by the user story:

| Field | Why |
|---|---|
| `id` | Stable reference for toggle/delete operations |
| `title` | The user typed it |
| `dueAt` | The user picked a date |
| `status` | Checkbox state |
| `createdAt` | Stable tiebreak in sort, useful for debugging |
| `completedAt` | Sort key for the completed section |

No `description`, `priority`, `reminderAt`, `tagIds`, `position`,
`listId`. They have no place in the user story.

## IDs

```ts
// src/domain/ids.ts

import { ulid } from 'ulid'
import { ValidationError } from './errors'

export type TodoId = string & { readonly __brand: 'TodoId' }

export const newTodoId = (): TodoId => ulid() as TodoId

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export function parseTodoId(value: string): TodoId {
  const normalized = value.trim().toUpperCase()
  if (!ULID_RE.test(normalized)) throw new ValidationError('Invalid todo id')
  return normalized as TodoId
}
```

The brand prevents arbitrary strings being passed where a `TodoId` is
expected. Zero runtime cost.

`parseTodoId` is the canonical parser for any external-string source
(storage rehydration, URL params, imports). Keep it even when no UI
code calls it directly — its absence would force `as TodoId` casts
that defeat the brand.

## Validation

```ts
// src/domain/rules.ts

import { ValidationError } from './errors'
import type { TodoInput } from './types'

export function validateTodoInput(input: TodoInput): void {
  const title = input.title.trim()
  if (title.length < 1) throw new ValidationError('Title is required')
  if (title.length > 200) throw new ValidationError('Title is too long')
  if (!Number.isFinite(input.dueAt) || input.dueAt <= 0) {
    throw new ValidationError('Due date is required')
  }
}
```

A single function is the rule surface. The data layer calls it before
inserting; the UI surfaces the thrown message to the user.

No Zod, because there is one input shape and one validator.

## Errors

```ts
// src/domain/errors.ts

export class DomainError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ValidationError extends DomainError {}
export class NotFoundError extends DomainError {}
```

Two subclasses cover the actual throw sites in this product
(`validateTodoInput` and the repository's missing-record paths).

## Barrel

```ts
// src/domain/index.ts
export * from './types'
export * from './ids'
export * from './rules'
export * from './errors'
```

## Boundary Rules

Forbidden in `domain/`:

- DOM types, `window`, `navigator`, `localStorage`, `Notification`,
  `Date.now()`.
- React imports.
- `dexie`, the `db` instance, or anything from `@/data`.
- `date-fns`, `zod`, or any other helper library.

If a domain function needs the current time, take it as a parameter.

## Tests

Optional but recommended. The rule surface is small enough to cover in
one file:

```ts
// tests/unit/rules.test.ts
import { describe, it, expect } from 'vitest'
import { validateTodoInput, ValidationError } from '@/domain'

describe('validateTodoInput', () => {
  it('rejects empty title', () => {
    expect(() => validateTodoInput({ title: '   ', dueAt: 1 })).toThrow(ValidationError)
  })
  it('rejects missing dueAt', () => {
    expect(() => validateTodoInput({ title: 'x', dueAt: 0 })).toThrow(ValidationError)
  })
  it('accepts a valid input', () => {
    expect(() => validateTodoInput({ title: 'x', dueAt: 1 })).not.toThrow()
  })
})
```

Vitest is not required for delivery (per `spec/README.md` non-goals)
but the file lives here once added.
