import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  constructor(private readonly eth: EthService) {}


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
    const pairAddr: string = await this.eth.withProviderFailover(
      (p) => new ethers.Contract(UNISWAP_V2_FACTORY, FACTORY_ABI, p).getPair(fromToken, toToken),
      { attempts: 1, timeoutMs }
    );
    if (!pairAddr || pairAddr === ethers.ZeroAddress) {
      throw new NotFoundException({ code: 'PAIR_NOT_FOUND', message: 'UniswapV2 pair does not exist' });
    }

    const [token0, reserves, block] = await Promise.all([
      this.eth.withProviderFailover((p) => new ethers.Contract(pairAddr, PAIR_ABI, p).token0() as Promise<string>, { attempts: 1, timeoutMs }),
      this.eth.withProviderFailover((p) => new ethers.Contract(pairAddr, PAIR_ABI, p).getReserves() as Promise<[ethers.BigNumberish, ethers.BigNumberish, number]>, { attempts: 1, timeoutMs }),
      this.eth.withProviderFailover((p) => p.getBlockNumber(), { attempts: 1, timeoutMs }),
    ]);

    const fromIsToken0 = fromToken.toLowerCase() === (token0 as string).toLowerCase();
    const reserveIn = BigInt(fromIsToken0 ? (reserves as any)[0].toString() : (reserves as any)[1].toString());
    const reserveOut = BigInt(fromIsToken0 ? (reserves as any)[1].toString() : (reserves as any)[0].toString());
    const amountIn = BigInt(amountInStr);
    const amountOut = this.getAmountOut(amountIn, reserveIn, reserveOut);

    const chainId = parseInt(process.env.CHAIN_ID ?? '1', 10);
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


