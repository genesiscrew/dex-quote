import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Gas SLA (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    // Warm: call once to ensure snapshot exists
    await request(app.getHttpServer()).get('/gasPrice');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('p99 latency for /gasPrice is under 50ms (allow small buffer)', async () => {
    const N = 300; // enough samples for stable percentile
    const times: number[] = [];
    for (let i = 0; i < N; i++) {
      const t0 = process.hrtime.bigint();
      const res = await request(app.getHttpServer()).get('/gasPrice');
      expect(res.status).toBe(200);
      const t1 = process.hrtime.bigint();
      const ms = Number(t1 - t0) / 1e6;
      times.push(ms);
    }
    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(0.99 * (times.length - 1))];
    expect(p99).toBeLessThanOrEqual(60); // small CI buffer above 50ms
  });
});


