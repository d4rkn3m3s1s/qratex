import { emailLookupFilter, isSameEmail, normalizeEmail, normalizeEmailOrNull } from '@/lib/auth/normalize-email';

describe('normalizeEmail', () => {
  it('kırpar ve küçük harfe çevirir', () => {
    expect(normalizeEmail('  Ali.Yilmaz@Ornek.COM ')).toBe('ali.yilmaz@ornek.com');
  });

  it('tam genişlikli karakterleri NFKC ile katlar', () => {
    const fullWidth = String.fromCharCode(0xff41, 0xff4c, 0xff49) + String.fromCharCode(0xff20) + 'x.com';
    expect(normalizeEmail(fullWidth)).toBe('ali@x.com');
  });

  it('görünmez karakterleri siler', () => {
    const zwsp = String.fromCharCode(0x200b);
    const bom = String.fromCharCode(0xfeff);
    const shy = String.fromCharCode(0x00ad);
    expect(normalizeEmail(`${bom}ali${zwsp}@x${shy}.com`)).toBe('ali@x.com');
  });

  it('Türkçe büyük noktalı İ → i (birleştirici nokta üretmez)', () => {
    expect(normalizeEmail('İLKER@X.COM')).toBe('ilker@x.com');
    expect(normalizeEmail('İLKER@X.COM')).toHaveLength('ilker@x.com'.length);
  });

  it('Gmail nokta/+etiket katlaması yapmaz', () => {
    expect(normalizeEmail('a.b+tag@gmail.com')).toBe('a.b+tag@gmail.com');
  });

  it('string olmayan girdide boş döner', () => {
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(42)).toBe('');
    expect(normalizeEmail({ email: 'x' })).toBe('');
  });
});

describe('normalizeEmailOrNull / isSameEmail / emailLookupFilter', () => {
  it('boşta null', () => {
    expect(normalizeEmailOrNull('   ')).toBeNull();
    expect(normalizeEmailOrNull('A@B.co')).toBe('a@b.co');
  });

  it('büyük-küçük harf ve boşluk farkını aynı sayar; boşları eşit saymaz', () => {
    expect(isSameEmail('Ali@X.com', ' ali@x.com')).toBe(true);
    expect(isSameEmail('ali@x.com', 'veli@x.com')).toBe(false);
    expect(isSameEmail('', '')).toBe(false);
    expect(isSameEmail(undefined, null)).toBe(false);
  });

  it('geçiş dönemi Prisma filtresi', () => {
    expect(emailLookupFilter(' Ali@X.com ')).toEqual({ equals: 'ali@x.com', mode: 'insensitive' });
  });
});
