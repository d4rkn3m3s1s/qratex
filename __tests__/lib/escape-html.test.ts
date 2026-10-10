import { escapeEmailHtml, escapeEmailText, escapeHtml, safeHref, safeUrl } from '@/lib/security/escape-html';

describe('escapeHtml', () => {
  it('beş tehlikeli karakteri kaçırır', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('null/undefined/nesne → boş; sayı/boolean metne', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml({ toString: () => '<b>' })).toBe('');
    expect(escapeHtml(4.5)).toBe('4.5');
    expect(escapeHtml(true)).toBe('true');
  });

  it('Türkçe karakterlere dokunmaz', () => {
    expect(escapeHtml('Çağrı Şükür Ğıö')).toBe('Çağrı Şükür Ğıö');
  });
});

describe('escapeEmailHtml', () => {
  it('kaçış + kontrol karakteri temizliği; tek tırnağı da kaçırır', () => {
    expect(escapeEmailHtml(`Kafe'm <script>\u0007`)).toBe('Kafe&#39;m &lt;script&gt;');
  });
  it('satır sonu ve sekmeyi korur', () => {
    expect(escapeEmailHtml('a\nb\tc')).toBe('a\nb\tc');
  });
});

describe('escapeEmailText', () => {
  it('bayi adındaki alan adı ve e-posta otomatik bağlantıya dönüşmez', () => {
    const out = escapeEmailText('Ödeme için qratex-destek.com veya odeme@evil.com https://evil.com');
    expect(out).not.toMatch(/qratex-destek\.com/);
    expect(out).toContain('qratex-destek.&#8203;com');
    expect(out).toContain('@&#8203;evil');
    expect(out).toContain('https:&#8203;//');
  });

  it('HTML enjeksiyonunu engeller', () => {
    const out = escapeEmailText('<a href="https://evil.com">Tıkla</a>');
    expect(out).not.toContain('<a');
    expect(out).toContain('&lt;a href=&quot;');
  });

  it('nl2br ve kırpma seçenekleri', () => {
    expect(escapeEmailText('a\nb', { nl2br: true, breakAutolinks: false })).toBe('a<br>b');
    expect(escapeEmailText('abcdef', { maxLength: 3, breakAutolinks: false })).toBe('abc…');
  });
});

describe('safeUrl / safeHref', () => {
  it('yalnız http/https', () => {
    expect(safeUrl('https://qratex.com/a?b=1')).toBe('https://qratex.com/a?b=1');
    expect(safeUrl('http://qratex.com')).toBe('http://qratex.com/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeUrl('vbscript:x')).toBeNull();
    expect(safeUrl('file:///etc/passwd')).toBeNull();
  });

  it('kimlik bilgili, kontrol karakterli, ters bölülü ve göreli girdileri reddeder', () => {
    expect(safeUrl('https://qratex.com@evil.com/')).toBeNull();
    expect(safeUrl('java\tscript:alert(1)')).toBeNull();
    expect(safeUrl('https://evil.com\\@qratex.com')).toBeNull();
    expect(safeUrl('/customer')).toBeNull();
    expect(safeUrl('//evil.com')).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });

  it('taban verilirse göreli yolu çözer; protokol-göreliyi yine reddeder', () => {
    expect(safeUrl('/customer', { base: 'https://app.qratex.com' })).toBe('https://app.qratex.com/customer');
    expect(safeUrl('//evil.com', { base: 'https://app.qratex.com' })).toBeNull();
  });

  it('mailto yalnız açıkça izin verilirse', () => {
    expect(safeUrl('mailto:destek@qratex.com')).toBeNull();
    expect(safeUrl('mailto:destek@qratex.com', { allowMailto: true })).toBe('mailto:destek@qratex.com');
    expect(safeUrl('mailto:x', { allowMailto: true })).toBeNull();
  });

  it('safeHref kaçışlı ve yedekli', () => {
    expect(safeHref('https://qratex.com/?a=1&b="2"')).toBe('https://qratex.com/?a=1&amp;b=%222%22');
    expect(safeHref('javascript:alert(1)', 'https://qratex.com')).toBe('https://qratex.com');
    expect(safeHref('javascript:alert(1)')).toBe('#');
  });
});
