import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GasService } from './eth/gas.service';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { MetricsService } from './metrics/metrics.service';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // remove X-Powered-By header
  try { (app.getHttpAdapter().getInstance() as any).disable?.('x-powered-by'); } catch {}
  app.useGlobalInterceptors(new ResponseTimeInterceptor());
  const rlService = app.get(RateLimitService);
  app.useGlobalGuards(new RateLimitGuard(rlService));
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
  // Swagger/OpenAPI at /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DEX Quote API')
    .setDescription('Gas price snapshot and Uniswap V2 quoting (off-chain math)')
    .setVersion('1.0.0')
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc);
  await app.init();

  const gas = app.get(GasService);
  const timeoutMs = parseInt(process.env.GAS_READY_TIMEOUT_MS ?? '10000', 10);
  const start = Date.now();
  while (!gas.getSnapshot() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
