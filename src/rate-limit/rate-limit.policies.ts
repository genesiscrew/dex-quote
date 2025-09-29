export const RATE_LIMIT_POLICIES = {
  '/gasPrice': { points: parseInt(process.env.RL_GAS_POINTS ?? '60', 10), duration: parseInt(process.env.RL_GAS_DURATION ?? '60', 10) },
  '/return/:fromTokenAddress/:toTokenAddress/:amountIn': { points: parseInt(process.env.RL_RETURN_POINTS ?? '12', 10), duration: parseInt(process.env.RL_RETURN_DURATION ?? '60', 10) },
} as const;
