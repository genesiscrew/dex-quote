export function extractClientIp(req: any): string {
  // If behind proxy and trust proxy is enabled in Nest/Express, Express populates req.ip
  // Fallback to X-Forwarded-For, then to connection addresses.
  const xf = (req.headers?.['x-forwarded-for'] || req.headers?.['X-Forwarded-For']) as string | undefined;
  if (xf && typeof xf === 'string') {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || req.connection?.socket?.remoteAddress;
  return typeof ip === 'string' ? ip : 'unknown';
}


