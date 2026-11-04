import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getAuthCallbackPath } from '../utils/sanitize-error';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const method = req.method;
    const originalUrl = req.originalUrl || req.url;
    const callbackPath = getAuthCallbackPath(originalUrl);
    const url = callbackPath ?? originalUrl;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `[${method}] ${url} -> ${res.statusCode} (${duration}ms)`,
          );
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const detail = callbackPath ? '' : `: ${err.message}`;
          this.logger.warn(
            `[${method}] ${url} -> ERROR ${err.status || 500} (${duration}ms)${detail}`,
          );
        },
      }),
    );
  }
}
