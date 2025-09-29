import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ethers } from 'ethers';
import { EthService } from './eth.service';

type GasSnapshot = {
  baseFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  maxFeePerGas: string | null;
  gasPrice?: string | null;
  updatedAt: number;
  blockNumber: number | null;
  stale: boolean;
};

@Injectable()
export class GasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GasService.name);
  private snapshot: GasSnapshot | null = null;
  private blockListener?: (bn: number) => void;
  private pollTimer?: NodeJS.Timeout;

  constructor(private readonly eth: EthService) {}

  async onModuleInit() {
    await this.refresh();
    const provider = this.eth.getProvider();
    // Refresh on each new block (provider emits 'block' via polling or websockets)
    this.blockListener = async (bn: number) => {
      try {
        await this.refresh(bn);
      } catch (err) {
        this.logger.warn(`Failed to refresh gas on block ${bn}: ${String(err)}`);
      }
    };
    provider.on('block', this.blockListener);

    // Fallback poller: if the primary block listener stalls, keep refreshing via failover
    const intervalMs = parseInt(process.env.GAS_REFRESH_INTERVAL_MS ?? '5000', 10);
    if (intervalMs > 0) {
      this.pollTimer = setInterval(async () => {
        try {
          const latestBn = await this.eth.withProviderFailover((p) => p.getBlockNumber());
          if (!this.snapshot || this.snapshot.blockNumber === null || latestBn > this.snapshot.blockNumber) {
            await this.refresh(latestBn);
          }
        } catch (err) {
          this.logger.warn(`Gas fallback poll failed: ${String(err)}`);
        }
      }, intervalMs);
    }
  }

  onModuleDestroy() {
    const provider = this.eth.getProvider();
    if (this.blockListener) {
      provider.off('block', this.blockListener);
    }
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  getSnapshot(): GasSnapshot | null {
    if (!this.snapshot) return null;
    const maxAgeMs = 60_000; // 1 minute considered fresh
    const stale = Date.now() - this.snapshot.updatedAt > maxAgeMs;
    return { ...this.snapshot, stale };
  }

  /**
   * Refreshes the in-memory gas snapshot from the provider (EIP-1559 + legacy).
   * Called on startup and on each new block.
   */
  private async refresh(latestBlockNumber?: number) {
    const provider = this.eth.getProvider();
    const [fd, latestBlock] = await Promise.all([
      this.eth.getFeeData(),
      this.eth.withProviderFailover((p) => p.getBlock('latest')),
    ]);
    const defaultPriority = ethers.parseUnits(process.env.DEFAULT_PRIORITY_GWEI ?? '1.5', 'gwei');
    const baseFee = latestBlock?.baseFeePerGas ?? null;
    const maxPrio = fd.maxPriorityFeePerGas ?? defaultPriority;
    const maxFee = fd.maxFeePerGas ?? (baseFee ? baseFee + maxPrio : null);
    const gasPrice = fd.gasPrice ?? null;

    this.snapshot = {
      baseFeePerGas: baseFee ? baseFee.toString() : null,
      maxPriorityFeePerGas: maxPrio ? maxPrio.toString() : null,
      maxFeePerGas: maxFee ? maxFee.toString() : null,
      gasPrice: gasPrice ? gasPrice.toString() : null,
      updatedAt: Date.now(),
      blockNumber: latestBlockNumber ?? latestBlock?.number ?? (await this.eth.withProviderFailover((p) => p.getBlockNumber())),
      stale: false,
    };
  }
}


