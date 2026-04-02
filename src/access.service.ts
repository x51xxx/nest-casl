import { Inject, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { Ability, AnyAbility, subject } from '@casl/ability';
import { AnyObject, Subject } from './types';

import { AuthorizableRequest } from './interfaces/request.interface';
import { AbilityFactory } from './factories/ability.factory';
import { AbilityMetadata } from './interfaces/ability-metadata.interface';
import { AuthorizeContext, OptionsForRoot } from './interfaces/options.interface';
import { UserProxy } from './proxies/user.proxy';
import { CaslConfig } from './casl.config';
import { CASL_ROOT_OPTIONS } from './casl.constants';
import { AuthorizableUser } from './interfaces/authorizable-user.interface';
import { RequestProxy } from './proxies/request.proxy';
import { ConditionsProxy } from './proxies/conditions.proxy';
import { AbilityResolver } from './services/ability-resolver';
import { AccessEvaluator } from './services/access-evaluator';
import { FieldAccessChecker } from './services/field-access-checker';

@Injectable()
export class AccessService {
  private readonly abilityResolver: AbilityResolver;
  private readonly accessEvaluator: AccessEvaluator;
  private readonly fieldAccessChecker: FieldAccessChecker;

  constructor(
    private abilityFactory: AbilityFactory,
    @Optional() @Inject(CASL_ROOT_OPTIONS) private readonly rootOptions?: OptionsForRoot,
  ) {
    this.abilityResolver = new AbilityResolver(abilityFactory);
    this.accessEvaluator = new AccessEvaluator();
    this.fieldAccessChecker = new FieldAccessChecker();
  }

  private getRootOptions(): OptionsForRoot & {
    getUserFromRequest: (request: AuthorizableRequest) => AuthorizableUser | undefined;
  } {
    if (this.rootOptions) {
      const opts = this.rootOptions;
      if (!opts.getUserFromRequest) {
        return { ...opts, getUserFromRequest: (request: AuthorizableRequest) => request.user };
      }
      return opts as OptionsForRoot & {
        getUserFromRequest: (request: AuthorizableRequest) => AuthorizableUser | undefined;
      };
    }
    return CaslConfig.getRootOptions();
  }

  public async getAbility(user: AuthorizableUser): Promise<AnyAbility> {
    return this.abilityResolver.resolveAbility(user, Ability);
  }

  public async hasAbility(user: AuthorizableUser, action: string, subject: Subject, field?: string): Promise<boolean> {
    if (!user || !action || !subject) {
      return false;
    }

    const { superuserRole } = this.getRootOptions();

    if (this.abilityResolver.isSuperuser(user, superuserRole)) {
      return true;
    }

    const userAbilities = await this.abilityResolver.resolveAbility(user, Ability);
    return userAbilities.can(action, subject, field);
  }

  public async assertAbility(user: AuthorizableUser, action: string, subject: Subject, field?: string): Promise<void> {
    if (!(await this.hasAbility(user, action, subject, field))) {
      const userAbilities = await this.abilityResolver.resolveAbility(user, Ability);
      const relatedRules = userAbilities.rulesFor(action, typeof subject === 'object' ? subject.constructor : subject);
      if (relatedRules.some((rule) => rule.conditions)) {
        throw new NotFoundException();
      }
      throw new UnauthorizedException();
    }
  }

  public async canActivateAbility<Subject = AnyObject>(
    request: AuthorizableRequest,
    ability?: AbilityMetadata<Subject>,
  ): Promise<boolean> {
    const {
      getUserFromRequest,
      superuserRole,
      conditionsProxyFactory,
      getFieldsFromRequest,
      preCheck,
      afterAuthorize,
    } = this.getRootOptions();

    const user = this.abilityResolver.resolveUser(request, getUserFromRequest);
    const req = new RequestProxy(request);

    if (!user || !ability) {
      return false;
    }

    const emitResult = async (allowed: boolean): Promise<boolean> => {
      if (afterAuthorize) {
        await afterAuthorize({
          allowed,
          user,
          action: ability.action,
          subject: ability.subject,
          request,
        } as AuthorizeContext);
      }
      return allowed;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createConditions = (abilities: AnyAbility, action: string, subj: any, forUser: AuthorizableUser) =>
      conditionsProxyFactory
        ? conditionsProxyFactory(abilities, action, subj, forUser)
        : new ConditionsProxy(abilities, action, subj);

    // Pre-check: early deny based on custom business logic (e.g., role requirements)
    if (preCheck && !(await preCheck(user, request))) {
      return emitResult(false);
    }

    // Always allow access for superuser
    if (this.abilityResolver.isSuperuser(user, superuserRole)) {
      const userAbilities = await this.abilityResolver.resolveAbility(user, Ability, request);
      req.setConditions(createConditions(userAbilities, ability.action, ability.subject, user));
      return emitResult(true);
    }

    let userAbilities = await this.abilityResolver.resolveAbility(user, Ability, request);
    const relevantRules = userAbilities.rulesFor(ability.action, ability.subject);

    // If no relevant rules have conditions or no subject hook exists, check against subject class
    if (!relevantRules.some((rule) => rule.conditions) || !ability.subjectHook) {
      req.setConditions(createConditions(userAbilities, ability.action, ability.subject, user));
      return emitResult(this.accessEvaluator.evaluate(userAbilities, ability.action, ability.subject));
    }

    // Otherwise try to obtain subject
    const subjectInstance = await req.getSubjectHook().run(request);
    req.setSubject(subjectInstance);

    if (!subjectInstance) {
      req.setConditions(createConditions(userAbilities, ability.action, ability.subject, user));
      return emitResult(this.accessEvaluator.evaluate(userAbilities, ability.action, ability.subject));
    }

    const userProxy = new UserProxy(request, getUserFromRequest);
    const finalUser = await userProxy.get();
    if (finalUser && finalUser !== userProxy.getFromRequest()) {
      userAbilities = await this.abilityResolver.resolveAbility(finalUser, Ability, request);
    }

    // Set conditions after user hook — use finalUser so factory gets the enriched user
    req.setConditions(createConditions(userAbilities, ability.action, ability.subject, finalUser ?? user));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actualSubject = subject(ability.subject as any, subjectInstance);

    const cannotActivateSomeField = await this.fieldAccessChecker.check(
      userAbilities,
      request,
      ability.action,
      actualSubject,
      finalUser,
      getFieldsFromRequest,
    );

    if (cannotActivateSomeField) return emitResult(false);

    return emitResult(this.accessEvaluator.evaluate(userAbilities, ability.action, actualSubject));
  }
}
