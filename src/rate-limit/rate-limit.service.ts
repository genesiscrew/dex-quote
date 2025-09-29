import { Injectable, Logger } from '@nestjs/common';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import Redis from 'ioredis';

export type RateLimitPolicy = {
  points: number; // max number of tokens in the bucket (requests per duration)
  duration: number; // seconds
  blockDuration?: number; // optional ban time in seconds
};

export type RateLimitConsumeResult = {
  remaining: number;
  msBeforeNext: number;
  resetAt: number; // epoch ms when bucket resets
  blocked: boolean; // true if the request exceeded the limit
};

type Limiter = RateLimiterMemory | RateLimiterRedis;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis?: Redis;
  private readonly defaultPolicy: RateLimitPolicy;
  private readonly routeLimiters = new Map<string, Limiter>();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new Redis(redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
      this.redis.on('error', (err) => this.logger.warn(`Redis error: ${String(err)}`));
    }

    this.defaultPolicy = {
      points: parseInt(process.env.RL_DEFAULT_POINTS ?? '60', 10),
      duration: parseInt(process.env.RL_DEFAULT_DURATION ?? '60', 10),
      blockDuration: parseInt(process.env.RL_DEFAULT_BLOCK ?? '0', 10) || undefined,
    };
  }

  private getOrCreateLimiter(routeKey: string, policy?: RateLimitPolicy): Limiter {
    const key = routeKey || 'default';
    const existing = this.routeLimiters.get(key);
    if (existing) return existing;

    const p = policy ?? this.defaultPolicy;
    const baseOptions = {
      keyPrefix: `rl:${key}`,
      points: p.points,
      duration: p.duration,
      blockDuration: p.blockDuration ?? 0,
      execEvenly: false,
      insuranceLimiter: undefined as any,
    };

    let limiter: Limiter;
    if (this.redis) {
      limiter = new RateLimiterRedis({ storeClient: this.redis, ...baseOptions });
    } else {
      limiter = new RateLimiterMemory(baseOptions);
    }
    this.routeLimiters.set(key, limiter);
    return limiter;
  }

  async consume(routeKey: string, ip: string, policy?: RateLimitPolicy, cost = 1): Promise<RateLimitConsumeResult> {
    const limiter = this.getOrCreateLimiter(routeKey, policy);
    try {
      const res = await limiter.consume(`${ip}:${routeKey}`, cost);
      return this.toResult(res, false);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        return this.toResult(err, true);
      }
      this.logger.warn(`Unexpected rate-limit error: ${String(err)}`);
      throw err;
    }
  }

  private toResult(res: RateLimiterRes, blocked: boolean): RateLimitConsumeResult {
    const msBeforeNext = res.msBeforeNext ?? 0;
    const now = Date.now();
    return {
      remaining: Math.max((res.remainingPoints ?? 0), 0),
      msBeforeNext,
      resetAt: now + msBeforeNext,
      blocked,
    };
  }
}


