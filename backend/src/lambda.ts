import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import serverlessExpress from 'serverless-http';
import type { Handler } from 'aws-lambda';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation-pipe';
import { configureBodyParser } from './common/body-parser.config';
import { configurePayloadCap } from './common/payload-cap.config';

/**
 * Serverless entrypoint — one Lambda wrapping the whole NestJS app behind
 * API Gateway (detailed-design §1). The bootstrapped handler is cached in the
 * module scope so warm invocations skip the Nest bootstrap (cold-start friendly,
 * NFR-3).
 */
let cachedHandler: ReturnType<typeof serverlessExpress> | undefined;

async function bootstrapHandler(): Promise<ReturnType<typeof serverlessExpress>> {
  const expressApp = express();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressApp),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  configurePayloadCap(app);
  configureBodyParser(app);
  await app.init();
  return serverlessExpress(expressApp);
}

export const handler: Handler = async (event, context) => {
  // A Lambda execution environment may freeze the instant its invocation
  // settles, and this line sets `callbackWaitsForEmptyEventLoop = true` so
  // Lambda waits for the event loop to drain first — the backstop for any
  // pending work a handler leaves in flight when it returns.
  //
  // This silently killed the registration OTP (`fix/otp-mail-lambda-freeze`,
  // 2026-09-03): `RegistrationsService.requestVerificationCode` used to
  // dispatch `MailService.sendVerificationCode` fire-and-forget ON PURPOSE
  // — awaiting SES would have made response latency an oracle for whether
  // an address was recently used, which FR-4 (requirements.md:245) forbids
  // as a hard `AND IT MUST` — so the in-flight SES call was frozen mid-request
  // and lost, with its own `.catch()` never running either. Observed in
  // production, not theorised: CloudWatch carried a `mail send attempt` line
  // and ZERO matching `mail send outcome` lines, the exact
  // attempt-without-outcome signature `MailService.dispatch`'s two-line log
  // shape is built to make visible.
  //
  // **This line alone did not fix that.** It was added 2026-08-07 as the
  // intended mitigation and stayed silently ineffective for the OTP path
  // until this fix — this handler is `async`, and the Node Lambda runtime
  // settles an `async` handler's invocation when its RETURNED PROMISE
  // resolves, not via the legacy `context.done`/callback mechanism this flag
  // governs, so it never got a chance to hold the freeze back for
  // promise-based work still pending after `return`. (Strong inference from
  // the observed behaviour and Lambda's documented async-handler completion
  // model, not something instrumented and confirmed line-by-line — an
  // earlier revision of this comment instead blamed `serverless-http` for
  // setting the flag to `false`; grepping the installed package shows it
  // never touches `callbackWaitsForEmptyEventLoop` at all, so that claim was
  // wrong and is corrected here rather than repeated.)
  //
  // The OTP path's actual fix is at the source: `requestVerificationCode`
  // now AWAITS the send inside its own try/catch (padding both branches to
  // a constant-time floor to keep FR-4's timing property — see that
  // method's class doc), so the freeze this comment describes can no
  // longer drop it. This flag remains load-bearing regardless:
  // `AdminRegistrationsService`'s approval/rejection notices and
  // `RegistrationsService.submitRegistration`'s receipt email are still
  // dispatched fire-and-forget by design (DD-9), and depend on this flag to
  // survive a freeze after their own `202`/response is written.
  context.callbackWaitsForEmptyEventLoop = true;

  if (!cachedHandler) {
    cachedHandler = await bootstrapHandler();
  }
  return cachedHandler(event, context);
};
