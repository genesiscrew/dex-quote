import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { EthModule } from './eth/eth.module';
import { UniswapModule } from './uniswap/uniswap.module';
import { GasController } from './http/gas.controller';
import { QuoteController } from './http/quote.controller';
import { MetricsModule } from './metrics/metrics.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { LoggerModule } from 'nestjs-pino';
import crypto from 'node:crypto';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req: any, res: any) => {
          const existing = req.headers?.['x-request-id'] || req.headers?.['X-Request-Id'];
          const id = (typeof existing === 'string' && existing) ? existing : crypto.randomUUID();
          try { res.setHeader('X-Request-Id', id); } catch {}
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: {
          ignore: (req: any) => {
            const path = (req.originalUrl || req.url || '').split('?')[0];
            return path === '/metrics';
          },
        },
      },
    }),
    EthModule,
    UniswapModule,
    MetricsModule,
    RateLimitModule,
  ],
  controllers: [AppController, GasController, QuoteController],
  providers: [],
})
export class AppModule {}
