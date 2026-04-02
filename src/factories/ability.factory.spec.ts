import { Test } from '@nestjs/testing';
import { AbilityFactory, nullConditionsMatcher } from './ability.factory';

import { Permissions } from '../interfaces/permissions.interface';
import { DefaultActions as Actions } from '../actions.enum';
import { Roles } from '../__specs__/app/app.roles';
import { Post } from '../__specs__/app/post/dtos/post.dto';
import { CASL_FEATURE_OPTIONS } from '../casl.constants';

const permissions: Permissions<Roles> = {
  everyone({ can }) {
    can(Actions.read, Post);
  },

  customer({ can }) {
    can(Actions.create, Post);
    can(Actions.delete, Post);
  },

  operator({ can, cannot, extend }) {
    extend(Roles.customer);

    can(Actions.update, Post);
    cannot(Actions.delete, Post);
  },
};

const permissionsEveryAlias: Permissions<Roles> = {
  every({ can }) {
    can(Actions.read, Post);
  },

  customer({ can }) {
    can(Actions.create, Post);
    can(Actions.delete, Post);
  },
};

const permissionsNoEveryone: Permissions<Roles> = {
  customer({ can }) {
    can(Actions.create, Post);
    can(Actions.delete, Post);
  },
};

const getAbilityFactory = async (permissions: Permissions<Roles>): Promise<AbilityFactory> => {
  const moduleRef = await Test.createTestingModule({
    providers: [AbilityFactory, { provide: CASL_FEATURE_OPTIONS, useValue: { permissions } }],
  }).compile();

  return moduleRef.get<AbilityFactory>(AbilityFactory);
};

describe('AbilityFactory', () => {
  let abilityFactory: AbilityFactory;

  beforeEach(async () => {
    abilityFactory = await getAbilityFactory(permissions);
  });

  it("everyone's rules applied to customer", async () => {
    const user = { id: 'userId', roles: [Roles.customer] };
    const ability = await abilityFactory.createForUser(user);
    expect(ability.can(Actions.read, Post)).toBe(true);
  });

  it('every is an alias for everyone', async () => {
    abilityFactory = await getAbilityFactory(permissionsEveryAlias);
    const user = { id: 'userId', roles: [Roles.customer] };
    const ability = await abilityFactory.createForUser(user);
    expect(ability.can(Actions.read, Post)).toBe(true);
  });

  it('works without everyone role', async () => {
    abilityFactory = await getAbilityFactory(permissionsNoEveryone);
    const user = { id: 'userId', roles: [Roles.customer] };
    const ability = await abilityFactory.createForUser(user);
    expect(ability.can(Actions.read, Post)).toBe(false);
  });

  it('operator inherits rules from user', async () => {
    const user = { id: 'userId', roles: [Roles.operator] };
    const ability = await abilityFactory.createForUser(user);
    expect(ability.can(Actions.read, Post)).toBe(true);
    expect(ability.can(Actions.create, Post)).toBe(true);
    expect(ability.can(Actions.update, Post)).toBe(true);
    expect(ability.can(Actions.delete, Post)).toBe(false);
  });

  it('null conditions matcher always true', () => {
    expect(nullConditionsMatcher()()).toBeTruthy();
  });

  describe('context in permissions', () => {
    it('passes context from request via getContextFromRequest', async () => {
      const { CaslConfig } = await import('../casl.config');
      const { vi } = await import('vitest');

      const contextPermissions: Permissions<Roles, Post, Actions> = {
        customer({ context, can }) {
          const ctx = context as { accountId: number };
          can(Actions.read, Post, { userId: String(ctx.accountId) } as any);
        },
      };

      const factory = await getAbilityFactory(contextPermissions);

      vi.spyOn(CaslConfig, 'getRootOptions').mockImplementation(() => ({
        getUserFromRequest: () => undefined,
        getContextFromRequest: (req: any) => ({ accountId: req.accountId }),
      }));

      const user = { id: 'userId', roles: [Roles.customer] };
      const mockRequest = {
        accountId: 42,
        casl: { hooks: { user: { run: async () => undefined }, subject: { run: async () => undefined } } },
      } as any;
      const ability = await factory.createForUser(user, undefined, mockRequest);

      expect(ability.rules).toEqual([{ action: 'read', subject: Post, conditions: { userId: '42' } }]);

      vi.restoreAllMocks();
    });

    it('defaults context to empty object when no getContextFromRequest', async () => {
      const { CaslConfig } = await import('../casl.config');
      const { vi } = await import('vitest');

      const contextPermissions: Permissions<Roles, Post, Actions> = {
        customer({ context, can }) {
          // context should be {} — no error accessing it
          expect(context).toEqual({});
          can(Actions.read, Post);
        },
      };

      const factory = await getAbilityFactory(contextPermissions);

      vi.spyOn(CaslConfig, 'getRootOptions').mockImplementation(() => ({
        getUserFromRequest: () => undefined,
      }));

      const user = { id: 'userId', roles: [Roles.customer] };
      await factory.createForUser(user);

      vi.restoreAllMocks();
    });
  });
});
