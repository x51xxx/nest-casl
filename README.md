# @trishchuk/nest-casl

Access control for NestJS with CASL

[![CI Build](https://github.com/x51xxx/nest-casl/actions/workflows/build.yml/badge.svg)](https://github.com/x51xxx/nest-casl/actions/workflows/build.yml)
[![NPM version](https://img.shields.io/npm/v/@trishchuk/nest-casl.svg)](https://www.npmjs.com/package/@trishchuk/nest-casl)

Declarative, role-based access control for [NestJS](https://docs.nestjs.com/) applications powered by [CASL](https://casl.js.org/v5/en/guide/intro). Works with REST, GraphQL and WebSocket contexts.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Application Configuration](#application-configuration)
  - [Synchronous Configuration](#synchronous-configuration)
  - [Asynchronous Configuration](#asynchronous-configuration)
- [Permissions Definition](#permissions-definition)
  - [Default Actions](#default-actions)
  - [Defining Permissions per Module](#defining-permissions-per-module)
  - [Role Inheritance](#role-inheritance)
- [Access Control](#access-control)
  - [AccessGuard and UseAbility](#accessguard-and-useability)
  - [Subject Hook](#subject-hook)
  - [Tuple Subject Hook](#tuple-subject-hook)
- [Decorators](#decorators)
  - [CaslSubject](#caslsubject)
  - [CaslConditions](#caslconditions)
  - [CaslUser](#casluser)
- [AccessService (Programmatic)](#accessservice-programmatic)
- [Advanced Usage](#advanced-usage)
  - [User Hook](#user-hook)
  - [Custom Actions](#custom-actions)
  - [Custom User and Request Types](#custom-user-and-request-types)
- [Testing](#testing)
- [API Reference](#api-reference)

## Installation

```bash
npm install @trishchuk/nest-casl
# or
yarn add @trishchuk/nest-casl
```

**Peer dependencies** (required):
- `@nestjs/core` >= 7.0.0
- `@nestjs/common` >= 7.0.0

**Optional peer dependencies** (for GraphQL support):
- `@nestjs/graphql` >= 7.0.0
- `@nestjs/apollo` >= 7.0.0

## Quick Start

```typescript
// 1. Define roles
export enum Roles {
  admin = 'admin',
  customer = 'customer',
}

// 2. Configure module
@Module({
  imports: [
    CaslModule.forRoot<Roles>({
      superuserRole: Roles.admin,
      getUserFromRequest: (request) => request.user,
    }),
  ],
})
export class AppModule {}

// 3. Define permissions
const permissions: Permissions<Roles, Post, Actions> = {
  everyone({ can }) {
    can(Actions.read, Post);
  },
  customer({ user, can }) {
    can(Actions.update, Post, { userId: user.id });
  },
};

// 4. Register in feature module
@Module({
  imports: [CaslModule.forFeature({ permissions })],
})
export class PostModule {}

// 5. Protect endpoints
@UseGuards(AuthGuard, AccessGuard)
@UseAbility(Actions.update, Post, PostHook)
async updatePost(@Args('input') input: UpdatePostInput) {
  return this.postService.update(input);
}
```

## Application Configuration

### Synchronous Configuration

Define roles and configure `CaslModule.forRoot()` in your root module:

```typescript
// app.roles.ts
export enum Roles {
  admin = 'admin',
  operator = 'operator',
  customer = 'customer',
}
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { CaslModule } from '@trishchuk/nest-casl';
import { Roles } from './app.roles';

@Module({
  imports: [
    CaslModule.forRoot<Roles>({
      // Role with unrestricted access (optional)
      superuserRole: Roles.admin,
      // Extract user from request (optional, defaults to request.user)
      getUserFromRequest: (request) => request.currentUser,
    }),
  ],
})
export class AppModule {}
```

The user object must implement `AuthorizableUser<Roles, Id>`:

```typescript
interface AuthorizableUser<Roles = string, Id = string> {
  id: Id;
  roles: Array<Roles>;
}
```

### Asynchronous Configuration

Use `forRootAsync()` when configuration depends on injected services:

```typescript
@Module({
  imports: [
    CaslModule.forRootAsync({
      useFactory: async (configService: ConfigService) => ({
        superuserRole: configService.get('SUPERUSER_ROLE'),
        getUserFromRequest: (request) => request.user,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## Permissions Definition

### Default Actions

The library provides a set of default actions. `manage` has the special meaning of **any action**.

```typescript
enum DefaultActions {
  read = 'read',
  aggregate = 'aggregate',
  create = 'create',
  update = 'update',
  delete = 'delete',
  manage = 'manage',
}
```

`DefaultActions` is aliased as `Actions` for convenience.

### Defining Permissions per Module

Permissions are defined per feature module. The `everyone` key (alias: `every`) applies to all users regardless of role.

```typescript
// post.permissions.ts
import { Permissions, Actions, InferSubjects } from '@trishchuk/nest-casl';
import { Roles } from '../app.roles';
import { Post } from './dtos/post.dto';

type Subjects = InferSubjects<typeof Post>;

export const permissions: Permissions<Roles, Subjects, Actions> = {
  everyone({ can }) {
    can(Actions.read, Post);
    can(Actions.create, Post);
  },

  customer({ user, can }) {
    can(Actions.update, Post, { userId: user.id });
  },

  operator({ can, cannot, extend }) {
    extend(Roles.customer);
    can(Actions.manage, Post);
    cannot(Actions.delete, Post);
  },
};
```

Register permissions in the feature module:

```typescript
// post.module.ts
import { Module } from '@nestjs/common';
import { CaslModule } from '@trishchuk/nest-casl';
import { permissions } from './post.permissions';

@Module({
  imports: [CaslModule.forFeature({ permissions })],
})
export class PostModule {}
```

### Role Inheritance

Use `extend()` inside a permission definition to inherit all permissions from another role:

```typescript
operator({ can, cannot, extend }) {
  extend(Roles.customer);  // inherits all customer permissions
  can(Actions.manage, Post);
  cannot(Actions.delete, Post);  // override: deny delete
},
```

## Access Control

### AccessGuard and UseAbility

`AccessGuard` checks permissions based on `@UseAbility()` metadata. It expects an authenticated user on the request. If no user is found, access is denied.

```typescript
import { UseGuards } from '@nestjs/common';
import { AccessGuard, UseAbility, Actions } from '@trishchuk/nest-casl';

@Resolver(() => Post)
export class PostResolver {
  constructor(private postService: PostService) {}

  // Anyone with read permission
  @Query(() => [Post])
  @UseGuards(AccessGuard)
  @UseAbility(Actions.read, Post)
  async posts() {
    return this.postService.findAll();
  }

  // Conditional permission with subject hook
  @Mutation(() => Post)
  @UseGuards(AuthGuard, AccessGuard)
  @UseAbility(Actions.update, Post, PostHook)
  async updatePost(@Args('input') input: UpdatePostInput) {
    return this.postService.update(input);
  }
}
```

Works the same way with REST controllers:

```typescript
@Controller('posts')
export class PostController {
  @Get()
  @UseAbility(Actions.read, Post)
  async posts() {
    return this.postService.findAll();
  }

  @Put(':id')
  @UseGuards(AccessGuard)
  @UseAbility(Actions.update, Post, PostHook)
  async updatePost(@Param('id') id: string, @Body() input: UpdatePostInput) {
    return this.postService.update({ ...input, id });
  }
}
```

### Subject Hook

For permissions with conditions (e.g., `{ userId: user.id }`), a subject hook fetches the actual entity to check conditions against. Implement `SubjectBeforeFilterHook`:

```typescript
// post.hook.ts
import { Injectable } from '@nestjs/common';
import { Request, SubjectBeforeFilterHook } from '@trishchuk/nest-casl';
import { PostService } from './post.service';
import { Post } from './dtos/post.dto';

@Injectable()
export class PostHook implements SubjectBeforeFilterHook<Post, Request> {
  constructor(readonly postService: PostService) {}

  async run({ params }: Request) {
    return this.postService.findById(params.input.id);
  }
}
```

Pass it as the third argument to `@UseAbility()`:

```typescript
@UseAbility(Actions.update, Post, PostHook)
```

### Tuple Subject Hook

For simple cases, use an inline tuple instead of a class. The tuple injects a single service:

```typescript
@UseAbility<Post>(Actions.update, Post, [
  PostService,
  (service: PostService, { params }) => service.findById(params.input.id),
])
```

Class hooks are preferred — they support full dependency injection and can be reused across endpoints.

## Decorators

### CaslSubject

Access the lazy-loaded subject obtained from the [subject hook](#subject-hook), cached on the request:

```typescript
@Mutation(() => Post)
@UseGuards(AuthGuard, AccessGuard)
@UseAbility(Actions.update, Post, PostHook)
async updatePost(
  @Args('input') input: UpdatePostInput,
  @CaslSubject() subjectProxy: SubjectProxy<Post>,
) {
  const post = await subjectProxy.get();
}
```

### CaslConditions

Access permission conditions as SQL, MongoDB, or AST format. Useful for filtering records in queries. Subject hook is not required.

```typescript
@Mutation(() => Post)
@UseGuards(AuthGuard, AccessGuard)
@UseAbility(Actions.update, Post)
async updatePosts(
  @Args('input') input: UpdatePostInput,
  @CaslConditions() conditions: ConditionsProxy,
) {
  conditions.toSql();   // ['"userId" = $1', ['userId'], []]
  conditions.toMongo(); // { $or: [{ userId: 'userId' }] }
  conditions.toAst();   // CASL AST condition tree
  conditions.get();     // Raw conditions array
}
```

### CaslUser

Access the lazy-loaded user, obtained from the request or [user hook](#user-hook), cached on the request:

```typescript
@Mutation(() => Post)
@UseGuards(AuthGuard, AccessGuard)
@UseAbility(Actions.update, Post)
async updatePost(
  @Args('input') input: UpdatePostInput,
  @CaslUser() userProxy: UserProxy<User>,
) {
  const user = await userProxy.get();
}
```

## AccessService (Programmatic)

Use `AccessService` for manual permission checks without `AccessGuard`:

```typescript
import { AccessService, Actions, CaslUser, UserProxy } from '@trishchuk/nest-casl';

@Resolver(() => Post)
export class PostResolver {
  constructor(
    private postService: PostService,
    private accessService: AccessService,
  ) {}

  @Mutation(() => Post)
  @UseGuards(AuthGuard)
  async updatePost(
    @Args('input') input: UpdatePostInput,
    @CaslUser() userProxy: UserProxy<User>,
  ) {
    const user = await userProxy.get();
    const post = await this.postService.findById(input.id);

    // Throws UnauthorizedException (403) when no conditions match
    // Throws NotFoundException (404) when conditions exist but subject doesn't match
    this.accessService.assertAbility(user, Actions.update, post);

    // Returns boolean
    this.accessService.hasAbility(user, Actions.update, post);

    // Check specific field
    this.accessService.hasAbility(user, Actions.update, post, 'title');
  }
}
```

## Advanced Usage

### User Hook

When permission conditions require more user data than what's on `request.user`, configure a user hook. It runs only for abilities with conditions, after `getUserFromRequest`.

**Class hook:**

```typescript
// user.hook.ts
import { Injectable } from '@nestjs/common';
import { UserBeforeFilterHook } from '@trishchuk/nest-casl';
import { UserService } from './user.service';
import { User } from './dtos/user.dto';

@Injectable()
export class UserHook implements UserBeforeFilterHook<User> {
  constructor(readonly userService: UserService) {}

  async run(user: User) {
    return {
      ...user,
      ...(await this.userService.findById(user.id)),
    };
  }
}
```

```typescript
// app.module.ts
@Module({
  imports: [
    CaslModule.forRoot({
      getUserFromRequest: (request) => request.user,
      getUserHook: UserHook,
    }),
  ],
})
export class AppModule {}
```

**Tuple hook:**

```typescript
CaslModule.forRoot({
  getUserFromRequest: (request) => request.user,
  getUserHook: [
    UserService,
    async (service: UserService, user) => service.findById(user.id),
  ],
})
```

> **Tip:** The user hook executes in the context of each authorized module. To avoid importing the user module everywhere, make it `@Global()`.

### Custom Actions

Extend the default actions with custom ones:

```typescript
enum CustomActions {
  feature = 'feature',
  publish = 'publish',
}

export type Actions = DefaultActions | CustomActions;
export const Actions = { ...DefaultActions, ...CustomActions };
```

Use custom actions in permissions and `@UseAbility()` the same way as defaults.

### Custom User and Request Types

For users with non-string IDs or custom request shapes, pass type parameters to `forRoot()`:

```typescript
class User implements AuthorizableUser<Roles, number> {
  id: number;
  roles: Array<Roles>;
}

interface CustomRequest {
  loggedInUser: User;
}

@Module({
  imports: [
    CaslModule.forRoot<Roles, User, CustomRequest>({
      superuserRole: Roles.admin,
      getUserFromRequest: (request) => request.loggedInUser,
    }),
  ],
})
export class AppModule {}
```

## Testing

The library includes comprehensive test examples:

- **Unit tests** — alongside source files (`*.spec.ts`)
- **E2E tests** — in [`src/__specs__/`](https://github.com/x51xxx/nest-casl/tree/master/src/__specs__) with a full NestJS test app

Example test setup:

```typescript
import { Test } from '@nestjs/testing';
import { CaslModule } from '@trishchuk/nest-casl';

const moduleRef = await Test.createTestingModule({
  imports: [
    PostModule,
    UserModule,
    CaslModule.forRoot<Roles>({
      superuserRole: Roles.admin,
      getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
    }),
  ],
})
  .overrideProvider(PostService)
  .useValue(mockPostService)
  .compile();

const app = moduleRef.createNestApplication();
await app.init();
```

## API Reference

### Module Methods

| Method | Description |
|--------|-------------|
| `CaslModule.forRoot(options)` | Global configuration with `superuserRole`, `getUserFromRequest`, `getUserHook` |
| `CaslModule.forRootAsync(options)` | Async configuration with `useFactory` and `inject` |
| `CaslModule.forFeature({ permissions })` | Per-module permissions registration |

### Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@UseAbility(action, subject, hook?)` | Method | Sets ability metadata for AccessGuard |
| `@CaslUser()` | Parameter | Injects `UserProxy` |
| `@CaslSubject()` | Parameter | Injects `SubjectProxy` |
| `@CaslConditions()` | Parameter | Injects `ConditionsProxy` |

### Services

| Service | Method | Description |
|---------|--------|-------------|
| `AccessService` | `hasAbility(user, action, subject, field?)` | Returns `boolean` |
| `AccessService` | `assertAbility(user, action, subject, field?)` | Throws `UnauthorizedException` or `NotFoundException` |
| `AccessService` | `getAbility(user)` | Returns CASL `Ability` instance |

### Proxies

| Proxy | Method | Description |
|-------|--------|-------------|
| `UserProxy<User>` | `get()` | Returns user from hook or request (cached) |
| `SubjectProxy<Subject>` | `get()` | Returns subject from hook (cached) |
| `ConditionsProxy` | `toSql()` | Returns `[sql, params, joins]` |
| `ConditionsProxy` | `toMongo()` | Returns MongoDB query object |
| `ConditionsProxy` | `toAst()` | Returns CASL AST condition tree |
| `ConditionsProxy` | `get()` | Returns raw conditions array |

## License

MIT
