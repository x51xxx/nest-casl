import { ContextType, ExecutionContext, NotAcceptableException } from '@nestjs/common';
import { AuthorizableRequest } from '../interfaces/request.interface';
import { NullUserHook } from '../factories/user-hook.factory';
import { NullSubjectHook } from '../factories/subject-hook.factory';

// Redefine GqlContextType to avoid hard dependency on @nestjs/graphql module
export type GqlContextType = 'graphql' | ContextType;

export class ContextProxy {
  constructor(private readonly context: ExecutionContext) {}

  public static create(context: ExecutionContext): ContextProxy {
    return new ContextProxy(context);
  }

  public async getRequest(): Promise<AuthorizableRequest> {
    switch (this.context.getType<GqlContextType>()) {
      case 'http':
      case 'ws':
        return this.context.switchToHttp().getRequest();
      case 'graphql': {
        const { GqlExecutionContext } = await import('@nestjs/graphql');
        const ctx = GqlExecutionContext.create(this.context);
        const request = ctx.getContext().req;
        const mergedParams = {
          ...ctx.getArgs(),
          ...request.params,
        };
        // Store normalized params in casl cache without mutating request.params
        if (!request.casl) {
          request.casl = {
            hooks: {
              user: new NullUserHook(),
              subject: new NullSubjectHook(),
            },
          };
        }
        request.casl.params = mergedParams;
        // Keep mutation for backward compatibility (deprecated — use request.casl.params)
        request.params = mergedParams;
        return request;
      }
      default:
        throw new NotAcceptableException();
    }
  }
}
