import { Test, TestingModule } from '@nestjs/testing';
import { EthService } from './eth.service';
import { MetricsService } from '../metrics/metrics.service';

describe('EthService RPC metrics', () => {
  let moduleRef: TestingModule;
  let service: EthService;
  let metrics: MetricsService;

  beforeEach(async () => {
    process.env.RPC_URL = 'http://primary';
    delete process.env.RPC_URLS;
    process.env.RPC_TIMEOUT_MS = '50';
    process.env.RPC_COOLDOWN_MS = '200';
    moduleRef = await Test.createTestingModule({ providers: [EthService, MetricsService] }).compile();
    service = moduleRef.get(EthService);
    metrics = moduleRef.get(MetricsService);
  });

  afterEach(async () => {
    delete process.env.RPC_URL;
    delete process.env.RPC_TIMEOUT_MS;
    delete process.env.RPC_COOLDOWN_MS;
    // Ensure provider has removeAllListeners to satisfy onModuleDestroy
    const prov = (service as any).provider;
    if (prov && typeof prov.removeAllListeners !== 'function') {
      (service as any).provider.removeAllListeners = () => {};
    }
    await moduleRef?.close();
    jest.restoreAllMocks();
  });

  it('emits ok metrics on successful RPC call', async () => {
    const p1: any = { getBlockNumber: jest.fn(async () => 123), connection: { url: 'p1' } };
    (service as any).providers = [p1];
    (service as any).provider = p1;
    (service as any).providerState = new Map<any, any>([[p1, { cooldownUntil: 0 }]]);

    const reqLabelsInc = jest.fn();
    const durLabelsObs = jest.fn();
    jest.spyOn(metrics.rpcRequestsTotal as any, 'labels').mockReturnValue({ inc: reqLabelsInc });
    jest.spyOn(metrics.rpcRequestDurationMs as any, 'labels').mockReturnValue({ observe: durLabelsObs });

    const res = await service.withProviderFailover(p => p.getBlockNumber());
    expect(res).toBe(123);
    expect(reqLabelsInc).toHaveBeenCalled();
    expect(durLabelsObs).toHaveBeenCalled();
  });

  it('emits error + cooldown + failover metrics when first fails then second succeeds', async () => {
    const p1: any = { getBlockNumber: jest.fn(async () => { throw new Error('fail'); }), connection: { url: 'p1' } };
    const p2: any = { getBlockNumber: jest.fn(async () => 456), connection: { url: 'p2' } };
    (service as any).providers = [p1, p2];
    (service as any).provider = p1;
    (service as any).providerState = new Map<any, any>([[p1, { cooldownUntil: 0 }], [p2, { cooldownUntil: 0 }]]);

    const reqLabelsMock = jest.fn().mockReturnValue({ inc: jest.fn() });
    const cooldownLabelsMock = jest.fn().mockReturnValue({ inc: jest.fn() });
    const failoverLabelsMock = jest.fn().mockReturnValue({ inc: jest.fn() });
    const durLabelsObs = jest.fn();

    jest.spyOn(metrics.rpcRequestsTotal as any, 'labels').mockImplementation(reqLabelsMock);
    jest.spyOn(metrics.rpcCooldownsTotal as any, 'labels').mockImplementation(cooldownLabelsMock);
    jest.spyOn(metrics.rpcFailoverTotal as any, 'labels').mockImplementation(failoverLabelsMock);
    jest.spyOn(metrics.rpcRequestDurationMs as any, 'labels').mockReturnValue({ observe: durLabelsObs });

    const res = await service.withProviderFailover(p => p.getBlockNumber());
    expect(res).toBe(456);
    // Expect that labels() was called for error on p1 and ok on p2
    expect(reqLabelsMock).toHaveBeenCalled();
    expect(cooldownLabelsMock).toHaveBeenCalled();
    expect(failoverLabelsMock).toHaveBeenCalled();
    expect(durLabelsObs).toHaveBeenCalled();
  });
});


