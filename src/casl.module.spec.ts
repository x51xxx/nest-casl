import { vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Injectable, Module } from '@nestjs/common';

import { CaslModule } from './casl.module';
import { CaslConfig } from './casl.config';
import { AccessService } from './access.service';
import { Roles } from './__specs__/app/app.roles';
import { Post } from './__specs__/app/post/dtos/post.dto';
import { Actions } from './actions.enum';
import { Permissions } from './interfaces/permissions.interface';
import { CASL_ROOT_OPTIONS } from './casl.constants';

const permissions: Permissions<Roles, Post> = {
  everyone({ can }) {
    can(Actions.read, Post);
  },
  customer({ can }) {
    can(Actions.create, Post);
  },
};

describe('CaslModule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('forRoot()', () => {
    it('stores root options in CaslConfig metadata', async () => {
      const getUserFromRequest = vi.fn();
      CaslModule.forRoot<Roles>({
        superuserRole: Roles.admin,
        getUserFromRequest,
      });
      const options = CaslConfig.getRootOptions();
      expect(options.superuserRole).toBe(Roles.admin);
      expect(options.getUserFromRequest).toBe(getUserFromRequest);
    });

    it('returns a dynamic module', () => {
      const result = CaslModule.forRoot<Roles>({
        getUserFromRequest: () => undefined,
      });
      expect(result.module).toBe(CaslModule);
    });
  });

  describe('forFeature()', () => {
    it('returns a dynamic module with AccessService', () => {
      const result = CaslModule.forFeature({ permissions });
      expect(result.module).toBe(CaslModule);
      expect(result.providers).toBeDefined();
    });

    it('provides working AccessService with permissions', async () => {
      CaslModule.forRoot<Roles>({
        superuserRole: Roles.admin,
        getUserFromRequest: () => undefined,
      });

      const moduleRef = await Test.createTestingModule({
        imports: [CaslModule.forFeature({ permissions })],
      }).compile();

      const accessService = moduleRef.get(AccessService);
      const user = { id: 'userId', roles: [Roles.customer] };
      expect(accessService.hasAbility(user, Actions.read, Post)).toBe(true);
      expect(accessService.hasAbility(user, Actions.create, Post)).toBe(true);
      expect(accessService.hasAbility(user, Actions.delete, Post)).toBe(false);
    });

    it('exports AccessService so consuming modules can inject it (issue #905)', async () => {
      const result = CaslModule.forFeature({ permissions });
      expect(result.exports).toContain(AccessService);
    });

    it('injected AccessService in consuming module has correct permissions (issue #905)', async () => {
      CaslModule.forRoot<Roles>({
        superuserRole: Roles.admin,
        getUserFromRequest: () => undefined,
      });

      @Injectable()
      class TestConsumer {
        constructor(public readonly accessService: AccessService) {}
      }

      @Module({
        imports: [CaslModule.forFeature({ permissions })],
        providers: [TestConsumer],
        exports: [TestConsumer],
      })
      class FeatureModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [FeatureModule],
      }).compile();

      const consumer = moduleRef.get(TestConsumer);
      const user = { id: 'userId', roles: [Roles.customer] };
      expect(consumer.accessService.hasAbility(user, Actions.read, Post)).toBe(true);
      expect(consumer.accessService.hasAbility(user, Actions.create, Post)).toBe(true);
    });

    it('injected AccessService denies actions not in permissions (issue #905)', async () => {
      CaslModule.forRoot<Roles>({
        getUserFromRequest: () => undefined,
      });

      @Injectable()
      class TestService {
        constructor(public readonly accessService: AccessService) {}
      }

      @Module({
        imports: [CaslModule.forFeature({ permissions })],
        providers: [TestService],
        exports: [TestService],
      })
      class PostFeatureModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [PostFeatureModule],
      }).compile();

      const service = moduleRef.get(TestService);
      const user = { id: 'userId', roles: [Roles.customer] };
      // customer can read and create, but NOT delete or update
      expect(service.accessService.hasAbility(user, Actions.delete, Post)).toBe(false);
      expect(service.accessService.hasAbility(user, Actions.update, Post)).toBe(false);
    });

    it('AccessService from forFeature respects superuser role (issue #905)', async () => {
      CaslModule.forRoot<Roles>({
        superuserRole: Roles.admin,
        getUserFromRequest: () => undefined,
      });

      @Injectable()
      class TestService {
        constructor(public readonly accessService: AccessService) {}
      }

      @Module({
        imports: [CaslModule.forFeature({ permissions })],
        providers: [TestService],
        exports: [TestService],
      })
      class PostFeatureModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [PostFeatureModule],
      }).compile();

      const service = moduleRef.get(TestService);
      const admin = { id: 'adminId', roles: [Roles.admin] };
      // Admin should have unrestricted access even for actions not in permissions
      expect(service.accessService.hasAbility(admin, Actions.delete, Post)).toBe(true);
      expect(service.accessService.hasAbility(admin, Actions.manage, Post)).toBe(true);
    });

    it('two feature modules get separate AccessService instances with own permissions (issue #905)', async () => {
      class Comment {
        id: string;
        authorId: string;
      }

      const postPermissions: Permissions<Roles, Post> = {
        customer({ can }) {
          can(Actions.read, Post);
        },
      };

      const commentPermissions: Permissions<Roles, typeof Comment> = {
        customer({ can }) {
          can(Actions.delete, Comment);
        },
      };

      CaslModule.forRoot<Roles>({
        getUserFromRequest: () => undefined,
      });

      @Injectable()
      class PostConsumer {
        constructor(public readonly accessService: AccessService) {}
      }

      @Injectable()
      class CommentConsumer {
        constructor(public readonly accessService: AccessService) {}
      }

      @Module({
        imports: [CaslModule.forFeature({ permissions: postPermissions })],
        providers: [PostConsumer],
        exports: [PostConsumer],
      })
      class PostFeatureModule {}

      @Module({
        imports: [CaslModule.forFeature({ permissions: commentPermissions })],
        providers: [CommentConsumer],
        exports: [CommentConsumer],
      })
      class CommentFeatureModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [PostFeatureModule, CommentFeatureModule],
      }).compile();

      const postConsumer = moduleRef.get(PostConsumer);
      const commentConsumer = moduleRef.get(CommentConsumer);
      const user = { id: 'userId', roles: [Roles.customer] };

      // PostConsumer's AccessService should know about Post permissions
      expect(postConsumer.accessService.hasAbility(user, Actions.read, Post)).toBe(true);

      // CommentConsumer's AccessService should know about Comment permissions
      expect(commentConsumer.accessService.hasAbility(user, Actions.delete, Comment)).toBe(true);
    });
  });

  describe('forRootAsync()', () => {
    it('returns a dynamic module with provider factory', () => {
      const result = CaslModule.forRootAsync<Roles>({
        useFactory: () => ({
          superuserRole: Roles.admin,
          getUserFromRequest: () => undefined,
        }),
      });
      expect(result.module).toBe(CaslModule);
      expect(result.providers).toBeDefined();
    });

    it('resolves factory and stores options in CaslConfig', async () => {
      const getUserFromRequest = vi.fn();
      const moduleRef = await Test.createTestingModule({
        imports: [
          CaslModule.forRootAsync<Roles>({
            useFactory: () => ({
              superuserRole: Roles.admin,
              getUserFromRequest,
            }),
          }),
        ],
      }).compile();

      // Force factory execution by getting the provider
      await moduleRef.get(CASL_ROOT_OPTIONS);
      const options = CaslConfig.getRootOptions();
      expect(options.superuserRole).toBe(Roles.admin);
      expect(options.getUserFromRequest).toBe(getUserFromRequest);
    });

    it('supports async factory', async () => {
      const getUserFromRequest = vi.fn();
      const moduleRef = await Test.createTestingModule({
        imports: [
          CaslModule.forRootAsync<Roles>({
            useFactory: async () => ({
              superuserRole: Roles.operator,
              getUserFromRequest,
            }),
          }),
        ],
      }).compile();

      await moduleRef.get(CASL_ROOT_OPTIONS);
      const options = CaslConfig.getRootOptions();
      expect(options.superuserRole).toBe(Roles.operator);
    });

    it('passes injected dependencies to factory', async () => {
      const TOKEN = 'TEST_TOKEN';
      const factoryFn = vi.fn().mockReturnValue({
        getUserFromRequest: () => undefined,
      });

      const moduleRef = await Test.createTestingModule({
        imports: [
          CaslModule.forRootAsync<Roles>({
            imports: [
              {
                module: class TestModule {},
                providers: [{ provide: TOKEN, useValue: 'injected-value' }],
                exports: [TOKEN],
              },
            ],
            useFactory: factoryFn,
            inject: [TOKEN],
          }),
        ],
      }).compile();

      await moduleRef.get(CASL_ROOT_OPTIONS);
      expect(factoryFn).toHaveBeenCalledWith('injected-value');
    });
  });
});
