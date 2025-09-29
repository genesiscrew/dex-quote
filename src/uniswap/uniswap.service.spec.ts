import { Test, TestingModule } from '@nestjs/testing';
import { UniswapService } from './uniswap.service';
import { EthService } from '../eth/eth.service';
import { BadRequestException } from '@nestjs/common';

class MockFactory {
  constructor(private pairAddress: string) {}
  async getPair(_a: string, _b: string) { return this.pairAddress; }
}

class MockPair {
  constructor(private token0Addr: string, private reserves: [bigint, bigint, number]) {}
  async token0() { return this.token0Addr; }
  async getReserves() { return this.reserves as any; }
}

class MockProvider {
  constructor(private factory: any, private pair: any) {}
  getBlockNumber = async () => 123;
  // Simulate ethers.Contract(address, abi, provider)
  // We will intercept via a simple function on EthService
}

class MockEthService {
  constructor(private factory: any, private pair: any) {}
  getProvider() { return {} as any; }
}

// We will monkey-patch ethers.Contract usage by stubbing UniswapService dependencies through its methods

describe('UniswapService', () => {
  let moduleRef: TestingModule;
  let service: UniswapService;
  let factory: MockFactory;
  let pair: MockPair;

  beforeEach(async () => {
    // default: WETH token0, reserves (1000, 2000)
    factory = new MockFactory('0xPAIR');
    pair = new MockPair('0xFrom', [1000n, 2000n, 0]);

    moduleRef = await Test.createTestingModule({
      providers: [
        UniswapService,
        { provide: EthService, useValue: { getProvider: () => ({ getBlockNumber: async () => 123 }) } },
      ],
    }).compile();

    service = moduleRef.get(UniswapService);

    // Patch contract creation method on service
    jest.spyOn<any, any>(service as any, 'createContract').mockImplementation((address: string) => {
      if (address === '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f') return factory as any;
      if (address === '0xPAIR') return pair as any;
      return {} as any;
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await moduleRef?.close();
  });

  it('computes amountOut with correct token ordering', async () => {
    // fromToken equals token0
    const res1 = await service.quote('0xFrom', '0xTo', '100');
    // amountInWithFee = 100*997=99700; numerator=99700*reserveOut(2000)=199400000; denominator=reserveIn(1000)*1000+99700=1099700
    // floor(199400000/1099700)=181
    expect(res1.amountOut).toBe('181');

    // flip token0 so fromToken is token1 now
    pair = new MockPair('0xOther', [1000n, 2000n, 0]);
    const res2 = await service.quote('0xFrom', '0xTo', '100');
    // from is token1, so reserveIn=reserve1=2000, reserveOut=reserve0=1000
    // amountInWithFee=99700; numerator=99700*1000=99,700,000; denominator=2000*1000+99700=2,099,700 => 47
    expect(res2.amountOut).toBe('47');
  });

  it('returns pair not found error object when factory returns zero address', async () => {
    factory = new MockFactory('0x0000000000000000000000000000000000000000');
    (service as any).createContract.mockImplementation((address: string) => {
      if (address === '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f') return factory as any;
      return {} as any;
    });
    const res = await service.quote('0xFrom', '0xTo', '100');
    expect(res.error).toBe('pair not found');
    expect(res.amountOut).toBe('0');
  });

  it('throws on insufficient liquidity and input amount per on-chain semantics', async () => {
    await expect(service.quote('0xFrom', '0xTo', '0')).rejects.toThrow(BadRequestException);

    // zero reserves case
    pair = new MockPair('0xFrom', [0n, 0n, 0]);
    (service as any).createContract.mockImplementation((address: string) => {
      if (address === '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f') return factory as any;
      if (address === '0xPAIR') return pair as any;
      return {} as any;
    });
    await expect(service.quote('0xFrom', '0xTo', '100')).rejects.toThrow('INSUFFICIENT_LIQUIDITY');
  });
});


