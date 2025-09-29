import { Test, TestingModule } from '@nestjs/testing';
import { GasService } from './gas.service';
import { EthService } from './eth.service';

class MockProvider {
  public blockCb?: (bn: number) => void;

  async getFeeData() {
    return { maxPriorityFeePerGas: 1n, maxFeePerGas: 3n, gasPrice: 2n } as any;
  }

  async getBlock(tag: string) {
    if (tag !== 'latest') return null as any;
    return { baseFeePerGas: 1n, number: 100 } as any;
  }

  async getBlockNumber() {
    return 100;
  }

  on(event: string, cb: (bn: number) => void) {
    if (event === 'block') this.blockCb = cb;
  }

  off(event: string, _cb: (bn: number) => void) {
    if (event === 'block') this.blockCb = undefined;
  }

  removeAllListeners() {}
}

class MockEthService {
  constructor(private readonly provider: MockProvider) {}
  getProvider() { return this.provider as any; }
  async getFeeData() { return this.provider.getFeeData(); }
}

describe('GasService', () => {
  let moduleRef: TestingModule;
  let service: GasService;
  let provider: MockProvider;

  beforeEach(async () => {
    provider = new MockProvider();
    const mockEth = new MockEthService(provider);

    moduleRef = await Test.createTestingModule({
      providers: [
        GasService,
        { provide: EthService, useValue: mockEth },
      ],
    }).compile();

    service = moduleRef.get(GasService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it('initializes snapshot on module init', async () => {
    await service.onModuleInit();
    const snap = service.getSnapshot();
    expect(snap).toBeTruthy();
    expect(snap?.stale).toBe(false);
    expect(snap?.baseFeePerGas).toBe('1');
    expect(snap?.maxPriorityFeePerGas).toBe('1');
    expect(snap?.maxFeePerGas).toBe('3');
    expect(snap?.gasPrice).toBe('2');
  });

  it('updates snapshot on block event with passed block number', async () => {
    await service.onModuleInit();
    expect(provider.blockCb).toBeDefined();
    await (provider.blockCb as (bn: number) => Promise<void> | void)?.(42);
    // Allow any pending microtasks inside refresh to complete
    await Promise.resolve();
    const snap = service.getSnapshot();
    expect(snap?.blockNumber).toBe(42);
  });

  it('marks snapshot as stale after 60s', async () => {
    await service.onModuleInit();
    const snap = service.getSnapshot();
    expect(snap).toBeTruthy();
    const updatedAt = snap!.updatedAt;
    jest.spyOn(Date, 'now').mockReturnValue(updatedAt + 61_000);
    const later = service.getSnapshot();
    expect(later?.stale).toBe(true);
    (Date.now as jest.Mock).mockRestore?.();
  });
});


