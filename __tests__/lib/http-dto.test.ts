import { maskEmail, pickDto, pickDtoList, publicDisplayName } from '@/lib/http/dto';

describe('pickDto', () => {
  it('yalnız izinli alanları kopyalar', () => {
    const row = { id: '1', name: 'Ali', email: 'ali@x.com', churnRisk: 0.9, internalNote: 'gizli' };
    expect(pickDto(row, ['id', 'name'])).toEqual({ id: '1', name: 'Ali' });
    expect(pickDtoList([row, { ...row, id: '2' }], ['id'])).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('olmayan anahtarı eklemez', () => {
    const row: { id: string; opt?: string } = { id: '1' };
    expect(pickDto(row, ['id', 'opt'])).toEqual({ id: '1' });
  });
});

describe('maskEmail', () => {
  it('yerel kısmı ve alan adını maskeler', () => {
    expect(maskEmail('ali.yilmaz@ornek.com')).toBe('a***z@o***.com');
    expect(maskEmail('ab@x.co')).toBe('a***@x***.co');
    expect(maskEmail('a@localhost')).toBe('a***@l***');
  });
  it('geçersizde ***', () => {
    expect(maskEmail(null)).toBe('***');
    expect(maskEmail('yok')).toBe('***');
    expect(maskEmail('@x.com')).toBe('***');
    expect(maskEmail('a@')).toBe('***');
  });
});

describe('publicDisplayName', () => {
  it('ad + soyadın baş harfi', () => {
    expect(publicDisplayName('Ayşe Nur Yılmaz')).toBe('Ayşe Y.');
    expect(publicDisplayName('  ilker   işık ')).toBe('ilker İ.');
    expect(publicDisplayName('Ayşe')).toBe('Ayşe');
  });
  it('boşta yedek', () => {
    expect(publicDisplayName('')).toBe('Misafir');
    expect(publicDisplayName(null, 'Anonim')).toBe('Anonim');
  });
});
