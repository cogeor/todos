# Data Layer

> One Dexie table. One repository. Returns and accepts only domain types.

This layer owns persistence and nothing else. The UI never sees Dexie.

## Files

```
src/data/
  db.ts
  todo-repository.ts
  index.ts
```

## Dependencies

- `dexie`
- `@/domain`

## Schema

```ts
// src/data/db.ts

import Dexie, { type Table } from 'dexie'
import type { Todo } from '@/domain'

export class TodosDB extends Dexie {
  todos!: Table<Todo, string>

  constructor() {
    super('todos-app')
    this.version(1).stores({
      todos: 'id, status, dueAt, [status+dueAt]',
    })
  }
}

export const db = new TodosDB()
```

Index rationale:

| Index | Used by |
|---|---|
| `id` | Primary key, lookups by id |
| `status` | Filtering open vs completed |
| `dueAt` | Sorting by due date |
| `[status+dueAt]` | The main list query |

No migrations. If the schema ever needs to change, a new `.version(2)`
block is added; the old block is never edited.

There is no seed step. The app starts empty.

## Repository

```ts
// src/data/todo-repository.ts

import {
  newTodoId,
  NotFoundError,
  validateTodoInput,
  type Todo,
  type TodoId,
  type TodoInput,
  type TodoStatus,
} from '@/domain'
import { db } from './db'

export interface TodoRepository {
  list(): Promise<Todo[]>
  create(input: TodoInput): Promise<Todo>
  setStatus(id: TodoId, status: TodoStatus): Promise<Todo>
  delete(id: TodoId): Promise<void>
}

class TodoRepositoryImpl implements TodoRepository {
  async list(): Promise<Todo[]> {
    const rows = await db.todos.toArray()
    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      if (a.status === 'open') return a.dueAt - b.dueAt
      return (b.completedAt ?? 0) - (a.completedAt ?? 0)
    })
    return rows
  }

  async create(input: TodoInput): Promise<Todo> {
    validateTodoInput(input)
    const now = Date.now()
    const todo: Todo = {
      id: newTodoId(),
      title: input.title.trim(),
      dueAt: input.dueAt,
      status: 'open',
      createdAt: now,
    }
    await db.todos.add(todo)
    return todo
  }

  async setStatus(id: TodoId, status: TodoStatus): Promise<Todo> {
    const existing = await db.todos.get(id)
    if (!existing) throw new NotFoundError(`Todo ${id} not found`)
    const next: Todo =
      status === 'completed'
        ? { ...existing, status, completedAt: Date.now() }
        : { id: existing.id, title: existing.title, dueAt: existing.dueAt,
            status: 'open', createdAt: existing.createdAt }
    await db.todos.put(next)
    return next
  }

  async delete(id: TodoId): Promise<void> {
    const existing = await db.todos.get(id)
    if (!existing) throw new NotFoundError(`Todo ${id} not found`)
    await db.todos.delete(id)
  }
}

export const todoRepository: TodoRepository = new TodoRepositoryImpl()
```

Four methods. Each maps 1:1 to a user-story action (list, add,
toggle, delete). `setStatus` is one method instead of two
(`complete`/`uncomplete`) because the UI only needs to mirror the
checkbox state.

The repository is a singleton. The UI imports the instance. There is
no DI container; a single entity and a single consumer do not warrant
one.

## Barrel

```ts
// src/data/index.ts
export { todoRepository, type TodoRepository } from './todo-repository'
export type { Todo, TodoId, TodoStatus, TodoInput } from '@/domain'
```

Re-exporting the domain types means the UI imports everything it needs
from `@/data` and never sees Dexie.

## Boundary Rules

Allowed:
- `dexie`, `@/domain`.

Forbidden:
- React, DOM globals, `window`, `navigator`.
- Any application-layer abstractions (`UnitOfWork`, ports, container).
  Those do not exist; do not invent them.

## Errors

- `validateTodoInput` may throw `ValidationError` during `create`.
- `setStatus` and `delete` throw `NotFoundError` if the row is missing.

The UI catches these at the call site (the hook in `ui/use-todos.ts`).
Dexie's own errors propagate uncaught; the user story has no
specifically-translated failure modes for them in v1.

## Tests

Optional. If added: `tests/integration/todo-repository.test.ts` using
`fake-indexeddb/auto`, exercising `list`, `create`, `setStatus`,
`delete`.

Not required for delivery — the smoke test (`scripts/smoke.mjs`)
exercises the repository end-to-end through the UI.
