import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { getJwtVerifier } from './jwt-verifier';
import { AuthUser, roleFromGroups } from './auth.types';

/**
 * Opt-in guard (never global — FR-8) that authenticates a request from its
 * Cognito access token. Extracts `Authorization: Bearer <token>`, verifies it
 * against the pool JWKS (iss/aud/token-use/exp via `aws-jwt-verify`, NFR-1),
 * and on success attaches the verified identity to `req.user`. Role is derived
 * solely from the verified `cognito:groups` claim, so a forged role in the body
 * or a header can never grant access (FR-6). Any failure — missing header or a
 * verify rejection — yields `401`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: Record<string, unknown>;
    try {
      payload = await getJwtVerifier().verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const groups = (payload['cognito:groups'] as string[] | undefined) ?? [];
    const user: AuthUser = {
      sub: payload.sub as string,
      username: (payload.username as string | undefined) ?? (payload.sub as string),
      email: payload.email as string | undefined,
      groups,
      role: roleFromGroups(groups),
    };
    (req as Request & { user: AuthUser }).user = user;
    return true;
  }
}

/** Pull the token out of an `Authorization: Bearer <token>` header. */
function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
