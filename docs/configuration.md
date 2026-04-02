# Configuration

## forRoot — Global Configuration

Call `CaslModule.forRoot()` once in your root module.

```typescript
import { Module } from '@nestjs/common';
import { CaslModule } from '@trishchuk/nest-casl';

export enum Roles {
  admin = 'admin',
  operator = 'operator',
  customer = 'customer',
}

@Module({
  imports: [
    CaslModule.forRoot<Roles>({
      superuserRole: Roles.admin,
      getUserFromRequest: (request) => request.user,
    }),
  ],
})
export class AppModule {}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `superuserRole` | `Roles` | — | Role that bypasses all permission checks |
| `getUserFromRequest` | `(request) => User` | `(req) => req.user` | Extracts the authenticated user from request |
| `getUserHook` | `Class \| Tuple` | — | Hook to enrich user data for conditional rules |
| `getContextFromRequest` | `(request) => Context` | — | Extracts custom context available in permission builders |
| `conditionsProxyFactory` | `(abilities, action, subject, user) => ConditionsProxy` | — | Custom factory for creating ConditionsProxy instances |
| `getFieldsFromRequest` | `(request) => string[]` | `flatten(body)` | Custom field extraction for field-level restrictions |

### User Interface

The user object must implement `AuthorizableUser`:

```typescript
import { AuthorizableUser } from '@trishchuk/nest-casl';

class User implements AuthorizableUser<Roles, number> {
  id: number;
  roles: Roles[];
}
```

## forRootAsync — Async Configuration

Use when configuration depends on injected services:

```typescript
CaslModule.forRootAsync({
  useFactory: async (configService: ConfigService) => ({
    superuserRole: configService.get('SUPERUSER_ROLE'),
    getUserFromRequest: (request) => request.user,
  }),
  inject: [ConfigService],
})
```

With module imports:

```typescript
CaslModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    superuserRole: configService.get('SUPERUSER_ROLE'),
    getUserFromRequest: (request) => request.user,
  }),
  inject: [ConfigService],
})
```

## forFeature — Per-Module Permissions

Each feature module registers its own permissions:

```typescript
import { Module } from '@nestjs/common';
import { CaslModule } from '@trishchuk/nest-casl';
import { permissions } from './post.permissions';

@Module({
  imports: [CaslModule.forFeature({ permissions })],
})
export class PostModule {}
```

### Feature Options

| Option | Type | Description |
|--------|------|-------------|
| `permissions` | `Permissions<Roles, Subjects, Actions>` | Role-to-permission mapping |
| `moduleName` | `string` | Module identifier for scoped DB-driven permissions |
| `subjectsMap` | `Record<string, Subject>` | String-to-class mapping for dynamic subject resolution |
| `onBuildAbility` | `(builder, request) => Promise<void>` | Async hook to add dynamic permissions (e.g., from database) |

### Dynamic Permissions from Database

```typescript
CaslModule.forFeature({
  permissions,
  moduleName: 'PostModule',
  subjectsMap: { Post, Comment },
  async onBuildAbility(builder, request) {
    const dbRules = await permissionService.loadForUser(
      request.user,
      'PostModule',
    );
    dbRules.forEach((rule) => {
      const op = rule.inverted ? builder.cannot : builder.can;
      op(rule.action, subjectsMap[rule.subject], rule.conditions);
    });
  },
})
```

## Custom Request Context

Pass additional context (e.g., tenant ID) to permission builders via `getContextFromRequest`:

```typescript
// app.module.ts
CaslModule.forRoot<Roles, User, CustomRequest>({
  getUserFromRequest: (request) => request.user,
  getContextFromRequest: (request) => ({
    accountId: request.accountId,
    tenantId: request.headers['x-tenant-id'],
  }),
})

// post.permissions.ts
const permissions: Permissions<Roles, Post, Actions> = {
  customer({ context, user, can }) {
    // context is the object returned by getContextFromRequest
    can(Actions.read, Post, { accountId: (context as any).accountId });
    can(Actions.update, Post, { userId: user.id });
  },
};
```
