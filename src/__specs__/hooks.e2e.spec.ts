import { vi } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';

import { PostService } from './app/post/post.service';
import { PostModule } from './app/post/post.module';
import { CaslModule } from '../casl.module';
import { Roles } from './app/app.roles';
import { UserModule } from './app/user/user.module';
import { UserService } from './app/user/user.service';
import { User } from './app/user/dtos/user.dto';
import { Post } from './app/post/dtos/post.dto';
import { ConditionsProxy } from '../proxies/conditions.proxy';
import { AuthorizeContext } from '../interfaces/options.interface';

const getUser = (role: Roles, id = 'userId') => ({ id, roles: [role] });

const getPostService = (post: Post) => ({
  findAll: vi.fn().mockImplementation(async () => [post]),
  findById: vi.fn().mockImplementation(async () => post),
  create: vi.fn().mockImplementation(async () => post),
  update: vi.fn().mockImplementation(async () => post),
  addUser: vi.fn().mockImplementation(async () => post),
  delete: vi.fn().mockImplementation(async () => post),
});

const getUserService = (user: User) => ({
  findById: vi.fn(async () => user),
});

describe('Hooks E2E', () => {
  const post = { id: 'id', userId: 'userId', title: 'Post title' };
  const user = { id: 'userId', name: 'John Doe', roles: [] };

  let app: INestApplication;
  let postService: PostService;
  let userService: UserService;

  afterEach(async () => {
    await app.close();
  });

  describe('preCheck', () => {
    it('denies access when preCheck returns false', async () => {
      postService = getPostService(post);
      userService = getUserService(user);

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
            preCheck: () => false,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // preCheck denies everything — use guarded routes
      await request(app.getHttpServer()).get('/posts/id').expect(403);
      await request(app.getHttpServer()).put('/posts/id').expect(403);
    });

    it('allows access when preCheck returns true', async () => {
      postService = getPostService(post);
      userService = getUserService(user);

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
            preCheck: () => true,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(200);
    });

    it('receives actual user and request object', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const preCheckSpy = vi.fn().mockReturnValue(true);

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.operator),
            preCheck: preCheckSpy,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(200);

      expect(preCheckSpy).toHaveBeenCalled();
      const [calledUser, calledRequest] = preCheckSpy.mock.calls[0];
      expect(calledUser).toEqual(getUser(Roles.operator));
      expect(calledRequest).toHaveProperty('method');
    });

    it('preCheck can deny superuser', async () => {
      postService = getPostService(post);
      userService = getUserService(user);

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            superuserRole: Roles.admin,
            getUserFromRequest: () => getUser(Roles.admin),
            preCheck: () => false,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(403);
    });
  });

  describe('afterAuthorize', () => {
    it('called with allowed=true on successful access', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const afterSpy = vi.fn();

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
            afterAuthorize: afterSpy,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(200);

      expect(afterSpy).toHaveBeenCalledWith(
        expect.objectContaining({ allowed: true, action: 'read' }),
      );
    });

    it('called with allowed=false on denied access', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const afterSpy = vi.fn();

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
            preCheck: () => false,
            afterAuthorize: afterSpy,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(403);

      expect(afterSpy).toHaveBeenCalledWith(
        expect.objectContaining({ allowed: false }),
      );
    });

    it('includes user, action, subject, and request', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const afterSpy = vi.fn();

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            superuserRole: Roles.admin,
            getUserFromRequest: () => getUser(Roles.admin),
            afterAuthorize: afterSpy,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(200);

      const ctx: AuthorizeContext = afterSpy.mock.calls[0][0];
      expect(ctx.allowed).toBe(true);
      expect(ctx.user).toEqual(getUser(Roles.admin));
      expect(ctx.action).toBe('read');
      expect(ctx.subject).toBe(Post);
      expect(ctx.request).toBeDefined();
    });
  });

  describe('getContextFromRequest', () => {
    it('context available in permission builder', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const contextSpy = vi.fn();

      // Override PostModule permissions to use context
      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
            getContextFromRequest: (req) => {
              contextSpy(req.url);
              return { tenantId: 'tenant-1' };
            },
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // The request triggers guard → ability factory → getContextFromRequest
      await request(app.getHttpServer()).get('/posts/id').expect(200);

      expect(contextSpy).toHaveBeenCalled();
    });
  });

  describe('conditionsProxyFactory', () => {
    it('uses custom proxy for non-superuser', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const factorySpy = vi.fn().mockImplementation(
        (abilities, action, subject) => new ConditionsProxy(abilities, action, subject),
      );

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
            conditionsProxyFactory: factorySpy,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(200);

      expect(factorySpy).toHaveBeenCalled();
      const [, action, , forUser] = factorySpy.mock.calls[0];
      expect(action).toBe('read');
      expect(forUser).toEqual(getUser(Roles.customer));
    });

    it('uses custom proxy for superuser too', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const factorySpy = vi.fn().mockImplementation(
        (abilities, action, subject) => new ConditionsProxy(abilities, action, subject),
      );

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            superuserRole: Roles.admin,
            getUserFromRequest: () => getUser(Roles.admin),
            conditionsProxyFactory: factorySpy,
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(200);

      expect(factorySpy).toHaveBeenCalled();
    });
  });

  describe('getUserHook (tuple)', () => {
    it('user hook not called when no conditions on rules', async () => {
      postService = getPostService(post);
      userService = getUserService(user);

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRootAsync<Roles>({
            useFactory: () => ({
              getUserFromRequest: () => getUser(Roles.operator),
              getUserHook: [
                UserService,
                async (service: UserService, u: User) => ({
                  ...u,
                  ...(await service.findById(u.id)),
                }),
              ],
            }),
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // Operator has `can(manage, Post)` without conditions → no subject resolution → no user hook
      await request(app.getHttpServer()).put('/posts/postId').expect(200);
      expect(userService.findById).not.toHaveBeenCalled();
    });
  });

  describe('all hooks in sequence', () => {
    it('executes preCheck → ability build → conditionsFactory → afterAuthorize', async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const callOrder: string[] = [];

      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
            preCheck: () => {
              callOrder.push('preCheck');
              return true;
            },
            getContextFromRequest: () => {
              callOrder.push('getContext');
              return {};
            },
            conditionsProxyFactory: (abilities, action, subject) => {
              callOrder.push('conditionsFactory');
              return new ConditionsProxy(abilities, action, subject);
            },
            afterAuthorize: () => {
              callOrder.push('afterAuthorize');
            },
          }),
        ],
      })
        .overrideProvider(PostService)
        .useValue(postService)
        .overrideProvider(UserService)
        .useValue(userService)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/posts/id').expect(200);

      expect(callOrder[0]).toBe('preCheck');
      expect(callOrder).toContain('getContext');
      expect(callOrder).toContain('conditionsFactory');
      expect(callOrder[callOrder.length - 1]).toBe('afterAuthorize');
    });
  });
});
