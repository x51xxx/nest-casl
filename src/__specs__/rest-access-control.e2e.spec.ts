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

describe('REST access control', () => {
  const post = { id: 'id', userId: 'userId', title: 'Post title' };
  const user = { id: 'userId', name: 'John Doe', roles: [] };

  let app: INestApplication;
  let postService: PostService;
  let userService: UserService;

  afterEach(async () => {
    await app.close();
  });

  describe('unauthenticated user', () => {
    beforeEach(async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => undefined,
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
    });

    it('denies GET /posts/:id', async () => {
      return request(app.getHttpServer()).get('/posts/id').expect(403);
    });

    it('denies PUT /posts/:id', async () => {
      return request(app.getHttpServer()).put('/posts/postId').send({ title: 'Updated' }).expect(403);
    });
  });

  describe('superuser (admin)', () => {
    beforeEach(async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            superuserRole: Roles.admin,
            getUserFromRequest: () => getUser(Roles.admin),
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
    });

    it('allows GET /posts', async () => {
      return request(app.getHttpServer()).get('/posts').expect(200);
    });

    it('allows GET /posts/:id', async () => {
      return request(app.getHttpServer()).get('/posts/id').expect(200);
    });

    it('allows PUT /posts/:id', async () => {
      return request(app.getHttpServer()).put('/posts/postId').expect(200);
    });
  });

  describe('customer updating own post', () => {
    beforeEach(async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
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
    });

    it('allows GET /posts (everyone can read)', async () => {
      return request(app.getHttpServer()).get('/posts').expect(200);
    });

    it('allows PUT /posts/:id for own post', async () => {
      return request(app.getHttpServer()).put('/posts/postId').expect(200);
    });
  });

  describe('customer updating other user post', () => {
    beforeEach(async () => {
      const otherUserPost = { id: 'id', userId: 'otherUserId', title: 'Post title' };
      postService = getPostService(otherUserPost);
      userService = getUserService(user);
      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.customer),
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
    });

    it('denies PUT /posts/:id for other user post', async () => {
      return request(app.getHttpServer()).put('/posts/postId').expect(403);
    });
  });

  describe('operator role', () => {
    beforeEach(async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRoot<Roles>({
            getUserFromRequest: () => getUser(Roles.operator),
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
    });

    it('allows GET /posts', async () => {
      return request(app.getHttpServer()).get('/posts').expect(200);
    });

    it('allows GET /posts/:id', async () => {
      return request(app.getHttpServer()).get('/posts/id').expect(200);
    });

    it('allows PUT /posts/:id (operator can manage)', async () => {
      return request(app.getHttpServer()).put('/posts/postId').expect(200);
    });
  });

  describe('forRootAsync configuration', () => {
    beforeEach(async () => {
      postService = getPostService(post);
      userService = getUserService(user);
      const moduleRef = await Test.createTestingModule({
        imports: [
          PostModule,
          UserModule,
          CaslModule.forRootAsync<Roles>({
            useFactory: async () => ({
              superuserRole: Roles.admin,
              getUserFromRequest: () => getUser(Roles.admin),
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
    });

    it('allows superuser access via async config', async () => {
      return request(app.getHttpServer()).get('/posts/id').expect(200);
    });

    it('allows superuser PUT via async config', async () => {
      return request(app.getHttpServer()).put('/posts/postId').expect(200);
    });
  });
});
