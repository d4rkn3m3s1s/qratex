/**
 * guvenlik-admin-api B12 — SVG etkin içerik denetimi (kara liste atlatma vektörleri).
 */
jest.mock('sharp', () => jest.fn());

import { assetContentDisposition, svgContainsScript } from '@/lib/media-validation';

const svg = (inner: string, attrs = '') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${inner}</svg>`);

describe('svgContainsScript', () => {
  it('temiz rozet SVG\'si (gradyan, belge içi use, veri görseli) kabul edilir', () => {
    const ok = svg(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
        '<circle cx="5" cy="5" r="4" fill="url(#g)" style="fill: url(#g)"/>' +
        '<use href="#g"/><image xlink:href="data:image/png;base64,iVBORw0KGgo="/>' +
        '<text>Rozet &amp; ödül</text>',
      'viewBox="0 0 10 10" version="1.1"'
    );
    expect(svgContainsScript(ok)).toBe(false);
  });

  it.each([
    ['script', '<script>alert(1)</script>'],
    ['olay özniteliği', '<rect onload="alert(1)"/>'],
    ['büyük harfli olay', '<rect ONCLICK = "x()"/>'],
    ['javascript: bağlantı', '<a href="javascript:alert(1)"><rect/></a>'],
    ['varlık kodlamalı javascript', '<a href="javascript&#58;alert(1)"><rect/></a>'],
    ['onaltılık varlık', '<a href="&#x6A;avascript:alert(1)"><rect/></a>'],
    ['foreignObject içinde HTML', '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject>'],
    ['harici href', '<use href="https://evil.example/x.svg#a"/>'],
    ['tırnaksız harici href', '<use href=https://evil.example/x.svg#a />'],
    ['harici xlink:href görsel', '<image xlink:href="https://evil.example/track.png"/>'],
    ['animate ile href değiştirme', '<a><animate attributeName="href" values="javascript:alert(1)"/><rect/></a>'],
    ['set ile xlink:href', '<a><set attributeName="xlink:href" to="x"/></a>'],
    ['iframe', '<iframe src="https://evil.example"/>'],
    ['CSS @import', '<style>@import url(https://evil.example/a.css);</style>'],
    ['CSS harici url()', '<rect style="fill:url(https://evil.example/a.svg#g)"/>'],
    ['data:text/html', '<a href="data:text/html,<script>alert(1)</script>"><rect/></a>'],
  ])('reddedilir: %s', (_name, inner) => {
    expect(svgContainsScript(svg(inner))).toBe(true);
  });

  it('DOCTYPE / ENTITY genişletmesi reddedilir', () => {
    const b = Buffer.from('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "javascript:alert(1)">]><svg><a href="&x;"/></svg>');
    expect(svgContainsScript(b)).toBe(true);
  });
});

describe('assetContentDisposition', () => {
  it('SVG doğrudan açılışta belge olarak çalışmasın diye attachment; PNG inline (varsayılan)', () => {
    expect(assetContentDisposition('image/svg+xml', 'rozet "x".svg')).toBe('attachment; filename="rozet__x_.svg"');
    expect(assetContentDisposition('image/png', 'a.png')).toBeUndefined();
  });
});
