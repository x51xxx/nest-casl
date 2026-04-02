import { vi } from 'vitest';
import { ModuleRef } from '@nestjs/core';
import { NullUserHook, TupleUserHook, userHookFactory } from './user-hook.factory';
import { UserBeforeFilterHook } from '../interfaces/hooks.interface';

class ServiceClass {
  findById = vi.fn().mockResolvedValue({ id: '1', roles: [] });
}

describe('NullUserHook', () => {
  it('returns undefined', async () => {
    const hook = new NullUserHook();
    expect(await hook.run()).toBeUndefined();
  });
});

describe('TupleUserHook', () => {
  it('calls run function with service and user', async () => {
    const service = new ServiceClass();
    const user = { id: 'userId', roles: [] };
    const runFunc = vi.fn().mockResolvedValue(user);
    const hook = new TupleUserHook(service, runFunc);

    const result = await hook.run(user);

    expect(runFunc).toHaveBeenCalledWith(service, user);
    expect(result).toEqual(user);
  });
});

describe('userHookFactory', () => {
  const moduleRef = {
    get: vi.fn().mockReturnValue(new ServiceClass()),
    create: vi.fn(),
  } as unknown as ModuleRef;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns NullUserHook when no hook provided', async () => {
    const hook = await userHookFactory(moduleRef);
    expect(hook).toBeInstanceOf(NullUserHook);
  });

  it('returns NullUserHook when undefined passed', async () => {
    const hook = await userHookFactory(moduleRef, undefined);
    expect(hook).toBeInstanceOf(NullUserHook);
  });

  it('resolves to instance of TupleUserHook with tuple hook passed', async () => {
    expect(await userHookFactory(moduleRef, [ServiceClass, async (user) => user])).toBeInstanceOf(TupleUserHook);
  });

  it('TupleUserHook runs passed function', async () => {
    const tupleFunc = vi.fn().mockImplementation(async (user) => user);
    const tupleUserHook = await userHookFactory(moduleRef, [ServiceClass, tupleFunc]);
    tupleUserHook.run({ id: 'id', roles: [] });
    expect(tupleFunc).toBeCalled();
  });

  it('resolves service from moduleRef with strict: false', async () => {
    await userHookFactory(moduleRef, [ServiceClass, async (user) => user]);
    expect(moduleRef.get).toHaveBeenCalledWith(ServiceClass, { strict: false });
  });

  it('creates hook from class using moduleRef.create', async () => {
    class CustomHook implements UserBeforeFilterHook {
      async run() {
        return { id: '1', roles: [] };
      }
    }
    (moduleRef.create as any).mockResolvedValue(new CustomHook());

    const hook = await userHookFactory(moduleRef, CustomHook);
    expect(moduleRef.create).toHaveBeenCalledWith(CustomHook);
    expect(hook).toBeInstanceOf(CustomHook);
  });
});
