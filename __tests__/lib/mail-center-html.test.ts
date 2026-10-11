/**
 * Gelen kutusu güvenli gövde + yanıt başlıkları (denetim Bulgu 1, 2, 4, 13, 16).
 */
import { createHash } from 'crypto';
import {
  FRAME_HEIGHT_SCRIPT,
  FRAME_HEIGHT_SCRIPT_HASH,
  attachmentDisposition,
  buildMailFrameDocument,
  buildReferences,
  hasRemoteImages,
  mailFrameCsp,
  quoteOriginal,
  renderPersonalReplyHtml,
  scrubMailHtml,
  threadRootOf,
} from '@/lib/mail-center/mail-html';
import { replySubject } from '@/lib/mail-center/inbox-contract';

describe('mailFrameCsp (HTTP başlığı)', () => {
  it("yalnız yükseklik betiğinin özetine izin verir, 'unsafe-inline' betik yok", () => {
    const csp = mailFrameCsp(false);
    expect(csp).toContain(`script-src '${FRAME_HEIGHT_SCRIPT_HASH}'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox');
  });

  it('uzak görseller varsayılan kapalı, istenirse yalnız https açılır', () => {
    expect(mailFrameCsp(false)).toContain('img-src data: cid:;');
    expect(mailFrameCsp(true)).toContain('img-src data: cid: https:');
  });

  it('özet, belgedeki betikle birebir eşleşir', () => {
    const expected = `sha256-${createHash('sha256').update(FRAME_HEIGHT_SCRIPT, 'utf8').digest('base64')}`;
    expect(FRAME_HEIGHT_SCRIPT_HASH).toBe(expected);
    expect(buildMailFrameDocument({ html: '<p>x</p>', text: null })).toContain(`<script>${FRAME_HEIGHT_SCRIPT}</script>`);
  });
});

describe('scrubMailHtml / buildMailFrameDocument', () => {
  it('<header> içeren mailde bile kendi <head> ve <base target=_blank> en başta', () => {
    const doc = buildMailFrameDocument({ html: '<html><body><header><img src="https://saldirgan/p.gif"></header>x</body></html>', text: null });
    expect(doc.indexOf('<base target="_blank">')).toBeLessThan(doc.indexOf('<header>'));
    expect(doc.startsWith('<!DOCTYPE html><html lang="tr"><head>')).toBe(true);
  });

  it('script, meta refresh, base, iframe, form, on* ve javascript: ayıklanır', () => {
    const dirty =
      '<script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://x"><base href="https://x/">' +
      '<iframe src="https://x"></iframe><form action="https://x"><input></form>' +
      '<img src="a.png" onerror="fetch(1)"><a href="javascript:alert(1)">t</a><a href=\'vbscript:x\'>v</a>';
    const out = scrubMailHtml(dirty);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<meta/i);
    expect(out).not.toMatch(/<base/i);
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/vbscript:/i);
  });

  it('düz metin gövde kaçışlanır', () => {
    expect(buildMailFrameDocument({ html: null, text: '<b>x</b>' })).toContain('<pre>&lt;b&gt;x&lt;/b&gt;</pre>');
  });

  it('uzak görsel tespiti', () => {
    expect(hasRemoteImages('<img src="https://a/b.png">')).toBe(true);
    expect(hasRemoteImages('<div style="background:url(https://a/b.png)"></div>')).toBe(true);
    expect(hasRemoteImages('<img src="cid:abc">')).toBe(false);
    expect(hasRemoteImages(null)).toBe(false);
  });
});

describe('yanıt başlıkları (RFC 5322)', () => {
  it('References = ebeveyn References + ebeveyn Message-ID (kök korunur)', () => {
    expect(buildReferences('<root@x> <b@x>', '<c@x>')).toBe('<root@x> <b@x> <c@x>');
    expect(buildReferences(null, '<c@x>')).toBe('<c@x>');
    expect(buildReferences(null, null)).toBeNull();
  });

  it('998 sınırında kök korunur, ortadaki halkalar düşer', () => {
    const many = Array.from({ length: 60 }, (_, i) => `<id-${i}-${'x'.repeat(20)}@ornek.com>`).join(' ');
    const out = buildReferences(many, '<son@x>')!;
    expect(out.length).toBeLessThanOrEqual(998 - 'References: '.length);
    expect(out.startsWith('<id-0-')).toBe(true);
    expect(out.endsWith('<son@x>')).toBe(true);
  });

  it('thread kökü kuralı senkronla aynı', () => {
    expect(threadRootOf('<a@x> <b@x>', '<b@x>', '<c@x>')).toBe('<a@x>');
    expect(threadRootOf(null, '<b@x>', '<c@x>')).toBe('<b@x>');
    expect(threadRootOf(null, null, '<c@x>')).toBe('<c@x>');
  });

  it('konu: "Re: Re:" üretmez, uzun konuyu 200 karaktere kırpar (hata yok)', () => {
    expect(replySubject('Re: Görev')).toBe('Re: Görev');
    expect(replySubject('YNT: Görev')).toBe('YNT: Görev');
    expect(replySubject('Görev')).toBe('Re: Görev');
    expect(replySubject('x'.repeat(400)).length).toBe(200);
    expect(replySubject('')).toBe('Re: (konu yok)');
  });

  it('alıntı ve kişisel yanıt HTML kaçışlanır', () => {
    const q = quoteOriginal({ fromName: 'Ali', fromEmail: 'a@x.com', sentAt: new Date('2026-10-10T10:00:00Z'), text: 'satır1\nsatır2' });
    expect(q).toContain('> satır1');
    expect(q).toContain('Ali <a@x.com>');
    const html = renderPersonalReplyHtml('<b>merhaba</b>', q);
    expect(html).toContain('&lt;b&gt;merhaba&lt;/b&gt;');
    expect(html).toContain('<blockquote');
  });
});

describe('attachmentDisposition (ek sunumu)', () => {
  it('SVG/HTML/XHTML her zaman indirme + octet-stream', () => {
    for (const ct of ['image/svg+xml', 'text/html', 'application/xhtml+xml']) {
      const r = attachmentDisposition(ct, 'kötü.svg');
      expect(r.contentType).toBe('application/octet-stream');
      expect(r.disposition.startsWith('attachment;')).toBe(true);
    }
  });

  it('güvenli önizlenebilir türler inline, Türkçe dosya adı RFC 5987 ile', () => {
    const r = attachmentDisposition('application/pdf', 'Özgeçmiş.pdf');
    expect(r.contentType).toBe('application/pdf');
    expect(r.disposition).toContain('inline;');
    expect(r.disposition).toContain("filename*=UTF-8''%C3%96zge%C3%A7mi%C5%9F.pdf");
  });

  it('başlık enjeksiyonu yok (satır sonu ve tırnak temizlenir)', () => {
    const r = attachmentDisposition('image/png', 'a"\r\nSet-Cookie: x.png');
    expect(r.disposition).not.toMatch(/[\r\n]/);
  });
});

describe('scrubMailHtml — atlatma regresyonu (güvenlik incelemesi)', () => {
  it('iç içe yazımla meta refresh / base / script geri kurulamaz', () => {
    const out = scrubMailHtml(
      '<me<meta>ta http-equiv="refresh" content="0;url=https://evil.example">' +
        '<ba<base>se href="https://evil.example/">' +
        '<scr<script>ipt>alert(1)</scr</script>ipt>' +
        '<ifr<iframe>ame srcdoc="x"></iframe>'
    );
    expect(out).not.toMatch(/<\s*meta/i);
    expect(out).not.toMatch(/<\s*base/i);
    expect(out).not.toMatch(/<\s*script/i);
    expect(out).not.toMatch(/<\s*iframe/i);
  });

  it('target (_top/_parent/_self) ve srcdoc/formaction kaldırılır, linklere rel=noopener eklenir', () => {
    const out = scrubMailHtml(
      '<a href="https://x.example" target="_top">a</a><a target=_self href="https://y">b</a><area target=\'_parent\' href="https://z"><button formaction="https://e">c</button>'
    );
    expect(out).not.toMatch(/target\s*=/i);
    expect(out).not.toMatch(/formaction/i);
    expect(out.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
    expect(out).toContain('<a rel="noopener noreferrer" href="https://x.example"');
  });

  it('a ile başlayan diğer etiketlere (abbr/address) rel eklenmez', () => {
    expect(scrubMailHtml('<abbr>x</abbr><address>y</address>')).toBe('<abbr>x</abbr><address>y</address>');
  });

  it('meta/base içermeyen benzer adlı etiketler (metadata değil, metro) bozulmaz', () => {
    expect(scrubMailHtml('<p>metro <b>base</b></p>')).toBe('<p>metro <b>base</b></p>');
  });
});
