import { BadRequestException, Injectable, NotFoundException, Logger, BadGatewayException, ServiceUnavailableException, GatewayTimeoutException } from '@nestjs/common';
import { ethers } from 'ethers';
import { EthService } from '../eth/eth.service';
import { FACTORY_ABI, PAIR_ABI, UNISWAP_V2_FACTORY } from './abis';
import { withRetry } from '../common/utils/retry.util';

type QuoteResult = {
  pair: string;
  amountIn: string;
  amountOut: string;
  reserveIn: string;
  reserveOut: string;
  feeBps: number;
  updatedAtBlock: number;
  stale: boolean;
  error?: string;
  chainId?: number;
  factory?: string;
  timestampLast?: number;
};

@Injectable()
export class UniswapService {
  private readonly logger = new Logger(UniswapService.name);
  constructor(private readonly eth: EthService) {}

  private mapRpcError(err: any, label: string) {
    const status = (err?.status ?? err?.response?.status ?? undefined) as number | undefined;
    const jsonRpcCode = (err?.error?.code ?? err?.code) as number | string | undefined;
    const msg = String((err && (err.message || err.code || err.name)) ?? err);
    try { this.logger.warn(`RPC error [${label}]: ${msg}`); } catch {}
    // Prefer explicit HTTP status when available
    if (typeof status === 'number') {
      if (status === 400) return new BadGatewayException({ code: 'RPC_BAD_REQUEST', message: msg });
      if (status === 401) return new BadGatewayException({ code: 'RPC_UNAUTHORIZED', message: msg });
      if (status === 402) return new BadGatewayException({ code: 'RPC_QUOTA_EXCEEDED', message: msg });
      if (status === 403) return new BadGatewayException({ code: 'RPC_FORBIDDEN', message: msg });
      if (status === 413) return new BadGatewayException({ code: 'RPC_PAYLOAD_TOO_LARGE', message: msg });
      if (status === 429) return new BadGatewayException({ code: 'RPC_RATE_LIMIT', message: msg });
      if (status === 503) return new ServiceUnavailableException({ code: 'RPC_UNAVAILABLE', message: msg });
      if (status === 504) return new GatewayTimeoutException({ code: 'RPC_TIMEOUT', message: msg });
      if (status === 500 || status === 502) return new BadGatewayException({ code: 'RPC_UPSTREAM_ERROR', message: msg });
    }
    // JSON-RPC error code mapping when HTTP status is 200
    if (typeof jsonRpcCode === 'number') {
      if (jsonRpcCode === -32700 || jsonRpcCode === -32600 || jsonRpcCode === -32602 || jsonRpcCode === -32601) {
        return new BadGatewayException({ code: 'RPC_BAD_REQUEST', message: msg });
      }
      if (jsonRpcCode === -32005) {
        return new BadGatewayException({ code: 'RPC_RATE_LIMIT', message: msg });
      }
      if (jsonRpcCode <= -32000 && jsonRpcCode >= -32099) {
        return new BadGatewayException({ code: 'RPC_UPSTREAM_ERROR', message: msg });
      }
    }
    // Fallback to message heuristics
    const m = msg.toLowerCase();
    if (m.includes('timeout') || m.includes('504')) {
      return new GatewayTimeoutException({ code: 'RPC_TIMEOUT', message: msg });
    }
    if (m.includes('rate') && (m.includes('limit') || m.includes('429'))) {
      return new BadGatewayException({ code: 'RPC_RATE_LIMIT', message: msg });
    }
    if (m.includes('forbidden') || m.includes('403')) {
      return new BadGatewayException({ code: 'RPC_FORBIDDEN', message: msg });
    }
    if (m.includes('payload too large') || m.includes('content too large') || m.includes('request entity too large') || m.includes('413')) {
      return new BadGatewayException({ code: 'RPC_PAYLOAD_TOO_LARGE', message: msg });
    }
    if (m.includes('503') || m.includes('unavailable')) {
      return new ServiceUnavailableException({ code: 'RPC_UNAVAILABLE', message: msg });
    }
    if (m.includes('500') || m.includes('502')) {
      return new BadGatewayException({ code: 'RPC_UPSTREAM_ERROR', message: msg });
    }
    return new BadGatewayException({ code: 'RPC_ERROR', message: msg });
  }

  private async callWithRpcHandling<T>(op: () => Promise<T>, label: string): Promise<T> {
    try {
      return await op();
    } catch (err) {
      throw this.mapRpcError(err, label);
    }
  }


  /**
   * Uniswap V2 amountOut with 0.3% fee (997/1000).
   * Throws on non‑positive input or zero reserves.
   */
  private getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    if (amountIn <= 0n) {
      throw new BadRequestException('UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
    }
    if (reserveIn <= 0n || reserveOut <= 0n) {
      throw new BadRequestException('UniswapV2Library: INSUFFICIENT_LIQUIDITY');
    }
    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    return numerator / denominator;
  }

  async quote(fromToken: string, toToken: string, amountInStr: string): Promise<QuoteResult> {
    const timeoutMs = parseInt(process.env.RPC_TIMEOUT_MS ?? '1500', 10);
    const pairAddr: string = await this.callWithRpcHandling(
      () => this.eth.withProviderFailover(
        (p) => new ethers.Contract(UNISWAP_V2_FACTORY, FACTORY_ABI, p).getPair(fromToken, toToken),
        { attempts: 1, timeoutMs }
      ),
      'FACTORY_GET_PAIR'
    );
    if (!pairAddr || pairAddr === ethers.ZeroAddress) {
      try { this.logger.warn(`PAIR_NOT_FOUND from=${fromToken} to=${toToken}`); } catch {}
      throw new NotFoundException({ code: 'PAIR_NOT_FOUND', message: 'UniswapV2 pair does not exist' });
    }

    const token0 = await this.callWithRpcHandling(
      () => this.eth.withProviderFailover((p) => new ethers.Contract(pairAddr, PAIR_ABI, p).token0() as Promise<string>, { attempts: 1, timeoutMs }),
      'PAIR_TOKEN0'
    );
    const reserves = await this.callWithRpcHandling(
      () => this.eth.withProviderFailover((p) => new ethers.Contract(pairAddr, PAIR_ABI, p).getReserves() as Promise<[ethers.BigNumberish, ethers.BigNumberish, number]>, { attempts: 1, timeoutMs }),
      'PAIR_GET_RESERVES'
    );
    const block = await this.callWithRpcHandling(
      () => this.eth.withProviderFailover((p) => p.getBlockNumber(), { attempts: 1, timeoutMs }),
      'GET_BLOCK_NUMBER'
    );

    const fromIsToken0 = fromToken.toLowerCase() === (token0 as string).toLowerCase();
    const reserveIn = BigInt(fromIsToken0 ? (reserves as any)[0].toString() : (reserves as any)[1].toString());
    const reserveOut = BigInt(fromIsToken0 ? (reserves as any)[1].toString() : (reserves as any)[0].toString());
    const amountIn = BigInt(amountInStr);
    const amountOut = this.getAmountOut(amountIn, reserveIn, reserveOut);

    const chainId = parseInt(process.env.CHAIN_ID ?? '1', 10);
    try {
      this.logger.debug?.(`quote computed from=${fromToken} to=${toToken} pair=${pairAddr} amountIn=${amountIn.toString()} amountOut=${amountOut.toString()} block=${block}`);
    } catch {}
    return {
      pair: pairAddr,
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      reserveIn: reserveIn.toString(),
      reserveOut: reserveOut.toString(),
      feeBps: 30,
      updatedAtBlock: block,
      stale: false,
      chainId,
      factory: UNISWAP_V2_FACTORY,
      timestampLast: Number((reserves as any)[2] ?? 0),
    };
  }
}


