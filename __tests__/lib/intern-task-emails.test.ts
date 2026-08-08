/**
 * Stajyer görev maili çekirdeği: şablon normalize (geçersiz atılır) + HTML render
 * (departman rozeti, son teslim kutusu, tracking pixel doğru gömülüyor mu).
 */
jest.mock('@/lib/prisma', () => ({ prisma: { settings: { findUnique: () => Promise.resolve(null) } } }));
jest.mock('@/lib/public-app-origin', () => ({ getPublicAppOrigin: () => 'https://qratex.example' }));

import {
  normalizeInternEmails,
  renderInternTaskEmailHtml,
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
