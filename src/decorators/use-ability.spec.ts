import { CASL_META_ABILITY } from '../casl.constants';
import { UseAbility } from './use-ability';
import { Actions } from '../actions.enum';

class TestSubject {
  id: string;
}

class TestSubjectHook {
  async run() {
    return new TestSubject();
  }
}

describe('UseAbility', () => {
  it('sets metadata with action and subject', () => {
    class TestClass {
      handler() {}
    }
    const decorator = UseAbility(Actions.read, TestSubject);
    decorator(TestClass.prototype, 'handler', Object.getOwnPropertyDescriptor(TestClass.prototype, 'handler')!);
    const metadata = Reflect.getMetadata(CASL_META_ABILITY, TestClass.prototype.handler);
    expect(metadata).toEqual({
      action: Actions.read,
      subject: TestSubject,
      subjectHook: undefined,
    });
  });

  it('sets metadata with action, subject, and subjectHook', () => {
    class TestClass {
      handler() {}
    }
    const decorator = UseAbility(Actions.update, TestSubject, TestSubjectHook);
    decorator(TestClass.prototype, 'handler', Object.getOwnPropertyDescriptor(TestClass.prototype, 'handler')!);
    const metadata = Reflect.getMetadata(CASL_META_ABILITY, TestClass.prototype.handler);
    expect(metadata).toEqual({
      action: Actions.update,
      subject: TestSubject,
      subjectHook: TestSubjectHook,
    });
  });

  it('sets metadata with options object containing hook and paramKey', () => {
    class TestClass {
      handler() {}
    }
    const decorator = UseAbility(Actions.update, TestSubject, {
      hook: TestSubjectHook,
      paramKey: 'eventId',
    });
    decorator(TestClass.prototype, 'handler', Object.getOwnPropertyDescriptor(TestClass.prototype, 'handler')!);
    const metadata = Reflect.getMetadata(CASL_META_ABILITY, TestClass.prototype.handler);
    expect(metadata).toEqual({
      action: Actions.update,
      subject: TestSubject,
      subjectHook: TestSubjectHook,
      paramKey: 'eventId',
    });
  });

  it('sets metadata with options object containing only paramKey', () => {
    class TestClass {
      handler() {}
    }
    const decorator = UseAbility(Actions.read, TestSubject, {
      paramKey: 'id',
    });
    decorator(TestClass.prototype, 'handler', Object.getOwnPropertyDescriptor(TestClass.prototype, 'handler')!);
    const metadata = Reflect.getMetadata(CASL_META_ABILITY, TestClass.prototype.handler);
    expect(metadata).toEqual({
      action: Actions.read,
      subject: TestSubject,
      subjectHook: undefined,
      paramKey: 'id',
    });
  });

  it('still supports tuple hook as third argument', () => {
    class TestClass {
      handler() {}
    }
    class SomeService {}
    const tupleHook: [typeof SomeService, () => Promise<TestSubject>] = [SomeService, async () => new TestSubject()];
    const decorator = UseAbility(Actions.update, TestSubject, tupleHook);
    decorator(TestClass.prototype, 'handler', Object.getOwnPropertyDescriptor(TestClass.prototype, 'handler')!);
    const metadata = Reflect.getMetadata(CASL_META_ABILITY, TestClass.prototype.handler);
    expect(metadata).toEqual({
      action: Actions.update,
      subject: TestSubject,
      subjectHook: tupleHook,
    });
  });
});
