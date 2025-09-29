import { Test, TestingModule } from '@nestjs/testing';
import { UniswapService } from './uniswap.service';
import { EthService } from '../eth/eth.service';

describe('UniswapService retry/timeout', () => {
  let moduleRef: TestingModule;
  let service: UniswapService;

  beforeEach(async () => {
    process.env.RPC_TIMEOUT_MS = '50';
    const ethMock: Partial<EthService> = {
      // Simulate EthService.withProviderFailover applying a timeout and erroring
      withProviderFailover: async () => { throw new Error('Timeout'); },
    } as any;

    moduleRef = await Test.createTestingModule({
      providers: [
        UniswapService,
        { provide: EthService, useValue: ethMock },
      ],
    }).compile();
    service = moduleRef.get(UniswapService);
  });

  afterEach(async () => {
    delete process.env.RPC_TIMEOUT_MS;
    jest.restoreAllMocks();
    await moduleRef?.close();
  });

  it('propagates timeout error from failover on getPair', async () => {
    await expect(service.quote('0xFrom', '0xTo', '100')).rejects.toThrow('Timeout');
  });
});


