import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { EthService } from './eth/eth.service';

@Controller()
export class AppController {
  constructor(private readonly eth: EthService) {}

  @Get('healthz')
  async healthz() {
    // basic provider check
    try {
      await this.eth.getProvider().getBlockNumber();
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
    }
  }
}
