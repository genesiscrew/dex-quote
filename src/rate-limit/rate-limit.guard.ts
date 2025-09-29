import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RateLimitService, RateLimitPolicy } from './rate-limit.service';
import { extractClientIp } from '../common/utils/ip.util';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly rl: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = (req.method || 'GET').toUpperCase();
    const urlPath: string = (req?.originalUrl || req?.url || '').split('?')[0] || '/';
    let effectiveRoute = urlPath;
    if (urlPath.startsWith('/gasPrice')) {
      effectiveRoute = '/gasPrice';
    } else if (urlPath.startsWith('/return/')) {
      effectiveRoute = '/return/:fromTokenAddress/:toTokenAddress/:amountIn';
    }
    const ip = extractClientIp(req);
    const routeKey = effectiveRoute; // separate buckets per-route
    // Read route-specific limits from env at request time (works in tests)
    const policy: RateLimitPolicy | undefined = (() => {
      if (routeKey === '/gasPrice') {
        return {
          points: parseInt(process.env.RL_GAS_POINTS ?? process.env.RL_DEFAULT_POINTS ?? '60', 10),
          duration: parseInt(process.env.RL_GAS_DURATION ?? process.env.RL_DEFAULT_DURATION ?? '60', 10),
        };
      }
      if (routeKey === '/return/:fromTokenAddress/:toTokenAddress/:amountIn') {
        return {
          points: parseInt(process.env.RL_RETURN_POINTS ?? process.env.RL_DEFAULT_POINTS ?? '12', 10),
          duration: parseInt(process.env.RL_RETURN_DURATION ?? process.env.RL_DEFAULT_DURATION ?? '60', 10),
        };
      }
      return undefined;
    })();

    const result = await this.rl.consume(routeKey, ip, policy, 1);
    const limit = (policy?.points ?? parseInt(process.env.RL_DEFAULT_POINTS ?? '60', 10));
    const resetSeconds = Math.ceil(result.msBeforeNext / 1000);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(result.remaining, 0)));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));

    if (result.blocked) {
      res.setHeader('Retry-After', String(resetSeconds));
      res.status(429).json({ statusCode: 429, message: 'Too Many Requests', method, route: effectiveRoute, nextAllowedInSeconds: resetSeconds });
      return false;
    }

    return true;
  }
}


