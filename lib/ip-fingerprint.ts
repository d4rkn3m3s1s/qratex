import { createHash } from 'crypto';

const DEFAULT_PEPPER = 'qratex-qra-chat-fp-v1';

/**
 * Ham IP depolanmaz; hız sınırı ve kaba korelasyon için tek yönlü parmak izi.
 * Üretimde `CHAT_IP_FINGERPRINT_PEPPER` ile özelleştirin.
 */
export function fingerprintChatIp(ip: string): string {
  const pepper = process.env.CHAT_IP_FINGERPRINT_PEPPER || DEFAULT_PEPPER;
  return createHash('sha256')
    .update(`${pepper}:${ip}`)
    .digest('hex')
    .slice(0, 32);
}
