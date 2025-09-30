import { Test, TestingModule } from '@nestjs/testing';
import { EthService } from './eth.service';
import { ethers } from 'ethers';
import { MetricsService } from '../metrics/metrics.service';

describe('EthService getFeeData (timeout/retry)', () => {
  let moduleRef: TestingModule;
  let service: EthService;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.RPC_TIMEOUT_MS;
    process.env.RPC_TIMEOUT_MS = '50';
    moduleRef = await Test.createTestingModule({ providers: [EthService, MetricsService] }).compile();
    service = moduleRef.get(EthService);
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.RPC_TIMEOUT_MS; else process.env.RPC_TIMEOUT_MS = originalEnv;
    await moduleRef?.close();
  });

  it('returns fee data on fast provider', async () => {
    // Patch provider method to return quickly
    jest.spyOn((service as any).provider, 'getFeeData').mockResolvedValue({ maxPriorityFeePerGas: 1n, maxFeePerGas: 2n, gasPrice: 3n } as any);
    const fd = await service.getFeeData();
    expect(fd.gasPrice).toBe(3n);
  });

  it('throws on timeout', async () => {
    jest.spyOn((service as any).provider, 'getFeeData').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { gasPrice: 1n } as any;
    });
    await expect(service.getFeeData()).rejects.toThrow('Timeout');
  });
});


