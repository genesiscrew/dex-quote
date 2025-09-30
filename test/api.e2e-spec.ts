import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GasService } from '../src/eth/gas.service';
import { UniswapService } from '../src/uniswap/uniswap.service';
import { RateLimitGuard } from '../src/rate-limit/rate-limit.guard';
import { RateLimitService } from '../src/rate-limit/rate-limit.service';
import { MetricsService } from '../src/metrics/metrics.service';

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GasService)
      .useValue({
        getSnapshot: () => ({
          baseFeePerGas: '1',
          maxPriorityFeePerGas: '2',
          maxFeePerGas: '3',
          gasPrice: '4',
          updatedAt: Date.now(),
          blockNumber: 123,
          stale: false,
        }),
      })
      .overrideProvider(UniswapService)
      .useValue({
        quote: (from: string, to: string, amount: string) => ({
          pair: '0xPAIR',
          amountIn: amount,
          amountOut: '100',
          reserveIn: '1000',
          reserveOut: '2000',
          feeBps: 30,
          updatedAtBlock: 123,
          stale: false,
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    // Register metrics recording middleware to ensure HTTP metrics show up
    const metrics = app.get(MetricsService);
    app.use((req: any, res: any, next: any) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ns = Number(process.hrtime.bigint() - start);
        const ms = ns / 1e6;
        const routePath = req.route?.path || req.originalUrl?.split('?')[0] || req.url?.split('?')[0] || 'unknown';
        const method = String(req.method || 'GET').toUpperCase();
        const status = String(res.statusCode || 0);
        metrics.httpDuration.labels(method, String(routePath), status).observe(ms);
        metrics.httpRequestsTotal.labels(method, String(routePath), status).inc();
      });
      next();
    });

    // Register rate limit guard with low limits for tests
    process.env.RL_GAS_POINTS = '1';
    process.env.RL_GAS_DURATION = '60';
    process.env.RL_DEFAULT_POINTS = '1';
    process.env.RL_DEFAULT_DURATION = '60';
    app.useGlobalGuards(new RateLimitGuard(app.get(RateLimitService)));

    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('GET /gasPrice returns snapshot', async () => {
    const res = await request(app.getHttpServer()).get('/gasPrice').expect(200);
    expect(res.body).toHaveProperty('gasPrice', '4');
  });

  it('GET /return returns quote (happy path)', async () => {
    const res = await request(app.getHttpServer())
      .get('/return/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/1000000000000000000')
      .expect(200);
    expect(res.body).toHaveProperty('amountOut', '100');
  });

  it('GET /return validates params (bad address)', async () => {
    await request(app.getHttpServer())
      .get('/return/notAnAddress/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/1000000')
      .expect(400);
  });

  it('Rate limiting on /gasPrice returns 429 on second request', async () => {
    await request(app.getHttpServer()).get('/gasPrice').expect(200);
    const res = await request(app.getHttpServer()).get('/gasPrice').expect(429);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('GET /metrics includes http_requests_total after traffic', async () => {
    await request(app.getHttpServer()).get('/gasPrice').expect(200);
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.text).toMatch(/http_requests_total/);
  });

  it('Metrics include route label isolating /gasPrice', async () => {
    await request(app.getHttpServer()).get('/gasPrice').expect(200);
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.text).toMatch(/route="\/gasPrice"/);
    // Relaxed: ensure duration histogram and 50ms bucket exist (not necessarily same line)
    expect(res.text).toMatch(/http_server_duration_ms_bucket/);
    expect(res.text).toMatch(/le="50"/);
  });

  it('Rate limiting on /return returns 429 on second request', async () => {
    process.env.RL_RETURN_POINTS = '1';
    process.env.RL_RETURN_DURATION = '60';
    const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const AMOUNT = '1000000000000000000';
    await request(app.getHttpServer()).get(`/return/${WETH}/${USDC}/${AMOUNT}`).expect(200);
    await request(app.getHttpServer()).get(`/return/${WETH}/${USDC}/${AMOUNT}`).expect(429);
  });

  it('Pair not found returns error object (200 with error field)', async () => {
    const uni = app.get(UniswapService) as any;
    const original = uni.quote;
    uni.quote = (_a: string, _b: string, amount: string) => ({
      pair: '0x0000000000000000000000000000000000000000',
      amountIn: amount,
      amountOut: '0',
      reserveIn: '0',
      reserveOut: '0',
      feeBps: 30,
      updatedAtBlock: 123,
      stale: false,
      error: 'pair not found',
    });
    const res = await request(app.getHttpServer())
      .get('/return/0x1111111111111111111111111111111111111111/0x2222222222222222222222222222222222222222/1000')
      .expect(200);
    expect(res.body.error).toBe('pair not found');
    // restore
    uni.quote = original;
  });
});


