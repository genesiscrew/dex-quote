import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { withRetry } from '../common/utils/retry.util';

/**
 * Provides a singleton ethers JsonRpcProvider for chain access.
 */
@Injectable()
export class EthService implements OnModuleDestroy, OnModuleInit {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly providers: ethers.JsonRpcProvider[] = [];
  private readonly providerState = new Map<ethers.JsonRpcProvider, { cooldownUntil: number }>();
  private healthTimer?: NodeJS.Timeout;

  constructor() {
    const chainId = parseInt(process.env.CHAIN_ID ?? '1', 10);
    const urlsEnv = process.env.RPC_URLS?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    const single = process.env.RPC_URL ? [process.env.RPC_URL] : [];
    const urls = urlsEnv.length > 0 ? urlsEnv : single;
    if (urls.length === 0) {
      throw new Error('RPC_URL or RPC_URLS must be set');
    }
    for (const url of urls) {
      const p = new ethers.JsonRpcProvider(url, chainId);
      this.providers.push(p);
      this.providerState.set(p, { cooldownUntil: 0 });
    }
    this.provider = this.providers[0];
  }

  onModuleInit() {
    const intervalMs = parseInt(process.env.RPC_HEALTH_INTERVAL_MS ?? '15000', 10);
    if (intervalMs > 0) {
      this.healthTimer = setInterval(async () => {
        const timeoutMs = parseInt(process.env.RPC_TIMEOUT_MS ?? '1500', 10);
        for (const prov of this.providers) {
          const state = this.providerState.get(prov)!;
          if (state.cooldownUntil <= Date.now()) {
            // quick probe; if succeeds, clear cooldown
            try {
              await withRetry(() => prov.getBlockNumber(), { attempts: 0, timeoutMs });
              this.providerState.set(prov, { cooldownUntil: 0 });
            } catch {
              // keep cooldown
            }
          }
        }
      }, intervalMs);
    }
  }

  /** Returns the shared ethers provider. */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /** Execute an RPC operation with per-request failover across configured providers. */
  async withProviderFailover<T>(
    op: (p: ethers.JsonRpcProvider) => Promise<T>,
    options?: { timeoutMs?: number; attempts?: number; backoffMs?: number }
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? parseInt(process.env.RPC_TIMEOUT_MS ?? '1500', 10);
    const attempts = options?.attempts ?? 1;
    const backoffMs = options?.backoffMs ?? 200;
    let lastErr: unknown;
    const now = Date.now();
    const cooldownMs = parseInt(process.env.RPC_COOLDOWN_MS ?? '30000', 10);
    for (let i = 0; i < this.providers.length; i++) {
      const prov = this.providers[i];
      const state = this.providerState.get(prov)!;
      if (state.cooldownUntil > now) {
        continue; // skip providers in cooldown
      }
      try {
        return await withRetry(() => op(prov), { attempts, timeoutMs, backoffMs });
      } catch (err) {
        lastErr = err;
        // mark provider as cooling down and try next provider
        this.providerState.set(prov, { cooldownUntil: Date.now() + cooldownMs });
        continue;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Thin wrapper around provider.getFeeData() with timeout/retry and failover. */
  async getFeeData(): Promise<ethers.FeeData> {
    return this.withProviderFailover((p) => p.getFeeData());
  }

  onModuleDestroy() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.provider.removeAllListeners();
  }
}


