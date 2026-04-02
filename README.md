# @trishchuk/nest-casl

Declarative, role-based access control for [NestJS](https://docs.nestjs.com/) powered by [CASL](https://casl.js.org/v5/en/guide/intro). Works with REST, GraphQL and WebSocket.

[![CI Build](https://github.com/x51xxx/nest-casl/actions/workflows/build.yml/badge.svg)](https://github.com/x51xxx/nest-casl/actions/workflows/build.yml)
[![NPM version](https://img.shields.io/npm/v/@trishchuk/nest-casl.svg)](https://www.npmjs.com/package/@trishchuk/nest-casl)

## Installation

```bash
npm install @trishchuk/nest-casl
```

**Peer dependencies:** `@nestjs/core`, `@nestjs/common` (>= 7.0.0). Optional: `@nestjs/graphql`, `@nestjs/apollo`.

## Quick Start

```typescript
// 1. Define roles
export enum Roles { admin = 'admin', editor = 'editor', viewer = 'viewer' }

// 2. Configure root module
@Module({
  imports: [
    CaslModule.forRoot<Roles>({
      superuserRole: Roles.admin,
      getUserFromRequest: (request) => request.user,
    }),
  ],
})
export class AppModule {}

// 3. Define permissions per feature
const permissions: Permissions<Roles, Post, Actions> = {
  everyone({ can }) {
    can(Actions.read, Post);
  },
  editor({ user, can }) {
    can(Actions.update, Post, { authorId: user.id });
  },
};

@Module({
  imports: [CaslModule.forFeature({ permissions })],
})
export class PostModule {}

// 4. Protect endpoints
@Put(':id')
@UseGuards(AccessGuard)
@UseAbility(Actions.update, Post, PostHook)
async updatePost(@Param('id') id: string, @Body() input: UpdatePostInput) {
  return this.postService.update(id, input);
}

// 5. Use conditions for filtering
@Get()
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
async posts(@CaslFilter() filter: FindOptionsWhere<Post>) {
  return this.postService.findAll({ where: filter });
}
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Configuration](./docs/configuration.md) | `forRoot`, `forRootAsync`, `forFeature`, async/DB permissions, multi-tenant context |
| [Permissions](./docs/permissions.md) | Defining roles, conditions, inheritance, custom actions, multi-tenant |
| [Conditions](./docs/conditions.md) | `toFilter`, `toWhere`, `toSql`, `toMongo` — choosing the right method, ORM integration |
| [Hooks](./docs/hooks.md) | Subject hooks, user hooks, paramKey, execution flow |
| [Decorators](./docs/decorators.md) | `@UseAbility`, `@CaslConditions`, `@CaslFilter`, `@CaslSubject`, `@CaslUser` |
| [Examples](./docs/examples.md) | REST API, multi-tenant SaaS, scope-based, field-level, GraphQL with DB, testing |
| [Migration](./docs/migration.md) | From nest-casl or custom CASL implementation |
| [API Reference](./docs/api-reference.md) | Complete type signatures for all exports |

## Key Features

- **Role-based permissions** with `can()`, `cannot()`, `extend()` and `everyone`/`every`
- **Conditional access** — ownership checks like `{ userId: user.id }` with automatic subject fetching via hooks
- **Multi-transport** — HTTP, GraphQL, WebSocket via unified `ContextProxy`
- **Conditions as queries** — convert CASL rules to SQL, MongoDB, or plain filter objects via `@CaslConditions()` / `@CaslFilter()`
- **Multi-tenant support** — pass tenant context to permission builders via `getContextFromRequest`
- **Dynamic permissions** — load rules from database at runtime via `onBuildAbility` async hook
- **Custom ConditionsProxy** — `conditionsProxyFactory` for role-specific proxy behavior (e.g., admin gets no filter)
- **Field-level restrictions** — `cannot(action, subject, ['field'])` with customizable `getFieldsFromRequest`
- **Full DI integration** — root options registered as global NestJS provider, not global mutable state

## Comparison with nest-casl

This package is a fork of [nest-casl](https://www.npmjs.com/package/nest-casl) with bug fixes, new features, and architectural improvements. See [Migration Guide](./docs/migration.md) for a step-by-step upgrade path.

| Feature | nest-casl | @trishchuk/nest-casl |
|---------|-----------|---------------------|
| **Decorators** | `@UseAbility`, `@CaslConditions`, `@CaslSubject`, `@CaslUser` | All of the above + `@CaslFilter()` |
| **Conditions output** | `toSql()`, `toMongo()`, `toAst()` | All of the above + `toFilter()`, `toWhere()`, `toQuery()`, `getRules()` |
| **Permission context** | `user` only | `user` + custom `context` via `getContextFromRequest` |
| **Multi-tenant support** | Manual workaround | Built-in via `context` in permission builders |
| **DB-driven permissions** | Not supported | `onBuildAbility` async hook in `forFeature()` |
| **Module-scoped metadata** | Not supported | `moduleName` + `subjectsMap` in `forFeature()` |
| **Custom ConditionsProxy** | Requires replacing entire guard | `conditionsProxyFactory` option in `forRoot()` |
| **Field extraction** | Hardcoded `flatten(body)` | Customizable via `getFieldsFromRequest` |
| **@UseAbility options** | `(action, subject, hook)` | Also accepts `{ hook, paramKey }` object |
| **Root config storage** | Global mutable state (`Reflect.defineMetadata`) | NestJS DI provider (+ legacy fallback) |
| **AccessService methods** | Synchronous | Async (supports `onBuildAbility` hooks) |
| **Internal architecture** | Single monolithic `AccessService` | Decomposed: `AbilityResolver`, `AccessEvaluator`, `FieldAccessChecker` |
| **CASL type imports** | `@casl/ability/dist/types/types` (private) | Local `types.ts` (no private path dependency) |
| **AccessService export from forFeature** | Missing (bug [#905](https://github.com/getjerry/nest-casl/issues/905)) | Fixed |
| **Subject hook with mixed conditions** | Broken (bug [#923](https://github.com/getjerry/nest-casl/issues/923)) | Fixed |
| **ConditionsProxy stale user** | Uses pre-hook user | Uses post-hook user |

## License

MIT
