import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { register, collectDefaultMetrics, Histogram, Counter, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  readonly httpDuration: Histogram<string>;
  readonly httpRequestsTotal: Counter<string>;

  constructor() {
    // Avoid double registration across test modules
    try { collectDefaultMetrics(); } catch {}

    if (!register.getSingleMetric('http_server_duration_ms')) {
      this.httpDuration = new Histogram({
      name: 'http_server_duration_ms',
      help: 'HTTP request duration in milliseconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
      });
      register.registerMetric(this.httpDuration);
    } else {
      this.httpDuration = register.getSingleMetric('http_server_duration_ms') as Histogram<string>;
    }

    if (!register.getSingleMetric('http_requests_total')) {
      this.httpRequestsTotal = new Counter({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
      });
      register.registerMetric(this.httpRequestsTotal);
    } else {
      this.httpRequestsTotal = register.getSingleMetric('http_requests_total') as Counter<string>;
    }
  }

  getRegistry(): Registry {
    return register;
  }

  onModuleDestroy() {
    try { register.clear(); } catch {}
  }
}


