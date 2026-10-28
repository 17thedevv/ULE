import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '@ule/contracts';
import { sanitizeLogMessage } from '../utils/sanitize-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        // Prevent 5xx HttpException from leaking raw internal details
        this.logger.error(
          `Server Error (${status}) on ${request.method} ${request.url}: ${sanitizeLogMessage(exception.message)}`,
          exception.stack ? sanitizeLogMessage(exception.stack) : undefined,
        );
        message = 'Internal server error';
        error = 'Internal Server Error';
      } else {
        // Client-safe errors (4xx) preserve validation and operational messages
        if (typeof res === 'string') {
          message = res;
        } else if (typeof res === 'object' && res !== null) {
          const resObj = res as Record<string, unknown>;
          message = (resObj.message as string | string[]) || exception.message;
          error = (resObj.error as string) || exception.name;
        }
      }
    } else if (exception instanceof Error) {
      // Unhandled internal errors (Prisma exceptions, TypeErrors, etc.) must NEVER leak to client
      this.logger.error(
        `Unhandled Exception on ${request.method} ${request.url}: ${sanitizeLogMessage(exception.message)}`,
        exception.stack ? sanitizeLogMessage(exception.stack) : undefined,
      );
      message = 'Internal server error';
      error = 'Internal Server Error';
    } else {
      this.logger.error(
        `Non-Error exception thrown on ${request.method} ${request.url}: ${String(exception)}`,
      );
      message = 'Internal server error';
      error = 'Internal Server Error';
    }

    const errorPayload: ApiErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorPayload);
  }
}
