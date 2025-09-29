import { Test, TestingModule } from '@nestjs/testing';
import { GasService } from './gas.service';
import { EthService } from './eth.service';

describe('GasService initial refresh and fallback polling failover', () => {
  let moduleRef: TestingModule;
  let service: GasService;

  beforeEach(async () => {
    const failingProv: any = { getBlock: async () => { throw new Error('fail'); }, getBlockNumber: async () => { throw new Error('fail'); } };
    const okProv: any = { getBlock: async () => ({ baseFeePerGas: 1n, number: 777 }), getBlockNumber: async () => 777, on: () => {}, off: () => {} };
    const ethMock = {
      getProvider: () => okProv, // used for block listener registration
      getFeeData: async () => ({ maxPriorityFeePerGas: 1n, maxFeePerGas: 2n, gasPrice: 3n }),
      withProviderFailover: async (op: (p: any) => Promise<any>) => {
        try { return await op(failingProv); } catch { return await op(okProv); }
      },
    } as Partial<EthService> as EthService;

    moduleRef = await Test.createTestingModule({
      providers: [GasService, { provide: EthService, useValue: ethMock }],
    }).compile();
    service = moduleRef.get(GasService);
  });

  afterEach(async () => {
    await moduleRef?.close();
    delete process.env.GAS_REFRESH_INTERVAL_MS;
  });

  it('uses failover provider when primary getBlock fails (initial refresh)', async () => {
    await (service as any).refresh();
    const snap = service.getSnapshot();
    expect(snap?.blockNumber).toBe(777);
  });

  it('fallback poller refreshes when block listener stalls', async () => {
    process.env.GAS_REFRESH_INTERVAL_MS = '10';
    await service.onModuleInit();
    // Simulate time for poller to run at least once
    await new Promise(r => setTimeout(r, 25));
    const snap = service.getSnapshot();
    expect(snap?.blockNumber).toBe(777);
    await service.onModuleDestroy();
  });
});


