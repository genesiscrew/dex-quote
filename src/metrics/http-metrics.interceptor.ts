import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = process.hrtime.bigint();
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        const ns = Number(process.hrtime.bigint() - start);
        const ms = ns / 1e6;
        const routePath = req.route?.path
          || req?.routerPath
          || req?.originalUrl?.split('?')[0]
          || req?.url?.split('?')[0]
          || 'unknown';
        const method = (req.method || 'GET').toUpperCase();
        const status = String(res.statusCode || 0);
        this.metrics.httpDuration.labels(method, routePath, status).observe(ms);
        this.metrics.httpRequestsTotal.labels(method, routePath, status).inc();
        if (process.env.METRICS_DEBUG === '1' || process.env.METRICS_DEBUG === 'true') {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify({ type: 'metrics', action: 'record', method, route: routePath, status, ms: +ms.toFixed(3) }));
        }
      }),
    );
  }
}


