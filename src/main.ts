import './observability/otel';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';
import { stopTracing } from './observability/tracing';

async function bootstrap(): Promise<void> {
  const shutdownTracing = (): void => {
    void stopTracing();
  };
  process.once('SIGTERM', shutdownTracing);
  process.once('SIGINT', shutdownTracing);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: origins === '*' ? true : origins.split(',').map((value) => value.trim()),
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Resource Access API')
    .setDescription(
      'User-scoped resource listing with filtering, keyset pagination, and access control.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-user-id', in: 'header' }, 'x-user-id')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document));

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
