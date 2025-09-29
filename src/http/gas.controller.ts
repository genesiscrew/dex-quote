import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GasService } from '../eth/gas.service';

@Controller('gasPrice')
export class GasController {
  constructor(private readonly gas: GasService) {}

  @Get()
  async getGasPrice(@Res({ passthrough: true }) res: Response) {
    const snap = this.gas.getSnapshot();
    if (!snap) {
      return { error: 'NO_DATA', stale: true };
    }
    const ageMs = Math.max(Date.now() - snap.updatedAt, 0);
    res.setHeader('Age', String(Math.floor(ageMs / 1000)));
    res.setHeader('X-Cache', snap.stale ? 'STALE' : 'HIT');
    res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=1');
    return snap;
  }
}


