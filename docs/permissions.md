# Permissions

## Defining Permissions

Permissions are defined as a mapping of roles to permission functions. Each function receives a builder with `can()`, `cannot()`, `extend()`, `user`, and `context`.

```typescript
import { Permissions, Actions, InferSubjects } from '@trishchuk/nest-casl';

type Subjects = InferSubjects<typeof Post | typeof Comment>;

export const permissions: Permissions<Roles, Subjects, Actions> = {
  // Applied to all users regardless of role
  everyone({ can }) {
    can(Actions.read, Post);
  },

  // Role-specific permissions
  customer({ user, can }) {
    can(Actions.create, Post);
    can(Actions.update, Post, { userId: user.id });
  },

  operator({ can, cannot, extend }) {
    extend('customer'); // inherit customer permissions
    can(Actions.manage, Post);
    cannot(Actions.delete, Post);
  },
};
```

## Default Actions

```typescript
enum DefaultActions {
  read = 'read',
  aggregate = 'aggregate',
  create = 'create',
  update = 'update',
  delete = 'delete',
  manage = 'manage', // special: matches ANY action
}
```

Aliased as `Actions` for convenience.

## Role Inheritance

Use `extend()` to inherit all permissions from another role:

```typescript
operator({ can, cannot, extend }) {
  extend('customer');
  can(Actions.manage, Post);
  cannot(Actions.delete, Post); // deny even though manage allows it
},
```

## everyone / every

`everyone` (alias: `every`) runs for all users before role-specific permissions:

```typescript
const permissions: Permissions<Roles, Post, Actions> = {
  every({ can }) {  // same as everyone
    can(Actions.read, Post);
  },
};
```

## Conditional Permissions

Add conditions to restrict access based on entity properties:

```typescript
customer({ user, can, cannot }) {
  // Can only update posts they own
  can(Actions.update, Post, { userId: user.id });

  // Can update own posts but not the userId field
  cannot(Actions.update, Post, ['userId']);
},
```

When conditions are present, a [subject hook](./hooks.md) is needed to fetch the actual entity for comparison.

## Custom Actions

Extend default actions with domain-specific ones:

```typescript
enum CustomActions {
  publish = 'publish',
  archive = 'archive',
  invoice = 'invoice',
}

export type Actions = DefaultActions | CustomActions;
export const Actions = { ...DefaultActions, ...CustomActions };
```

Use in permissions and decorators the same way:

```typescript
const permissions: Permissions<Roles, Post, Actions> = {
  editor({ can }) {
    can(Actions.publish, Post);
  },
};

@UseAbility(Actions.publish, Post)
async publishPost() { ... }
```

## Multi-Tenant Permissions with Context

Use `getContextFromRequest` to pass tenant/account data into permission builders:

```typescript
// In forRoot:
getContextFromRequest: (request) => ({
  accountId: request.accountId,
})

// In permissions:
const permissions: Permissions<Roles, Post, Actions> = {
  operator({ context, can }) {
    const { accountId } = context as { accountId: number };
    can(Actions.read, Post, { accountId });
    can(Actions.update, Post, { accountId });
  },
};
```
