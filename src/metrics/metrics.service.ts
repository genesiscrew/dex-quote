import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { register, collectDefaultMetrics, Histogram, Counter, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  readonly httpDuration: Histogram<string>;
  readonly httpRequestsTotal: Counter<string>;
  readonly rpcRequestDurationMs: Histogram<string>;
  readonly rpcRequestsTotal: Counter<string>;
  readonly rpcFailoverTotal: Counter<string>;
  readonly rpcCooldownsTotal: Counter<string>;
  readonly rpcHealthProbeTotal: Counter<string>;

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

    if (!register.getSingleMetric('rpc_request_duration_ms')) {
      this.rpcRequestDurationMs = new Histogram({
        name: 'rpc_request_duration_ms',
        help: 'RPC request duration in milliseconds',
        labelNames: ['provider', 'label', 'outcome'],
        buckets: [10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
      });
      register.registerMetric(this.rpcRequestDurationMs);
    } else {
      this.rpcRequestDurationMs = register.getSingleMetric('rpc_request_duration_ms') as Histogram<string>;
    }

    if (!register.getSingleMetric('rpc_requests_total')) {
      this.rpcRequestsTotal = new Counter({
        name: 'rpc_requests_total',
        help: 'Total RPC requests by outcome',
        labelNames: ['provider', 'label', 'outcome'],
      });
      register.registerMetric(this.rpcRequestsTotal);
    } else {
      this.rpcRequestsTotal = register.getSingleMetric('rpc_requests_total') as Counter<string>;
    }

    if (!register.getSingleMetric('rpc_failover_total')) {
      this.rpcFailoverTotal = new Counter({
        name: 'rpc_failover_total',
        help: 'Count of operations that required failover to a non-primary provider',
        labelNames: ['label'],
      });
      register.registerMetric(this.rpcFailoverTotal);
    } else {
      this.rpcFailoverTotal = register.getSingleMetric('rpc_failover_total') as Counter<string>;
    }

    if (!register.getSingleMetric('rpc_cooldowns_total')) {
      this.rpcCooldownsTotal = new Counter({
        name: 'rpc_cooldowns_total',
        help: 'Count of times a provider was put into cooldown',
        labelNames: ['provider'],
      });
      register.registerMetric(this.rpcCooldownsTotal);
    } else {
      this.rpcCooldownsTotal = register.getSingleMetric('rpc_cooldowns_total') as Counter<string>;
    }

    if (!register.getSingleMetric('rpc_health_probe_total')) {
      this.rpcHealthProbeTotal = new Counter({
        name: 'rpc_health_probe_total',
        help: 'Count of RPC health probe results by outcome',
        labelNames: ['provider', 'outcome'],
      });
      register.registerMetric(this.rpcHealthProbeTotal);
    } else {
      this.rpcHealthProbeTotal = register.getSingleMetric('rpc_health_probe_total') as Counter<string>;
    }
  }

  getRegistry(): Registry {
    return register;
  }

  onModuleDestroy() {
    try { register.clear(); } catch {}
  }
}


