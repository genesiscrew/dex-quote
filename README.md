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
- `RPC_URL` (Alchemy/Infura/QuickNode) or `RPC_URLS` (comma‑separated for failover)
- `CHAIN_ID` (default 1)

## Endpoints
- GET `/gasPrice`
  - Returns: `baseFeePerGas`, `maxPriorityFeePerGas`, `maxFeePerGas`, `gasPrice`, `blockNumber`, `updatedAt`, `stale`
  - Notes: served from an in‑memory snapshot; returns `503` until warm. Adds `Age`, `X-Cache`, `Cache-Control`.

- GET `/return/:from/:to/:amount`
  - Input: addresses and `amount` in base units (e.g., wei for WETH, 6‑decimals for USDC)
  - Output: `amountOut`, `pair`, `reserveIn`, `reserveOut`, `feeBps`, `updatedAtBlock`, plus `chainId`, `factory`, `timestampLast`
  - Errors: invalid params → 400; insufficient liquidity/input → 400 (Uniswap‑style); pair missing → `404 { code: "PAIR_NOT_FOUND" }`
  - State reads (`getPair`, `token0`, `getReserves`, `getBlockNumber`) use per‑request RPC failover with timeouts/retries.

### Examples
```bash
# Health
curl -s http://localhost:3000/healthz | jq

# Gas snapshot
curl -i -s http://localhost:3000/gasPrice | sed -n '1,10p'
curl -s http://localhost:3000/gasPrice | jq

# 1 WETH -> USDC (amountIn in wei)
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
AMOUNT_WEI=1000000000000000000
curl -s "http://localhost:3000/return/$WETH/$USDC/$AMOUNT_WEI" | jq

# 100 USDC -> WETH (USDC has 6 decimals)
USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
AMOUNT_USDC=100000000
curl -s "http://localhost:3000/return/$USDC/$WETH/$AMOUNT_USDC" | jq

# Metrics
curl -s http://localhost:3000/metrics | head
```

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

SLA queries (Prometheus)
- p50: `histogram_quantile(0.50, sum(rate(http_server_duration_ms_bucket{route="/gasPrice"}[5m])) by (le))`
- p95: `histogram_quantile(0.95, sum(rate(http_server_duration_ms_bucket{route="/gasPrice"}[5m])) by (le))`
- p99: `histogram_quantile(0.99, sum(rate(http_server_duration_ms_bucket{route="/gasPrice"}[5m])) by (le))`
- Error budget: `sum(rate(http_requests_total{route="/gasPrice",status=~"5.."}[5m])) / sum(rate(http_requests_total{route="/gasPrice"}[5m]))`

### Operations
- Prometheus
  - Scrape this service’s `/metrics` endpoint
  - Load alert rules from `prometheus/alerts.yml` (rule_files)
  - Route `severity=page` in Alertmanager for `GasPriceP99High`
- Grafana
  - Use the SLA queries above to build panels filtered by `route="/gasPrice"`
- CI/CD
  - Run the SLA test `test/gas.sla.e2e-spec.ts` (via `npm run test:e2e`) to prevent latency regressions
- Ops
  - If p99 > 50ms alert fires, check cache readiness, CPU saturation, or middleware changes; drill down by labels `method`, `route`, `status`
  - Tune thresholds/windows in `alerts.yml` to your SLO; adjust histogram buckets or route labels as paths evolve

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
  - RPC: `RPC_URL` or `RPC_URLS`, `CHAIN_ID`, `RPC_TIMEOUT_MS`, `RPC_COOLDOWN_MS`, `RPC_HEALTH_INTERVAL_MS`
  - Server: `PORT`
  - Gas snapshot: `DEFAULT_PRIORITY_GWEI`, `GAS_READY_TIMEOUT_MS`, `GAS_REFRESH_INTERVAL_MS`
  - Metrics: `METRICS_DEBUG`
  - Rate limiting: `RL_DEFAULT_*`, `RL_GAS_*`, `RL_RETURN_*`, optional `REDIS_URL`
  - Proxy trust: `TRUST_PROXY=1` to respect X-Forwarded-For

## RPC resilience (retry & failover)
- Multiple RPCs (`RPC_URLS=a,b,c`): each call tries providers in order.
- Timeouts/retry: per‑call timeout via `RPC_TIMEOUT_MS` and a small retry budget.
- Circuit breaker: failed providers enter cooldown (`RPC_COOLDOWN_MS`).
- Health probe: `RPC_HEALTH_INTERVAL_MS` clears cooldown when providers recover.
- Gas freshness: block listener on primary plus fallback polling (`GAS_REFRESH_INTERVAL_MS`).

Example:
```bash
RPC_URLS="https://rpc1,https://rpc2" \
RPC_TIMEOUT_MS=500 RPC_COOLDOWN_MS=30000 RPC_HEALTH_INTERVAL_MS=15000 \
GAS_REFRESH_INTERVAL_MS=3000 npm run start
```

## Notes
- Uniswap V2 math matches periphery (0.3% fee, constant‑product) computed in BigInt -> https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L42C1-L50C6
