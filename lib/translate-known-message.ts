/**
 * API and Zod errors can use dot-path keys (`auth.*`, `validation.*`) so the client
 * can render them with useAppT. Legacy plain-text errors pass through unchanged.
 */
export function translateKnownMessageKey(t: (key: string) => string, message: string | undefined): string {
  if (!message) return '';
  if (message.startsWith('validation.') || message.startsWith('auth.')) {
    return t(message);
  }
  return message;
}
