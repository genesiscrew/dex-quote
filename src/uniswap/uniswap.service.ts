import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  error?: string;
  chainId?: number;
  factory?: string;
  timestampLast?: number;
};

@Injectable()
export class UniswapService {
  constructor(private readonly eth: EthService) {}

  // Factory method to facilitate testing/mocking of contracts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private createContract(address: string, abi: any, provider: ethers.Provider): any {
    return new ethers.Contract(address, abi, provider);
  }

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
    const provider = this.eth.getProvider();
    const factory = this.createContract(UNISWAP_V2_FACTORY, FACTORY_ABI, provider);
    const pairAddr: string = await factory.getPair(fromToken, toToken);
    if (!pairAddr || pairAddr === ethers.ZeroAddress) {
      throw new NotFoundException({ code: 'PAIR_NOT_FOUND', message: 'UniswapV2 pair does not exist' });
    }

    const pair = this.createContract(pairAddr, PAIR_ABI, provider);
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


