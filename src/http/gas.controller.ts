import { Controller, Get, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { GasService } from '../eth/gas.service';

/**
 * Returns a cached gas snapshot. No RPC on the request path.
 */
@Controller('gasPrice')
export class GasController {
  constructor(private readonly gas: GasService) {}

  /**
   * GET /gasPrice
   * Adds Age/X-Cache headers and returns the latest snapshot.
   */
  @Get()
  async getGasPrice(@Res({ passthrough: true }) res: Response) {
    const snap = this.gas.getSnapshot();
    if (!snap) {
      throw new ServiceUnavailableException({ code: 'NO_DATA', message: 'Gas snapshot not ready' });
    }
    const ageMs = Math.max(Date.now() - snap.updatedAt, 0);
    res.setHeader('Age', String(Math.floor(ageMs / 1000)));
    res.setHeader('X-Cache', snap.stale ? 'STALE' : 'HIT');
    res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=1');
    return snap;
  }
}


