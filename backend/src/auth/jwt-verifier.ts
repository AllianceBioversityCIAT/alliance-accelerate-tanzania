import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getCognitoConfig } from './auth.config';

/**
 * Single, shared Cognito JWT verifier (Lambda-tuned — mirrors the
 * {@link PrismaService} singleton). One instance per container is reused across
 * warm invocations; it caches the pool JWKS, so only the first verify fetches
 * the keys (design §9 cold-start mitigation).
 *
 * The verifier checks issuer (`https://cognito-idp.<region>.amazonaws.com/
 * <poolId>`), the client id (audience), `token_use=access`, and expiry
 * (NFR-1). It is created lazily on first use so a public-only run without the
 * Cognito env never constructs it.
 */
export type Verifier = ReturnType<typeof CognitoJwtVerifier.create>;

let verifier: Verifier | undefined;

export function getJwtVerifier(): Verifier {
  if (!verifier) {
    const { userPoolId, clientId } = getCognitoConfig();
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'access',
      clientId,
    });
  }
  return verifier;
}

/** Test seam — reset the cached singleton between specs. */
export function resetJwtVerifier(): void {
  verifier = undefined;
}
