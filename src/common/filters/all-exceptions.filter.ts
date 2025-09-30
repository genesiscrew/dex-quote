import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req: any = ctx.getRequest();
    const res: any = ctx.getResponse();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? (exception as HttpException).getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttp ? (exception as HttpException).getResponse() : { code: 'INTERNAL_ERROR', message: 'Internal server error' };

    const requestId = req?.id || req?.headers?.['x-request-id'] || undefined;
    const method = req?.method;
    const url = (req?.originalUrl || req?.url || '').split('?')[0];
    const errMsg = isHttp ? (typeof payload === 'string' ? payload : (payload as any)?.message) : (exception as any)?.message;

    try {
      const log = req?.log;
      if (log && typeof log[status >= 500 ? 'error' : 'warn'] === 'function') {
        const logFn = status >= 500 ? log.error.bind(log) : log.warn.bind(log);
        logFn({ requestId, method, url, status, err: exception }, 'request error');
      }
    } catch {}

    const body = typeof payload === 'object' ? { ...(payload as any), requestId } : { message: String(payload), requestId };
    res.status(status).json(body);
  }
}


