import { AnyObject } from '../types';

import { SubjectBeforeFilterHook, UserBeforeFilterHook } from './hooks.interface';
import { AuthorizableUser } from './authorizable-user.interface';
import { ConditionsProxy } from '../proxies/conditions.proxy';

export interface CaslRequestCache<
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser,
  Subject = AnyObject,
> {
  user?: User;
  subject?: Subject;
  conditions?: ConditionsProxy;
  params?: Record<string, unknown>;
  paramKey?: string;
  hooks: {
    user: UserBeforeFilterHook<User>;
    subject: SubjectBeforeFilterHook<Subject>;
  };
}
