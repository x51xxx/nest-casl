import { vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';

import { AccessService } from './access.service';
import { Permissions } from './interfaces/permissions.interface';
import { Roles } from './__specs__/app/app.roles';
import { Post } from './__specs__/app/post/dtos/post.dto';
import { Actions } from './actions.enum';
import { AbilityFactory } from './factories/ability.factory';
import { CASL_FEATURE_OPTIONS } from './casl.constants';
import { CaslConfig } from './casl.config';
import { NullSubjectHook } from './factories/subject-hook.factory';
import { NullUserHook } from './factories/user-hook.factory';
import { CaslRequestCache } from './interfaces/casl-request-cache.interface';
import { SubjectBeforeFilterHook, UserBeforeFilterHook } from 'interfaces/hooks.interface';
import { AbilityMetadata } from 'interfaces/ability-metadata.interface';
import { User } from '__specs__/app/user/dtos/user.dto';
import { AuthorizableRequest } from './interfaces/request.interface';
import { AnyClass } from './types';
import { ConditionsProxy } from './proxies/conditions.proxy';

const permissions: Permissions<Roles, Post> = {
  everyone({ can }) {
    can(Actions.read, Post);
  },
  customer({ user, can, cannot }) {
    can(Actions.update, Post, { userId: user.id });
    cannot(Actions.update, Post, ['userId']);
  },
  operator({ can }) {
    can(Actions.manage, Post);
  },
};

describe('AccessService', () => {
  let accessService: AccessService;
  let user: User;

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  beforeEach(async () => {
    vi.spyOn(CaslConfig, 'getRootOptions').mockImplementation(() => ({
      superuserRole: Roles.admin,
      getUserFromRequest: () => undefined,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccessService,
        AbilityFactory,
        {
          provide: CASL_FEATURE_OPTIONS,
          useValue: { permissions },
        },
      ],
    }).compile();

    accessService = moduleRef.get(AccessService);
  });

  describe('getAbility()', () => {
    beforeEach(async () => {
      user = { id: 'userId', roles: [Roles.operator] };
    });

    it('returns user abilities', async () => {
      expect((await accessService.getAbility(user)).rules).toEqual([
        { action: 'read', subject: Post },
        { action: 'manage', subject: Post },
      ]);
    });
  });

  describe('hasAbility()', () => {
    beforeEach(async () => {
      user = { id: 'userId', roles: [Roles.operator] };
    });

    it('allows access to delete action for operator', async () => {
      expect(await accessService.hasAbility(user, Actions.delete, Post)).toBeTruthy();
    });

    it('denies access to delete action for customer', async () => {
      user = { id: 'userId', roles: [Roles.customer] };
      expect(await accessService.hasAbility(user, Actions.delete, Post)).toBeFalsy();
    });

    it('allows access to update not restricted field for customer', async () => {
      user = { id: 'userId', roles: [Roles.customer] };
      expect(await accessService.hasAbility(user, Actions.update, Post, 'title')).toBeTruthy();
    });

    it('denies access to update restricted field for customer', async () => {
      user = { id: 'userId', roles: [Roles.customer] };
      expect(await accessService.hasAbility(user, Actions.update, Post, 'userId')).toBeFalsy();
    });

    it('can check ability', async () => {
      expect(await accessService.hasAbility(user, Actions.delete, Post)).toBeTruthy();
      expect(await accessService.hasAbility(user, Actions.update, Post, 'userId')).toBeTruthy();
    });

    it('deny access without user', async () => {
      expect(await accessService.hasAbility(undefined as never, Actions.delete, Post)).toBeFalsy();
    });

    it('deny access without action', async () => {
      expect(await accessService.hasAbility(user, undefined as never, Post)).toBeFalsy();
    });

    it('deny access without subject', async () => {
      expect(await accessService.hasAbility(user, Actions.delete, undefined as never)).toBeFalsy();
    });

    it('allow access to superuser', async () => {
      user = { id: 'userId', roles: [Roles.admin] };
      expect(await accessService.hasAbility(user, Actions.delete, Post)).toBeTruthy();
    });
  });

  describe('assertAbility()', () => {
    beforeEach(async () => {
      user = { id: 'userId', roles: [Roles.customer] };
    });

    it('throw UnauthorizedException for ability without conditions and class subject', async () => {
      await expect(accessService.assertAbility(user, Actions.delete, Post)).rejects.toThrowError(UnauthorizedException);
    });

    it('throw UnauthorizedException for ability without conditions and instance subject', async () => {
      const post = new Post();
      await expect(accessService.assertAbility(user, Actions.delete, post)).rejects.toThrowError(UnauthorizedException);
    });

    it('throw NotFoundException for ability with conditions and instance subject', async () => {
      user = { id: 'otherUserId', roles: [Roles.customer] };
      const post = new Post();
      await expect(accessService.assertAbility(user, Actions.update, post)).rejects.toThrowError(NotFoundException);
    });

    it('do not throw for ability with conditions and class subject', async () => {
      user = { id: 'otherUserId', roles: [Roles.customer] };
      await expect(accessService.assertAbility(user, Actions.update, Post)).resolves.not.toThrow();
    });

    it('throw NotFoundException for ability with restricted field', async () => {
      await expect(accessService.assertAbility(user, Actions.update, Post, 'userId')).rejects.toThrowError(
        NotFoundException,
      );
    });

    it('do not throw for ability with not restricted field', async () => {
      await expect(accessService.assertAbility(user, Actions.update, Post, 'title')).resolves.not.toThrow();
    });
  });

  describe('canActivateAbility()', () => {
    const defaultCaslCache: CaslRequestCache = {
      hooks: {
        subject: new NullSubjectHook(),
        user: new NullUserHook(),
      },
    };

    beforeEach(() => {
      vi.spyOn(CaslConfig, 'getRootOptions').mockImplementation(() => ({
        superuserRole: Roles.admin,
        getUserFromRequest: () => user,
      }));
    });

    it('deny access without user', async () => {
      const request = { casl: defaultCaslCache };
      const abilityMetadata: AbilityMetadata<Post> = {
        action: Actions.delete,
        subject: Post,
      };
      expect(await accessService.canActivateAbility(request, abilityMetadata)).toBeFalsy();
    });

    it('deny access without ability', async () => {
      const request = { casl: defaultCaslCache };
      expect(await accessService.canActivateAbility(request, undefined)).toBeFalsy();
    });

    it('allow access without subject hook returning undefined', async () => {
      user = { id: 'otherUserId', roles: [Roles.customer] };
      const request = { user, casl: defaultCaslCache };
      const abilityMetadata = {
        action: Actions.update,
        subject: Post,
        subjectHook: NullSubjectHook,
      };
      expect(await accessService.canActivateAbility(request, abilityMetadata)).toBeTruthy();
    });

    it('allow access with subject hook returning object', async () => {
      user = { id: 'userId', roles: [Roles.customer] };

      class UserHook implements UserBeforeFilterHook<User> {
        public async run() {
          return user;
        }
      }

      class PostHook implements SubjectBeforeFilterHook<Post> {
        public async run() {
          return { ...new Post() };
        }
      }

      const request: AuthorizableRequest = {
        user,
        casl: {
          user,
          hooks: {
            subject: new PostHook(),
            user: new UserHook(),
          },
        },
        body: {},
      };

      const abilityMetadata = {
        action: Actions.update,
        subject: Post,
        subjectHook: PostHook,
      };

      expect(await accessService.canActivateAbility(request, abilityMetadata)).toBeFalsy();
    });

    it('fires subject hook when some rules have conditions and some do not (issue #923)', async () => {
      // Setup permissions where one rule has conditions and another does not
      const mixedPermissions: Permissions<Roles, Post> = {
        everyone({ can }) {
          can(Actions.read, Post);
        },
        customer({ user, can, cannot }) {
          can(Actions.update, Post, { userId: user.id });
          cannot(Actions.update, Post, ['userId']);
        },
        operator({ can }) {
          can(Actions.update, Post); // rule WITHOUT conditions
        },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          AccessService,
          AbilityFactory,
          {
            provide: CASL_FEATURE_OPTIONS,
            useValue: { permissions: mixedPermissions },
          },
        ],
      }).compile();

      const svc = moduleRef.get(AccessService);
      user = { id: 'userId', roles: [Roles.customer] };

      class PostHookSpy implements SubjectBeforeFilterHook<Post> {
        public async run() {
          return { ...new Post(), userId: 'userId' };
        }
      }

      class UserHookStub implements UserBeforeFilterHook<User> {
        public async run() {
          return user;
        }
      }

      const hookInstance = new PostHookSpy();
      const runSpy = vi.spyOn(hookInstance, 'run');

      const request: AuthorizableRequest = {
        user,
        casl: {
          user,
          hooks: {
            subject: hookInstance,
            user: new UserHookStub(),
          },
        },
        body: {},
      };

      const abilityMetadata = {
        action: Actions.update,
        subject: Post,
        subjectHook: PostHookSpy,
      };

      await svc.canActivateAbility(request, abilityMetadata);
      expect(runSpy).toHaveBeenCalled();
    });

    it('fires subject hook and denies access when cannot rule has no conditions but can rule has (issue #923)', async () => {
      const invertedPermissions: Permissions<Roles, Post> = {
        everyone({ can }) {
          can(Actions.read, Post);
        },
        customer({ user, can, cannot }) {
          can(Actions.update, Post, { userId: user.id });
          cannot(Actions.update, Post, { userId: 'blocked' }); // inverted rule with conditions
        },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          AccessService,
          AbilityFactory,
          {
            provide: CASL_FEATURE_OPTIONS,
            useValue: { permissions: invertedPermissions },
          },
        ],
      }).compile();

      const svc = moduleRef.get(AccessService);
      user = { id: 'userId', roles: [Roles.customer] };

      class PostHookSpy implements SubjectBeforeFilterHook<Post> {
        public async run() {
          return { ...new Post(), userId: 'blocked' };
        }
      }

      class UserHookStub implements UserBeforeFilterHook<User> {
        public async run() {
          return user;
        }
      }

      const hookInstance = new PostHookSpy();
      const runSpy = vi.spyOn(hookInstance, 'run');

      const request: AuthorizableRequest = {
        user,
        casl: {
          user,
          hooks: {
            subject: hookInstance,
            user: new UserHookStub(),
          },
        },
        body: {},
      };

      const abilityMetadata = {
        action: Actions.update,
        subject: Post,
        subjectHook: PostHookSpy,
      };

      const result = await svc.canActivateAbility(request, abilityMetadata);
      expect(runSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('fires subject hook and allows access for own post with conditions (issue #923)', async () => {
      user = { id: 'userId', roles: [Roles.customer] };

      class PostHookOwnPost implements SubjectBeforeFilterHook<Post> {
        public async run() {
          return { ...new Post(), userId: 'userId' };
        }
      }

      class UserHookStub implements UserBeforeFilterHook<User> {
        public async run() {
          return user;
        }
      }

      const hookInstance = new PostHookOwnPost();
      const runSpy = vi.spyOn(hookInstance, 'run');

      const request: AuthorizableRequest = {
        user,
        casl: {
          user,
          hooks: {
            subject: hookInstance,
            user: new UserHookStub(),
          },
        },
        body: {},
      };

      const abilityMetadata = {
        action: Actions.update,
        subject: Post,
        subjectHook: PostHookOwnPost,
      };

      const result = await accessService.canActivateAbility(request, abilityMetadata);
      expect(runSpy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('fires subject hook and denies access for other user post with conditions (issue #923)', async () => {
      user = { id: 'userId', roles: [Roles.customer] };

      class PostHookOtherPost implements SubjectBeforeFilterHook<Post> {
        public async run() {
          return { ...new Post(), userId: 'otherUserId' };
        }
      }

      class UserHookStub implements UserBeforeFilterHook<User> {
        public async run() {
          return user;
        }
      }

      const hookInstance = new PostHookOtherPost();
      const runSpy = vi.spyOn(hookInstance, 'run');

      const request: AuthorizableRequest = {
        user,
        casl: {
          user,
          hooks: {
            subject: hookInstance,
            user: new UserHookStub(),
          },
        },
        body: {},
      };

      const abilityMetadata = {
        action: Actions.update,
        subject: Post,
        subjectHook: PostHookOtherPost,
      };

      const result = await accessService.canActivateAbility(request, abilityMetadata);
      expect(runSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('does not fire subject hook when no rules have conditions', async () => {
      const noConditionsPermissions: Permissions<Roles, Post> = {
        everyone({ can }) {
          can(Actions.read, Post);
        },
        customer({ can }) {
          can(Actions.update, Post); // no conditions
        },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          AccessService,
          AbilityFactory,
          {
            provide: CASL_FEATURE_OPTIONS,
            useValue: { permissions: noConditionsPermissions },
          },
        ],
      }).compile();

      const svc = moduleRef.get(AccessService);
      user = { id: 'userId', roles: [Roles.customer] };

      class PostHookSpy implements SubjectBeforeFilterHook<Post> {
        public async run() {
          return { ...new Post(), userId: 'userId' };
        }
      }

      const hookInstance = new PostHookSpy();
      const runSpy = vi.spyOn(hookInstance, 'run');

      const request: AuthorizableRequest = {
        user,
        casl: {
          user,
          hooks: {
            subject: hookInstance,
            user: new NullUserHook(),
          },
        },
        body: {},
      };

      const abilityMetadata = {
        action: Actions.update,
        subject: Post,
        subjectHook: PostHookSpy,
      };

      await svc.canActivateAbility(request, abilityMetadata);
      expect(runSpy).not.toHaveBeenCalled();
    });

    describe('conditionsProxyFactory', () => {
      it('uses custom factory to create conditions proxy', async () => {
        const testUser = { id: 'otherUserId', roles: [Roles.customer] };
        const customProxy = new ConditionsProxy(null as any, 'read', Post);
        const factory = vi.fn().mockReturnValue(customProxy);

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => testUser,
          conditionsProxyFactory: factory,
        });

        const request = { user: testUser, casl: { ...defaultCaslCache } };
        const abilityMetadata = {
          action: Actions.update,
          subject: Post,
          subjectHook: NullSubjectHook,
        };

        await accessService.canActivateAbility(request, abilityMetadata);
        expect(factory).toHaveBeenCalled();
        expect(request.casl.conditions).toBe(customProxy);
      });

      it('sets conditions via factory for superuser too', async () => {
        const adminUser = { id: 'adminId', roles: [Roles.admin] };
        const customProxy = new ConditionsProxy(null as any, 'read', Post);
        const factory = vi.fn().mockReturnValue(customProxy);

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => adminUser,
          conditionsProxyFactory: factory,
        });

        const request = { user: adminUser, casl: { ...defaultCaslCache } };
        const abilityMetadata = {
          action: Actions.read,
          subject: Post,
        };

        const result = await accessService.canActivateAbility(request, abilityMetadata);
        expect(result).toBe(true);
        expect(factory).toHaveBeenCalled();
        expect(request.casl.conditions).toBe(customProxy);
      });

      it('falls back to default ConditionsProxy when no factory', async () => {
        const testUser = { id: 'otherUserId', roles: [Roles.customer] };

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => testUser,
        });

        const request = { user: testUser, casl: { ...defaultCaslCache } };
        const abilityMetadata = {
          action: Actions.update,
          subject: Post,
          subjectHook: NullSubjectHook,
        };

        await accessService.canActivateAbility(request, abilityMetadata);
        expect(request.casl.conditions).toBeInstanceOf(ConditionsProxy);
      });
    });

    describe('preCheck', () => {
      it('denies access when preCheck returns false', async () => {
        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
          preCheck: () => false,
        });

        const request = { user: { id: 'userId', roles: [Roles.customer] }, casl: { ...defaultCaslCache } };
        const abilityMetadata = { action: Actions.read, subject: Post };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBe(false);
      });

      it('allows access when preCheck returns true', async () => {
        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
          preCheck: () => true,
        });

        const request = { user: { id: 'userId', roles: [Roles.customer] }, casl: { ...defaultCaslCache } };
        const abilityMetadata = { action: Actions.read, subject: Post };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBe(true);
      });

      it('supports async preCheck', async () => {
        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
          preCheck: async () => false,
        });

        const request = { user: { id: 'userId', roles: [Roles.customer] }, casl: { ...defaultCaslCache } };
        const abilityMetadata = { action: Actions.read, subject: Post };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBe(false);
      });

      it('receives user and request in preCheck', async () => {
        const preCheckSpy = vi.fn().mockReturnValue(true);
        const testUser = { id: 'userId', roles: [Roles.customer] };

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => testUser,
          preCheck: preCheckSpy,
        });

        const request = { user: testUser, casl: { ...defaultCaslCache } };
        const abilityMetadata = { action: Actions.read, subject: Post };

        await accessService.canActivateAbility(request, abilityMetadata);
        expect(preCheckSpy).toHaveBeenCalledWith(testUser, request);
      });

      it('skips preCheck for superuser when preCheck is not defined', async () => {
        const adminUser = { id: 'admin', roles: [Roles.admin] };

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => adminUser,
        });

        const request = { user: adminUser, casl: { ...defaultCaslCache } };
        const abilityMetadata = { action: Actions.delete, subject: Post };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBe(true);
      });

      it('preCheck runs before superuser check', async () => {
        const adminUser = { id: 'admin', roles: [Roles.admin] };

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => adminUser,
          preCheck: () => false, // deny even admin
        });

        const request = { user: adminUser, casl: { ...defaultCaslCache } };
        const abilityMetadata = { action: Actions.delete, subject: Post };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBe(false);
      });
    });

    describe('afterAuthorize', () => {
      it('calls afterAuthorize with allowed=true on success', async () => {
        const afterSpy = vi.fn();
        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
          afterAuthorize: afterSpy,
        });

        const request = { user: { id: 'userId', roles: [Roles.customer] }, casl: { ...defaultCaslCache } };
        await accessService.canActivateAbility(request, { action: Actions.read, subject: Post });

        expect(afterSpy).toHaveBeenCalledWith(
          expect.objectContaining({ allowed: true, action: Actions.read, subject: Post }),
        );
      });

      it('calls afterAuthorize with allowed=false on deny', async () => {
        const afterSpy = vi.fn();
        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
          afterAuthorize: afterSpy,
        });

        const request = { user: { id: 'userId', roles: [Roles.customer] }, casl: { ...defaultCaslCache } };
        await accessService.canActivateAbility(request, { action: Actions.delete, subject: Post });

        expect(afterSpy).toHaveBeenCalledWith(
          expect.objectContaining({ allowed: false, action: Actions.delete }),
        );
      });

      it('calls afterAuthorize with allowed=false on preCheck deny', async () => {
        const afterSpy = vi.fn();
        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
          preCheck: () => false,
          afterAuthorize: afterSpy,
        });

        const request = { user: { id: 'userId', roles: [Roles.customer] }, casl: { ...defaultCaslCache } };
        await accessService.canActivateAbility(request, { action: Actions.read, subject: Post });

        expect(afterSpy).toHaveBeenCalledWith(expect.objectContaining({ allowed: false }));
      });

      it('calls afterAuthorize with allowed=true for superuser', async () => {
        const afterSpy = vi.fn();
        const adminUser = { id: 'admin', roles: [Roles.admin] };

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => adminUser,
          afterAuthorize: afterSpy,
        });

        const request = { user: adminUser, casl: { ...defaultCaslCache } };
        await accessService.canActivateAbility(request, { action: Actions.delete, subject: Post });

        expect(afterSpy).toHaveBeenCalledWith(
          expect.objectContaining({ allowed: true, user: adminUser }),
        );
      });

      it('includes user and request in afterAuthorize context', async () => {
        const afterSpy = vi.fn();
        const testUser = { id: 'userId', roles: [Roles.customer] };

        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => testUser,
          afterAuthorize: afterSpy,
        });

        const request = { user: testUser, casl: { ...defaultCaslCache } };
        await accessService.canActivateAbility(request, { action: Actions.read, subject: Post });

        const ctx = afterSpy.mock.calls[0][0];
        expect(ctx.user).toBe(testUser);
        expect(ctx.request).toBe(request);
      });

      it('supports async afterAuthorize', async () => {
        const log: string[] = [];
        vi.mocked(CaslConfig.getRootOptions).mockReturnValue({
          superuserRole: Roles.admin,
          getUserFromRequest: () => ({ id: 'userId', roles: [Roles.customer] }),
          afterAuthorize: async (ctx) => {
            log.push(`${ctx.action}:${ctx.allowed}`);
          },
        });

        const request = { user: { id: 'userId', roles: [Roles.customer] }, casl: { ...defaultCaslCache } };
        await accessService.canActivateAbility(request, { action: Actions.read, subject: Post });

        expect(log).toEqual(['read:true']);
      });
    });

    describe('field restriction', () => {
      user = { id: 'userId', roles: [Roles.customer] };

      function postHookFactory(post: Post) {
        return class PostHook {
          public async run() {
            return post;
          }
        };
      }

      function requestFactory(postHook: AnyClass, post?: Partial<Post>): AuthorizableRequest {
        return {
          user,
          casl: {
            user,
            hooks: {
              subject: new postHook() as unknown as SubjectBeforeFilterHook,
              user: new UserHook() as unknown as UserBeforeFilterHook,
            },
          },
          body: post,
        };
      }

      class UserHook implements UserBeforeFilterHook<User> {
        public async run() {
          return user;
        }
      }

      it('denies access for a subject with restricted field', async () => {
        const PostHook = postHookFactory({ ...new Post(), description: '', userId: 'userId' });
        const request = requestFactory(PostHook, {
          userId: 'userId',
        });

        const abilityMetadata = {
          action: Actions.update,
          subject: Post,
          subjectHook: PostHook,
        };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBeFalsy();
      });

      it('allow access for a subject with restricted field when request body is undefined', async () => {
        const PostHook = postHookFactory({ ...new Post(), description: '', userId: 'userId' });
        const request = requestFactory(PostHook, undefined);

        const abilityMetadata = {
          action: Actions.update,
          subject: Post,
          subjectHook: PostHook,
        };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBeTruthy();
      });

      it('allows access for a subject with non-restricted field', async () => {
        const PostHook = postHookFactory({ ...new Post(), userId: 'userId' });

        const permissions: Permissions<Roles, Post> = {
          everyone({ can }) {
            can(Actions.read, Post);
          },
          customer({ user, can, cannot }) {
            can(Actions.update, Post, { userId: user.id });
            cannot(Actions.update, Post, ['title']);
          },
          operator({ can }) {
            can(Actions.manage, Post);
          },
        };

        const moduleRef = await Test.createTestingModule({
          providers: [
            AccessService,
            AbilityFactory,
            {
              provide: CASL_FEATURE_OPTIONS,
              useValue: { permissions },
            },
          ],
        }).compile();

        accessService = moduleRef.get(AccessService);

        const request: AuthorizableRequest = {
          user,
          casl: {
            user,
            hooks: {
              subject: new PostHook() as unknown as SubjectBeforeFilterHook,
              user: new UserHook() as unknown as UserBeforeFilterHook,
            },
          },
          body: {
            description: 'test',
          },
        };

        const abilityMetadata = {
          action: Actions.update,
          subject: Post,
          subjectHook: PostHook,
        };

        expect(await accessService.canActivateAbility(request, abilityMetadata)).toBeTruthy();
      });
    });
  });
});
