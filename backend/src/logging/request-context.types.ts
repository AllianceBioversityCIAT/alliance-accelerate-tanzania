// @sdd-spec actors/public-self-registration (T-4)
/**
 * Shared typing for the request id `RequestContextMiddleware` attaches.
 * `RequestContextMiddleware` itself reads the same field back off the
 * request when it emits the structured log line on `res.on('finish', ...)`.
 */
import type { Request } from 'express';

export interface RequestWithId extends Request {
  requestId?: string;
}
