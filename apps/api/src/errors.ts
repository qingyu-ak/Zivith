import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '@zivith/domain';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            rule: issue.code,
            severity: 'error',
            message: issue.message,
          })),
        },
      });
    }
    if (error instanceof ApiError) {
      return reply.status(error.status).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    if (error instanceof DomainError) {
      return reply.status(409).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    const statusCode = getStatusCode(error);
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: {
          code: 'HTTP_CLIENT_ERROR',
          message: clientErrorMessage(statusCode),
        },
      });
    }
    requestLog(app, error);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: '请求的资源不存在' } }),
  );
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

function clientErrorMessage(statusCode: number): string {
  if (statusCode === 413) return '请求内容过大';
  if (statusCode === 415) return '不支持的内容类型';
  if (statusCode === 429) return '请求过于频繁，请稍后重试';
  return '请求格式不正确';
}

function requestLog(app: FastifyInstance, error: unknown): void {
  app.log.error({ err: error }, 'Unhandled API error');
}
