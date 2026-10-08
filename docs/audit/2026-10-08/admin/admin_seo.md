# /admin/seo

**Amaç:** Platformun genel SEO yapılandırmasını (meta başlık/açıklama, Open Graph/Twitter, Schema.org JSON-LD, robots, sitemap, sayfa bazlı override) tek bir `Settings` satırında (`key = 'seo'`) yönetmek; canlı "SEO Health" kontrolü, JSON dışa/içe aktarma ve audit-log tabanlı geri alma sunmak.

**Genel puan: 5/10** · **Karar: yeniden tasarla** (backend iskeleti — tek satır JSON + audit + `unstable_cache` etiketi — korunabilir; ancak formun veri doğrulaması, kontrollü girdi hataları, tehlikeli ayarların korumasızlığı ve bilgi mimarisi yeniden ele alınmalı.)

Dosyalar: `app/admin/seo/page.tsx` (798 satır, tek istemci bileşeni), `app/api/admin/seo/route.ts`, `app/api/admin/seo/audit/route.ts`, `app/api/admin/seo/health/route.ts`, `app/api/admin/seo/rollback/route.ts`, `lib/seo-settings.ts`, `lib/validations-admin.ts:61-76`. Tüketiciler: `app/layout.tsx`, `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `app/(public)/page.tsx`, `app/(public)/{guven,kullanim-sartlari,gizlilik-politikasi,kvkk-aydinlatma-metni,cerez-politikasi}/page.tsx`, tüm panel layout'ları (`siteName`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Kaydet/health/rollback uçtan uca bağlı ve gerçek; fakat boş Site URL tüm siteyi düşürüyor, anahtar kelime/disallow alanları yazarken bozuluyor, boş override ana sayfa meta'sını siliyor. |
| UX | 4/10 | Uzun tek sayfa, Kaydet butonu ikincil butonların arasında ve sabit değil; kirli-durum/onay/diff yok; en tehlikeli ayar (noindex) tek tıkla ve uyarısız. |
| Görsel | 5/10 | shadcn kartları temiz ama hiyerarşi yok: health, önizleme ve araç kartları editörün üstünde aynı ağırlıkta; Google önizlemesi gerçek SERP düzenini yanlış yansıtıyor. |
| Mimari | 5/10 | Tek JSON satırı + audit iyi fikir; ancak sunucu tarafı tip doğrulaması gevşek (`z.record(z.unknown())` + `typeof string` geçişi), iyimser kilit yok, `revalidateTag(..., 'max')` okuma-sonrası-yazma tutarlılığı vermiyor. |
| Performans | 7/10 | Tek GET, önbellekli okuma; audit ucu kullanılmayan 30 tam `oldData/newData` JSON'u gönderiyor, rate-limit bellek-içi. |
| Erişilebilirlik + Mobil | 4/10 | `Label`'lar `htmlFor` ile bağlı değil, override/sitemap girdilerinin yalnız placeholder'ı var, Switch'ler etiketsiz; mobilde satırlar sarılıyor ama sabit kaydet çubuğu yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (PageHeader "SEO Motoru") | ÇALIŞIYOR | page.tsx:220-223 | Başlık/açıklama sabit TR, i18n'e bağlı değil. |
| 2 | Yükleniyor durumu | ÇALIŞIYOR | page.tsx:206-213 | `InlineLoadingStatus` + `useAppT` (sayfadaki tek i18n kullanımı). |
| 3 | Hata durumu (GET başarısız) | BOZUK | page.tsx:79-88, 206 | `r.json()` öncesi `res.ok` kontrolü yok; 429/500'de `data.global` yok → `payload=null`, `loading=false` → `if (loading \|\| !payload)` sonsuza kadar spinner; toast da çıkmaz (JSON parse başarılı). |
| 4 | Yetki kontrolü | KISMİ | route.ts (`requireAuth(['ADMIN'])`), proxy.ts:79-87, proxy.ts:105-118 | Sayfa ADMIN + gizli kapı çerezi ister; `/api/admin/seo*` uçları yalnız rol kontrolü yapar, gate çerezini kontrol etmez (sistem genelinde). |
| 5 | "Siteyi aç" butonu | ÇALIŞIYOR | page.tsx:225-232 | Kaydedilmemiş `g.siteUrl` değerini kullanır. |
| 6 | Dışa aktar (JSON) | ÇALIŞIYOR | page.tsx:161-170 | Kaydedilmemiş yerel durumu dışa aktarır; bunu belirtmez. |
| 7 | İçe aktar (JSON) | KISMİ | page.tsx:172-197 | Yalnız `parsed.global` varlığına bakar; alan tipleri doğrulanmaz, boyut sınırı yok, önizleme/diff yok. Bkz. Bulgu 6. |
| 8 | Kaydet | KISMİ | page.tsx:90-108, route.ts PUT | Çalışır ve audit yazar; ama kirli-durum göstergesi, iyimser kilit, alan bazlı hata gösterimi yok. |
| 9 | "SEO Health" butonu | ÇALIŞIYOR | page.tsx:127-142, 245-248 | `no-store` ile çağırır. |
| 10 | Canlı SEO Health skoru | KISMİ | health/route.ts:40-140 | 7 kontrol eşit ağırlıklı; `robotsIndex=false` (siteyi Google'dan silen ayar) kontrol edilmiyor; OG görselinin erişilebilirliği/boyutu, canonical, kaydedilmemiş form durumu değerlendirilmiyor. |
| 11 | Son kontrol zamanı + hata sayısı | ÇALIŞIYOR | page.tsx:267-271 | Sonuç kalıcı değil; sayfa yenilenince kaybolur. |
| 12 | "Sadece hatalar" filtresi | ÇALIŞIYOR | page.tsx:216, 272-282 | |
| 13 | Kontrol satırları + önem rozeti | KISMİ | page.tsx:283-310 | Rozet ham İngilizce (`critical/warning/info`), sonuç "OK/Hata"; düzeltme bağlantısı (ilgili alana atla) yok. |
| 14 | Health boş durumu | ÇALIŞIYOR | page.tsx:311-313 | |
| 15 | Google arama önizlemesi | KISMİ | page.tsx:317-336 | Düzen Google'ın tersine (URL büyük mavi, başlık `text-primary`); karakter bazlı kırpma (piksel değil); sayfa override'ları önizlenemiyor; `cursor-pointer hover:underline` sahte link hissi. |
| 16 | Google Rich Results Test linki | KISMİ | page.tsx:344-349 | URL önden doldurulmuyor (`?url=` parametresi kullanılmıyor). |
| 17 | Facebook Paylaşım Debugger linki | ÇALIŞIYOR | page.tsx:350-355 | `q=` ile önden dolu. |
| 18 | Twitter Kart Validator linki | BOZUK | page.tsx:356-361 | `cards-dev.twitter.com/validator` X tarafından önizleme işlevi kaldırılmış eski araç; kullanıcıyı işe yaramaz sayfaya yollar. |
| 19 | Sekmeler (Genel / JSON-LD / Robots & Sitemap / Sayfa Override) | ÇALIŞIYOR | page.tsx:365-383 | Seçili sekme URL'de tutulmuyor. |
| 20 | Varsayılan başlık | ÇALIŞIYOR | page.tsx:396-401 → app/layout.tsx | Karakter sayacı yok (health 10 karakter alt sınırı uyguluyor ama form göstermiyor). |
| 21 | Site adı | ÇALIŞIYOR | page.tsx:404-409 | Tüm panel layout'larında `applicationName`/sidebar'da da kullanılıyor — etki alanı belirtilmiyor. |
| 22 | Varsayılan meta description | ÇALIŞIYOR | page.tsx:413-419 | Sayaç yok; placeholder "160 karakter civarı" diyor, health 70-170 kontrol ediyor. |
| 23 | Site URL | BOZUK | page.tsx:423-428; route.ts:94-99; lib/seo-settings.ts:102; app/layout.tsx:49,65 | Boş bırakılıp kaydedilirse doğrulamayı geçer ve kök layout'ta `new URL('')` atar → tüm site (admin dahil) çöker. Bkz. Bulgu 1. |
| 24 | Canonical base | ÇALIŞIYOR | page.tsx:431-436; route.ts:97 | Sonda `/` normalize edilmiyor → `//sitemap.xml` riski (app/robots.ts:23). |
| 25 | OG / Twitter görsel URL | KISMİ | page.tsx:440-446; app/layout.tsx; app/opengraph-image.tsx | Kök segmentte dosya tabanlı `opengraph-image.tsx` var; Next.js'te dosya tabanlı metadata config tabanlıyı ezer → ayarın ana sayfada etkisi şüpheli (çalışma zamanında doğrulanmadı). |
| 26 | OG genişlik / yükseklik | KISMİ | page.tsx:449-463 | `Number(v) \|\| 1200` → alanı silince anında 1200'e döner, serbest yazım zor; görselin gerçek boyutuyla karşılaştırma yok. |
| 27 | Twitter kullanıcı adı | ÇALIŞIYOR | page.tsx:467-472 | `@` biçim doğrulaması yok. |
| 28 | Twitter kart tipi | ÇALIŞIYOR | page.tsx:475-488 | Sunucu enum doğrulamıyor (route.ts:82-84). |
| 29 | Locale | KISMİ | page.tsx:491-496 | Serbest metin, `xx_XX` doğrulaması yok; `<html lang>`/hreflang ile ilişki gösterilmiyor. |
| 30 | Anahtar kelimeler | BOZUK | page.tsx:500-506 | Her tuşta split+trim+filter+join: sona yazılan virgül ve boşluk anında silinir → "QR kod" gibi çok kelimeli ya da ikinci bir anahtar kelime yazılamaz (yalnız yapıştırarak). Bkz. Bulgu 3. |
| 31 | Organization adı | ÇALIŞIYOR | page.tsx:525-529 → app/(public)/page.tsx:40 | |
| 32 | Organization açıklaması | ÇALIŞIYOR | page.tsx:532-537 → app/(public)/page.tsx:43 | |
| 33 | WebSite açıklaması | ÇALIŞIYOR | page.tsx:540-545 → app/(public)/page.tsx:50 | JSON-LD önizlemesi/doğrulaması yok; logo, sameAs, contactPoint gibi alanlar yok. |
| 34 | İndekslemeye izin ver (index) | ÇALIŞIYOR | page.tsx:560-569 → app/layout.tsx robots | Tek tıkla tüm siteyi noindex yapar; onay, uyarı, health kontrolü yok. Bkz. Bulgu 4. |
| 35 | Link takibi (follow) | ÇALIŞIYOR | page.tsx:570-578 | Açıklama metni yok. |
| 36 | Ek disallow yolları | BOZUK | page.tsx:579-591 | Aynı kontrollü-girdi hatası: satır sonunda Enter'a basınca boş satır anında silinir → yeni yol yazılamaz. Liste boşaltılırsa robots.ts:20 sessizce varsayılana döner (UI bunu göstermez). |
| 37 | Sitemap etkin | ÇALIŞIYOR | page.tsx:600-609 → app/sitemap.ts:9, robots.ts:23 | |
| 38 | Sitemap ek URL satırları (url / priority / changeFrequency / lastmod) | KISMİ | page.tsx:613-675; route.ts:66-76; app/sitemap.ts:99-107 | Sunucu `priority` aralığı, `changeFrequency` enum'u, `lastModified` tarih geçerliliği doğrulamıyor; geçersiz tarih `new Date('...')` → sitemap üretiminde hata riski (yalnız içe aktarma/API yoluyla). Varsayılan girdilerle çakışma/tekrar denetimi yok; varsayılan 10 URL UI'da görünmüyor. |
| 39 | URL ekle / Sil (sitemap) | ÇALIŞIYOR | page.tsx:673, 676 | `size="icon"` butonda "Sil" metni — kare buton içine metin. |
| 40 | Yinelenen path uyarısı | KISMİ | page.tsx:199-204, 683-690 | Uyarır ama kaydı engellemez; sunucu tekilleştirmez; `getPageSeo` ilk eşleşeni alır (lib/seo-settings.ts:142). Baştaki `/` normalize edilmiyor ("guven" ≠ "/guven"). |
| 41 | Sayfa bazlı override satırları | KISMİ | page.tsx:691-760; lib/seo-settings.ts:139-143 | Yalnız 6 sayfa okur (`/`, `/guven`, `/kullanim-sartlari`, `/gizlilik-politikasi`, `/kvkk-aydinlatma-metni`, `/cerez-politikasi`); `/blog`, `/neden-qratex` vb. sessizce yok sayılır. Boş path `/`'a eşlenir, boş title/description meta'yı boşaltır. Bkz. Bulgu 2. Açıklama metinleri çelişkili ("ileride kullanılacak" vs "kullanır", page.tsx:695 ve 700). |
| 42 | Override canonical alanı | EKSİK | lib/seo-settings.ts:75; app/(public)/page.tsx:16 | Tip ve tüketici destekliyor, UI'da girdi yok. |
| 43 | Satır ekle / Sil (override) | ÇALIŞIYOR | page.tsx:735-757 | `key={i}` (index) — silmede odak/kontrollü girdi kayması riski. |
| 44 | Geçmiş (Audit) listesi | KISMİ | page.tsx:118-125, 764-795; audit/route.ts | Otomatik yüklenmez; yüklenmeden önce "Denetim kaydı yok." gösterir (yanıltıcı); eylem ham İngilizce (`update/create/rollback`); fark (diff) gösterilmez, oysa uç 30 kaydın tam `oldData/newData`'sını döndürür. |
| 45 | "Bu sürüme dön" (rollback) | KISMİ | page.tsx:144-159, 785-787; rollback/route.ts:47-70 | Onay yok; aslında kaydın **önceki** (`oldData`) durumuna döner — etiket "bu sürüm" diyor; `create` kaydında `oldData` null → 404; kaydedilmemiş yerel düzenlemeleri sessizce ezer. |
| 46 | Audit log yazımı (PUT + rollback) | ÇALIŞIYOR | route.ts:171-182; rollback/route.ts:72-83 | IP/UA meta dahil. |
| 47 | Rate limit | KISMİ | lib/rate-limit.ts:12, 279-298 | Bellek-içi `Map` → serverless örnekleri arasında paylaşılmaz; health ve audit uçlarında hiç yok. |
| 48 | Önbellek geçersizleştirme | KISMİ | route.ts:184; rollback/route.ts:85; lib/seo-settings.ts:118 | `revalidateTag(tag, 'max')` (Next 16) stale-while-revalidate anlamı taşır: kayıttan hemen sonraki ilk okuma eskiyi görebilir (çalışma zamanında doğrulanmadı). |
| 49 | Kaydedilmemiş değişiklik uyarısı / kirli durum | EKSİK | page.tsx (yok) | `beforeunload` veya "değişiklikler kaydedilmedi" çubuğu yok. |
| 50 | Mobil düzen | KISMİ | page.tsx:224, 366, 614, 704 | Satırlar `flex-wrap` ile sarılıyor; ancak Kaydet sabit değil, 798 satırlık sayfada en üstte kalıyor. |
| 51 | Form erişilebilirliği | KISMİ | page.tsx:396-509 vb. | `Label`'larda `htmlFor`, girdilerde `id` yok; override/sitemap girdileri yalnız placeholder'lı; Switch'ler etiketlenmemiş. |
| 52 | Dil tutarlılığı / i18n | KISMİ | page.tsx:247, 300, 306, 484-485, 652-658 | "SEO Health", "OK", `critical`, "Summary Large Image", `always/hourly…` İngilizce; metinler `useAppT` yerine sabit. |

**Durum özeti:** ÇALIŞIYOR 25 · KISMİ 20 · BOZUK 5 · SAHTE 0 · EKSİK 2 (toplam 52).

---

## Bulgular

### 1. Boş "Site URL" kaydedilince tüm site (admin paneli dahil) çöker
- **Önem:** kritik · **Kategori:** hata / veri bütünlüğü · **Efor:** S
- **Kanıt:** `app/api/admin/seo/route.ts:94-99` (`if (g.siteUrl && !isValidUrl(...))` — boş string doğrulamayı atlar), `route.ts:82-84` (string olduğu için `''` saklanır), `lib/seo-settings.ts:102` (`globalSource.siteUrl ?? defaults.siteUrl` — `??` boş string'i yakalamaz), `app/layout.tsx:49` (`seo.canonicalBase || seo.siteUrl` → `''`), `app/layout.tsx:65` (`metadataBase: new URL(base)` → `TypeError: Invalid URL`).
- **Sorun:** Admin "Site URL" alanını temizleyip Kaydet'e basarsa sunucu kabul eder. Kök `generateMetadata` try/catch içermediği için **her** rota (public, panel, `/admin/seo` dahil) metadata üretiminde hata verir. Ayar ancak doğrudan DB müdahalesiyle düzeltilebilir — UI'dan geri almak imkânsız hale gelir. Ayrıca `robots.ts:23` ve `sitemap.ts` göreli URL üretir.
- **Profesyonel öneri:** (a) `adminSeoPutSchema`'yı `z.record(z.unknown())` yerine tam tipli bir Zod şemasına çevir: `siteUrl: z.string().url().refine(u => /^https:\/\//.test(u))` zorunlu, `canonicalBase: z.union([z.literal(''), z.string().url()])`, sonda `/` normalize edilmiş. (b) `loadSeoSettingsRow` içinde `siteUrl: globalSource.siteUrl?.trim() || defaults.siteUrl` ile savunmacı geri dönüş. (c) `app/layout.tsx` içindeki `new URL(base)` çağrısını güvenli bir `safeUrl(base, siteUrlFromEnv)` yardımcısına sar — build-time DB fail-safe ilkesiyle aynı çizgide. (d) İstemcide alan bazlı hata gösterimi (Bulgu 9).

### 2. Boş/yarım sayfa override'ı ana sayfanın ve yasal sayfaların meta'sını siler
- **Önem:** yüksek · **Kategori:** hata / SEO veri bütünlüğü · **Efor:** S
- **Kanıt:** `page.tsx:747-756` ("Satır ekle" `{path:'', title:'', description:''}` ekler), `route.ts:153-158` (yalnız tip kontrolü; boş değerler kabul), `lib/seo-settings.ts:141-142` (`p.path.replace(/\/$/, '') || '/'` → boş path `/` olur), `app/(public)/page.tsx:14-15` ve `app/(public)/guven/page.tsx:15-16` (`override?.title ?? ...` — `??` boş string'i geçirir).
- **Sorun:** Admin "Satır ekle"ye basıp doldurmadan kaydederse boş satır ana sayfa (`/`) override'ı olur → ana sayfanın `<title>` ve `meta description`'ı boş string'e düşer. Aynı şekilde `/guven` için yalnız başlık girip açıklamayı boş bırakmak sayfanın açıklamasını siler. Hata hiçbir yerde görünmez; health kontrolü override'lara bakmaz.
- **Profesyonel öneri:** Sunucuda override şeması: `path: z.string().regex(/^\/[a-z0-9\-\/]*$/)` zorunlu ve desteklenen yollar kümesine karşı doğrulanmış; `title/description` opsiyonel ama boşsa alan **hiç yazılmamalı** (`undefined`). Tüketicilerde `override?.title || fallback` kullan (merkezî bir `resolvePageMeta(path, fallback)` yardımcısıyla 6 sayfadaki tekrar kaldırılmalı). UI'da path için serbest metin yerine "desteklenen sayfalar" açılır listesi (route registry'den) kullan.

### 3. Anahtar kelime ve disallow alanları yazarken bozuluyor (kontrollü girdi hatası)
- **Önem:** yüksek · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `page.tsx:500-506` (`value={g.keywords.join(', ')}`, `onChange` → `split(/[,\n]/).map(trim).filter(Boolean)`), `page.tsx:581-586` (`value={g.robotsDisallow.join('\n')}`, `onChange` → `split('\n').map(trim).filter(Boolean)`).
- **Sorun:** Her tuş vuruşunda metin diziye çevrilip tekrar birleştiriliyor. Sonuç: "QR " yazınca sondaki boşluk silinir ("QR kod" yazılamaz), "abc," yazınca virgül silinir (ikinci kelime eklenemez), disallow alanında satır sonunda Enter'a basınca yeni satır silinir (yeni yol eklenemez). İmleç de sona sıçrar. Bu alanlar fiilen yalnız yapıştırma ile düzenlenebiliyor.
- **Profesyonel öneri:** Ham metni ayrı yerel state'te tut (`keywordsDraft: string`), diziye dönüşümü yalnız `onBlur`/kaydetme anında yap. Daha iyisi: anahtar kelimeler için bir **chip/tag input** bileşeni (Enter/virgül ile ekle, ×ile sil), disallow için satır bazlı liste editörü (her satır ayrı input + "yol ekle"). Ayrıca `keywords` alanının modern arama motorlarında sıralamaya etkisi olmadığı UI'da belirtilmeli (ayar sadeleştirme adayı).

### 4. En yıkıcı ayar (siteyi noindex yapmak) tek tıkla, onaysız ve izlenmeden değişiyor
- **Önem:** yüksek · **Kategori:** ürün güvenliği / UX · **Efor:** M
- **Kanıt:** `page.tsx:560-569` (Switch, açıklama "false = noindex"), `app/layout.tsx` `robots.index` ve `googleBot.index`, `health/route.ts:40-126` (robotsIndex kontrolü yok).
- **Sorun:** Bir yanlış tıklama + Kaydet tüm public sitenin Google'dan düşmesine yol açar; health skoru bu durumda bile yüksek çıkar (7 kontrolün hiçbiri `robotsIndex`'e bakmaz). Disallow'a `/` yazmak da aynı etkiyi verir ve kontrol edilmez.
- **Profesyonel öneri:** "Tehlikeli değişiklik" protokolü: noindex/nofollow/`Disallow: /`/sitemap kapatma için kayıt öncesi açıklamalı onay diyaloğu (Stripe'ın "type the name to confirm" deseni), health'e `robotsIndex`, `robotsFollow`, `disallow içinde '/'` kontrolleri **critical** olarak eklenmeli, ve bu ayar değiştiğinde admin bildirim/audit vurgusu (ör. platform-pulse'a olay). Demo ortamında (`NEXT_PUBLIC_DEMO_SITE`) robots.ts zaten tümünü kapatıyor — UI bunu bir rozetle göstermeli.

### 5. Hata durumunda sonsuz yükleniyor ekranı
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:79-88` (`res.ok` kontrolü yok; `data.global` yoksa `setPayload(null)`), `page.tsx:206` (`if (loading || !payload)` → spinner).
- **Sorun:** GET 429 (rate limit 30/dk, `lib/rate-limit.ts:279`) veya 500 döndüğünde JSON başarıyla parse edildiği için `catch` çalışmaz; toast yok, sayfa kalıcı olarak "yükleniyor"da kalır. Kullanıcıya yeniden deneme yolu verilmez.
- **Profesyonel öneri:** Veri katmanını `useSWR`/`react-query` ile kur (`error`, `isLoading`, `mutate`), `res.ok` değilse hata fırlat, `Alert` + "Tekrar dene" butonlu açık bir hata durumu göster. Aynı desen `loadAudit` (page.tsx:118-125) için de geçerli.

### 6. Sunucu doğrulaması gevşek: içe aktarılan JSON tip-bozuk veriyi kaydedebiliyor ve sayfayı çökertebiliyor
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `lib/validations-admin.ts:61-71` (`global: z.record(z.unknown())`, `.passthrough()`), `route.ts:56-88` (`keywords` dizi değilse aşağıya düşer ve `typeof v === 'string'` olduğu için **string olarak** saklanır; `robotsIndex: "false"` string olarak geçer ve truthy olur; `twitterCard`, `changeFrequency`, `priority`, `lastModified` doğrulanmaz), `page.tsx:102` (yanıttaki `settings` doğrudan state'e yazılır) → `page.tsx:501` `g.keywords.join` TypeError.
- **Sorun:** İçe aktarma (page.tsx:172-197) veya doğrudan API çağrısıyla `keywords: "a,b"` gönderilirse kaydedilir, PUT yanıtı state'e yazılır ve `join is not a function` ile sayfa çöker. `robotsIndex: "false"` gibi bir değer index'i **açık** bırakır (amaçlananın tersi). Geçersiz `lastModified` sitemap üretimini kırabilir (`app/sitemap.ts:104`, doğrulanmadı).
- **Profesyonel öneri:** `SeoGlobalSettings` için tek bir Zod şeması tanımla (lib/seo-settings.ts içinde) ve hem PUT, hem rollback, hem içe aktarma, hem `loadSeoSettingsRow` bunu kullansın (`schema.partial().parse` + defaults ile merge). İçe aktarmada istemci tarafında aynı şemayla doğrula, hataları alan bazlı listele ve "içe aktarılacak değişiklikler" diff önizlemesi göster.

### 7. Rollback semantiği yanıltıcı, onaysız ve bazı kayıtlarda kırık
- **Önem:** orta · **Kategori:** UX / veri bütünlüğü · **Efor:** M
- **Kanıt:** `page.tsx:770` ("Önceki kayıtlara dönmek için"), `page.tsx:785-787` ("Bu sürüme dön"), `rollback/route.ts:50-64` (`log.oldData` yazılır = o değişiklikten **önceki** durum), `route.ts:175-178` (ilk kayıtta `oldData: Prisma.JsonNull`) → `rollback/route.ts:50-52` 404.
- **Sorun:** "Bu sürüme dön" kullanıcıya "bu kayıtla oluşan sürümü yükle" izlenimi verir, ama aslında o değişikliği geri alır. Bir `rollback` kaydını geri almak da kafa karıştırıcı zincirler üretir. `create` kaydında buton görünür ama her zaman hata verir. Onay diyaloğu yok, diff yok; kaydedilmemiş yerel düzenlemeler sessizce ezilir (page.tsx:154).
- **Profesyonel öneri:** Geçmişi "sürüm zaman çizelgesi" olarak modelle: her kayıt için `newData` = o sürüm. Satırda kim/ne zaman/hangi alanlar değişti (alan bazlı diff: `defaultTitle: "A" → "B"`) göster; "Bu sürümü geri yükle" `newData`'yı yazsın; işlem öncesi diff'li onay diyaloğu; `oldData` null olan kayıtta "geri al" gizlensin. Audit ucu ham JSON yerine sunucuda hesaplanmış `changedKeys`/diff özetini dönsün (yük de azalır).

### 8. Okuma-sonrası-yazma tutarsızlığı ve eşzamanlı düzenlemede kayıp güncelleme
- **Önem:** orta · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `route.ts:148` (`current = await getSeoSettingsFull()` → `unstable_cache` 60 sn, lib/seo-settings.ts:118), `route.ts:184` ve `rollback/route.ts:85` (`revalidateTag(SEO_CACHE_TAG, 'max')`), `health/route.ts:36` (önbellekli ayarları okur). Sürüm/`updatedAt` karşılaştırması yok (`route.ts:164-169`).
- **Sorun:** Next 16'da `'max'` profili stale-while-revalidate'dir: kayıttan hemen sonra sayfa yenilendiğinde veya health çalıştırıldığında eski değerler dönebilir ("kaydettim ama eski geldi" algısı; çalışma zamanında doğrulanmadı). İki admin aynı anda düzenlerse son yazan kazanır, diğerinin değişikliği sessizce kaybolur.
- **Profesyonel öneri:** Admin GET ve PUT'un birleştirme tabanı önbelleği atlayıp doğrudan `prisma.settings.findUnique` okusun; route handler'da `revalidateTag(SEO_CACHE_TAG, { expire: 0 })` ile anında sona erdirme kullanılsın. PUT gövdesine `baseUpdatedAt` eklenip `updatedAt` eşleşmezse 409 + "başka biri değiştirdi, farkı gör" akışı (iyimser kilit).

### 9. Form genelinde doğrulama geri bildirimi, sayaç ve kirli-durum yok
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:** `page.tsx:396-509` (sayaç/inline hata yok), `page.tsx:241-244` (Kaydet, ikincil butonların arasında, sabit değil), sunucu hatası yalnız toast (page.tsx:104).
- **Sorun:** Health'in kullandığı eşikler (başlık ≥10, açıklama 70-170; health/route.ts:58-66) formda canlı gösterilmiyor; sunucu "Geçersiz OG görsel URL" döndüğünde hangi alanın hatalı olduğu işaretlenmiyor; kullanıcı kaydedilmemiş değişiklik olup olmadığını bilmiyor ve sayfadan çıkınca düzenlemeler kaybolur.
- **Profesyonel öneri:** `react-hook-form` + paylaşılan Zod şeması; alan altında sayaç ve renkli eşik çubuğu (Google piksel genişliği yaklaşımı); `isDirty` ile ekranın altına yapışan "Kaydedilmemiş N değişiklik · Vazgeç · Kaydet" çubuğu (Linear/Stripe deseni) ve `beforeunload` koruması.

### 10. Google önizlemesi gerçek SERP'i yanlış yansıtıyor; sosyal kart önizlemesi yok
- **Önem:** düşük · **Kategori:** UX / doğruluk · **Efor:** M
- **Kanıt:** `page.tsx:323-334` (URL `text-lg text-blue-600`, başlık `text-primary`; 160 karakter kesimi), `page.tsx:356-361` (kaldırılmış Twitter validator).
- **Sorun:** Google'da başlık mavi ve büyük, site adı/URL küçük ve üsttedir; buradaki düzen tersidir. Kırpma piksel değil karakter bazlı. OG/Twitter kart görünümü hiç önizlenmiyor; sayfa override'ları için önizleme yok.
- **Profesyonel öneri:** Masaüstü/mobil SERP önizlemesi (favicon + site adı + breadcrumb URL, mavi başlık, ~600px başlık / ~920px açıklama genişliği ölçümü `canvas.measureText` ile), yanında Facebook/X/LinkedIn/WhatsApp kart önizlemeleri (gerçek `ogImageUrl` görseliyle, oran uyarısı). Önizleme, seçili sekmeye/override satırına bağlı olsun. Twitter validator linki kaldırılsın.

### 11. OG görsel ayarı dosya tabanlı `opengraph-image.tsx` ile çakışıyor
- **Önem:** düşük · **Kategori:** mimari / tutarlılık · **Efor:** S
- **Kanıt:** `app/opengraph-image.tsx:1-60` (kök segmentte dinamik OG görseli, `qratex.com` sabit metni satır 60), `app/layout.tsx` `openGraph.images: [{ url: seo.ogImageUrl, ... }]`.
- **Sorun:** Next.js dokümantasyonuna göre dosya tabanlı metadata config tabanlıyı ezer; ana sayfada admin'deki "OG görsel URL / genişlik / yükseklik" etkisiz kalıyor olabilir (çalışma zamanında doğrulanmadı). Admin hangi görselin gerçekten kullanıldığını bilemiyor.
- **Profesyonel öneri:** Tek kaynak seçilmeli: ya OG görsel alanı kaldırılıp dinamik görselin şablonu (başlık/renk) admin'den yönetilsin, ya da `opengraph-image.tsx` `ogImageUrl` doluysa onu proxy'lesin. UI "şu an yayında olan OG görseli" önizlemesini `/opengraph-image` çıktısından göstersin.

### 12. Sayfa override kapsamı belirsiz ve tutarsız belgelenmiş
- **Önem:** düşük · **Kategori:** bilgi mimarisi · **Efor:** S
- **Kanıt:** `page.tsx:695` ("ileride layout/pages tarafından kullanılacak") vs `page.tsx:700` ("generateMetadata bu listeyi kullanır"); `getPageSeo` kullanan sayfalar yalnız 6 (grep: `app/(public)/page.tsx`, `guven`, `kullanim-sartlari`, `gizlilik-politikasi`, `kvkk-aydinlatma-metni`, `cerez-politikasi`); `blog/[slug]`, `neden-qratex` kullanmıyor.
- **Sorun:** Admin `/blog` veya `/neden-qratex` için override girer, kaydeder; hiçbir şey olmaz ve hiçbir uyarı gösterilmez. Ana sayfa (`/`) desteklendiği halde metinde anılmıyor.
- **Profesyonel öneri:** Override destekleyen rotaları bir registry'de (`lib/seo-routes.ts`) tanımla, UI'da serbest metin yerine bu listeden seçtir, her satırda "varsayılan başlık/açıklama"yı placeholder olarak göster. Blog ve diğer public sayfaları da aynı `resolvePageMeta` yardımcısına bağla.

### 13. API uçları admin gizli kapı çerezini kontrol etmiyor; rate-limit bellek-içi
- **Önem:** düşük (sistem geneli) · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** `proxy.ts:105-118` (`/api/` istekleri `authMiddleware`'e girmeden geçer), `lib/api-auth.ts:52-80` (`requireAuth` gate çerezine bakmaz), `lib/rate-limit.ts:12` (`new Map`), `health/route.ts` ve `audit/route.ts` rate-limit'siz.
- **Sorun:** Gizli kapı mimarisi "rol yetmez" der, fakat `PUT /api/admin/seo` yalnız ADMIN rolüyle çağrılabilir. Health ucu her çağrıda iki dış fetch yapar (`health/route.ts:97`) ve sınırsızdır; admin tarafından girilen `siteUrl`'e sunucudan istek atılması teorik bir SSRF yüzeyi oluşturur (yanıt gövdesi dönmediği için etkisi sınırlı).
- **Profesyonel öneri:** `requireAdmin()` yardımcısı ile `/api/admin/*` uçlarında gate çerezini de doğrula (proxy'de `/api/admin` önekine gate kontrolü eklemek daha merkezî). Rate-limit'i mevcut Upstash Redis'e taşı; health'i 1/10 sn ile sınırla ve fetch hedefini `siteUrl` hostu = `NEXT_PUBLIC_APP_URL` hostu kuralıyla kısıtla.

### 14. Erişilebilirlik: etiket-girdi bağları ve dil karışıklığı
- **Önem:** düşük · **Kategori:** erişilebilirlik / i18n · **Efor:** S
- **Kanıt:** `page.tsx:396, 404, 413, 423, ...` (`<Label>` `htmlFor`'suz), `page.tsx:565, 574, 605` (Switch'ler `aria-label`/`id` bağsız), `page.tsx:705-734, 615-672` (yalnız placeholder), `page.tsx:300, 306, 247, 484-485, 652-658` (İngilizce metinler), `page.tsx:33` (kullanılmayan `Map` import'u global `Map`'i gölgeliyor), `page.tsx:46` (`SeoPageOverride` kullanılmıyor).
- **Sorun:** Ekran okuyucu alan adlarını duyuramaz; Label'a tıklayınca alan odaklanmaz; severity ve eylem adları İngilizce; ölü importlar.
- **Profesyonel öneri:** Her alanı `FormField` deseniyle (`id`/`htmlFor`/`aria-describedby` → yardımcı metin + hata) sar; satır editörlerinde görsel olarak gizli etiketler; tüm metinleri `useAppT` anahtarlarına taşı; enum değerleri için TR görünen ad eşlemesi.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Alan bazlı diff'li sürüm geçmişi + geri yükleme önizlemesi** (Stripe Dashboard'un "Events/Logs" ve Retool'un sürüm geçmişi gibi): kim, ne zaman, hangi alan, eski→yeni; tek tıkla "bu sürümü önizle / geri yükle".
2. **Kirli-durum + yapışkan kaydet çubuğu + tehlikeli değişiklik onayı** (Linear/Stripe ayar sayfaları): noindex/robots/sitemap gibi kritik değişikliklerde yazılı onay.
3. **Sosyal kart önizlemeleri ve canlı OG görsel denetimi**: Facebook/X/LinkedIn/WhatsApp kartları, görselin gerçek boyut/oran/ağırlık kontrolü (health'e "OG görsel erişilebilir ve 1200×630" kontrolü).
4. **Sayfa envanteri / tarayıcı (crawler) görünümü**: tüm public rotaların listesi, her birinin efektif title/description/canonical/robots değeri, sitemap'te olup olmadığı, uzunluk uyarıları (Ahrefs/Screaming Frog'un mini sürümü; PostHog'daki "insight" tabloları gibi).
5. **Planlı/otomatik health izleme + uyarı**: health sonucunu kalıcı sakla, mevcut cron altyapısıyla günlük çalıştır, skor düşerse admin bildirimi; trend grafiği.
6. **Google Search Console entegrasyonu** (opsiyonel): indekslenen sayfa sayısı, kapsam hataları, sitemap gönderim durumu, gösterim/tıklama — gerçek SEO sonucunu ayarlarla aynı ekranda görmek.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "SEO Motoru" bir ayar formu değil, platformun **arama görünürlüğü kontrol merkezi** olmalı. Admin sayfayı açtığında ilk saniyede şunu görmeli: "Site indekslenebilir mi? Kaç sorun var? Son değişikliği kim yaptı?" Düzenleme güvenli (doğrulanmış, onaylı, geri alınabilir) ve sonucu anında önizlenebilir olmalı.

**Yerleşim (masaüstü, iki sütun):**
- **Üst durum şeridi (sticky):** İndeksleme durumu rozeti (Yayında · indekslenebilir / Noindex! kırmızı), health skoru (son otomatik çalıştırma zamanı, trend mini-grafiği), son değişiklik (kim/ne zaman → geçmiş çekmecesini açar). Kaydet bu şeritte değil; kirli durumda alttan yapışan çubukta.
- **Sol sütun — sekmeli editör** (sekme URL'de: `?tab=general`): Genel meta · Sosyal (OG/X) · Yapısal veri (JSON-LD, canlı JSON önizleme + "Rich Results'ta test et" `?url=` ile) · Tarama (robots/disallow liste editörü + efektif `robots.txt` önizlemesi; sitemap: varsayılan 10 URL salt-okunur + ek URL'ler tablo editörü) · Sayfalar (registry'den seçilen rotalar, efektif değer kolonuyla tablo).
- **Sağ sütun — canlı önizleme paneli (sticky):** SERP (masaüstü/mobil geçişi, piksel ölçümlü kırpma) + sosyal kart sekmeleri; seçili override satırına odaklanınca o sayfanın önizlemesine geçer.
- **Health paneli:** kontroller gruplu (Kritik / Uyarı / Bilgi), her başarısız kontrolde "düzelt" butonu ilgili alana scroll + focus yapar.
- **Geçmiş:** sağdan açılan çekmece (Sheet); sürüm satırları, alan diff'i, "geri yükle" onay diyaloğu.
- **Mobil:** önizleme paneli editörün altına iner, sekmeler yatay kaydırılabilir `TabsList`, kaydet çubuğu `env(safe-area-inset-bottom)` ile alta yapışık.

**Motion / 3D:** Bu bir operasyon aracı; 3D yersiz. Ölçülü framer-motion (`m as Motion`, global LazyMotion): (1) health skoru için kısa sayaç animasyonu ve halka dolumu, (2) kirli-durum çubuğunun alttan `y` ile girişi, (3) önizleme kartında değişen metnin hafif `layout` geçişi, (4) diff satırlarında eski→yeni vurgu flaşı. Hepsi `useReducedMotion` ile kapatılabilir olmalı.

**Veri / API değişiklikleri:**
- `lib/seo-settings.ts` içinde tek kaynak Zod şeması (`seoGlobalSchema`, `seoPageOverrideSchema`); PUT/rollback/import/okuma aynı şemayı kullanır; `siteUrl` zorunlu https URL.
- `GET /api/admin/seo` önbelleği atlayıp DB'den okur ve `updatedAt` döner; `PUT` `baseUpdatedAt` ile iyimser kilit (409); `revalidateTag(tag, { expire: 0 })`.
- `GET /api/admin/seo/audit` → `{ id, action, actor, createdAt, changedKeys, diff }` (ham JSON yerine), sayfalama; `POST /rollback` `newData` tabanlı "sürümü geri yükle" + `restoredFromId`.
- `GET /api/admin/seo/health` → kontrol seti genişler (robotsIndex/follow, `Disallow: /`, OG görsel HEAD + boyut, canonical tutarlılığı, override'lar boş alan, sitemap URL sayısı/çakışma); sonuç `Settings` veya ayrı bir tabloya kaydedilir; mevcut cron altyapısıyla günlük çalışır; Redis tabanlı rate-limit.
- `lib/seo-routes.ts` registry + `resolvePageMeta(path, fallback)` yardımcısı; tüm public sayfalar bunu kullanır; admin "Sayfalar" sekmesi efektif değerleri bu registry'den hesaplar.
- `app/layout.tsx`: `metadataBase` için güvenli URL yardımcısı (env'e geri dönüş).

---

## Çakışmalar / birleştirme önerisi

- **Doğrudan kopya bir sayfa bulunmadı.** `app/admin/settings`, `app/admin/pages` dosyalarında SEO meta alanı grep ile bulunamadı.
- **Kavramsal komşular:** `/admin/modules` (lib/module-controls.ts:52 `seo_engine` modül kaydı — sayfada bu modül anahtarına göre bir gate uygulanmıyor; modül kapatılsa da sayfa ve API çalışmaya devam eder, doğrulanmadı) ve landing/içerik yönetimi (blog). SEO Motoru'nun "Sayfalar" sekmesi, ileride blog/içerik editörlerinin her içerik için SEO alanlarıyla birleşmeli: içerik editörü kendi meta'sını yazar, SEO Motoru bunları **envanter** olarak salt-okunur listeler (tek doğruluk kaynağı içerik kaydı).
- **Site adı** (`siteName`) tüm panel layout'larında marka adı olarak kullanılıyor (app/admin/layout.tsx:19, 32 vb.); bu bir SEO ayarından çok marka ayarı. Tema/marka ayarları sayfasıyla (`/admin/themes` veya `/admin/settings`) ortak bir "Marka kimliği" kaynağına taşınması değerlendirilmeli.
- **Karar:** Kaldırma veya birleştirme değil; **koru ve yeniden tasarla** — özellikle Bulgu 1-4 kısa sürede düzeltilmeli (hepsi S efor, biri site genelini düşürebilir).

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod değiştirilmedi, DB/sunucu/test çalıştırılmadı. Next.js davranışı `node_modules/next/dist/lib/metadata/...` kaynağından okunarak teyit edildi.

### 1. Boş Site URL kaydedilince kök `generateMetadata` `new URL('')` ile çöker — **DOĞRULANDI**

- Zincir okundu ve kopuk halka yok: `app/admin/seo/page.tsx:425-426` alan boşaltılınca `siteUrl: ''` state'e yazılır, `save()` (page.tsx:94-97) tüm payload'u gönderir → `lib/validations-admin.ts:62` `z.record(z.unknown())` her şeyi geçirir → `app/api/admin/seo/route.ts:83-84` `''` string olduğu için saklanır → `route.ts:91` `g.siteUrl && ...` boş string'i falsy sayıp doğrulamayı atlar → upsert + `revalidateTag` (route.ts:165-184).
- Okumada `lib/seo-settings.ts:102` `??` yalnız `null/undefined` yakalar; `''` korunur. `app/layout.tsx:49` `base = '' || ''` → `app/layout.tsx:65` `new URL('')` → `TypeError: Invalid URL`.
- Önkoşul: `canonicalBase` boş olmalı (varsayılan `''`, seo-settings.ts:61). Doldurulmuşsa `base` ondan gelir ve çökme olmaz.
- Etki: kök layout metadata'sı her route'ta çalışır; `app/global-error.tsx` devreye girer — `/admin/seo` dahil tüm sayfalar hata ekranı gösterir. Ayrıca build-time prerender da aynı ayarı okuyacağından sonraki deploy da kırılır. `robots.ts:11` ve `sitemap.ts:10` göreli `"/sitemap.xml"` ve `"/guven"` gibi URL'ler üretir.
- Düzeltme notu: "DB'ye doğrudan müdahale gerekir" ifadesi biraz abartılı — route handler'lar kök layout'u render etmez; admin oturum çereziyle `PUT /api/admin/seo` veya `POST /api/admin/seo/rollback` çağrısı (curl/devtools) hâlâ çalışır. Ancak UI'dan kurtarma yoktur.
- Yeniden üretim: canonicalBase boşken Site URL alanını temizle → Kaydet → 200 "SEO ayarları kaydedildi" → en geç bir sonraki istekte herhangi bir sayfa global-error'a düşer.
- Öneri: (a) sunucu tarafında `siteUrl` zorunlu ve `https://` URL (Zod şeması, boş string reddedilir); (b) okuma tarafında `siteUrl: isValidUrl(x) ? x : defaults.siteUrl` savunması; (c) `layout.tsx` için `safeMetadataBase()` yardımcısı (geçersizse env `siteUrl`'e döner). Üçü birlikte "tek katman hatası siteyi düşürmez" garantisi verir.

### 2. Boş path'li / boş alanlı override ana sayfa ve yasal sayfaların meta'sını bozar — **DOĞRULANDI**

- `page.tsx:747-756` "Satır ekle" `{path:'',title:'',description:''}` ekler; formda zorunlu alan / uyarı yok (page.tsx:705-734). `validations-admin.ts:65-67` ve `route.ts:153-156` yalnız tip kontrolü yapar; boş string geçer.
- `lib/seo-settings.ts:141-142`: boş path `'' → '/'` olarak normalize edilir ve ana sayfa (`getPageSeo('/')`, `app/(public)/page.tsx:10`) ile eşleşir.
- `app/(public)/page.tsx:14-15` ve `guven/page.tsx:15-16` `??` kullanır; `''` fallback'e düşmez.
- Next.js davranışı (okundu): `resolve-title.js` boş string'e kök template'i uygular → `<title>` " | QRateX" olur (literal boş değil, ama anlamsız). `generate/meta.js:36` `content === ''` ise meta etiketini hiç basmaz → ana sayfa meta description'sız kalır (kök varsayılan açıklama da ezilir).
- Yalnız title girilen bir `/guven` satırında description `''` olur → aynı şekilde açıklama kaybolur; `WebPageJsonLd` de boş `description` alır. Health uç noktası override'ları kontrol etmiyor (doğrulandı: `app/api/admin/seo/health/route.ts` içinde `pageOverrides` referansı yok).
- Yeniden üretim: Sayfalar sekmesi → Satır ekle → hiçbir şey yazmadan Kaydet → `/` kaynağında `<title> | QRateX</title>` ve `meta[name=description]` yok.
- Öneri: override tipini `title?: string; description?: string` yapıp boş string'i `undefined`'a normalize et (sunucuda), path'i zorunlu + `/` ile başlayan + bilinen public route registry'sine karşı doğrula; tüketicilerde `??` yerine `||` / ortak `resolvePageMeta()` yardımcısı. UI'da satır bazlı inline doğrulama ve "boş bırakılan alan varsayılanı kullanır" ipucu.

### 3. Tip-bozuk global ayarlar (robotsIndex `'false'`, keywords string) — **ÇÜRÜTÜLDÜ (KRİTİK/YÜKSEK olarak)**; Düşük önem sertleştirme maddesi olarak geçerli

- Mekanizma doğru: `route.ts:83-84` string/boolean/number'ı anahtar tipinden bağımsız kabul eder; `robotsIndex: 'false'` saklanır, Next `resolve-basics.js:142` `if (robots.index)` truthy string'i `index` yapar. `keywords: 'a,b'` dizi olmadığı için route.ts:59 dalını atlar, :83'te string olarak saklanır.
- Neden yüksek önem değil:
  - UI hiçbir yoldan bu tipleri üretmez: `robotsIndex` `Switch` ile boolean (page.tsx:566-567), keywords `split` ile dizi (page.tsx:504), twitterCard `Select` (page.tsx:477-478), lastModified tarih girdisinden `YYYY-MM-DD` (page.tsx:665-669). Dışa aktarılan JSON da aynı tipleri taşır. Senaryo yalnız ADMIN'in JSON'u elle bozması veya API'yi elle çağırmasıyla oluşur — yetki sınırı aşılmaz, saldırgan aktör yok.
  - `robotsIndex: 'false'` sonucu "index açık kalır", yani üretimin zaten varsayılan durumu; veri sızıntısı ya da kesinti değil.
  - keywords çökmesi geçicidir: PUT yanıtı state'e yazılınca (page.tsx:102) `g.keywords.join` (page.tsx:501) patlar, ama sayfa yenilenince `lib/seo-settings.ts:103` dizi olmayan keywords'ü varsayılana çevirir; GET normalleşmiş veri döner, site metadata'sı da etkilenmez.
  - Geçersiz `lastModified` → `new Date('x')` → sitemap serileştirmede `toISOString` RangeError ihtimali kod okumasıyla makul ama UI tarih girdisi bunu üretmez; yalnız elle hazırlanmış istekle mümkün (doğrulanmadı).
- Öneri (Düşük): Bulgu 1 ve 2 için önerilen tek Zod şeması (`seoGlobalSchema.strict()`) bu sınıfı da kapatır; içe aktarmada aynı şema istemci tarafında `safeParse` ile çalıştırılıp hatalı alanlar listelenmeli.
