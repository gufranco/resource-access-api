import { EventEmitter } from 'node:events';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MetricsInterceptor } from './metrics.interceptor';
import type { MetricsService } from './metrics.service';

function nextHandler(): CallHandler {
  return { handle: () => of('ok') };
}

describe('MetricsInterceptor', () => {
  it('records a sample when the HTTP response finishes', () => {
    // Arrange
    const observe = vi.fn();
    const metrics = { observe } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metrics);
    const res = Object.assign(new EventEmitter(), { statusCode: 201 });
    const req = { method: 'POST', path: '/resources', route: { path: '/resources' } };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;

    // Act
    interceptor.intercept(context, nextHandler());
    res.emit('finish');

    // Assert
    expect(observe).toHaveBeenCalledWith('POST', '/resources', 201, expect.any(Number));
  });

  it('falls back to the request path when no route is matched', () => {
    // Arrange
    const observe = vi.fn();
    const metrics = { observe } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metrics);
    const res = Object.assign(new EventEmitter(), { statusCode: 404 });
    const req = { method: 'GET', path: '/unmatched' };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;

    // Act
    interceptor.intercept(context, nextHandler());
    res.emit('finish');

    // Assert
    expect(observe).toHaveBeenCalledWith('GET', '/unmatched', 404, expect.any(Number));
  });

  it('skips non-HTTP contexts', () => {
    // Arrange
    const observe = vi.fn();
    const metrics = { observe } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metrics);
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;

    // Act
    interceptor.intercept(context, nextHandler());

    // Assert
    expect(observe).not.toHaveBeenCalled();
  });
});
