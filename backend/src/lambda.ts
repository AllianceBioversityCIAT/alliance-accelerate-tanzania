import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import serverlessExpress from 'serverless-http';
import type { Handler } from 'aws-lambda';
import { AppModule } from './app.module';

/**
 * Serverless entrypoint — one Lambda wrapping the whole NestJS app behind
 * API Gateway (detailed-design §1). The bootstrapped handler is cached in the
 * module scope so warm invocations skip the Nest bootstrap (cold-start friendly,
 * NFR-3).
 */
let cachedHandler: ReturnType<typeof serverlessExpress> | undefined;

async function bootstrapHandler(): Promise<ReturnType<typeof serverlessExpress>> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );
  await app.init();
  return serverlessExpress(expressApp);
}

export const handler: Handler = async (event, context) => {
  if (!cachedHandler) {
    cachedHandler = await bootstrapHandler();
  }
  return cachedHandler(event, context);
};
