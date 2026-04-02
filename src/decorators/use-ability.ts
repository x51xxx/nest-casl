import { AnyClass, AnyObject } from '../types';
import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { CASL_META_ABILITY } from '../casl.constants';
import { SubjectBeforeFilterHook, SubjectBeforeFilterTuple } from '../interfaces/hooks.interface';
import { AuthorizableRequest } from '../interfaces/request.interface';

export interface UseAbilityOptions<Subject = AnyObject, Request = AuthorizableRequest> {
  hook?: AnyClass<SubjectBeforeFilterHook<Subject, Request>> | SubjectBeforeFilterTuple<Subject, Request>;
  paramKey?: string;
}

export function UseAbility<Subject = AnyObject, Request = AuthorizableRequest>(
  action: string,
  subject: AnyClass<Subject>,
  subjectHookOrOptions?:
    | AnyClass<SubjectBeforeFilterHook<Subject, Request>>
    | SubjectBeforeFilterTuple<Subject, Request>
    | UseAbilityOptions<Subject, Request>,
): CustomDecorator {
  if (subjectHookOrOptions && typeof subjectHookOrOptions === 'object' && !Array.isArray(subjectHookOrOptions)) {
    const options = subjectHookOrOptions as UseAbilityOptions<Subject, Request>;
    return SetMetadata(CASL_META_ABILITY, {
      action,
      subject,
      subjectHook: options.hook,
      paramKey: options.paramKey,
    });
  }

  return SetMetadata(CASL_META_ABILITY, { action, subject, subjectHook: subjectHookOrOptions });
}
