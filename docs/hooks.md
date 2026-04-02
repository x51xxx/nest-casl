# Hooks

## Subject Hook

When permissions have conditions (e.g., `{ userId: user.id }`), the guard needs the actual entity to evaluate them. Subject hooks fetch the entity before the permission check.

### Class Hook (recommended)

Full DI support and reusable across endpoints:

```typescript
import { Injectable } from '@nestjs/common';
import { Request, SubjectBeforeFilterHook } from '@trishchuk/nest-casl';
import { PostService } from './post.service';
import { Post } from './dtos/post.dto';

@Injectable()
export class PostHook implements SubjectBeforeFilterHook<Post, Request> {
  constructor(readonly postService: PostService) {}

  async run({ params }: Request) {
    return this.postService.findById(params.id);
  }
}
```

Usage:

```typescript
@UseAbility(Actions.update, Post, PostHook)
```

### Tuple Hook

For quick prototyping — injects a single service:

```typescript
@UseAbility<Post>(Actions.update, Post, [
  PostService,
  (service: PostService, { params }) => service.findById(params.id),
])
```

### paramKey Option

Simplify parameter extraction by specifying which param to use:

```typescript
@UseAbility(Actions.update, Post, {
  hook: PostHook,
  paramKey: 'postId',
})
```

The `paramKey` is stored on `request.casl.paramKey` and accessible in hooks:

```typescript
async run(request: Request) {
  const id = request.casl?.paramKey
    ? request.params[request.casl.paramKey]
    : request.params.id;
  return this.postService.findById(id);
}
```

## User Hook

Enriches the user object with additional data needed for conditional permissions. Runs only when the ability has conditions and a subject hook.

### Class Hook

```typescript
import { Injectable } from '@nestjs/common';
import { UserBeforeFilterHook } from '@trishchuk/nest-casl';
import { User } from './dtos/user.dto';
import { UserService } from './user.service';

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

Configure in `forRoot()`:

```typescript
CaslModule.forRoot({
  getUserFromRequest: (request) => request.user,
  getUserHook: UserHook,
})
```

### Tuple Hook

```typescript
CaslModule.forRoot({
  getUserFromRequest: (request) => request.user,
  getUserHook: [
    UserService,
    async (service: UserService, user) => service.findById(user.id),
  ],
})
```

> **Tip:** The user hook runs in each authorized module's context. Make your user module `@Global()` to avoid importing it everywhere.

## Hook Execution Flow

```
Request → AccessGuard
  1. Extract user from request (getUserFromRequest)
  2. Check superuser → allow immediately
  3. Build abilities from permissions
  4. Check if rules have conditions AND subject hook exists
     No  → evaluate against subject class (can user do X to ANY Post?)
     Yes → run subject hook to fetch entity
           → run user hook to enrich user (if configured)
           → evaluate against subject instance (can user do X to THIS post?)
  5. Check field restrictions (if body present)
  6. Return result
```
