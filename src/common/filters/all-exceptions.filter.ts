import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import type { ProblemDetails } from '../http/problem-details';

const SERVER_ERROR_MIN = 500;

/**
 * Maps every error to an RFC 7807 application/problem+json response. Internal
 * failures never leak a stack trace or message: 5xx responses carry a generic
 * detail while the real error is logged with the request id for correlation.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = readRequestId(request);

    const { status, title, detail, errors } = this.describe(exception);

    if (status >= SERVER_ERROR_MIN) {
      this.logger.error({ err: exception, path: request.url }, 'Unhandled request error');
    } else {
      this.logger.warn({ path: request.url, status }, title);
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title,
      status,
      detail,
      instance: request.url,
      ...(requestId !== undefined ? { requestId } : {}),
      ...(errors ? { errors } : {}),
    };

    response.status(status).type('application/problem+json').json(problem);
  }

  private describe(exception: unknown): {
    status: number;
    title: string;
    detail: string;
    errors?: readonly { path: string; message: string }[];
  } {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      const issues =
        zodError instanceof ZodError
          ? zodError.issues.map((issue) => ({
              path: issue.path.map((segment) => String(segment)).join('.'),
              message: issue.message,
            }))
          : [];
      return {
        status: HttpStatus.BAD_REQUEST,
        title: 'Validation failed',
        detail: 'One or more request parameters are invalid.',
        errors: issues,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, title: statusTitle(status), detail: extractDetail(exception) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred.',
    };
  }
}

function statusTitle(status: number): string {
  const titles: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'Bad Request',
    [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
    [HttpStatus.FORBIDDEN]: 'Forbidden',
    [HttpStatus.NOT_FOUND]: 'Not Found',
    [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  };
  return titles[status] ?? 'Error';
}

function readRequestId(req: Request): string | undefined {
  const id: unknown = (req as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function extractDetail(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.join(', ');
  }
  return exception.message;
}
