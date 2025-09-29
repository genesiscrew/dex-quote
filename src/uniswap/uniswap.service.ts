import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import { EthService } from '../eth/eth.service';
import { FACTORY_ABI, PAIR_ABI, UNISWAP_V2_FACTORY } from './abis';

type QuoteResult = {
  pair: string;
  amountIn: string;
  amountOut: string;
  reserveIn: string;
  reserveOut: string;
  feeBps: number;
  updatedAtBlock: number;
  stale: boolean;
};

@Injectable()
export class UniswapService {
  constructor(private readonly eth: EthService) {}

  private getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    if (amountIn <= 0n) return 0n;
    if (reserveIn <= 0n || reserveOut <= 0n) return 0n;
    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    return numerator / denominator;
  }

  async quote(fromToken: string, toToken: string, amountInStr: string): Promise<QuoteResult> {
    const provider = this.eth.getProvider();
    const factory = new ethers.Contract(UNISWAP_V2_FACTORY, FACTORY_ABI, provider);
    const pairAddr: string = await factory.getPair(fromToken, toToken);
    if (!pairAddr || pairAddr === ethers.ZeroAddress) {
      const block = await provider.getBlockNumber();
      return {
        pair: ethers.ZeroAddress,
        amountIn: amountInStr,
        amountOut: '0',
        reserveIn: '0',
        reserveOut: '0',
        feeBps: 30,
        updatedAtBlock: block,
        stale: false,
      };
    }

    const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
    const [token0, reserves, block] = await Promise.all([
      pair.token0() as Promise<string>,
      pair.getReserves() as Promise<[ethers.BigNumberish, ethers.BigNumberish, number]>,
      provider.getBlockNumber(),
    ]);

    const fromIsToken0 = fromToken.toLowerCase() === token0.toLowerCase();
    const reserveIn = BigInt(fromIsToken0 ? reserves[0].toString() : reserves[1].toString());
    const reserveOut = BigInt(fromIsToken0 ? reserves[1].toString() : reserves[0].toString());
    const amountIn = BigInt(amountInStr);
    const amountOut = this.getAmountOut(amountIn, reserveIn, reserveOut);

    return {
      pair: pairAddr,
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      reserveIn: reserveIn.toString(),
      reserveOut: reserveOut.toString(),
      feeBps: 30,
      updatedAtBlock: block,
      stale: false,
    };
  }
}


