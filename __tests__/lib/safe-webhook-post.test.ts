import { isPrivateIp, safeLookup, safeWebhookPost } from '@/lib/safe-webhook-post';

describe('safe-webhook-post SSRF', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1'])(
    'özel %s reddedilir', (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700::1111'])('genel %s izinli', (ip) => expect(isPrivateIp(ip)).toBe(false));

  it('localhost DNS çözümü reddedilir', (done) => {
    safeLookup('localhost', {}, (err) => { expect(err?.code).toBe('ESSRF'); done(); });
  });

  it.each(['http://example.com/x', 'https://127.0.0.1/', 'https://169.254.169.254/latest', 'https://[::1]/', 'https://localhost/', 'https://u:p@example.com/'])(
    '%s ağ isteği olmadan reddedilir', async (u) => {
      await expect(safeWebhookPost(u, '{}', {})).rejects.toThrow(/SSRF/);
    });
});
