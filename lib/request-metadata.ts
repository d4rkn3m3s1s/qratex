import { createHash } from 'crypto';

type RequestLike = {
  headers: {
    get(name: string): string | null;
  };
};

function extractFirstForwardedIp(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  return first || null;
}

export function getClientIp(request: RequestLike): string | null {
  return (
    extractFirstForwardedIp(request.headers.get('x-forwarded-for')) ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  );
}

export function getUserAgent(request: RequestLike): string | null {
  return request.headers.get('user-agent') || null;
}

export function getAuditRequestMeta(request: RequestLike): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  };
}

export function maskIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;

  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length <= 2) return '****:****';
    return `${parts.slice(0, 2).join(':')}:****:****`;
  }

  const chunks = ip.split('.');
  if (chunks.length !== 4) return '***.***.***.***';
  return `${chunks[0]}.${chunks[1]}.*.*`;
}

export function hashIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex');
}

