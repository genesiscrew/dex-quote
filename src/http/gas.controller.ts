import { Controller, Get } from '@nestjs/common';
import { GasService } from '../eth/gas.service';

@Controller('gasPrice')
export class GasController {
  constructor(private readonly gas: GasService) {}

  @Get()
  async getGasPrice() {
    const snap = this.gas.getSnapshot();
    if (!snap) {
      return { error: 'NO_DATA', stale: true };
    }
    return snap;
  }
}


