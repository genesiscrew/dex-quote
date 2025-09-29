import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GasService } from './eth/gas.service';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { HttpMetricsInterceptor } from './metrics/http-metrics.interceptor';
import { MetricsService } from './metrics/metrics.service';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimitService } from './rate-limit/rate-limit.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Register response-time header interceptor early
  app.useGlobalInterceptors(new ResponseTimeInterceptor());
  // Register rate limit guard early using explicit instance
  const rlService = app.get(RateLimitService);
  app.useGlobalGuards(new RateLimitGuard(rlService));
  // Express middleware to record metrics on response finish (register early)
  const metricsServiceInstance = app.get(MetricsService);
  app.use((req: any, res: any, next: any) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const ns = Number(process.hrtime.bigint() - start);
        const ms = ns / 1e6;
        const routePath = (req as any).route?.path
          || (req as any).routerPath
          || (req as any).originalUrl?.split('?')[0]
          || (req as any).url?.split('?')[0]
          || 'unknown';
        const method = String((req as any).method || 'GET').toUpperCase();
        const status = String((res as any).statusCode || 0);
        metricsServiceInstance.httpDuration.labels(method, String(routePath), status).observe(ms);
        metricsServiceInstance.httpRequestsTotal.labels(method, String(routePath), status).inc();
        if (process.env.METRICS_DEBUG === '1' || process.env.METRICS_DEBUG === 'true') {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify({ type: 'metrics', action: 'record', method, route: String(routePath), status, ms: +ms.toFixed(3) }));
        }
      } catch {
        /* noop */
      }
    });
    next();
  });
  await app.init();
  const metricsService = app.get(MetricsService);
  app.useGlobalInterceptors(new HttpMetricsInterceptor(metricsService));
  app.useGlobalGuards(app.get(RateLimitGuard));

  // Express middleware to ensure metrics are recorded when response finishes
  app.use((req: any, res: any, next: any) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const ns = Number(process.hrtime.bigint() - start);
        const ms = ns / 1e6;
        const routePath = (req as any).route?.path
          || (req as any).routerPath
          || (req as any).originalUrl?.split('?')[0]
          || (req as any).url?.split('?')[0]
          || 'unknown';
        const method = String((req as any).method || 'GET').toUpperCase();
        const status = String((res as any).statusCode || 0);
        metricsService.httpDuration.labels(method, String(routePath), status).observe(ms);
        metricsService.httpRequestsTotal.labels(method, String(routePath), status).inc();
      } catch {
        /* noop */
      }
    });
    next();
  });

  // Ensure initial gas snapshot is ready before serving traffic
  const gas = app.get(GasService);
  const timeoutMs = parseInt(process.env.GAS_READY_TIMEOUT_MS ?? '10000', 10);
  const start = Date.now();
  while (!gas.getSnapshot() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
