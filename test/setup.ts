// Jest global setup for tests

process.env.RPC_URL = process.env.RPC_URL ?? 'http://localhost:8545';
process.env.CHAIN_ID = process.env.CHAIN_ID ?? '1';
process.env.PORT = process.env.PORT ?? '0';
process.env.GAS_READY_TIMEOUT_MS = process.env.GAS_READY_TIMEOUT_MS ?? '1';
process.env.METRICS_DEBUG = '0';


