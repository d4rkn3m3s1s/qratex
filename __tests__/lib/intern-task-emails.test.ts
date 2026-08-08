/**
 * Stajyer görev maili çekirdeği: şablon normalize (geçersiz atılır) + HTML render
 * (departman rozeti, son teslim kutusu, tracking pixel doğru gömülüyor mu).
 */
jest.mock('@/lib/prisma', () => ({ prisma: { settings: { findUnique: () => Promise.resolve(null) } } }));
jest.mock('@/lib/public-app-origin', () => ({ getPublicAppOrigin: () => 'https://qratex.example' }));

import {
  normalizeInternEmails,
  renderInternTaskEmailHtml,
  deadlineIsToday,
  DEFAULT_INTERN_TASK_EMAILS,
  INTERN_TASK_DEADLINE_LABEL,
  type InternTaskEmail,
} from '@/lib/intern-task-emails';

const sample: InternTaskEmail = {
  id: 't1', department: 'Hukuk', recipientName: 'Zerda', email: 'z@x.com',
  subject: 'Konu', body: 'Merhaba Zerda,\n\nİlk paragraf.\n\nİkinci paragraf.',
};

describe('normalizeInternEmails', () => {
  it('geçerli şablonları kabul eder', () => {
    const r = normalizeInternEmails([sample]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('t1');
  });

  it('id/email/subject eksik olanları atar', () => {
    const r = normalizeInternEmails([
      { ...sample },
      { department: 'X', email: 'a@b.com', subject: 'S' }, // id yok
      { id: 'x', subject: 'S' }, // email yok
      { id: 'y', email: 'a@b.com' }, // subject yok
    ]);
    expect(r).toHaveLength(1);
  });

  it('dizi değilse / boşsa varsayılana döner', () => {
    expect(normalizeInternEmails(null)).toBe(DEFAULT_INTERN_TASK_EMAILS);
    expect(normalizeInternEmails([])).toBe(DEFAULT_INTERN_TASK_EMAILS);
    expect(normalizeInternEmails('nope')).toBe(DEFAULT_INTERN_TASK_EMAILS);
  });
});

describe('renderInternTaskEmailHtml', () => {
  it('departman rozeti + son teslim + kişisel hitap içerir', () => {
    const { html, text } = renderInternTaskEmailHtml(sample);
    expect(html).toContain('HUKUK DEPARTMANI');
    expect(html).toContain(INTERN_TASK_DEADLINE_LABEL);
    expect(html).toContain('Zerda');
    expect(html).toContain('İlk paragraf.');
    expect(text).toContain(INTERN_TASK_DEADLINE_LABEL);
  });

  it('token verilince tracking pixel gömer', () => {
    const { html } = renderInternTaskEmailHtml(sample, 'abc123token');
    expect(html).toContain('/api/track/email-open/abc123token');
    expect(html).toContain('width="1" height="1"');
  });

  it('token yoksa pixel gömmez (önizleme)', () => {
    const { html } = renderInternTaskEmailHtml(sample);
    expect(html).not.toContain('/api/track/email-open/');
  });

  it('HTML-escape: gövdedeki < > güvenli', () => {
    const { html } = renderInternTaskEmailHtml({ ...sample, body: 'Test <script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('deadline (şablon-başına son teslim)', () => {
  it('normalize deadline alanını korur ve 60 karaktere kırpar', () => {
    const r = normalizeInternEmails([{ ...sample, deadline: '20 Eylül 12.00' }]);
    expect(r[0].deadline).toBe('20 Eylül 12.00');
    const long = normalizeInternEmails([{ ...sample, deadline: 'x'.repeat(100) }]);
    expect(long[0].deadline?.length).toBe(60);
    const empty = normalizeInternEmails([{ ...sample, deadline: '   ' }]);
    expect(empty[0].deadline).toBeUndefined();
  });

  it('render: şablonun kendi deadline"ı kullanılır (varsayılan değil)', () => {
    const { html, text } = renderInternTaskEmailHtml({ ...sample, deadline: '20 Eylül 12.00' });
    expect(html).toContain('20 Eylül 12.00');
    expect(html).not.toContain(INTERN_TASK_DEADLINE_LABEL);
    expect(text).toContain('20 Eylül 12.00');
  });

  it('render: deadline yoksa varsayılana düşer', () => {
    const { html } = renderInternTaskEmailHtml(sample);
    expect(html).toContain(INTERN_TASK_DEADLINE_LABEL);
  });
});

describe('deadlineIsToday (cron gün eşleşmesi)', () => {
  it('TR ay adıyla bugüne denk gelirse true', () => {
    expect(deadlineIsToday('14 Ağustos 17.00', { day: 14, month: 8 })).toBe(true);
    expect(deadlineIsToday('14 agustos', { day: 14, month: 8 })).toBe(true); // ascii
    expect(deadlineIsToday('1 Ocak', { day: 1, month: 1 })).toBe(true);
    expect(deadlineIsToday('30 Aralık 23.59', { day: 30, month: 12 })).toBe(true);
  });

  it('gün/ay uymuyorsa false', () => {
    expect(deadlineIsToday('14 Ağustos 17.00', { day: 15, month: 8 })).toBe(false);
    expect(deadlineIsToday('14 Ağustos 17.00', { day: 14, month: 9 })).toBe(false);
  });

  it('noktalı/slash sayısal biçimi anlar', () => {
    expect(deadlineIsToday('14.08.2026', { day: 14, month: 8 })).toBe(true);
    expect(deadlineIsToday('3/9 12:00', { day: 3, month: 9 })).toBe(true);
  });

  it('BOŞ/tanımsız deadline → asla true (cron hatırlatması gönderilmez)', () => {
    expect(deadlineIsToday(undefined, { day: 14, month: 8 })).toBe(false);
    expect(deadlineIsToday('', { day: 14, month: 8 })).toBe(false);
    expect(deadlineIsToday('   ', { day: 14, month: 8 })).toBe(false);
  });

  it('tarih içermeyen metinde asla true dönmez', () => {
    expect(deadlineIsToday('yakında', { day: 14, month: 8 })).toBe(false);
    expect(deadlineIsToday('en kısa sürede', { day: 1, month: 1 })).toBe(false);
  });

  it('SAAT kısmını tarih sanmaz (ay adı bulununca sayısal biçim denenmez)', () => {
    // '20 Eylül 11.09' → 20 Eylül; '11.09' saat, 11 Eylül olarak YANLIŞ tetiklenmemeli.
    expect(deadlineIsToday('20 Eylül 11.09', { day: 11, month: 9 })).toBe(false);
    expect(deadlineIsToday('20 Eylül 11.09', { day: 20, month: 9 })).toBe(true);
    // '5 Mart 10.12' → 10 Aralık'ta YANLIŞ tetiklenmemeli.
    expect(deadlineIsToday('5 Mart 10.12', { day: 10, month: 12 })).toBe(false);
    expect(deadlineIsToday('5 Mart 10.12', { day: 5, month: 3 })).toBe(true);
  });
});

describe('DEFAULT şablonları', () => {
  it('13 görev şablonu (id benzersiz + email dolu)', () => {
    expect(DEFAULT_INTERN_TASK_EMAILS.length).toBeGreaterThanOrEqual(13);
    const ids = DEFAULT_INTERN_TASK_EMAILS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of DEFAULT_INTERN_TASK_EMAILS) {
      expect(t.email).toContain('@');
      expect(t.subject.length).toBeGreaterThan(0);
    }
  });
});
