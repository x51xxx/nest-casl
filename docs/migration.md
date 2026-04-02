# Migration from nest-casl to @trishchuk/nest-casl

Step-by-step guide to migrate from the original `nest-casl` package (getjerry/nest-casl) to `@trishchuk/nest-casl`.

## Step 1: Replace the Package

```bash
npm uninstall nest-casl
npm install @trishchuk/nest-casl
```

## Step 2: Update All Imports

Find and replace across the entire project:

```typescript
// Before
import { CaslModule, AccessGuard, ... } from 'nest-casl';

// After
import { CaslModule, AccessGuard, ... } from '@trishchuk/nest-casl';
```

**Search pattern:** `from 'nest-casl'` → `from '@trishchuk/nest-casl'`

If you import from internal paths (e.g., `nest-casl/dist/...`), replace those too:

```typescript
// Before
import { CaslConfig } from 'nest-casl/dist/casl.config';
import { ContextProxy } from 'nest-casl/dist/proxies/context.proxy';

// After — use public exports
import { ConditionsProxy, AccessService } from '@trishchuk/nest-casl';
```

All previously internal types are now exported from the main entry point.

## Step 3: Make AccessService Calls Async

`hasAbility()`, `assertAbility()`, and `getAbility()` now return Promises.

### hasAbility

```typescript
// Before (synchronous)
if (accessService.hasAbility(user, Actions.read, Post)) {
  // ...
}

// After (async)
if (await accessService.hasAbility(user, Actions.read, Post)) {
  // ...
}
```

### assertAbility

```typescript
// Before
try {
  accessService.assertAbility(user, Actions.update, post);
} catch (e) { ... }

// After
try {
  await accessService.assertAbility(user, Actions.update, post);
} catch (e) { ... }
```

### getAbility

```typescript
// Before
const ability = accessService.getAbility(user);

// After
const ability = await accessService.getAbility(user);
```

**Why this changed:** The ability factory is now async to support `onBuildAbility` hooks that load permissions from a database.

**No changes needed for:** `@UseAbility`, `@CaslConditions`, `@CaslSubject`, `@CaslUser`, `AccessGuard` — guards are already async.

## Step 4: Verify CaslModule Configuration

Your existing `forRoot()`, `forRootAsync()`, and `forFeature()` calls work without changes:

```typescript
// This stays the same
CaslModule.forRoot<Roles>({
  superuserRole: Roles.admin,
  getUserFromRequest: (request) => request.user,
})

// This stays the same
CaslModule.forFeature({ permissions })
```

The root options are now registered as a proper NestJS DI provider instead of global mutable state. This is transparent — no code changes needed.

## Step 5: Update Tests

### Sync → Async in Test Assertions

```typescript
// Before
it('allows read', () => {
  expect(accessService.hasAbility(user, Actions.read, Post)).toBe(true);
});

it('throws on unauthorized', () => {
  expect(() => accessService.assertAbility(user, Actions.delete, Post))
    .toThrowError(UnauthorizedException);
});

// After
it('allows read', async () => {
  expect(await accessService.hasAbility(user, Actions.read, Post)).toBe(true);
});

it('throws on unauthorized', async () => {
  await expect(accessService.assertAbility(user, Actions.delete, Post))
    .rejects.toThrowError(UnauthorizedException);
});
```

Note the pattern change for error assertions: `expect(() => ...).toThrowError()` becomes `await expect(...).rejects.toThrowError()`.

### E2E Tests

No changes needed — `AccessGuard` and decorators work the same way.

## Step 6: Remove Custom Workarounds (Optional)

If you built custom wrappers around `nest-casl`, you can now replace them with built-in features.

### Custom ConditionsProxy Subclass

If you extended `ConditionsProxy` to add a `getFilter()` method:

```typescript
// Before — custom class
class AppConditionsProxy<T> extends ConditionsProxy {
  getFilter(): FindOptionsWhere<T> {
    // custom logic
  }
}

// After — use built-in methods
conditions.toFilter<Post>()    // first condition as plain object
conditions.toWhere<Post>()     // merged conditions, $or flattened
```

Or replace `@CaslConditions()` + `getFilter()` with `@CaslFilter()`:

```typescript
// Before
@UseAbility(Actions.read, Post)
async posts(@CaslConditions() conditions: AppConditionsProxy<Post>) {
  return this.service.findAll(conditions.getFilter());
}

// After
@UseAbility(Actions.read, Post)
async posts(@CaslFilter() filter: FindOptionsWhere<Post>) {
  return this.service.findAll(filter);
}
```

### Custom Guard for Admin/Role-Specific Conditions

If you replaced `AccessGuard` to set different proxy types per role:

```typescript
// Before — custom 100+ line guard
if (user.roles.includes('admin')) {
  req.setConditions(new AdminProxy(...));
} else {
  req.setConditions(new AppProxy(...));
}

// After — use conditionsProxyFactory
CaslModule.forRoot({
  conditionsProxyFactory: (abilities, action, subject, user) => {
    if (user.roles?.includes('admin')) {
      return new AdminConditionsProxy(abilities, action, subject);
    }
    return new ConditionsProxy(abilities, action, subject);
  },
})
```

### Custom AbilityFactory for DB Permissions

If you replaced `AbilityFactory` to load permissions from a database:

```typescript
// Before — custom factory
@Injectable()
class CustomAbilityFactory {
  async createForUser(user) {
    const builder = new AbilityBuilder(Ability);
    // static permissions
    permissions.customer(builder);
    // dynamic permissions from DB
    const dbRules = await this.service.loadPermissions(user);
    dbRules.forEach(rule => builder.can(rule.action, ...));
    return builder.build();
  }
}

// After — use onBuildAbility hook
CaslModule.forFeature({
  permissions,
  async onBuildAbility(builder, request) {
    const dbRules = await service.loadPermissions(request.user);
    dbRules.forEach(rule => {
      builder.can(rule.action, subjectsMap[rule.subject], rule.conditions);
    });
  },
})
```

### Custom PermissionModule Wrapper

If you wrapped `CaslModule` to add `moduleName` or `subjectsMap`:

```typescript
// Before — custom wrapper
PermissionModule.forFeature({
  moduleName: 'OrderModule',
  subjectsMap: { Order, OrderItem },
  permissions: orderPermissions,
})

// After — built-in support
CaslModule.forFeature({
  permissions: orderPermissions,
  moduleName: 'OrderModule',
  subjectsMap: { Order, OrderItem },
})
```

### Custom Context in Permission Builders

If you extended the builder type to pass account/tenant data:

```typescript
// Before — type hack
rolePermissions({ ...ability, account } as any);

// After — built-in context
CaslModule.forRoot({
  getContextFromRequest: (req) => ({
    accountId: req.accountId,
    organizationId: req.organizationId,
  }),
})

// In permissions
customer({ context, can }) {
  const { accountId } = context as { accountId: number };
  can(Actions.read, Order, { accountId });
},
```

## Compatibility Reference

| nest-casl API | @trishchuk/nest-casl | Change |
|---------------|---------------------|--------|
| `CaslModule.forRoot()` | Same | Root options now also registered as DI provider |
| `CaslModule.forRootAsync()` | Same | Same |
| `CaslModule.forFeature()` | Same + `moduleName`, `subjectsMap`, `onBuildAbility` | Backward compatible |
| `@UseAbility(action, subject, hook)` | Same + options object variant | Backward compatible |
| `@CaslConditions()` | Same | No change |
| `@CaslSubject()` | Same | No change |
| `@CaslUser()` | Same | No change |
| `AccessGuard` | Same | No change |
| `AccessService.hasAbility()` | Returns `Promise<boolean>` | **Breaking** |
| `AccessService.assertAbility()` | Returns `Promise<void>` | **Breaking** |
| `AccessService.getAbility()` | Returns `Promise<AnyAbility>` | **Breaking** |
| `AccessService.canActivateAbility()` | Same (was already async) | No change |
| `ConditionsProxy.toSql()` | Same | No change |
| `ConditionsProxy.toMongo()` | Same | No change |
| `ConditionsProxy.toAst()` | Same | No change |
| `ConditionsProxy.get()` | Same | No change |
| — | `ConditionsProxy.toFilter()` | **New** |
| — | `ConditionsProxy.toWhere()` | **New** |
| — | `ConditionsProxy.toQuery()` | **New** |
| — | `ConditionsProxy.getRules()` | **New** (was private) |
| — | `@CaslFilter()` | **New** decorator |
| `Permissions<Roles, Subjects, Actions, User>` | + optional `Context` generic | Backward compatible |
| `OptionsForRoot` | + `getContextFromRequest`, `conditionsProxyFactory`, `getFieldsFromRequest` | Backward compatible |
| `OptionsForFeature` | + `moduleName`, `subjectsMap`, `onBuildAbility` | Backward compatible |
