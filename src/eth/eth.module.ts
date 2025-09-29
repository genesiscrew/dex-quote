import { Module } from '@nestjs/common';
import { EthService } from './eth.service';
import { GasService } from './gas.service';

@Module({
  providers: [EthService, GasService],
  exports: [EthService, GasService],
})
export class EthModule {}


