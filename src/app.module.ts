import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EthModule } from './eth/eth.module';
import { UniswapModule } from './uniswap/uniswap.module';
import { GasController } from './http/gas.controller';
import { QuoteController } from './http/quote.controller';
import { MetricsModule } from './metrics/metrics.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EthModule,
    UniswapModule,
    MetricsModule,
    RateLimitModule,
  ],
  controllers: [AppController, GasController, QuoteController],
  providers: [AppService],
})
export class AppModule {}
