import { Test, TestingModule } from '@nestjs/testing';
import { UniswapService } from './uniswap.service';
import { EthService } from '../eth/eth.service';

describe('UniswapService retry/timeout', () => {
  let moduleRef: TestingModule;
  let service: UniswapService;
  const factoryAddr = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';

  beforeEach(async () => {
    process.env.RPC_TIMEOUT_MS = '50';
    moduleRef = await Test.createTestingModule({
      providers: [
        UniswapService,
        { provide: EthService, useValue: { getProvider: () => ({ getBlockNumber: async () => 123 }) } },
      ],
    }).compile();
    service = moduleRef.get(UniswapService);
  });

  afterEach(async () => {
    delete process.env.RPC_TIMEOUT_MS;
    jest.restoreAllMocks();
    await moduleRef?.close();
  });

  it('times out on slow getPair', async () => {
    jest.spyOn<any, any>(service as any, 'createContract').mockImplementation((address: string) => {
      if (address === factoryAddr) {
        return { getPair: async () => { await new Promise(r => setTimeout(r, 200)); return '0xPAIR'; } } as any;
      }
      return {} as any;
    });
    await expect(service.quote('0xFrom', '0xTo', '100')).rejects.toThrow('Timeout');
  });
});


