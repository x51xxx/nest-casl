# Examples

## Basic REST API with CASL

### Roles and User

```typescript
// roles.ts
export enum Roles {
  admin = 'admin',
  editor = 'editor',
  viewer = 'viewer',
}

// user.entity.ts
import { AuthorizableUser } from '@trishchuk/nest-casl';

export class User implements AuthorizableUser<Roles> {
  id: string;
  roles: Roles[];
  name: string;
}
```

### App Module

```typescript
import { Module } from '@nestjs/common';
import { CaslModule } from '@trishchuk/nest-casl';
import { Roles } from './roles';

@Module({
  imports: [
    CaslModule.forRoot<Roles>({
      superuserRole: Roles.admin,
      getUserFromRequest: (request) => request.user,
    }),
    ArticleModule,
  ],
})
export class AppModule {}
```

### Permissions

```typescript
// article.permissions.ts
import { Permissions, Actions, InferSubjects } from '@trishchuk/nest-casl';
import { Roles } from '../roles';
import { Article } from './article.entity';

type Subjects = InferSubjects<typeof Article>;

export const permissions: Permissions<Roles, Subjects, Actions> = {
  everyone({ can }) {
    can(Actions.read, Article);
  },
  editor({ user, can }) {
    can(Actions.create, Article);
    can(Actions.update, Article, { authorId: user.id });
    can(Actions.delete, Article, { authorId: user.id });
  },
};
```

### Subject Hook

```typescript
// article.hook.ts
import { Injectable } from '@nestjs/common';
import { SubjectBeforeFilterHook, Request } from '@trishchuk/nest-casl';
import { ArticleService } from './article.service';
import { Article } from './article.entity';

@Injectable()
export class ArticleHook implements SubjectBeforeFilterHook<Article, Request> {
  constructor(readonly articleService: ArticleService) {}

  async run({ params }: Request) {
    return this.articleService.findById(params.id);
  }
}
```

### Controller

```typescript
// article.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AccessGuard, UseAbility, Actions, CaslSubject, SubjectProxy } from '@trishchuk/nest-casl';
import { Article } from './article.entity';
import { ArticleHook } from './article.hook';
import { ArticleService } from './article.service';

@Controller('articles')
export class ArticleController {
  constructor(private articleService: ArticleService) {}

  // Everyone can read
  @Get()
  @UseGuards(AccessGuard)
  @UseAbility(Actions.read, Article)
  findAll() {
    return this.articleService.findAll();
  }

  // Editor can create
  @Post()
  @UseGuards(AccessGuard)
  @UseAbility(Actions.create, Article)
  create(@Body() input: CreateArticleDto) {
    return this.articleService.create(input);
  }

  // Editor can update own articles (uses hook to fetch and check ownership)
  @Put(':id')
  @UseGuards(AccessGuard)
  @UseAbility(Actions.update, Article, ArticleHook)
  update(
    @Param('id') id: string,
    @Body() input: UpdateArticleDto,
    @CaslSubject() subjectProxy: SubjectProxy<Article>,
  ) {
    // Article was already fetched by ArticleHook — reuse it
    return this.articleService.update(id, input);
  }

  // Editor can delete own articles
  @Delete(':id')
  @UseGuards(AccessGuard)
  @UseAbility(Actions.delete, Article, ArticleHook)
  remove(@Param('id') id: string) {
    return this.articleService.remove(id);
  }
}
```

### Module

```typescript
// article.module.ts
import { Module } from '@nestjs/common';
import { CaslModule } from '@trishchuk/nest-casl';
import { permissions } from './article.permissions';
import { ArticleController } from './article.controller';
import { ArticleService } from './article.service';
import { ArticleHook } from './article.hook';

@Module({
  imports: [CaslModule.forFeature({ permissions })],
  controllers: [ArticleController],
  providers: [ArticleService, ArticleHook],
})
export class ArticleModule {}
```

---

## Multi-Tenant SaaS with TypeORM

### Setup

```typescript
// app.module.ts
CaslModule.forRoot<Roles, User, TenantRequest>({
  superuserRole: Roles.admin,
  getUserFromRequest: (request) => request.user,
  getContextFromRequest: (request) => ({
    accountId: request.accountId,
  }),
  // Admins get empty filter (no tenant restriction)
  conditionsProxyFactory: (abilities, action, subject, user) => {
    if (user.roles?.includes(Roles.admin)) {
      return new AdminConditionsProxy(abilities, action, subject);
    }
    return new ConditionsProxy(abilities, action, subject);
  },
})
```

### Permissions with Tenant Scope

```typescript
// order.permissions.ts
export const permissions: Permissions<Roles, Order, Actions> = {
  everyone({ context, can }) {
    const { accountId } = context as { accountId: number };
    can(Actions.read, Order, { accountId });
  },
  manager({ context, can }) {
    const { accountId } = context as { accountId: number };
    can(Actions.create, Order, { accountId });
    can(Actions.update, Order, { accountId });
  },
};
```

### Resolver with Filter

```typescript
// order.resolver.ts
@Resolver(() => Order)
export class OrderResolver {
  constructor(private orderService: OrderService) {}

  @Query(() => [Order])
  @UseGuards(AuthGuard, AccessGuard)
  @UseAbility(Actions.read, Order)
  async orders(
    @CaslFilter() filter: FindOptionsWhere<Order>,
    @Args('options') options: ListOptions,
  ) {
    // filter = { accountId: 42 } for non-admin
    // filter = {} for admin
    return this.orderService.findAll(options, filter);
  }
}
```

---

## GraphQL with Dynamic DB Permissions

### Database-Driven Permissions

```typescript
// game.module.ts
CaslModule.forFeature({
  permissions: gamePermissions,
  moduleName: 'GameModule',
  subjectsMap: { Game, GameVersion, GameConfig },
  async onBuildAbility(builder, request) {
    const dbRules = await permissionService.loadForModule(
      request.user.id,
      request.accountId,
      'GameModule',
    );

    dbRules.forEach((rule) => {
      const SubjectClass = builder.featureOptions?.subjectsMap?.[rule.subject];
      if (!SubjectClass) return;

      const op = rule.inverted ? builder.cannot : builder.can;
      const conditions = parseConditions(rule.conditions, {
        accountId: request.accountId,
        userId: request.user.id,
      });
      op(rule.action, SubjectClass, conditions);
    });
  },
})
```

### Condition Template Parsing

```typescript
// parse-conditions.ts
export function parseConditions(
  template: string,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  let prepared = template;
  for (const [key, value] of Object.entries(variables)) {
    prepared = prepared.replace(new RegExp(`:${key}`, 'g'), String(value));
  }
  return JSON.parse(prepared);
}

// Database stores: '{"accountId": :accountId, "userId": :userId}'
// Resolved to:    { accountId: 42, userId: 7 }
```

---

## Programmatic Access Checks

When you need permission checks outside of guards:

```typescript
@Injectable()
export class PostWorkflowService {
  constructor(
    private accessService: AccessService,
    private postService: PostService,
  ) {}

  async publishPost(user: User, postId: string) {
    const post = await this.postService.findById(postId);

    // Throws NotFoundException if user has conditions but post doesn't match
    // Throws UnauthorizedException if user has no permission at all
    await this.accessService.assertAbility(user, Actions.update, post);

    // Or check without throwing:
    const canPublish = await this.accessService.hasAbility(user, 'publish', post);
    if (!canPublish) {
      throw new ForbiddenException('You cannot publish this post');
    }

    return this.postService.publish(postId);
  }
}
```

---

## Testing Permissions

```typescript
import { Test } from '@nestjs/testing';
import { CaslModule, AccessService, Actions } from '@trishchuk/nest-casl';

describe('Post permissions', () => {
  let accessService: AccessService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        CaslModule.forRoot({ superuserRole: 'admin' }),
        CaslModule.forFeature({ permissions }),
      ],
    }).compile();

    accessService = moduleRef.get(AccessService);
  });

  it('allows editor to update own post', async () => {
    const user = { id: 'user1', roles: ['editor'] };
    const post = { id: 'post1', authorId: 'user1' };
    expect(await accessService.hasAbility(user, Actions.update, post)).toBe(true);
  });

  it('denies editor from updating other user post', async () => {
    const user = { id: 'user1', roles: ['editor'] };
    const post = { id: 'post1', authorId: 'user2' };
    // hasAbility checks against class (not instance), so conditions aren't evaluated
    // Use assertAbility with instance for full condition check
    await expect(
      accessService.assertAbility(user, Actions.update, post),
    ).rejects.toThrow();
  });

  it('allows admin to do anything', async () => {
    const user = { id: 'admin1', roles: ['admin'] };
    expect(await accessService.hasAbility(user, Actions.delete, Post)).toBe(true);
  });
});
```

### E2E Testing

```typescript
import request from 'supertest';
import { Test } from '@nestjs/testing';

describe('Article API', () => {
  let app;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ArticleModule,
        CaslModule.forRoot({
          superuserRole: 'admin',
          getUserFromRequest: () => ({ id: 'user1', roles: ['editor'] }),
        }),
      ],
    })
      .overrideProvider(ArticleService)
      .useValue(mockArticleService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('GET /articles returns 200 for editor', () => {
    return request(app.getHttpServer())
      .get('/articles')
      .expect(200);
  });

  it('DELETE /articles/:id returns 403 for other user article', () => {
    mockArticleService.findById.mockResolvedValue({
      id: '1',
      authorId: 'other-user',
    });
    return request(app.getHttpServer())
      .delete('/articles/1')
      .expect(403);
  });
});
```

---

## Multi-Tenant Data Isolation

In multi-tenant applications, each tenant (organization, workspace) should only see their own data. Use `getContextFromRequest` to pass the tenant ID into permission builders.

### Setup

```typescript
// app.module.ts
CaslModule.forRoot<Roles, User, Request>({
  superuserRole: Roles.admin,
  getUserFromRequest: (req) => req.user,
  getContextFromRequest: (req) => ({
    organizationId: req.headers['x-organization-id'],
  }),
})
```

### Tenant-Scoped Permissions

```typescript
// project.permissions.ts
export const permissions: Permissions<Roles, Project, Actions> = {
  everyone({ context, can }) {
    const { organizationId } = context as { organizationId: string };
    can(Actions.read, Project, { organizationId });
  },
  member({ context, user, can }) {
    const { organizationId } = context as { organizationId: string };
    can(Actions.create, Project, { organizationId });
    can(Actions.update, Project, { organizationId, ownerId: user.id });
  },
  manager({ context, can, extend }) {
    extend('member');
    const { organizationId } = context as { organizationId: string };
    can(Actions.update, Project, { organizationId });
    can(Actions.delete, Project, { organizationId });
  },
};
```

### Controller

```typescript
@Controller('projects')
export class ProjectController {
  constructor(private projectService: ProjectService) {}

  @Get()
  @UseGuards(AuthGuard, AccessGuard)
  @UseAbility(Actions.read, Project)
  async findAll(@CaslFilter() filter: FindOptionsWhere<Project>) {
    // filter = { organizationId: 'org-123' }
    // Only returns projects from the user's organization
    return this.projectService.findAll(filter);
  }
}
```

---

## Hierarchical Access with $in

When users belong to multiple groups (teams, departments) and can access resources across them, use `$in` conditions.

### Passing Accessible IDs via Context

```typescript
CaslModule.forRoot({
  getUserFromRequest: (req) => req.user,
  getContextFromRequest: (req) => ({
    // Pre-computed by auth middleware
    teamIds: req.user.teamIds,
    departmentIds: req.user.departmentIds,
  }),
})
```

### Permissions with $in

```typescript
// task.permissions.ts
export const permissions: Permissions<Roles, Task, Actions> = {
  employee({ context, can }) {
    const { teamIds } = context as { teamIds: string[] };
    can(Actions.read, Task, { teamId: { $in: teamIds } });
    can(Actions.update, Task, { teamId: { $in: teamIds } });
  },
  lead({ context, can, extend }) {
    extend('employee');
    const { departmentIds } = context as { departmentIds: string[] };
    can(Actions.manage, Task, { departmentId: { $in: departmentIds } });
  },
};
```

### Converting $in for TypeORM

`toWhere()` preserves `$in` as a plain object. Convert it for your ORM:

```typescript
import { In, FindOptionsWhere } from 'typeorm';

function convertInOperators<T>(where: any): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
  if (Array.isArray(where)) return where.map(convertInOperators) as FindOptionsWhere<T>[];
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

// Usage in controller
@Get()
@UseGuards(AccessGuard)
@UseAbility(Actions.read, Task)
async tasks(@CaslConditions() conditions: ConditionsProxy) {
  const where = conditions.toWhere<Task>();
  // where = { teamId: { $in: ['team-1', 'team-2'] } }

  return this.taskRepository.find({
    where: convertInOperators<Task>(where),
    // → { teamId: In(['team-1', 'team-2']) }
  });
}
```

---

## Field-Level Permissions

Control which fields users can update.

### Defining Field Restrictions

```typescript
const permissions: Permissions<Roles, Profile, Actions> = {
  user({ user, can, cannot }) {
    can(Actions.read, Profile);
    can(Actions.update, Profile, { id: user.id });
    cannot(Actions.update, Profile, ['role', 'email', 'createdAt']);
  },
  admin({ can }) {
    can(Actions.manage, Profile);
  },
};
```

When a user tries to update a restricted field, the guard returns `false`.

### Custom Field Extraction for GraphQL

By default, the library uses `flatten(request.body)` to detect which fields are being updated. For GraphQL or custom payloads:

```typescript
CaslModule.forRoot({
  getFieldsFromRequest: (request) => {
    const input = request.body?.variables?.input;
    return input ? Object.keys(input) : [];
  },
})
```

---

## Reusing Hook-Fetched Entities

When a subject hook fetches an entity for the guard check, `@CaslSubject()` returns it from cache — no duplicate DB query:

```typescript
@Put(':id/publish')
@UseGuards(AccessGuard)
@UseAbility(Actions.update, Article, ArticleHook)
async publishArticle(
  @Param('id') id: string,
  @CaslSubject() subjectProxy: SubjectProxy<Article>,
  @CaslUser() userProxy: UserProxy<User>,
) {
  const article = await subjectProxy.get(); // from cache
  const user = await userProxy.get();

  article.status = 'published';
  article.publishedBy = user.id;
  article.publishedAt = new Date();

  return this.articleService.save(article);
}
```

---

## Using Conditions in Background Jobs

When you need permission-based filtering outside the request lifecycle:

```typescript
import { defineAbility } from '@casl/ability';
import { ConditionsProxy } from '@trishchuk/nest-casl';

@Injectable()
export class ReportService {
  async generateWeeklyReport(user: User) {
    const ability = defineAbility((can) => {
      can('read', 'Order', { organizationId: user.organizationId });
    });

    const conditions = new ConditionsProxy(ability, 'read', 'Order');
    const sql = conditions.toSql();

    if (sql) {
      const [query, params] = sql;
      return this.dataSource.query(
        `SELECT * FROM orders WHERE ${query} AND created_at > $${params.length + 1}`,
        [...params, startOfWeek],
      );
    }
  }
}
```
