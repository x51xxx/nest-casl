import { Ability, AnyAbility, PureAbility, Subject } from '@casl/ability';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DefaultActions } from '../actions.enum';

import { OptionsForFeature, OptionsForRoot } from '../interfaces/options.interface';
import { AuthorizableUser } from '../interfaces/authorizable-user.interface';
import { AuthorizableRequest } from '../interfaces/request.interface';
import { UserAbilityBuilder } from '../interfaces/permissions.interface';
import { CaslConfig } from '../casl.config';
import { CASL_FEATURE_OPTIONS, CASL_ROOT_OPTIONS } from '../casl.constants';

export const nullConditionsMatcher = () => (): boolean => true;

@Injectable()
export class AbilityFactory<
  Roles extends string = string,
  Subjects extends Subject = Subject,
  Actions extends string = DefaultActions,
  User extends AuthorizableUser<Roles, unknown> = AuthorizableUser<Roles, unknown>,
> {
  constructor(
    @Inject(CASL_FEATURE_OPTIONS)
    private readonly featureOptions: OptionsForFeature<Roles, Subjects, Actions, User>,
    @Optional() @Inject(CASL_ROOT_OPTIONS) private readonly rootOptions?: OptionsForRoot,
  ) {}

  async createForUser(user: User, abilityClass = Ability, request?: AuthorizableRequest): Promise<AnyAbility> {
    const { permissions, onBuildAbility } = this.featureOptions;
    const opts = this.rootOptions || CaslConfig.getRootOptions();
    const { getContextFromRequest } = opts;

    const context = request && getContextFromRequest ? getContextFromRequest(request) : {};
    const ability = new UserAbilityBuilder<Subjects, Actions, User>(user, permissions, abilityClass, context);
    const everyone = permissions['everyone'] || permissions['every'];

    if (everyone) {
      everyone(ability);
    }

    user.roles?.forEach((role) => {
      ability.permissionsFor(role);
    });

    if (onBuildAbility) {
      await onBuildAbility(ability, request as unknown as AuthorizableRequest<User>);
    }

    // For PureAbility skip conditions check, conditions will be available for filtering through @CaslConditions() param
    if (abilityClass === PureAbility) {
      return ability.build({ conditionsMatcher: nullConditionsMatcher });
    }
    return ability.build();
  }
}
