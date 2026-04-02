import { defineAbility } from '@casl/ability';
import { ConditionsProxy } from './conditions.proxy';

describe('ConditionsProxy', () => {
  describe('toSql()', () => {
    it('translates proxied conditions to parametrized sql', () => {
      const ability = defineAbility((can) => {
        can('update', 'Post', { userId: 'userId' });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'update', 'Post');
      expect(conditionsProxy.toSql()).toEqual(['"userId" = $1', ['userId'], []]);
    });

    it('negates cannot rule with not', () => {
      const ability = defineAbility((can, cannot) => {
        can('update', 'Movie');
        cannot('update', 'Movie', { status: 'PUBLISHED' });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'update', 'Movie');
      expect(conditionsProxy.toSql()).toEqual(['not ("status" = $1)', ['PUBLISHED'], []]);
    });

    it('compose can rules', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload', { public: true });
        can('read', 'Upload', { user: 'userId', public: false });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Upload');
      expect(conditionsProxy.toSql()).toEqual([
        '("user" = $1 and "public" = $2) or "public" = $3',
        ['userId', false, true],
        [],
      ]);
    });

    it('return undefined when no rules found', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload', { public: true });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'write', 'Upload');
      expect(conditionsProxy.toSql()).toBeUndefined();
    });

    it('return undefined for rule without conditions', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Upload');
      expect(conditionsProxy.toSql()).toBeUndefined();
    });
  });

  describe('toMongo()', () => {
    it('translates proxied conditions to mongo query', () => {
      const ability = defineAbility((can) => {
        can('update', 'Post', { userId: 'userId' });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'update', 'Post');
      expect(conditionsProxy.toMongo()).toEqual({
        $or: [
          {
            userId: 'userId',
          },
        ],
      });
    });

    it('negates cannot rule with not', () => {
      const ability = defineAbility((can, cannot) => {
        can('update', 'Movie');
        cannot('update', 'Movie', { status: 'PUBLISHED' });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'update', 'Movie');
      expect(conditionsProxy.toMongo()).toEqual({ $and: [{ $nor: [{ status: 'PUBLISHED' }] }] });
    });

    it('compose can rules', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload', { public: true });
        can('read', 'Upload', { user: 'userId', public: false });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Upload');
      expect(conditionsProxy.toMongo()).toEqual({ $or: [{ public: false, user: 'userId' }, { public: true }] });
    });

    it('return undefined when no rules found', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload', { public: true });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'write', 'Upload');
      expect(conditionsProxy.toMongo()).toBeUndefined();
    });

    it('return undefined for rule without conditions', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Upload');
      expect(conditionsProxy.toSql()).toBeUndefined();
    });
  });

  describe('get()', () => {
    it('returns array of conditions', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload', { userId: { $in: ['1', '2'] } });
        can('read', 'Upload', { userId: { $not: null } });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Upload');
      expect(conditionsProxy.get()).toEqual([{ userId: { $not: null } }, { userId: { $in: ['1', '2'] } }]);
    });
  });

  describe('toFilter()', () => {
    it('returns first non-inverted rule conditions as typed filter', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post', { accountId: 123 });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toFilter<{ accountId: number }>()).toEqual({ accountId: 123 });
    });

    it('skips inverted rules and returns first non-inverted', () => {
      const ability = defineAbility((can, cannot) => {
        can('update', 'Post');
        cannot('update', 'Post', { status: 'PUBLISHED' });
        can('update', 'Post', { accountId: 42 });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'update', 'Post');
      expect(conditionsProxy.toFilter()).toEqual({ accountId: 42 });
    });

    it('returns undefined when no rules exist', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload', { public: true });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'write', 'Upload');
      expect(conditionsProxy.toFilter()).toBeUndefined();
    });

    it('returns undefined for rules without conditions', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toFilter()).toBeUndefined();
    });

    it('returns undefined when only inverted rules have conditions', () => {
      const ability = defineAbility((can, cannot) => {
        can('update', 'Movie');
        cannot('update', 'Movie', { status: 'ARCHIVED' });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'update', 'Movie');
      expect(conditionsProxy.toFilter()).toBeUndefined();
    });
  });

  describe('getRules()', () => {
    it('returns rules for action and subject', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post', { accountId: 1 });
        can('read', 'Post', { public: true });
        can('delete', 'Post');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      const rules = conditionsProxy.getRules();
      expect(rules).toHaveLength(2);
    });

    it('returns empty array when no rules match', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'delete', 'Post');
      expect(conditionsProxy.getRules()).toHaveLength(0);
    });
  });

  describe('toQuery()', () => {
    it('merges multiple rules into $or query', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post', { accountId: 1 });
        can('read', 'Post', { public: true });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toQuery()).toEqual({
        $or: [{ public: true }, { accountId: 1 }],
      });
    });

    it('returns single condition without $or wrapper', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post', { accountId: 1 });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toQuery()).toEqual({
        $or: [{ accountId: 1 }],
      });
    });

    it('returns undefined when no rules', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'write', 'Upload');
      expect(conditionsProxy.toQuery()).toBeUndefined();
    });

    it('skips inverted rules', () => {
      const ability = defineAbility((can, cannot) => {
        can('update', 'Post', { accountId: 1 });
        cannot('update', 'Post', { status: 'archived' });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'update', 'Post');
      const query = conditionsProxy.toQuery();
      // Inverted rules are excluded (returned undefined from converter)
      expect(query).toBeDefined();
    });
  });

  describe('toWhere()', () => {
    it('flattens $or into array of plain objects', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post', { accountId: 1 });
        can('read', 'Post', { public: true });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toWhere()).toEqual([{ public: true }, { accountId: 1 }]);
    });

    it('returns single object when one rule', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post', { accountId: 42 });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toWhere()).toEqual({ accountId: 42 });
    });

    it('preserves $in operators for ORM conversion', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post', { status: { $in: ['active', 'pending'] } });
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toWhere()).toEqual({
        status: { $in: ['active', 'pending'] },
      });
    });

    it('returns undefined when no rules', () => {
      const ability = defineAbility((can) => {
        can('read', 'Upload');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'write', 'Upload');
      expect(conditionsProxy.toWhere()).toBeUndefined();
    });

    it('returns empty object for rules without conditions (unrestricted access)', () => {
      const ability = defineAbility((can) => {
        can('read', 'Post');
      });
      const conditionsProxy = new ConditionsProxy(ability, 'read', 'Post');
      expect(conditionsProxy.toWhere()).toEqual({});
    });
  });
});
