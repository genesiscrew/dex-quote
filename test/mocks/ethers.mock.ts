export class MockProvider {
  async getFeeData() {
    return { maxPriorityFeePerGas: 1n, maxFeePerGas: 2n, gasPrice: 3n } as any;
  }
  async getBlock(tag: string) {
    if (tag !== 'latest') return null as any;
    return { baseFeePerGas: 1n, number: 123n } as any;
  }
  async getBlockNumber() {
    return 123;
  }
  on() {}
  off() {}
  removeAllListeners() {}
}


