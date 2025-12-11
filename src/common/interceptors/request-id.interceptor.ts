import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const REQUEST_ID_HEADER = 'X-Request-Id';

interface RequestWithId extends Request {
  requestId?: string;
}

interface ResponseWithMeta {
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Interceptor to handle X-Request-Id header
 * - X-Request-Id is REQUIRED per n8n contract
 * - Returns 400 BAD_REQUEST if header is missing
 * - Adds X-Request-Id to response headers
 * - Wraps response in standard format with meta.requestId
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<RequestWithId>();
    const response = ctx.getResponse<Response>();
    const startTime = Date.now();

    // X-Request-Id is REQUIRED
    const requestId =
      (request.headers[REQUEST_ID_HEADER.toLowerCase()] as string) ||
      (request.headers['x-request-id'] as string);

    if (!requestId) {
      throw new HttpException(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Missing required header: X-Request-Id',
          },
          meta: {
            requestId: 'unknown',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Store in request for later use
    request.requestId = requestId;

    // Set response header
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return next.handle().pipe(
      map((data: unknown) => {
        const processingTimeMs = Date.now() - startTime;

        // If response already has meta, just ensure requestId is there
        if (data && typeof data === 'object' && 'meta' in data) {
          const dataWithMeta = data as ResponseWithMeta;
          return {
            ...dataWithMeta,
            meta: {
              ...dataWithMeta.meta,
              requestId,
              processingTimeMs,
            },
          };
        }

        // Wrap in standard format
        return {
          data,
          meta: {
            requestId,
            processingTimeMs,
          },
        };
      }),
    );
  }
}
