/**
 * Otomasyon › Otomatik yanıt — saf sözleşme: ayrık birleşim koşul (B1), Türkçe katlamalı
 * eşleşme (B7), eski kayıt uyumu, şablon değişkenleri.
 */
import {
  describeCondition,
  foldForMatch,
  matchReplyCondition,
  parseStoredCondition,
  renderReplyTemplate,
  replyConditionSchema,
  replyRuleBodySchema,
  toStoredCondition,
  unknownTemplateVariables,
} from '@/lib/dealer-automation/reply-rules';
import { matchesAutoReplyCondition } from '@/lib/auto-reply-engine';

jest.mock('@/lib/prisma', () => require('../../helpers/prisma-proxy'));

const fb = (o: Partial<{ rating: number | null; sentiment: string | null; text: string | null }>) => ({
  rating: null,
  sentiment: null,
  text: null,
  ...o,
});

describe('koşul şeması (B1)', () => {
  it('motorun eşleştiremeyeceği kombinasyonları reddeder', () => {
    expect(replyConditionSchema.safeParse({ field: 'text', op: 'lte', value: 'soğuk' }).success).toBe(false);
    expect(replyConditionSchema.safeParse({ field: 'sentiment', op: 'lte', value: '2' }).success).toBe(false);
    expect(replyConditionSchema.safeParse({ field: 'rating', op: 'lte', value: 2.5 }).success).toBe(false);
    expect(replyConditionSchema.safeParse({ field: 'rating', op: 'lte', value: 7 }).success).toBe(false);
    expect(replyConditionSchema.safeParse({ field: 'rating', op: 'gte', value: 4 }).success).toBe(true);
  });

  it('eski bozuk kayıtları null (tetiklenemez) okur; motor onları eşleştirmez', () => {
    expect(parseStoredCondition({ field: 'text', op: 'lte', value: 'kirli' })).toBeNull();
    expect(parseStoredCondition({ field: 'sentiment', op: 'lte', value: '2' })).toBeNull();
    expect(parseStoredCondition({ field: 'text', op: 'contains', value: { a: 1 } })).toBeNull();
    expect(matchesAutoReplyCondition({ field: 'text', op: 'lte', value: 'kirli' }, fb({ text: 'kirli masa' }))).toBe(false);
  });

  it('eski geçerli kayıt (tek değerli metin, "2" dizesi) okunur', () => {
    expect(parseStoredCondition({ field: 'rating', op: 'lte', value: '2' })).toEqual({ field: 'rating', op: 'lte', value: 2 });
    expect(parseStoredCondition({ field: 'text', op: 'contains', value: 'soğuk, geç' })).toEqual({
      field: 'text',
      op: 'contains',
      keywords: ['soğuk', 'geç'],
      wholeWord: false,
    });
  });

  it('yanıt eylemi metinsiz kaydedilemez; AI modunda hata "yedek metin" der', () => {
    const r = replyRuleBodySchema.safeParse({ name: 'X kural', condition: { field: 'rating', op: 'lte', value: 2 }, action: 'reply', template: '', tone: 'formal' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/Yedek metin/);
    const inc = replyRuleBodySchema.safeParse({ name: 'Vaka', condition: { field: 'rating', op: 'eq', value: 1 }, action: 'incident' });
    expect(inc.success).toBe(true);
  });

  it('saklanan metin koşulu eski okuyucular için value da taşır', () => {
    expect(toStoredCondition({ field: 'text', op: 'contains', keywords: ['Soğuk', 'soğuk', 'geç'], wholeWord: true })).toEqual({
      field: 'text',
      op: 'contains',
      value: 'Soğuk, geç',
      keywords: ['Soğuk', 'geç'],
      wholeWord: true,
    });
  });
});

describe('Türkçe eşleşme (B7)', () => {
  it('büyük harf ve aksan farkı yok sayılır', () => {
    expect(foldForMatch('İADE')).toBe('iade');
    expect(foldForMatch('IŞIK')).toBe(foldForMatch('ışık'));
    const c = parseStoredCondition({ field: 'text', op: 'contains', keywords: ['iade', 'ışık'] });
    expect(matchReplyCondition(c, fb({ text: 'PARAMI İADE EDİN' }))).toBe(true);
    expect(matchReplyCondition(c, fb({ text: 'IŞIK çok azdı' }))).toBe(true);
    expect(matchReplyCondition(c, fb({ text: 'her şey yolundaydı' }))).toBe(false);
  });

  it('tam kelime modu "geç" ile "geçti"yi ayırır', () => {
    const sub = parseStoredCondition({ field: 'text', op: 'contains', keywords: ['geç'] });
    const whole = parseStoredCondition({ field: 'text', op: 'contains', keywords: ['geç'], wholeWord: true });
    expect(matchReplyCondition(sub, fb({ text: 'Güzel vakit geçti' }))).toBe(true);
    expect(matchReplyCondition(whole, fb({ text: 'Güzel vakit geçti' }))).toBe(false);
    expect(matchReplyCondition(whole, fb({ text: 'Sipariş çok GEÇ geldi.' }))).toBe(true);
  });

  it('puan koşulu puansız yorumda eşleşmez', () => {
    const c = parseStoredCondition({ field: 'rating', op: 'lte', value: 2 });
    expect(matchReplyCondition(c, fb({ rating: null }))).toBe(false);
    expect(matchReplyCondition(c, fb({ rating: 2 }))).toBe(true);
  });
});

describe('metinler', () => {
  it('okunur cümle', () => {
    expect(describeCondition({ field: 'rating', op: 'lte', value: 2 })).toBe('Puan 2 veya altındaysa');
    expect(describeCondition({ field: 'sentiment', op: 'eq', value: 'negative' })).toBe('Yorumun duygusu olumsuz ise');
    expect(describeCondition(null)).toBe('Geçersiz koşul');
  });

  it('şablon değişkenleri doldurulur', () => {
    expect(renderReplyTemplate('Merhaba {{musteri}}, {{ isletme }} ailesi teşekkür eder ({{puan}}).', { musteri: 'Ayşe Yılmaz', isletme: 'Kafe', puan: 5 })).toBe(
      'Merhaba Ayşe, Kafe ailesi teşekkür eder (5).'
    );
    expect(renderReplyTemplate('Merhaba {{musteri}}', {})).toBe('Merhaba değerli misafirimiz');
    expect(unknownTemplateVariables('{{musteri}} {{indirim}}')).toEqual(['indirim']);
  });
});
