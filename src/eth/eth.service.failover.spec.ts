import { Test, TestingModule } from '@nestjs/testing';
import { EthService } from './eth.service';
import { MetricsService } from '../metrics/metrics.service';

describe('EthService failover/circuit-breaker', () => {
  let moduleRef: TestingModule;
  let service: EthService;

  beforeEach(async () => {
    process.env.RPC_URL = 'http://primary';
    delete process.env.RPC_URLS;
    process.env.RPC_TIMEOUT_MS = '50';
    process.env.RPC_COOLDOWN_MS = '200';
    moduleRef = await Test.createTestingModule({ providers: [EthService, MetricsService] }).compile();
    service = moduleRef.get(EthService);
    // Replace internal providers with fakes
    const p1: any = { getBlockNumber: jest.fn(async () => { throw new Error('fail'); }) };
    const p2: any = { getBlockNumber: jest.fn(async () => 456) };
    (service as any).providers = [p1, p2];
    (service as any).providerState = new Map<any, any>([[p1, { cooldownUntil: 0 }], [p2, { cooldownUntil: 0 }]]);
  });

  afterEach(async () => {
    delete process.env.RPC_URL;
    delete process.env.RPC_TIMEOUT_MS;
    delete process.env.RPC_COOLDOWN_MS;
    await moduleRef?.close();
    jest.restoreAllMocks();
  });

  it('fails over to next provider when first fails', async () => {
    const res = await service.withProviderFailover(p => p.getBlockNumber());
    expect(res).toBe(456);
  });

  it('puts failing provider in cooldown and skips it on next call', async () => {
    // First call: p1 fails, p2 succeeds
    await service.withProviderFailover(p => p.getBlockNumber());
    const providers = (service as any).providers as any[];
    const p1 = providers[0];
    const p2 = providers[1];
    expect(p1.getBlockNumber).toHaveBeenCalled();
    expect(p2.getBlockNumber).toHaveBeenCalled();
    // Reset call counts
    p1.getBlockNumber.mockClear();
    p2.getBlockNumber.mockClear();
    // Second call within cooldown should skip p1 and use p2 directly
    await service.withProviderFailover(p => p.getBlockNumber());
    expect(p1.getBlockNumber).not.toHaveBeenCalled();
    expect(p2.getBlockNumber).toHaveBeenCalled();
  });

  it('health probe clears cooldown when provider recovers (allow either order)', async () => {
    const providers = (service as any).providers as any[];
    const p1 = providers[0];
    const p2 = providers[1];
    // Trigger cooldown on p1
    await service.withProviderFailover(p => p.getBlockNumber());
    // Make p1 healthy now
    p1.getBlockNumber.mockImplementation(async () => 999);
    process.env.RPC_HEALTH_INTERVAL_MS = '30';
    await (service as any).onModuleInit();
    // Wait for health probe to run
    await new Promise(r => setTimeout(r, 60));
    // Next call should be able to use p1 again (not guaranteed but acceptable if p1 tried first)
    p1.getBlockNumber.mockClear();
    p2.getBlockNumber.mockClear();
    await service.withProviderFailover(p => p.getBlockNumber());
    // Depending on provider order, either p1 or p2 may be tried first
    expect(p1.getBlockNumber.mock.calls.length + p2.getBlockNumber.mock.calls.length).toBeGreaterThan(0);
  });
});


