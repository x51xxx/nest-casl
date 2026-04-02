import { vi } from 'vitest';
import { ModuleRef } from '@nestjs/core';
import { NullSubjectHook, TupleSubjectHook, subjectHookFactory } from './subject-hook.factory';
import { SubjectBeforeFilterHook } from '../interfaces/hooks.interface';

class ServiceClass {
  findById = vi.fn().mockResolvedValue({ id: '1' });
}

describe('NullSubjectHook', () => {
  it('returns undefined', async () => {
    const hook = new NullSubjectHook();
    expect(await hook.run()).toBeUndefined();
  });
});

describe('TupleSubjectHook', () => {
  it('calls run function with service and request', async () => {
    const service = new ServiceClass();
    const runFunc = vi.fn().mockResolvedValue({ id: '1' });
    const hook = new TupleSubjectHook(service, runFunc);
    const request = { params: { id: '1' } } as any;

    const result = await hook.run(request);

    expect(runFunc).toHaveBeenCalledWith(service, request);
    expect(result).toEqual({ id: '1' });
  });
});

describe('subjectHookFactory', () => {
  const moduleRef = {
    get: vi.fn().mockReturnValue(new ServiceClass()),
    create: vi.fn(),
  } as unknown as ModuleRef;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns NullSubjectHook when no hook provided', async () => {
    const hook = await subjectHookFactory(moduleRef);
    expect(hook).toBeInstanceOf(NullSubjectHook);
  });

  it('returns NullSubjectHook when undefined passed', async () => {
    const hook = await subjectHookFactory(moduleRef, undefined);
    expect(hook).toBeInstanceOf(NullSubjectHook);
  });

  it('returns TupleSubjectHook with tuple hook', async () => {
    const tupleFunc = vi.fn().mockResolvedValue({ id: '1' });
    const hook = await subjectHookFactory(moduleRef, [ServiceClass, tupleFunc]);
    expect(hook).toBeInstanceOf(TupleSubjectHook);
    expect(moduleRef.get).toHaveBeenCalledWith(ServiceClass, { strict: false });
  });

  it('TupleSubjectHook runs with resolved service', async () => {
    const tupleFunc = vi.fn().mockResolvedValue({ id: '1' });
    const hook = await subjectHookFactory(moduleRef, [ServiceClass, tupleFunc]);
    await hook.run({} as any);
    expect(tupleFunc).toHaveBeenCalled();
  });

  it('creates hook from class using moduleRef.create', async () => {
    class CustomHook implements SubjectBeforeFilterHook {
      async run() {
        return { id: '1' };
      }
    }
    (moduleRef.create as any).mockResolvedValue(new CustomHook());

    const hook = await subjectHookFactory(moduleRef, CustomHook);
    expect(moduleRef.create).toHaveBeenCalledWith(CustomHook);
    expect(hook).toBeInstanceOf(CustomHook);
  });
});
