# Decorators

## @UseAbility(action, subject, hookOrOptions?)

Sets permission metadata on a route handler. Used by `AccessGuard` to determine what to check.

```typescript
// Basic — check "can user read Post?"
@UseAbility(Actions.read, Post)

// With class hook — fetches entity for conditional check
@UseAbility(Actions.update, Post, PostHook)

// With tuple hook
@UseAbility<Post>(Actions.update, Post, [
  PostService,
  (service: PostService, { params }) => service.findById(params.id),
])

// With options object — hook + paramKey
@UseAbility(Actions.update, Post, {
  hook: PostHook,
  paramKey: 'postId',
})
```

## @CaslConditions()

Parameter decorator that injects `ConditionsProxy` — the CASL rules converted to query-ready formats.

```typescript
@Query(() => [Post])
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
async posts(
  @CaslConditions() conditions: ConditionsProxy,
) {
  // SQL: ['"userId" = $1', ['userId'], []]
  const sql = conditions.toSql();

  // MongoDB: { $or: [{ userId: 'userId' }] }
  const mongo = conditions.toMongo();

  // CASL AST
  const ast = conditions.toAst();

  // First non-inverted condition as plain object
  const filter = conditions.toFilter<{ userId: string }>();

  // Merged query with $or/$in operators (input for ORM translators)
  const query = conditions.toQuery();

  // Flattened for ORM where clauses ($or → array, $in preserved)
  const where = conditions.toWhere<Post>();
  // Single rule:  { accountId: 42 }
  // Multiple:     [{ accountId: 42 }, { public: true }]

  // Raw conditions array
  const raw = conditions.get();

  // Underlying rules
  const rules = conditions.getRules();
}
```

## @CaslFilter()

Parameter decorator that returns the filter object directly — shorthand for `@CaslConditions()` + `conditions.toFilter()`.

```typescript
@Query(() => [Post])
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
async posts(
  @CaslFilter() filter: Record<string, unknown>,
) {
  // filter = { userId: 'userId' } or {} if no conditions
  return this.postService.findAll(filter);
}
```

Ideal for TypeORM/Prisma integration:

```typescript
import { FindOptionsWhere } from 'typeorm';

@Query(() => [Order])
@UseGuards(AuthGuard, AccessGuard)
@UseAbility(Actions.read, Order)
async orders(
  @CaslFilter() filter: FindOptionsWhere<Order>,
) {
  return this.orderRepository.find({ where: filter });
}
```

## @CaslSubject()

Parameter decorator that injects `SubjectProxy` — the lazy-loaded entity from the [subject hook](./hooks.md).

```typescript
@Mutation(() => Post)
@UseGuards(AuthGuard, AccessGuard)
@UseAbility(Actions.update, Post, PostHook)
async updatePost(
  @Args('input') input: UpdatePostInput,
  @CaslSubject() subjectProxy: SubjectProxy<Post>,
) {
  // The entity was already fetched by PostHook during guard check
  // SubjectProxy returns it from cache — no duplicate DB query
  const post = await subjectProxy.get();

  return this.postService.update(post.id, input);
}
```

## @CaslUser()

Parameter decorator that injects `UserProxy` — the user from request or [user hook](./hooks.md).

```typescript
@Mutation(() => Post)
@UseGuards(AuthGuard, AccessGuard)
@UseAbility(Actions.create, Post)
async createPost(
  @Args('input') input: CreatePostInput,
  @CaslUser() userProxy: UserProxy<User>,
) {
  // If UserHook is configured, returns the enriched user
  // Otherwise returns the user from request
  const user = await userProxy.get();

  return this.postService.create({ ...input, userId: user.id });
}
```
