/**
 * Davet paylaşımı (denetim #9/#10): iptal edilen paylaşım "kopyalandı" demez, geri dönüş
 * BAĞLANTIYI kopyalar, kopyalama gerçekten başarısızsa `failed` döner. Kademe yolu dolumu.
 */
import { buildInviteUrl, buildWhatsAppUrl, copyText, shareInvite, spellCode } from '@/components/customer/m-davet/share';
import { fillPercent } from '@/components/customer/m-davet/milestone-path';

const data = { title: 'Davet', text: 'Katıl', url: 'https://qratex.com/auth/register?ref=ABCD2345' };

describe('shareInvite', () => {
  it('Web Share başarılı → shared, panoya dokunmaz', async () => {
    const writeText = jest.fn();
    expect(await shareInvite(data, { share: jest.fn(async () => {}), writeText })).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('kullanıcı iptal etti (AbortError) → cancelled, "kopyalandı" yok', async () => {
    const writeText = jest.fn();
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    expect(await shareInvite(data, { share: jest.fn(async () => Promise.reject(abort)), writeText })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('Web Share yok → BAĞLANTI kopyalanır (kod değil)', async () => {
    const writeText = jest.fn(async () => {});
    expect(await shareInvite(data, { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it('pano izni reddi + yedek başarısız → failed (yanıltıcı başarı yok)', async () => {
    expect(
      await shareInvite(data, { writeText: jest.fn(async () => Promise.reject(new Error('denied'))), legacyCopy: () => false })
    ).toBe('failed');
  });

  it('pano reddinde execCommand yedeği denenir', async () => {
    const legacy = jest.fn(() => true);
    expect(await copyText('ABCD2345', { writeText: jest.fn(async () => Promise.reject(new Error('x'))), legacyCopy: legacy })).toBe(true);
    expect(legacy).toHaveBeenCalledWith('ABCD2345');
  });
});

describe('bağlantı yardımcıları', () => {
  it('kayıt bağlantısı ?ref= ile', () => {
    expect(buildInviteUrl('https://qratex.com/', 'AB CD')).toBe('https://qratex.com/auth/register?ref=AB%20CD');
    expect(buildWhatsAppUrl('Katıl', 'https://x.y/z')).toBe(`https://wa.me/?text=${encodeURIComponent('Katıl https://x.y/z')}`);
    expect(spellCode('7KQ2')).toBe('7 K Q 2');
  });
});

describe('fillPercent (kademe yolu)', () => {
  const stops = [3, 5, 10, 25];
  it('duraklar sütun ortalarında: 3 → %12,5, 5 → %37,5, 25 → %100', () => {
    expect(fillPercent(0, stops)).toBe(0);
    expect(fillPercent(3, stops)).toBeCloseTo(37.5 - 25, 5);
    expect(fillPercent(5, stops)).toBeCloseTo(37.5, 5);
    expect(fillPercent(4, stops)).toBeCloseTo(25, 5);
    expect(fillPercent(25, stops)).toBe(100);
    expect(fillPercent(40, stops)).toBe(100);
  });
});
