import { NullUserHook } from '../factories/user-hook.factory';
import { NullSubjectHook } from '../factories/subject-hook.factory';
import { CaslRequestCache } from '../interfaces/casl-request-cache.interface';
import { UserBeforeFilterHook, SubjectBeforeFilterHook } from '../interfaces/hooks.interface';
import { RequestProxy } from './request.proxy';
import { ConditionsProxy } from './conditions.proxy';

const defaultCaslCache: CaslRequestCache = {
  hooks: {
    subject: new NullSubjectHook(),
    user: new NullUserHook(),
  },
};

describe('RequestProxy', () => {
  let requestProxy: RequestProxy;

  beforeEach(() => {
    requestProxy = new RequestProxy({ casl: { ...defaultCaslCache, hooks: { ...defaultCaslCache.hooks } } });
  });

  describe('conditions', () => {
    it('getConditions returns undefined when no conditions set', () => {
      expect(requestProxy.getConditions()).toBeUndefined();
    });

    it('getConditions returns cached conditions', () => {
      const conditions = new ConditionsProxy([] as any, 'read', 'Post');
      requestProxy.setConditions(conditions);
      expect(requestProxy.getConditions()).toBe(conditions);
    });
  });

  describe('subject', () => {
    it('getSubject returns undefined when no subject set', () => {
      expect(requestProxy.getSubject()).toBeUndefined();
    });

    it('getSubject returns cached subject', () => {
      const subject = { userId: 'userId' };
      requestProxy.setSubject(subject);
      expect(requestProxy.getSubject()).toEqual(subject);
    });
  });

  describe('user', () => {
    it('getUser returns undefined when no user set', () => {
      expect(requestProxy.getUser()).toBeUndefined();
    });

    it('getUser returns cached user', () => {
      const user = { id: 'userId', roles: [] };
      requestProxy.setUser(user);
      expect(requestProxy.getUser()).toEqual(user);
    });

    it('setUser to undefined clears cached user', () => {
      const user = { id: 'userId', roles: [] };
      requestProxy.setUser(user);
      requestProxy.setUser(undefined);
      expect(requestProxy.getUser()).toBeUndefined();
    });
  });

  describe('hooks', () => {
    it('getUserHook returns default NullUserHook', () => {
      expect(requestProxy.getUserHook()).toBeInstanceOf(NullUserHook);
    });

    it('setUserHook and getUserHook work together', () => {
      const hook: UserBeforeFilterHook = { run: async () => ({ id: '1', roles: [] }) };
      requestProxy.setUserHook(hook);
      expect(requestProxy.getUserHook()).toBe(hook);
    });

    it('getSubjectHook returns default NullSubjectHook', () => {
      expect(requestProxy.getSubjectHook()).toBeInstanceOf(NullSubjectHook);
    });

    it('setSubjectHook and getSubjectHook work together', () => {
      const hook: SubjectBeforeFilterHook = { run: async () => ({ id: '1' }) };
      requestProxy.setSubjectHook(hook);
      expect(requestProxy.getSubjectHook()).toBe(hook);
    });
  });

  describe('default cache initialization', () => {
    it('initializes default casl cache when request has no casl property', () => {
      const request = {} as any;
      const proxy = new RequestProxy(request);
      expect(request.casl).toBeDefined();
      expect(proxy.getUserHook()).toBeInstanceOf(NullUserHook);
      expect(proxy.getSubjectHook()).toBeInstanceOf(NullSubjectHook);
    });

    it('preserves existing casl cache', () => {
      const existingCache = {
        ...defaultCaslCache,
        hooks: { ...defaultCaslCache.hooks },
        user: { id: 'existingUser', roles: [] },
      };
      const request = { casl: existingCache } as any;
      const proxy = new RequestProxy(request);
      expect(proxy.getUser()).toEqual({ id: 'existingUser', roles: [] });
    });
  });
});
