# DEX Quote API

NestJS service with two endpoints:
- GET `/gasPrice`: recent Ethereum gas snapshot (fast, cached)
- GET `/return/:fromTokenAddress/:toTokenAddress/:amountIn`: Uniswap V2 quote (off‑chain math)

Uses ethers v6 only. No on‑chain quoting. Uniswap V2 factory: `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f`.

## Quick start
```bash
npm install
cp .env.example .env   # set RPC_URL at minimum
npm run start:dev
```
Minimal env:
- `RPC_URL` (Alchemy/Infura/QuickNode)
- `CHAIN_ID` (default 1)

## Endpoints
- GET `/gasPrice`
  - Returns: `baseFeePerGas`, `maxPriorityFeePerGas`, `maxFeePerGas`, `gasPrice`, `blockNumber`, `updatedAt`, `stale`
  - Notes: served from an in‑memory snapshot refreshed on each new block; the app waits for the first snapshot before listening.

- GET `/return/:from/:to/:amount`
  - Input: addresses and `amount` in base units (e.g., wei for WETH, 6‑decimals for USDC)
  - Output: `amountOut`, `pair`, `reserveIn`, `reserveOut`, `feeBps`, `updatedAtBlock`
  - Errors: invalid params → 400; insufficient liquidity/input → 400 with Uniswap‑like messages; pair missing → 200 with `{ "error": "pair not found" }`

## Architecture (short)
- Components
  - Controllers: HTTP layer (`/gasPrice`, `/return/...`)
  - Services: logic and chain I/O (`EthService`, `GasService`, `UniswapService`)
  - Modules: wire services and controllers (`EthModule`, `UniswapModule`, `MetricsModule`, `RateLimitModule`)
- Cross‑cutting
  - Interceptor: sets `X-Response-Time`
  - Middleware: records Prometheus HTTP metrics on `res.finish`
  - Guard: per‑IP, per‑route rate limiting (token bucket)
- Data flow
  - `/gasPrice`: returns an in‑memory snapshot; `GasService` refreshes on each new block via ethers provider
  - `/return/...`: reads UniV2 state (factory.getPair → pair.getReserves/token0), computes output with constant‑product math (0.3% fee) entirely off‑chain in BigInt
- Error semantics
  - 404 `{ code: PAIR_NOT_FOUND }` when no pair
  - 400 Uniswap‑style messages for invalid input/insufficient liquidity

## Metrics
- Prometheus at `GET /metrics` (`http_server_duration_ms`, `http_requests_total`, plus default Node.js metrics)
- Every response includes `X-Response-Time: <ms>`

When to use what
- Developer debugging (per-request):
  - `curl -v http://localhost:3000/gasPrice` → check `X-Response-Time: <ms>` immediately
- Ops/monitoring (trends/percentiles):
  - PromQL example: `rate(http_server_duration_ms_sum[5m]) / rate(http_server_duration_ms_count[5m])`
  - Use histogram_quantile for p95/p99

## Rate limiting
- Per‑IP, per‑route token bucket via `rate-limiter-flexible`
- Defaults: `RL_DEFAULT_POINTS`, `RL_DEFAULT_DURATION`
- Route overrides: `RL_GAS_*` for `/gasPrice`, `RL_RETURN_*` for `/return/...`
- Backends: in‑memory by default; set `REDIS_URL` for Redis‑backed shared buckets
- 429 responses include `X-RateLimit-*` and `Retry-After`

Policy basics
- Each IP gets its own bucket per route (key is `${ip}:${route}`) within a fixed window.
- When tokens run out in the window, further requests return 429 until the window resets.
- Suggested starting values:
  - `/gasPrice` (cheap): 60 requests per 60s
  - `/return/...` (expensive): 12 requests per 60s
- You can add a temporary ban via `RL_DEFAULT_BLOCK` (seconds) if desired.

## Testing
```bash
npm run test       # unit
npm run test:e2e   # e2e (provider overrides, no real RPC)
```

## Environment
- Copy `.env.example` and adjust. Common variables:
  - RPC: `RPC_URL`, `CHAIN_ID`
  - Server: `PORT`
  - Gas snapshot: `DEFAULT_PRIORITY_GWEI`, `GAS_READY_TIMEOUT_MS`
  - Metrics: `METRICS_DEBUG`
  - Rate limiting: `RL_DEFAULT_*`, `RL_GAS_*`, `RL_RETURN_*`, optional `REDIS_URL`
  - Proxy trust: `TRUST_PROXY=1` to respect X-Forwarded-For

## Notes
- Uniswap V2 math matches periphery (0.3% fee, constant‑product) computed in BigInt
- Only ethers is used for chain access
