import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Local entrypoint — `npm run start`. In Lambda the app is bootstrapped by
 * `lambda.ts` instead. The global prefix `api/v1` is applied in both paths.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
