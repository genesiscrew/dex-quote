function isValidIp(ip: unknown): ip is string {
  if (typeof ip !== 'string') return false;
  const v4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[A-F0-9:]+$/i;
  return v4.test(ip) || v6.test(ip);
}

export function extractClientIp(req: any): string {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  if (trustProxy) {
    const xf = (req.headers?.['x-forwarded-for'] || req.headers?.['X-Forwarded-For']) as string | undefined;
    if (xf && typeof xf === 'string') {
      const first = xf.split(',')[0]?.trim();
      if (isValidIp(first)) return first;
    }
  }
  const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || req.connection?.socket?.remoteAddress;
  return isValidIp(ip) ? ip : 'unknown';
}


