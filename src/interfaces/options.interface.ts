import { AnyAbility } from '@casl/ability';
import { AnyClass, Subject } from '../types';
import { DefaultActions } from '../actions.enum';
import { FactoryProvider, ModuleMetadata } from '@nestjs/common';

import { UserBeforeFilterHook, UserBeforeFilterTuple } from './hooks.interface';
import { AnyPermissions, UserAbilityBuilder } from './permissions.interface';
import { AuthorizableUser } from './authorizable-user.interface';
import { AuthorizableRequest } from './request.interface';
import { ConditionsProxy } from '../proxies/conditions.proxy';

export interface OptionsForRoot<
  Roles extends string = string,
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser<Roles>,
  Request = AuthorizableRequest<User>,
  Context = unknown,
> {
  superuserRole?: Roles;
  getUserFromRequest?: (request: Request) => User | undefined;
  getUserHook?: AnyClass<UserBeforeFilterHook<User>> | UserBeforeFilterTuple<User>;
  getContextFromRequest?: (request: Request) => Context;
  conditionsProxyFactory?: (abilities: AnyAbility, action: string, subject: Subject, user: User) => ConditionsProxy;
  getFieldsFromRequest?: (request: AuthorizableRequest<User>) => string[];
}

export interface OptionsForFeature<
  Roles extends string = string,
  Subjects extends Subject = Subject,
  Actions extends string = DefaultActions,
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser<Roles>,
> {
  permissions: AnyPermissions<Roles, Subjects, Actions, User>;
  moduleName?: string;
  subjectsMap?: Record<string, Subject>;
  onBuildAbility?: (
    builder: UserAbilityBuilder<Subjects, Actions, User>,
    request?: AuthorizableRequest<User>,
  ) => Promise<void>;
}

export interface OptionsForRootAsync<
  Roles extends string = string,
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser<Roles>,
  Request = AuthorizableRequest<User>,
> extends Pick<ModuleMetadata, 'imports'> {
  useFactory: FactoryProvider<
    Promise<OptionsForRoot<Roles, User, Request>> | OptionsForRoot<Roles, User, Request>
  >['useFactory'];
  inject?: FactoryProvider['inject'];
}
