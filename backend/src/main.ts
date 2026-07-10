import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/validation-pipe';
import { configureBodyParser } from './common/body-parser.config';

/**
 * Local entrypoint — `npm run start`. In Lambda the app is bootstrapped by
 * `lambda.ts` instead. The global prefix `api/v1`, the global ValidationPipe,
 * and the shared 8 MB JSON body limit are applied in both paths so the T-3
 * query/write DTOs are coerced + validated (malformed query → 400, NFR-4) and
 * the base64 import payload fits (admin/actor-import §4).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  configureBodyParser(app);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
