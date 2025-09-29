import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ethers } from 'ethers';
import { withRetry } from '../common/utils/retry.util';

/**
 * Provides a singleton ethers JsonRpcProvider for chain access.
 */
@Injectable()
export class EthService implements OnModuleDestroy {
  private readonly provider: ethers.JsonRpcProvider;

  constructor() {
    const rpcUrl = process.env.RPC_URL;
    const chainId = parseInt(process.env.CHAIN_ID ?? '1', 10);
    if (!rpcUrl) {
      throw new Error('RPC_URL is not set');
    }
    this.provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  }

  /** Returns the shared ethers provider. */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /** Thin wrapper around provider.getFeeData() with timeout/retry. */
  async getFeeData(): Promise<ethers.FeeData> {
    const timeoutMs = parseInt(process.env.RPC_TIMEOUT_MS ?? '1500', 10);
    return withRetry(() => this.provider.getFeeData(), { attempts: 1, backoffMs: 200, timeoutMs });
  }

  onModuleDestroy() {
    this.provider.removeAllListeners();
  }
}


