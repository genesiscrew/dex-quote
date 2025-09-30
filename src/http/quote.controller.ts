import { Controller, Get, Param, BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';
import { UniswapService } from '../uniswap/uniswap.service';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

function isValidAmount(amount: string): boolean {
  try {
    const v = BigInt(amount);
    return v > 0n;
  } catch {
    return false;
  }
}

/**
 * Computes a Uniswap V2 quote using on-chain reserves and off-chain math.
 */
@ApiTags('uniswap')
@Controller('return')
export class QuoteController {
  constructor(private readonly uniswap: UniswapService) {}

  /**
   * GET /return/:fromTokenAddress/:toTokenAddress/:amountIn
   * amountIn is in base units; validates inputs and delegates to UniswapService.
   */
  @Get(':fromTokenAddress/:toTokenAddress/:amountIn')
  @ApiOperation({ summary: 'Uniswap V2 quote using off-chain math' })
  @ApiParam({ name: 'fromTokenAddress', description: 'ERC-20 address of input token' })
  @ApiParam({ name: 'toTokenAddress', description: 'ERC-20 address of output token' })
  @ApiParam({ name: 'amountIn', description: 'Exact input amount in base units (wei/6-dec, etc.)' })
  @ApiOkResponse({ description: 'Quote result' })
  @ApiBadRequestResponse({ description: 'Invalid parameters or insufficient liquidity/input amount' })
  @ApiNotFoundResponse({ description: 'Pair not found' })
  async getQuote(
    @Param('fromTokenAddress') fromTokenAddress: string,
    @Param('toTokenAddress') toTokenAddress: string,
    @Param('amountIn') amountIn: string,
  ) {
    if (!ethers.isAddress(fromTokenAddress)) {
      throw new BadRequestException('Invalid fromTokenAddress');
    }
    if (!ethers.isAddress(toTokenAddress)) {
      throw new BadRequestException('Invalid toTokenAddress');
    }
    if (!isValidAmount(amountIn)) {
      throw new BadRequestException('Invalid amountIn');
    }

    return this.uniswap.quote(fromTokenAddress, toTokenAddress, amountIn);
  }
}


