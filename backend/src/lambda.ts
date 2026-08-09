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
  // `serverless-http` sets `callbackWaitsForEmptyEventLoop = false`, which
  // freezes the container the instant the response is written. That silently
  // killed the registration OTP: `RegistrationsService` dispatches mail
  // fire-and-forget ON PURPOSE — awaiting SES would make response latency an
  // oracle for whether an address was recently used, which FR-4 (requirements
  // .md:245) forbids as a hard `AND IT MUST` — so the in-flight SES call was
  // frozen mid-request and lost, with its own `.catch()` never running either.
  // Observed in production, not theorised: CloudWatch carried three
  // `mail send attempt` lines and ZERO `mail send outcome` lines, which is
  // exactly the attempt-without-outcome signature T-8's review named as the
  // detection channel for this failure.
  //
  // Restoring the default delays the FREEZE, not the RESPONSE: the `202` is
  // still written immediately and the caller sees identical latency, so the
  // timing property FR-4 protects is untouched. The cost is billed duration
  // until the event loop drains — a few hundred ms on requests that send mail.
  context.callbackWaitsForEmptyEventLoop = true;

  if (!cachedHandler) {
    cachedHandler = await bootstrapHandler();
  }
  return cachedHandler(event, context);
};
