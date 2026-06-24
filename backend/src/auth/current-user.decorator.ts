import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from './auth.types';

/**
 * Param decorator returning the verified `req.user` attached by
 * {@link JwtAuthGuard}. Only meaningful on a route guarded by `JwtAuthGuard`;
 * on an unguarded route it resolves to `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined => {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    return req.user;
  },
);
