import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ProblemDetails } from '../http/problem-details';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(id?: string): {
  host: ArgumentsHost;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const type = vi.fn(() => ({ json }));
  const status = vi.fn(() => ({ type }));
  const response = { status };
  const request = id === undefined ? { url: '/resources' } : { url: '/resources', id };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  it('maps an HttpException to a problem document', () => {
    // Arrange
    const filter = new AllExceptionsFilter();
    const { host, json, status } = makeHost();

    // Act
    filter.catch(new ForbiddenException('nope'), host);

    // Assert
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProblemDetails>>({ status: 403, title: 'Forbidden' }),
    );
  });

  it('hides internal details for an unknown error', () => {
    // Arrange
    const filter = new AllExceptionsFilter();
    const { host, json, status } = makeHost();

    // Act
    filter.catch(new Error('secret stack detail'), host);

    // Assert
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProblemDetails>>({
        status: 500,
        detail: 'An unexpected error occurred.',
      }),
    );
  });

  it('reports validation issues for a Zod exception', () => {
    // Arrange
    const filter = new AllExceptionsFilter();
    const { host, json, status } = makeHost();
    const parsed = z.object({ type: z.string() }).safeParse({ type: 1 });
    const error = parsed.success ? new Error('unexpected') : parsed.error;

    // Act
    filter.catch(new ZodValidationException(error), host);

    // Assert
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProblemDetails>>({ status: 400, title: 'Validation failed' }),
    );
  });

  it('joins an array message into the detail', () => {
    // Arrange
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    // Act
    filter.catch(new BadRequestException(['bad a', 'bad b']), host);

    // Assert
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProblemDetails>>({ status: 400, detail: 'bad a, bad b' }),
    );
  });

  it('falls back to a generic title for an unmapped status', () => {
    // Arrange
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    // Act
    filter.catch(new HttpException({ message: 42 }, 418), host);

    // Assert
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProblemDetails>>({ status: 418, title: 'Error' }),
    );
  });

  it('uses a string response body as the detail', () => {
    // Arrange
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost();

    // Act
    filter.catch(new HttpException('plain message', 400), host);

    // Assert
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProblemDetails>>({ status: 400, detail: 'plain message' }),
    );
  });

  it('includes the request id when present', () => {
    // Arrange
    const filter = new AllExceptionsFilter();
    const { host, json } = makeHost('req-123');

    // Act
    filter.catch(new ForbiddenException('nope'), host);

    // Assert
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProblemDetails>>({ requestId: 'req-123' }),
    );
  });
});
