/**
 * Prompt injection savunması (P2-20 item 16).
 * Tehlikeli pattern'leri tespit eder; reddet veya sanitize.
 */
const DANGEROUS_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|prior|above|instructions)\b/i,
  /\bforget\s+(everything|all|your)\b/i,
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\s+(if\s+)?(you\s+are\s+)?\w+\b/i,
  /\bsystem\s*:\s*/i,
  /\bhuman\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\b\[system\]/i,
  /\b\[instructions\]/i,
  /<\s*script\s*>/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["'][^"']*["']/i, // onclick=, onerror=, etc
];

const MAX_INPUT_LENGTH = 10000;

/** Tehlikeli pattern tespit ederse true döner. */
export function detectPromptInjection(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length > MAX_INPUT_LENGTH) return true;
  return DANGEROUS_PATTERNS.some((p) => p.test(trimmed));
}

/** Input'u sanitize et; tehlikeli ise null veya kısaltılmış güvenli metin döner. */
export function sanitizeInput(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  let s = text.trim();
  if (s.length > MAX_INPUT_LENGTH) s = s.slice(0, MAX_INPUT_LENGTH);
  if (detectPromptInjection(s)) return null;
  return s;
}
