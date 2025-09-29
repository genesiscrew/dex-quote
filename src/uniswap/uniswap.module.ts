import { Module } from '@nestjs/common';
import { UniswapService } from './uniswap.service';
import { EthModule } from '../eth/eth.module';

@Module({
  imports: [EthModule],
  providers: [UniswapService],
  exports: [UniswapService],
})
export class UniswapModule {}


