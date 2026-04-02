import { AnyAbility } from '@casl/ability';

import { AuthorizableUser } from '../interfaces/authorizable-user.interface';
import { AuthorizableRequest } from '../interfaces/request.interface';
import { AbilityFactory } from '../factories/ability.factory';
import { UserProxy } from '../proxies/user.proxy';

export class AbilityResolver {
  constructor(private abilityFactory: AbilityFactory) {}

  resolveUser(
    request: AuthorizableRequest,
    getUserFromRequest: (request: AuthorizableRequest) => AuthorizableUser | undefined,
  ): AuthorizableUser | undefined {
    const userProxy = new UserProxy(request, getUserFromRequest);
    return userProxy.getFromRequest();
  }

  async resolveAbility(
    user: AuthorizableUser,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abilityClass: any,
    request?: AuthorizableRequest,
  ): Promise<AnyAbility> {
    return this.abilityFactory.createForUser(user, abilityClass, request);
  }

  isSuperuser(user: AuthorizableUser, superuserRole?: string): boolean {
    return !!(superuserRole && user.roles?.includes(superuserRole));
  }
}
