import { Module } from '@nestjs/common';
import { EthService } from './eth.service';
import { GasService } from './gas.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [EthService, GasService],
  exports: [EthService, GasService],
})
export class EthModule {}


