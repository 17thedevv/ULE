import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createCorsOriginValidator } from './common/utils/cors.util';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Set global API versioning prefix (e.g. /api/v1)
  app.setGlobalPrefix(apiPrefix);

  // Configure CORS with explicit trusted origins (wildcards prohibited)
  app.enableCors({
    origin: createCorsOriginValidator(corsOrigin),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // OpenAPI (Swagger) Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ULE API')
    .setDescription(
      'Universal Learning Engine (ULE) Authoritative REST API. Provides canonical endpoints for Web, mobile clients, and MCP tools.',
    )
    .setVersion('1.0.0')
    .addTag('Health', 'Health checks and readiness probes')
    .addTag('Auth', 'Authentication and session management')
    .addTag('Courses', 'Authoritative Course Core and draft management')
    .addTag('ABP Block Types', 'Activity block manifests, capabilities, and schemas')
    .addTag('ABP Draft Blocks', 'Draft block instances configuration and validation')
    .addTag('ABP Runtime', 'Activity Block Protocol execution context and host commands')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);

  logger.log(`🚀 ULE API is running on: http://localhost:${port}/${apiPrefix}`);
  logger.log(`📚 OpenAPI Documentation available at: http://localhost:${port}/docs`);
  logger.log(`🔒 Environment: ${nodeEnv}`);
  logger.log(`🌐 CORS Allowed Origins: ${corsOrigin}`);
}

void bootstrap();
