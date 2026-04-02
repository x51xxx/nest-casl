import { AnyAbility } from '@casl/ability';
import { flatten } from 'flat';

import { AnyObject } from '../types';
import { AuthorizableRequest } from '../interfaces/request.interface';
import { AuthorizableUser } from '../interfaces/authorizable-user.interface';

export class FieldAccessChecker {
  async check(
    abilities: AnyAbility,
    request: AuthorizableRequest,
    action: string,
    subject: AnyObject,
    user: AuthorizableUser | undefined,
    getFieldsFromRequest?: (request: AuthorizableRequest) => string[],
  ): Promise<boolean> {
    if (!user) return true;

    const subjectFields = getFieldsFromRequest
      ? getFieldsFromRequest(request)
      : Object.keys(flatten(request.body || {}));

    return subjectFields.some((field) => !abilities.can(action, subject, field));
  }
}
