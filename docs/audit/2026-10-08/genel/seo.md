# SEO denetimi (genel)

## Kontrol edilenler (temiz)
- `app/sitemap.ts`: tüm public rotalar (/, /guven, /neden-qratex, /blog + tekil yazılar, 4 yasal metin, /auth/login, /auth/register), yayındaki CMS sayfaları (noindex hariç), admin ek URL'leri; lastModified içerik tarihinden. `sitemapEnabled` admin ayarı sitemap'i ve robots'taki Sitemap satırını sürüyor.
- Paylaşım/token sayfaları (/experience, /surveys, /feedback, /c, /wall, /table-signal, /bakim, /offline, /lab) ve not-found: `noindex` mevcut.
- /auth/login ve /auth/register bilinçli indekslenebilir; diğer /auth/* noindex + robots kapalı — tutarlı.
- Her public sayfada metadata/generateMetadata var; blog yazısında canonical + OG.

## Bulgular ve düzeltmeler
1. **Panel layout'larında noindex yoktu** (admin/dealer/customer/staff). Admin robots listesini özelleştirirse paneller taranabilir hale geliyordu. Düzeltme: dört layout'un `generateMetadata`'sına `robots: { index: false, follow: false }`.
2. **Varsayılan robots Disallow `/staff/` ve `/api/` içermiyordu.** Düzeltme: `DEFAULT_DISALLOW` (lib/admin-seo/contract.ts) ve `lib/seo-settings.ts` varsayılanı genişletildi; `app/robots.ts` artık kopyayı değil `DEFAULT_DISALLOW`'u kullanıyor (admin önizlemesi ile gerçek çıktı aynı kaynaktan).
   - `/admin-gate` bilerek EKLENMEDİ: robots.txt herkese açık, kapı kamuflajını ifşa ederdi.

## Kalan (bu turda yapılmadı)
- JSON-LD (Organization/WebSite/BreadcrumbList/BlogPosting) kapsamının sayfa sayfa doğrulanması, hreflang, blog görsel alt/başlık hiyerarşisi taraması — tarayıcı yükü nedeniyle yalnız kod düzeyinde örneklendi.
- Canlı DB'de kayıtlı özel `robotsDisallow` listesi varsa yeni varsayılanlar ona uygulanmaz; admin /admin/seo'dan `/staff/` ve `/api/` eklemeli (panel noindex yine de korur).
