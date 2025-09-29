import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const start = process.hrtime.bigint();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        const ns = Number(process.hrtime.bigint() - start);
        const ms = ns / 1e6;
        res.setHeader('X-Response-Time', `${ms.toFixed(2)}ms`);
        // Simple structured log
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ method: req.method, path: req.url, status: res.statusCode, ms: +ms.toFixed(2) }));
      }),
    );
  }
}


