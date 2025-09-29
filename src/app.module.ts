import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EthModule } from './eth/eth.module';
import { UniswapModule } from './uniswap/uniswap.module';
import { GasController } from './http/gas.controller';
import { QuoteController } from './http/quote.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EthModule,
    UniswapModule,
  ],
  controllers: [AppController, GasController, QuoteController],
  providers: [AppService],
})
export class AppModule {}
