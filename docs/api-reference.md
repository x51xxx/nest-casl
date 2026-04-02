# API Reference

## Module

### CaslModule.forRoot(options)

Global configuration. Call once in root module.

```typescript
CaslModule.forRoot<Roles, User, Request, Context>(options: OptionsForRoot)
```

### CaslModule.forRootAsync(options)

Async global configuration with factory and DI.

```typescript
CaslModule.forRootAsync<Roles, User, Request>(options: OptionsForRootAsync)
```

### CaslModule.forFeature(options)

Per-module permission registration.

```typescript
CaslModule.forFeature<Roles, Subjects, Actions, User>(options: OptionsForFeature)
```

---

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@UseAbility(action, subject, hookOrOptions?)` | Method | Sets permission metadata for AccessGuard |
| `@CaslConditions()` | Parameter | Injects `ConditionsProxy` with all conversion methods |
| `@CaslFilter()` | Parameter | Injects filter object directly (`toFilter()` result) |
| `@CaslSubject()` | Parameter | Injects `SubjectProxy` (cached entity from hook) |
| `@CaslUser()` | Parameter | Injects `UserProxy` (user from request or hook) |

---

## AccessService

Injectable service for programmatic permission checks. Feature-scoped — each `forFeature()` module gets its own instance with its permissions.

### Methods

#### `getAbility(user): Promise<AnyAbility>`

Returns a CASL Ability instance for the user.

#### `hasAbility(user, action, subject, field?): Promise<boolean>`

Checks if user can perform action on subject. Returns `true` for superuser.

#### `assertAbility(user, action, subject, field?): Promise<void>`

Throws if user cannot perform action:
- `UnauthorizedException` — no permission at all
- `NotFoundException` — has conditional permission but subject doesn't match

#### `canActivateAbility(request, abilityMetadata): Promise<boolean>`

Full authorization flow used by `AccessGuard`. Handles user extraction, superuser check, subject hooks, user hooks, conditions, and field restrictions.

---

## AccessGuard

NestJS `CanActivate` guard. Reads `@UseAbility()` metadata and delegates to `AccessService.canActivateAbility()`.

```typescript
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
```

---

## Proxies

### ConditionsProxy

Converts CASL permission rules to query-ready formats.

| Method | Return Type | Description |
|--------|-------------|-------------|
| `toSql()` | `[string, unknown[], string[]] \| undefined` | Parametrized PostgreSQL query |
| `toMongo()` | `MongoQuery \| undefined` | MongoDB query object |
| `toAst()` | `Condition \| null` | CASL AST condition tree |
| `toFilter<T>()` | `T \| undefined` | First non-inverted rule's conditions as plain object |
| `toQuery<T>()` | `T \| undefined` | Merged conditions via rulesToQuery with $or/$in operators |
| `toWhere<T>()` | `T \| T[] \| undefined` | ORM-friendly: $or flattened to array, $in preserved |
| `get()` | `MongoQuery[]` | Raw conditions array from all rules |
| `getRules()` | `Rule[]` | Underlying CASL rules for action+subject |

### UserProxy\<User\>

| Method | Return Type | Description |
|--------|-------------|-------------|
| `get()` | `Promise<User \| undefined>` | User from hook (priority) or request |
| `getFromRequest()` | `User \| undefined` | User directly from request |
| `getFromHook()` | `Promise<User \| undefined>` | User from UserBeforeFilterHook |

### SubjectProxy\<Subject\>

| Method | Return Type | Description |
|--------|-------------|-------------|
| `get()` | `Promise<Subject \| undefined>` | Subject from hook or cache |

### RequestProxy

| Method | Description |
|--------|-------------|
| `getConditions()` | Get cached ConditionsProxy |
| `setConditions(proxy)` | Cache ConditionsProxy |
| `getSubject()` | Get cached subject |
| `setSubject(subject)` | Cache subject |
| `getUser()` | Get cached user |
| `setUser(user)` | Cache user |
| `getParams()` | Get normalized params (casl.params or request.params) |
| `getUserHook()` | Get UserBeforeFilterHook |
| `setUserHook(hook)` | Set UserBeforeFilterHook |
| `getSubjectHook()` | Get SubjectBeforeFilterHook |
| `setSubjectHook(hook)` | Set SubjectBeforeFilterHook |

---

## Types

### AuthorizableUser\<Roles, Id\>

```typescript
interface AuthorizableUser<Roles = string, Id = string> {
  id: Id;
  roles: Array<Roles>;
}
```

### Permissions\<Roles, Subjects, Actions, User, Context\>

```typescript
type Permissions<Roles, Subjects, Actions, User, Context> =
  Partial<Record<Roles | 'every' | 'everyone', DefinePermissions<Subjects, Actions, User, Context>>>;
```

### DefinePermissions\<Subjects, Actions, User, Context\>

```typescript
type DefinePermissions<Subjects, Actions, User, Context> =
  (builder: UserAbilityBuilder<Subjects, Actions, User, Context>) => void;
```

### UserAbilityBuilder

Extends CASL's `AbilityBuilder` with:
- `user` — the authenticated user
- `context` — custom context from `getContextFromRequest`
- `extend(role)` — inherit another role's permissions
- `permissionsFor(role)` — apply a specific role's permissions

### UseAbilityOptions

```typescript
interface UseAbilityOptions<Subject, Request> {
  hook?: AnyClass<SubjectBeforeFilterHook<Subject, Request>> | SubjectBeforeFilterTuple;
  paramKey?: string;
}
```

### OptionsForRoot

```typescript
interface OptionsForRoot<Roles, User, Request, Context> {
  superuserRole?: Roles;
  getUserFromRequest?: (request: Request) => User | undefined;
  getUserHook?: AnyClass<UserBeforeFilterHook<User>> | UserBeforeFilterTuple<User>;
  getContextFromRequest?: (request: Request) => Context;
  conditionsProxyFactory?: (abilities, action, subject, user) => ConditionsProxy;
  getFieldsFromRequest?: (request: AuthorizableRequest<User>) => string[];
}
```

### OptionsForFeature

```typescript
interface OptionsForFeature<Roles, Subjects, Actions, User> {
  permissions: AnyPermissions<Roles, Subjects, Actions, User>;
  moduleName?: string;
  subjectsMap?: Record<string, Subject>;
  onBuildAbility?: (builder, request) => Promise<void>;
}
```
