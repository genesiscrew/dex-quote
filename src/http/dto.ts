export class GasSnapshotDto {
  baseFeePerGas!: string | null;
  maxPriorityFeePerGas!: string | null;
  maxFeePerGas!: string | null;
  gasPrice?: string | null;
  updatedAt!: number;
  blockNumber!: number | null;
  stale!: boolean;
}

export class QuoteResultDto {
  pair!: string;
  amountIn!: string;
  amountOut!: string;
  reserveIn!: string;
  reserveOut!: string;
  feeBps!: number;
  updatedAtBlock!: number;
  stale!: boolean;
  chainId?: number;
  factory?: string;
  timestampLast?: number;
}


