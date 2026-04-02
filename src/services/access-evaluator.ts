import { AnyAbility } from '@casl/ability';
import { Subject } from '../types';

export class AccessEvaluator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate(abilities: AnyAbility, action: string, subject: Subject | any): boolean {
    return abilities.can(action, subject);
  }
}
