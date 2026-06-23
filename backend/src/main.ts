import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Local entrypoint — `npm run start`. In Lambda the app is bootstrapped by
 * `lambda.ts` instead. The global prefix `api/v1` and the global ValidationPipe
 * are applied in both paths so the T-3 query/write DTOs are coerced + validated
 * (malformed query → 400, NFR-4).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
