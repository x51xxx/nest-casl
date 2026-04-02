# Working with Conditions

Conditions are the core of CASL — they define **which** entities a user can access, not just **whether** they can. This guide covers how conditions flow from permission definitions through to database queries.

## How Conditions Work

When you define a conditional permission:

```typescript
customer({ user, can }) {
  can(Actions.read, Post, { authorId: user.id });
}
```

CASL creates a rule: "customer can read Post **where** authorId equals the user's ID". The library makes these conditions available in multiple formats for different use cases.

## Conditions Flow

```
Permission Definition           Guard Check              Controller/Resolver
─────────────────────         ─────────────           ────────────────────
can(read, Post,        →   AccessGuard builds    →   @CaslConditions()
  { authorId: user.id })    ConditionsProxy           or @CaslFilter()
                            and caches on request     provides conditions
                                                      for DB queries
```

## Choosing the Right Method

| Method | Returns | Best For |
|--------|---------|----------|
| `toFilter<T>()` | First condition as plain object | Simple single-condition permissions |
| `toWhere<T>()` | Array or object, `$or` flattened | TypeORM/Prisma with multiple rules |
| `toQuery<T>()` | Raw merged query with `$or`/`$in` | Custom ORM adapters |
| `toMongo()` | MongoDB query | Mongoose / MongoDB driver |
| `toSql()` | Parametrized SQL | Raw SQL / query builders |
| `toAst()` | CASL AST tree | Custom interpreters |
| `get()` | Conditions array | Low-level access to all rules |

## Simple Filtering with @CaslFilter

For the most common case — pass conditions straight to the data layer:

```typescript
@Get()
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
async posts(@CaslFilter() filter: FindOptionsWhere<Post>) {
  return this.postRepository.find({ where: filter });
}
```

`@CaslFilter()` calls `toFilter()` internally — returns the first non-inverted rule's conditions or `{}` if none.

## Multiple Conditions with toWhere()

When a user has multiple permission rules, `toWhere()` properly merges them:

```typescript
// Permissions: user can read own posts AND public posts
customer({ user, can }) {
  can(Actions.read, Post, { authorId: user.id });
  can(Actions.read, Post, { public: true });
}
```

```typescript
@Get()
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
async posts(@CaslConditions() conditions: ConditionsProxy) {
  const where = conditions.toWhere<Post>();
  // where = [{ authorId: 'user123' }, { public: true }]
  // TypeORM interprets array as OR

  return this.postRepository.find({ where });
}
```

### Handling $in Operators

When conditions use `$in` (e.g., from scope-based permissions):

```typescript
operator({ context, can }) {
  can(Actions.read, Location, { clientId: { $in: context.clientIds } });
}
```

`toWhere()` preserves `$in` as-is. Transform for your ORM:

```typescript
import { In } from 'typeorm';

@Get()
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Location)
async locations(@CaslConditions() conditions: ConditionsProxy) {
  const where = conditions.toWhere<Location>();
  // where = { clientId: { $in: [1, 2, 3] } }

  // Transform $in to TypeORM In()
  const typeormWhere = transformConditions(where);
  // typeormWhere = { clientId: In([1, 2, 3]) }

  return this.locationRepository.find({ where: typeormWhere });
}

// Helper to convert $in to TypeORM In()
function transformConditions(where: any): any {
  if (Array.isArray(where)) return where.map(transformConditions);
  if (!where || typeof where !== 'object') return where;

  const result: any = {};
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && '$in' in (value as any)) {
      result[key] = In((value as any).$in);
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

## SQL Conditions with toSql()

For raw SQL or query builders:

```typescript
@Get()
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
async posts(@CaslConditions() conditions: ConditionsProxy) {
  const sql = conditions.toSql();
  // sql = ['"authorId" = $1', ['user123'], []]
  //        ^query             ^params      ^joins

  if (sql) {
    const [query, params] = sql;
    return this.dataSource.query(
      `SELECT * FROM posts WHERE ${query}`,
      params,
    );
  }
  return this.dataSource.query('SELECT * FROM posts');
}
```

### Complex SQL Conditions

Multiple rules produce composed SQL:

```typescript
// can read own posts and public posts
can(Actions.read, Post, { authorId: user.id });
can(Actions.read, Post, { public: true });

// toSql() → ['("authorId" = $1) or "public" = $2', ['user123', true], []]
```

Negated rules:

```typescript
can(Actions.update, Post);
cannot(Actions.update, Post, { status: 'archived' });

// toSql() → ['not ("status" = $1)', ['archived'], []]
```

## MongoDB Conditions with toMongo()

For Mongoose or the MongoDB driver:

```typescript
@Get()
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Post)
async posts(@CaslConditions() conditions: ConditionsProxy) {
  const mongoQuery = conditions.toMongo();
  // mongoQuery = { $or: [{ authorId: 'user123' }, { public: true }] }

  return this.postModel.find(mongoQuery);
}
```

## Conditions with Subject Hooks

When `@UseAbility` has a subject hook, the guard:
1. Builds conditions from permissions
2. Fetches the entity via hook
3. Checks conditions against the entity
4. Caches conditions on the request

The cached conditions are available even after the guard check:

```typescript
@Put(':id')
@UseGuards(AccessGuard)
@UseAbility(Actions.update, Post, PostHook)
async updatePost(
  @Param('id') id: string,
  @Body() input: UpdatePostInput,
  @CaslConditions() conditions: ConditionsProxy,
  @CaslSubject() subjectProxy: SubjectProxy<Post>,
) {
  // Guard already verified this user can update THIS post
  // But you can still use conditions for related queries:
  const relatedFilter = conditions.toFilter<Post>();
  const relatedPosts = await this.postService.findRelated(id, relatedFilter);

  // Subject was fetched by PostHook — no duplicate query
  const post = await subjectProxy.get();
  return this.postService.update(post, input);
}
```

## Superuser Conditions

When `conditionsProxyFactory` is configured, superusers get custom conditions:

```typescript
// In forRoot:
CaslModule.forRoot({
  superuserRole: Roles.admin,
  conditionsProxyFactory: (abilities, action, subject, user) => {
    // Admins get a proxy that returns empty filter (no restrictions)
    if (user.roles?.includes(Roles.admin)) {
      return new UnrestrictedConditionsProxy(abilities, action, subject);
    }
    return new ConditionsProxy(abilities, action, subject);
  },
})

// Custom proxy for admins
class UnrestrictedConditionsProxy extends ConditionsProxy {
  toFilter() { return {} as any; }
  toWhere() { return {} as any; }
}
```

Without the factory, superusers get standard `ConditionsProxy` (which may return `undefined` if no rules match).

## Conditions Without Guard

You can use `ConditionsProxy` programmatically with `AccessService`:

```typescript
import { defineAbility } from '@casl/ability';
import { ConditionsProxy } from '@trishchuk/nest-casl';

const ability = defineAbility((can) => {
  can('read', 'Post', { authorId: 'user1' });
  can('read', 'Post', { public: true });
});

const conditions = new ConditionsProxy(ability, 'read', 'Post');

conditions.toFilter();  // { authorId: 'user1' }
conditions.toWhere();   // [{ public: true }, { authorId: 'user1' }]
conditions.toSql();     // ['("authorId" = $1) or "public" = $2', ['user1', true], []]
conditions.toMongo();   // { $or: [{ public: true }, { authorId: 'user1' }] }
```
