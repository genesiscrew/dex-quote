import { Test, TestingModule } from '@nestjs/testing';
import { UniswapService } from './uniswap.service';
import { EthService } from '../eth/eth.service';
import { GatewayTimeoutException, BadGatewayException } from '@nestjs/common';

describe('UniswapService RPC error mapping', () => {
  let moduleRef: TestingModule;
  let service: UniswapService;

  afterEach(async () => {
    await moduleRef?.close();
    jest.restoreAllMocks();
  });

  it('maps timeout errors to 504 GatewayTimeout', async () => {
    const ethMock: Partial<EthService> = {
      withProviderFailover: async () => { throw new Error('request timeout'); },
    } as any;
    moduleRef = await Test.createTestingModule({
      providers: [UniswapService, { provide: EthService, useValue: ethMock }],
    }).compile();
    service = moduleRef.get(UniswapService);
    await expect(service.quote('0xFrom', '0xTo', '100')).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('maps rate-limit errors to 502 BadGateway', async () => {
    const ethMock: Partial<EthService> = {
      withProviderFailover: async () => { throw new Error('429 rate limit exceeded'); },
    } as any;
    moduleRef = await Test.createTestingModule({
      providers: [UniswapService, { provide: EthService, useValue: ethMock }],
    }).compile();
    service = moduleRef.get(UniswapService);
    await expect(service.quote('0xFrom', '0xTo', '100')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps forbidden errors to 502 BadGateway', async () => {
    const ethMock: Partial<EthService> = {
      withProviderFailover: async () => { throw new Error('403 forbidden'); },
    } as any;
    moduleRef = await Test.createTestingModule({
      providers: [UniswapService, { provide: EthService, useValue: ethMock }],
    }).compile();
    service = moduleRef.get(UniswapService);
    await expect(service.quote('0xFrom', '0xTo', '100')).rejects.toBeInstanceOf(BadGatewayException);
  });
});


