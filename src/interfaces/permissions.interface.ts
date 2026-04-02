import { Ability, AnyAbility, AbilityBuilder, AbilityTuple, Subject } from '@casl/ability';
import { AnyClass } from '../types';
import { DefaultActions } from '../actions.enum';
import { AuthorizableUser } from './authorizable-user.interface';

export class UserAbilityBuilder<
  Subjects extends Subject = Subject,
  Actions extends string = DefaultActions,
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser,
  Context = unknown,
> extends AbilityBuilder<AnyAbility> {
  constructor(
    public user: User,
    public permissions: AnyPermissions<string, Subjects, Actions, User, Context>,
    AbilityType: AnyClass<Ability<AbilityTuple<Actions, Subjects>>>,
    public context: Context = {} as Context,
  ) {
    super(AbilityType);
  }

  extend = (role: string): void => {
    this.permissionsFor(role);
  };

  permissionsFor(role: string): void {
    const rolePermissions = this.permissions[role];
    if (rolePermissions) {
      rolePermissions(this);
    }
  }
}

export type DefinePermissions<
  Subjects extends Subject = Subject,
  Actions extends string = DefaultActions,
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser,
  Context = unknown,
> = (builder: UserAbilityBuilder<Subjects, Actions, User, Context>) => void;

export type Permissions<
  Roles extends string,
  Subjects extends Subject = Subject,
  Actions extends string = DefaultActions,
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser<Roles>,
  Context = unknown,
> = Partial<Record<Roles | 'every' | 'everyone', DefinePermissions<Subjects, Actions, User, Context>>>;

export type AnyPermissions<
  Roles extends string = string,
  Subjects extends Subject = Subject,
  Actions extends string = string,
  User extends AuthorizableUser<unknown, unknown> = AuthorizableUser<Roles>,
  Context = unknown,
> = Permissions<Roles, Subjects, Actions, User, Context>;
