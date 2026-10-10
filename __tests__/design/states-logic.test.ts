/**
 * QueryState karar mantığı ve tipli onay karşılaştırması.
 * K5 ("hata = boş durum") yapısal olarak kapanmalı.
 */
import { classifyError, defaultIsEmpty, resolveQueryView } from '@/components/states/query-state-logic';
import { matchesConfirmPhrase } from '@/components/states/confirm-phrase';

describe('resolveQueryView', () => {
  it('ilk yüklemede loading', () => {
    expect(resolveQueryView({ isLoading: true })).toEqual({ kind: 'loading' });
    expect(resolveQueryView({ isPending: true })).toEqual({ kind: 'loading' });
  });

  it('devre dışı TanStack sorgusu (isPending + isLoading:false) sonsuz iskelette kalmaz', () => {
    expect(resolveQueryView({ isPending: true, isLoading: false }).kind).toBe('empty');
  });

  it('hata asla boş durum olarak görünmez', () => {
    expect(resolveQueryView({ isError: true, error: new Error('500') })).toEqual({ kind: 'error', errorKind: 'generic' });
    expect(resolveQueryView({ data: [], isError: true, error: new Error('x') }).kind).toBe('error');
  });

  it('veri varken gelen hata veriyi silmez → stale', () => {
    const v = resolveQueryView({ data: [1, 2], isError: true, error: { status: 503 } });
    expect(v).toEqual({ kind: 'ready', stale: true, refreshing: false, staleErrorKind: 'generic' });
  });

  it('boş dizi / boş items → empty; dolu → ready', () => {
    expect(resolveQueryView({ data: [] }).kind).toBe('empty');
    expect(resolveQueryView({ data: { items: [] } }).kind).toBe('empty');
    expect(resolveQueryView({ data: { items: [1] } })).toEqual({ kind: 'ready', stale: false, refreshing: false });
  });

  it('arka plan yenilemesi işaretlenir', () => {
    expect(resolveQueryView({ data: [1], isFetching: true })).toEqual({ kind: 'ready', stale: false, refreshing: true });
  });

  it('özel isEmpty kullanılır', () => {
    expect(resolveQueryView({ data: { total: 0 } }, { isEmpty: (d) => d.total === 0 }).kind).toBe('empty');
  });

  it('çevrimdışıyken hata türü offline', () => {
    expect(resolveQueryView({ isError: true, error: new Error('boom') }, { online: false })).toEqual({ kind: 'error', errorKind: 'offline' });
  });
});

describe('classifyError', () => {
  it.each([
    [{ status: 403 }, 'forbidden'],
    [{ status: 401 }, 'forbidden'],
    [{ status: 404 }, 'notFound'],
    [{ status: 423 }, 'moduleDisabled'],
    [{ code: 'MODULE_DISABLED' }, 'moduleDisabled'],
    [{ cause: { status: 403 } }, 'forbidden'],
    [{ response: { status: 404 } }, 'notFound'],
    [new TypeError('Failed to fetch'), 'offline'],
    [new Error('Internal'), 'generic'],
    [null, 'generic'],
  ])('%p → %s', (err, kind) => {
    expect(classifyError(err)).toBe(kind);
  });
});

describe('defaultIsEmpty', () => {
  it('null/undefined/boş dizi boş; sayı ve dolu nesne dolu', () => {
    expect(defaultIsEmpty(null)).toBe(true);
    expect(defaultIsEmpty(undefined)).toBe(true);
    expect(defaultIsEmpty([])).toBe(true);
    expect(defaultIsEmpty({ rows: [] })).toBe(true);
    expect(defaultIsEmpty(0)).toBe(false);
    expect(defaultIsEmpty({ name: 'x' })).toBe(false);
  });
});

describe('matchesConfirmPhrase (Türkçe duyarlı)', () => {
  it('büyük/küçük harf ve boşluk duyarsız', () => {
    expect(matchesConfirmPhrase('  yaz kampanyası ', 'Yaz Kampanyası')).toBe(true);
    expect(matchesConfirmPhrase('İSTANBUL ŞUBESİ', 'istanbul şubesi')).toBe(true);
  });

  it('noktalı/noktasız i farkı korunur', () => {
    expect(matchesConfirmPhrase('ılık', 'ilik')).toBe(false);
  });

  it('eksik yazım eşleşmez', () => {
    expect(matchesConfirmPhrase('yaz kampanya', 'Yaz Kampanyası')).toBe(false);
  });
});
