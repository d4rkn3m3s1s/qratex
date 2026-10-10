# /offline

**Amaç:** next-pwa `fallbacks.document` yedek sayfası. Ağ yokken istenen belge (HTML) önbellekte de yoksa service worker bu sayfayı gösterir. Kullanıcıya "internet yok" der ve yeniden denemesi için tek bir buton sunar.

**Genel puan:** 4.5/10 · **Karar:** yeniden tasarla. Altyapı (precache + fallback) doğru bağlanmış ama sayfanın tek aksiyonu yanlış işi yapıyor. Ayrıca çevrimdışı anda kullanıcıya hiçbir değer sunmuyor.

> Kapsam: `app/offline/page.tsx` (37 satır, tamamen statik, veri/API çağrısı yok). Buna bağlı katmanlar da okundu: kök layout (`app/layout.tsx`), `components/providers.tsx`, `components/layout/offline-banner.tsx`, `hooks/use-pwa.ts`, `next.config.js` PWA yapılandırması, üretilmiş `public/sw.js`, Next 16.1.6 app-router geçmiş (history) davranışı. Sayfa hiçbir API ucu çağırmıyor ve hiçbir Prisma modeli kullanmıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Fallback zinciri çalışıyor (`sw.js` içinde `/offline` precache ediliyor ve `caches.match("/offline")` var). Sayfanın tek aksiyonu "Yeniden dene" ise isteği yeniden denemiyor, ana sayfaya gidiyor. |
| UX | 3/10 | Sayfa "kaldığınız yerden devam edebilirsiniz" diye söz veriyor ama bunu sağlayan bir mekanizma yok: otomatik yeniden bağlanma da çevrimdışı içerik de yok. Global amber şeritle aynı mesaj iki kez gösteriliyor. |
| Görsel | 5/10 | Temiz ve tema tokenlarıyla tutarlı. Ancak markasız ve jenerik bir shadcn boş durumu. Qratex'in oyunlaştırılmış kimliğinden hiçbir iz taşımıyor. |
| Mimari | 6/10 | Statik, veri çekmiyor, doğru yere bağlanmış. Fakat bütün kök layout zincirini (Chatbot, PostHog, SessionProvider, InstallBanner) çevrimdışı ekrana da taşıyor. |
| Performans | 8/10 | Sayfa küçük ve precache'li. Fontlar ve chunk'lar `_next/static` altında önbellekte. Gereksiz ağ denemeleri (oturum yenileme, analitik) zararsız ama boşa iş yapıyor. |
| Erişilebilirlik + mobil | 6/10 | `main` ve `h1` var, ikon `aria-hidden`, dokunma hedefi 44 px (`h-11`), tema farkındalığı var. Bağlantı geri gelince ekran okuyucuya duyuru yok ve aksiyon yanlış etiketlenmiş. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | SW belge fallback'i olarak bağlanma | ÇALIŞIYOR | `next.config.js:9-11`; `public/sw.js` içinde `{url:"/offline",revision:…}` precache girdisi ve `fallback=…"document"===e.destination?caches.match("/offline")` | Yerel `sw.js` git'te izlenmiyor (`.gitignore:44`). Bu kanıt yerel build çıktısından alındı ve üretimdekiyle aynı mantık. |
| 2 | Tamamen statik render (veri çekmez) | ÇALIŞIYOR | `app/offline/page.tsx:10-15` yorum + gövde | Doğru tercih. |
| 3 | Sayfa başlığı (`<title>`) | KISMİ | `app/offline/page.tsx:6` + `app/layout.tsx:51-54` (`template: '%s \| ${seo.siteName}'`) | Şablon yüzünden başlık "Çevrimdışısınız — QRateX \| QRateX" oluyor ve marka iki kez yazılıyor. |
| 4 | `robots: noindex, nofollow` | ÇALIŞIYOR | `app/offline/page.tsx:7` | `app/sitemap.ts` içinde `/offline` yok (grep ile doğrulandı). |
| 5 | WifiOff ikon rozeti | ÇALIŞIYOR | `app/offline/page.tsx:18-20` | `aria-hidden` doğru. Marka/logo yok. |
| 6 | Başlık "İnternet bağlantısı yok" (h1) | ÇALIŞIYOR | `app/offline/page.tsx:22` | |
| 7 | Açıklama metni | KISMİ | `app/offline/page.tsx:23-26` | "Kaldığınız yerden devam edebilirsiniz" sözünü tutan bir mekanizma yok. "Bazı sayfalar görüntülenebilir" deniyor ama hangileri olduğu söylenmiyor ve onlara link yok. |
| 8 | "Yeniden dene" aksiyonu | BOZUK | `app/offline/page.tsx:29-34` (`<Link href="/">`) | Etiket "yeniden dene" diyor ama asıl isteği tekrarlamıyor, kullanıcıyı `/` adresine götürüyor. Ayrıntısı Bulgu 1'de. |
| 9 | Açık/koyu tema uyumu | ÇALIŞIYOR | `app/offline/page.tsx:17` (`bg-background`, `text-muted-foreground`); `app/layout.tsx:19-32,154` (inline tema betiği çevrimdışı da çalışır) | |
| 10 | Mobil yerleşim | ÇALIŞIYOR | `app/offline/page.tsx:17` (`min-h-screen … p-8 text-center`) | Ortalanmış tek sütun. Alt kısmı global şerit örtüyor (#11). |
| 11 | Global çevrimdışı şeridi (OfflineBanner) bu sayfada da görünür | KISMİ (çakışma) | `components/providers.tsx:244`; `components/layout/offline-banner.tsx:19-30` | Aynı mesaj ikinci kez gösteriliyor: ekranın altında amber şerit. |
| 12 | Global kurulum bandı (InstallBanner) bu sayfada da çalışır | KISMİ | `components/providers.tsx:243` | Kullanıcı çevrimdışıyken "uygulamayı yükle" teşviki yersiz kalıyor. |
| 13 | Chatbot FAB bu sayfada da yüklenir | KISMİ | `app/layout.tsx:166`; `components/chat/chatbot-lazy.tsx:6` | Ağ gerektiren bir sohbet aracı çevrimdışı ekranda kullanıcıya sunuluyor. |
| 14 | Oturum/analitik arka plan istekleri | KISMİ | `components/providers.tsx:219` (`SessionProvider refetchInterval={5*60} refetchOnWindowFocus`); `app/layout.tsx:167-169` (Analytics, SpeedInsights, PostHog) | Sessizce başarısız oluyorlar. Zararsız ama boşa iş. |
| 15 | Bağlantı geri gelince otomatik yenileme | EKSİK | `app/offline/page.tsx` içinde `online` dinleyicisi yok; `hooks/use-pwa.ts:44-48` bu olayı yalnızca global şerit için dinliyor | |
| 16 | Çevrimdışı kullanılabilir içeriklerin listesi (önbellekteki sayfalar) | EKSİK | — | |
| 17 | Çevrimdışı sadakat kartı / QR kimlik | EKSİK | `app/customer/my-card/page.tsx:1` bir `'use client'` sayfası, offline için özel bir önbellek stratejisi yok | Starbucks benzeri "barkod her zaman açık" deneyimi yok. |
| 18 | Çevrimdışı geri bildirim kuyruğu (müşteri) | EKSİK | Müşteri tarafında `sync.register` / IndexedDB kullanımı yok (grep). Kuyruk yalnızca bayi tarafında var: `app/api/dealer/offline-sync/route.ts` | |
| 19 | Marka kimliği (logo, Qratex dili, maskot) | EKSİK | `app/offline/page.tsx:17-35` | |
| 20 | Motion / azaltılmış hareket | YOK (uygulanabilir değil) | Sayfada animasyon yok. `MotionConfig reducedMotion="user"` globalde mevcut (`components/providers.tsx:231`). | |
| 21 | Bağlantı durumu duyurusu (aria-live) | EKSİK | Sayfada live region yok. Yalnızca global şerit `role="status"` taşıyor (`offline-banner.tsx:23-24`). | |
| 22 | Çok dillilik | EKSİK (düşük öncelik) | Metinler sabit Türkçe (`page.tsx:22-33`). `AppLocaleProvider` mevcut (`providers.tsx:221`) ama kullanılmıyor. | Site `lang="tr"`, bu yüzden pratik etkisi düşük. |
| 23 | Çevrimdışı olay telemetrisi | EKSİK | — | Fallback'in kaç kez ve hangi URL'de gösterildiği ölçülmüyor. |

**Durum özeti:** ÇALIŞIYOR 8 · KISMİ 6 · BOZUK 1 · SAHTE 0 · EKSİK 8. (#20 sayıma dahil değil.)

---

## Bulgular

### 1. "Yeniden dene" isteği tekrarlamıyor, kullanıcıyı ana sayfaya atıyor. QR akışında hedef URL kayboluyor.
- **Önem:** yüksek · **Kategori:** işlevsellik/UX · **Efor:** S
- **Kanıt:** `app/offline/page.tsx:28-34` (`<Link href="/">Yeniden dene</Link>`). SW fallback, belgeyi asıl istek URL'sine yanıt olarak döndürüyor (`public/sw.js`: `caches.match("/offline")`). Next 16.1.6 hidrasyonda adres çubuğunu korur: `node_modules/next/dist/client/components/router-reducer/create-initial-router-state.js:24-26`, burada `canonicalUrl` değeri `window.location`'dan okunuyor. Dolayısıyla kullanıcı bu ekrandayken adres çubuğunda hâlâ asıl URL (ör. `/c/<token>`) duruyor.
- **Sorun:** Tipik senaryo şu: müşteri masadaki QR'ı zayıf şebekede okutuyor, `/c/<token>` yüklenemiyor ve bu ekran açılıyor. "Yeniden dene"ye bastığında asıl sayfa yeniden istenmiyor. Next istemci navigasyonu `/` adresine gidiyor, çevrimdışı olduğu için MPA navigasyonuna düşüyor ve `/` ya önbellekten bayat haliyle ya da yine bu ekran olarak geliyor. Adres artık `/` olduğu için QR token'ı kaybolur. Kullanıcı QR'ı yeniden okutmak zorunda kalır. Platformun ana dönüşüm hunisi (QR → geri bildirim → puan) tam bu noktada kırılıyor. Butonun etiketi de yaptığı işi doğru anlatmıyor.
- **Öneri:** Aksiyonu ikiye ayırın:
  - **Birincil "Yeniden dene":** Küçük bir istemci adası (`offline-actions.tsx`, `'use client'`) önce hafif bir bağlantı yoklaması yapsın (`fetch('/api/health', { cache: 'no-store' })`, 3–5 sn timeout). Başarılıysa `window.location.reload()` çağırsın; böylece asıl URL yeniden istenir. Başarısızsa butonda "Hâlâ çevrimdışı" geri bildirimi gösterilsin ve yükleme durumu temizlensin.
  - **İkincil "Ana sayfa":** Ayrı ve açıkça etiketlenmiş bir link olsun.
  - **QR bağlamı:** `location.pathname` `/c/` veya `/feedback/` ile başlıyorsa metin bağlama uysun: "Masadaki QR'ı kaydettik. Bağlantı gelince otomatik açılacak." Bu tamamen istemci tarafında yapılabilir; veri çekmeye gerek yok.

### 2. SW, kimlik doğrulamalı HTML/RSC yanıtlarını 24 saat önbellekte tutuyor ve çevrimdışı/yavaş ağda başka kullanıcıya sunabilir. Çıkışta önbellek temizlenmiyor.
- **Önem:** yüksek · **Kategori:** güvenlik/gizlilik (çevrimdışı deneyimin parçası) · **Efor:** M
- **Kanıt:** `next.config.js:136-152`. "others" kuralı aynı-origin ve `/api/` dışındaki her isteği `NetworkFirst` ile `maxAgeSeconds: 24*60*60` ve `networkTimeoutSeconds: 10` ayarıyla önbelleğe alıyor. Bu kapsam `/customer/*`, `/dealer/*`, `/admin/*` HTML'ini ve `?_rsc=` isteklerini de içeriyor. Kod tabanında `caches.delete` ya da `caches.keys` kullanımı yok (`app components lib hooks` üzerinde grep, sonuç boş).
- **Sorun:** Workbox `NetworkFirst`, sunucunun `Cache-Control` başlıklarına bakmadan 200 yanıtlarını önbelleğe yazıyor. Paylaşılan bir cihazda A kullanıcısı çıkış yapsa bile, B kullanıcısı çevrimdışıyken ya da ağ 10 saniyeden yavaşken A'nın kişisel sayfalarının (puan, cüzdan, kupon, bayi paneli) bayat HTML'ini görebilir. Admin sayfaları da bu kapsamda; önbellekten sunulan HTML gizli kapıdan (`proxy.ts`) geçmez. Bu ekran "Daha önce açtığınız bazı sayfalar çevrimdışıyken de görüntülenebilir" diyerek bu davranışı ürün özelliği olarak sunuyor (`page.tsx:25`). Not: Bu bulgu yapılandırma ve kod okumasıyla doğrulandı; çalışma zamanında cihaz üzerinde test edilmedi.
- **Öneri:**
  - `runtimeCaching` içinde kimlikli yolları (`/customer`, `/dealer`, `/admin`, `/admin-gate`, `/staff`, `/c/`, `/feedback/`, `/experience/`) `NetworkOnly` yapın. Ya da `cacheableResponse` ile yalnızca açıkça herkese açık sayfaları (landing, blog, yasal metinler) önbelleğe alın.
  - `signOut` akışına bir `clearRuntimeCaches()` yardımcısı ekleyin: `caches.keys()` ile `others` ve `cross-origin` önbelleklerini silsin, `postMessage` ile SW'ye bildirsin.
  - Kişisel verinin çevrimdışı gösterilmesi isteniyorsa bunu HTML önbelleğiyle değil, kullanıcıya bağlı ve çıkışta silinen bir IndexedDB "çevrimdışı özet" kaydıyla yapın (Bulgu 6).

### 3. Sayfa "kaldığınız yerden devam" diyor ama bağlantı dönüşünü algılamıyor.
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** `app/offline/page.tsx:23-26` (söz). Sayfada `online` olay dinleyicisi yok. `hooks/use-pwa.ts:44-48` bu olayı yalnızca global şerit için kullanıyor.
- **Sorun:** Bağlantı geri geldiğinde kullanıcı aynı ekranda takılı kalıyor ve neyi ne zaman deneyeceğini kendisi tahmin etmek zorunda. Revolut ve Monzo gibi mobil uygulamalar bağlantı dönünce kendiliğinden toparlanır.
- **Öneri:** İstemci adası `online` olayını ve `visibilitychange` olayını dinlesin. Olay gelince Bulgu 1'deki yoklama + `reload` akışını otomatik çalıştırsın. Ayrıca artan aralıklı (5 → 10 → 20 → 30 sn, en fazla 30 sn) arka plan yoklaması yapsın; `navigator.onLine` "kaptif portal" durumlarında yanıltıcı olabilir. Durumu bir `aria-live="polite"` bölgesinde duyurun: "Bağlantı geri geldi, sayfa açılıyor…". Bu akış içinde sayfa kendi şeridini göstermeli ve global şerit gizlenmeli (Bulgu 4).

### 4. Çift mesaj ve yersiz global bileşenler: amber şerit, kurulum bandı, chatbot.
- **Önem:** orta · **Kategori:** UX/mimari · **Efor:** S
- **Kanıt:** `components/providers.tsx:243-244` (`<InstallBanner />`, `<OfflineBanner />` her rotada); `app/layout.tsx:166-169` (Chatbot, Analytics, SpeedInsights, PostHog); `components/layout/offline-banner.tsx:25` (alt kenarda sabit amber şerit).
- **Sorun:** Bu ekranda kullanıcı aynı mesajı iki kez görüyor: ortada büyük kart, altta amber şerit. Şerit ayrıca ekranın alt kısmını örtüyor. Ağ gerektiren chatbot FAB'ı ve "uygulamayı yükle" bandı çevrimdışı bağlamda yanlış beklenti oluşturuyor. `SessionProvider` her pencere odağında `/api/auth/session` isteği atıp sessizce başarısız oluyor.
- **Öneri:** Fallback sayfası asıl URL'de sunulduğu için `usePathname()` ile ayırt edilemez. Sayfa bunun yerine `<html>` üzerine `data-offline-fallback` niteliği koysun (küçük bir istemci efekti). `OfflineBanner`, `InstallBanner` ve `ChatbotLazy` bu bayrağı görünce render etmesin. Daha temiz çözüm: `app/offline` için ayrı bir route group ve hafif bir layout (`app/(bare)/offline/layout.tsx`). Ancak kök `<html>` layout'u paylaşıldığı için Providers zincirini tamamen dışarıda bırakmak "multiple root layouts" mimarisi gerektirir. Kısa vadede bayrak yaklaşımı yeterli.

### 5. Markasız ve jenerik boş durum; Qratex kimliğini taşımıyor.
- **Önem:** orta · **Kategori:** görsel/marka · **Efor:** M
- **Kanıt:** `app/offline/page.tsx:17-35`: gri daire içinde WifiOff ikonu, iki satır metin ve bir buton. Logo, maskot ve marka dili yok.
- **Sorun:** Qratex oyunlaştırılmış ve duygusal bir ürün (rozet küresi, maskot, sürpriz kutusu). Kullanıcının en sinirli olduğu anda karşısına çıkan bu ekran ise uygulamanın geri kalanıyla görsel olarak kopuk. Duolingo'nun çevrimdışı ekranı maskotla bu anı sevimli hale getirir.
- **Öneri:** Ekranı precache'teki marka varlıklarıyla yeniden kurun: `public/logo/logo.png` ve `/icons/*.svg` zaten precache listesinde. Rozet maskotu varlıkları da SVG/PNG olarak `public/` altındaysa kullanılabilir; her yeni görsel `sw.js` precache listesine girmeli, çevrimdışı çalışma şartı bu. Ton olarak oyunlaştırma dilini kullanın: "Sinyal avına çıktık 📡" türünden bir başlık, sade bir alt metin. Hafif bir "sinyal arıyor" animasyonu ekleyin (bkz. vizyon). 3B/three.js KULLANMAYIN: hem ağır olur hem de bu ekran mümkün olan en hafif sayfa olmalı.

### 6. Çevrimdışı anda kullanıcıya hiçbir değer sunulmuyor (kart, puan, QR, kuyruk).
- **Önem:** orta · **Kategori:** ürün/eksik özellik · **Efor:** L
- **Kanıt:** Sayfada önbellekteki içeriğe dair hiçbir referans yok (`page.tsx:15-36`). Müşteri tarafında IndexedDB/Background Sync kullanımı yok (grep). Bayi tarafında bir kuyruk modeli zaten var: `app/api/dealer/offline-sync/route.ts:1-30` (`prisma.offlineQueue`).
- **Sorun:** Starbucks Rewards'ta üye barkodu ve bakiye çevrimdışı da açılır. Qratex'te aynı anda (kafede, kasada) bağlantı koparsa kullanıcı ne puanını görebiliyor ne de kartını gösterebiliyor.
- **Öneri:**
  1. Müşteri her çevrimiçi oturumda küçük bir "cüzdan özeti" (ad, seviye, puan, kart QR'ının verisi, en fazla 3 aktif kupon kodu, `updatedAt`) yazsın. Bu kayıt `customer/my-card` yüklenirken IndexedDB'ye `userId` anahtarıyla gitsin ve çıkışta silinsin.
  2. `/offline` sayfası bu kaydı okuyup "Son bilinen durumunuz — 14:32 itibarıyla" kartını göstersin. QR'ı istemcide yeniden üretsin (`qrcode` bağımlılığı zaten var; perf notlarında geçiyor).
  3. Uzun vadede `/c/[token]` geri bildirim formu için müşteri tarafı bir Background Sync kuyruğu kurulabilir. Puan ekonomisi invariant'ları gereği puan sunucu tarafında, sync anında ve tek seferlik olarak kredilenmeli. Çevrimdışıyken "kazandınız" diye puan gösterilmemeli; "gönderilecek" ifadesi kullanılmalı.

### 7. Başlıkta marka iki kez geçiyor.
- **Önem:** düşük · **Kategori:** tutarlılık · **Efor:** S
- **Kanıt:** `app/offline/page.tsx:6` (`'Çevrimdışısınız — QRateX'`) + `app/layout.tsx:53` (`template: '%s | ${seo.siteName}'`, `siteName` varsayılanı `'QRateX'`: `lib/seo-settings.ts:45`).
- **Sorun:** Sekme ve görev değiştiricide "Çevrimdışısınız — QRateX | QRateX" görünüyor.
- **Öneri:** `title: 'Çevrimdışısınız'` yeterli; markayı şablon ekliyor.

### 8. Aksiyon, tasarım sisteminin `Button` bileşeni yerine elle stillenmiş bir `Link`.
- **Önem:** düşük · **Kategori:** tutarlılık/mimari · **Efor:** S
- **Kanıt:** `app/offline/page.tsx:29-32`. Projede `components/ui/button.tsx` mevcut.
- **Sorun:** Odak halkası (`focus-visible`), basılı durum ve devre dışı/yükleniyor durumları shadcn `Button` ile tutarlı değil. Klavye odağında görünür bir halka yok.
- **Öneri:** Yoklamalı yeniden deneme bir eylem olduğu için `<Button onClick>` kullanın ve yükleniyor durumu ekleyin. "Ana sayfa" için `<Button asChild variant="ghost"><Link/></Button>` kullanın.

### 9. Fallback gösterimleri ölçülmüyor.
- **Önem:** düşük · **Kategori:** gözlemlenebilirlik · **Efor:** S
- **Kanıt:** Sayfada ve SW'de telemetri yok. PostHog layout'ta yükleniyor (`app/layout.tsx:169`) ama çevrimdışıyken gönderemez.
- **Sorun:** Hangi rotaların (özellikle `/c/[token]` QR girişi) bağlantı sorunu yüzünden kaybedildiği bilinmiyor.
- **Öneri:** Gösterim anında `{ path, ts }` kaydını `localStorage`'a yazın. Bağlantı dönünce `posthog.capture('offline_fallback_shown', …)` ile toplu gönderin. Bu veri, QR hunisindeki kaybı ölçmenin tek yolu.

### 10. Precache'teki fallback HTML'i build anındaki tema ve SEO ayarlarını taşıyor.
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `app/layout.tsx:144` (`getPublicThemeSettings()`, `unstable_cache` 120 sn); precache revizyonu build kimliği (`public/sw.js` `revision:"WI95…"`).
- **Sorun:** Admin'in sezonluk tema değişikliği, bir sonraki deploy'a kadar çevrimdışı ekrana yansımaz. Etkisi küçük ama tutarsızlık yaratabilir.
- **Öneri:** Bu ekran tema token'larına (CSS değişkenleri) güveniyor ve renkler istemci tarafında `ThemeColorsProvider` + `localStorage` ile de uygulanıyor. Bu yeterli; yalnızca dokümante edilmesi yeterli. Sezonluk özel renkler kritikse ekran nötr tokenlarla sınırlı tutulmalı.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Çevrimdışı üye kartı ve bakiye** (Starbucks Rewards): son bilinen puan, seviye ve kart QR'ı, zaman damgasıyla.
2. **Otomatik toparlanma** (Revolut/Monzo): bağlantı dönünce sayfanın kendiliğinden açılması ve bunun ekran okuyucuya duyurulması.
3. **Bağlama duyarlı mesaj ve hedefin korunması:** QR girişinde "QR'ınızı kaydettik, bağlantı gelince açılacak".
4. **Çevrimdışı küçük oyun** (Chrome dinozoru / Duolingo tonu): mevcut mini oyun altyapısından tamamen istemci tarafında çalışan, ÖDÜLSÜZ bir oyun (ör. `data-snake`'in hafif bir sürümü). Ödül sunucu doğrulamalı olduğu için açıkça "eğlence modu, puan yok" etiketi taşımalı.
5. **Önbellekte ne var? listesi:** güvenli (herkese açık) önbellekteki sayfalara linkler, örneğin blog yazıları ve yasal metinler.
6. **Gönderilmeyi bekleyen işlemler kuyruğu:** müşteri geri bildirimi için Background Sync ve "1 geri bildirim gönderilmeyi bekliyor" rozeti.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı bu ekranı bir hata olarak değil, uygulamanın kısa bir bekleme anı olarak yaşamalı. Ekran kim olduğunu bilmeli (son bilinen özet), nereye gitmek istediğini hatırlamalı (asıl URL) ve bağlantı gelince kendiliğinden devam etmeli.

**Yerleşim (mobil öncelikli, tek sütun):**
1. **Üst:** Qratex logosu (precache'te) ve küçük bir durum çipi: "Çevrimdışı · son deneme 5 sn önce".
2. **Kahraman alanı:** "Sinyal aranıyor" illüstrasyonu (SVG; maskot varlığı varsa o), başlık ve bağlama göre değişen tek cümle:
   - QR girişinde: "Masadaki QR kaydedildi. Bağlantı gelince otomatik açılacak."
   - Diğer durumlarda: "Bağlantı gelince kaldığınız sayfa açılacak."
3. **Birincil aksiyon:** "Şimdi tekrar dene" (`Button`, yükleniyor durumlu). İkincil aksiyon: "Ana sayfa" (ghost).
4. **"Son bilinen durumunuz" kartı** (yalnızca giriş yapmış ve IndexedDB özeti varsa): seviye, puan, kart QR'ı, "14:32 itibarıyla" etiketi. Kasada gösterilebilecek kadar büyük bir QR için tam ekran modu.
5. **Alt (isteğe bağlı):** "Beklerken oyna: puan yok, sadece eğlence" mini oyun girişi.

**Motion / 3B:** Ölçülü olmalı. Sinyal halkaları için 3 eş merkezli CSS `@keyframes` dalgası yeterli; framer-motion'a bile gerek yok, böylece çevrimdışı JS yükü minimumda kalır. Bağlantı dönünce kısa bir "yeşil onay" geçişi gösterilip sayfa yenilenir. `prefers-reduced-motion: reduce` durumunda animasyonlar statik ikonlara düşmeli. Global `MotionConfig reducedMotion="user"` yalnızca framer bileşenlerini kapsıyor; CSS animasyonları için ayrı medya sorgusu gerekiyor. three.js kesinlikle KULLANILMAMALI.

**Veri / API değişiklikleri:**
- Yeni bir istemci adası `components/pwa/offline-recovery.tsx`: `online` / `visibilitychange` dinleyicileri, artan aralıklı `fetch('/api/health')` yoklaması, `location.reload()`, `aria-live` duyuru.
- Yeni `lib/offline-snapshot.ts`: IndexedDB (`idb-keyval` benzeri hafif bir sarmalayıcı ya da yerel API). `writeSnapshot(userId, data)` çağrısı `customer/my-card` ve dashboard yüklenirken yapılır; `clearSnapshot()` çıkışta çağrılır.
- `next.config.js` `runtimeCaching`: kimlikli yollar `NetworkOnly`. Çıkışta runtime önbellekleri temizlenir (Bulgu 2).
- Sayfa sunucu tarafında statik kalmalı. Bütün dinamiklik istemci adasında olmalı, veri çekme yalnızca IndexedDB'den yapılmalı.
- Telemetri: `offline_fallback_shown` ve `offline_recovered` olayları (gecikmeli toplu gönderim).

---

## Çakışmalar / birleştirme önerisi

- **`components/layout/offline-banner.tsx` (global amber şerit):** İkisi de aynı amaca hizmet ediyor; şerit "sayfa açık ama ağ koptu", `/offline` ise "sayfa hiç açılamadı" durumu için. Kaldırmak yerine görev paylaşımı netleştirilmeli: fallback ekranında şerit gizlenmeli (Bulgu 4). İkisi aynı `useConnectivity()` hook'unu kullanmalı; mevcut `usePWA().isOnline` genişletilip yoklama mantığı tek yerde toplanabilir.
- **`/customer/my-card`:** Çevrimdışı kart görünümü bu sayfanın verisinin (IndexedDB özeti) yeniden kullanımı olmalı; ayrı bir kart bileşeni yazılmamalı, `my-card` içindeki kart bileşeni paylaşılmalı.
- **Bayi tarafı çevrimdışı kuyruk (`app/api/dealer/offline-sync`):** Müşteri tarafı kuyruk kurulursa aynı desen (durum makinesi, `MAX_QUEUE_RETRIES`) yeniden kullanılmalı.
- **Kaldırma/birleştirme:** Sayfa kaldırılmamalı. PWA fallback'i için zorunlu ve başka bir rotayla birleştirilemez.

---

## Doğrulama (şüpheci inceleme)

> Yöntem: salt okunur kod okuması. Kod değiştirilmedi, build/test/dev server/DB çalıştırılmadı. Kanıt için yerel `.next` build çıktısı (BUILD_ID `WI95wUtouUqtEzsyBlxjJ`, 2 Eylül) ve `node_modules/next-pwa@5.6.0` kaynağı okundu.

### Ortak kök bulgu: `sw.js` App Router'da hiç kaydedilmiyor

Her iki iddia da `public/sw.js`'in tarayıcıda **aktif** olduğunu varsayıyor. Kod okuması bunun tersini gösteriyor:

- `next-pwa@5.6.0` kayıt betiğini yalnızca webpack'in `main.js` girişine ekliyor: `node_modules/next-pwa/index.js:92-99` (`if (entries['main.js'] ...) entries['main.js'].unshift(registerJs)`). `window.workbox.register()` çağrısı `node_modules/next-pwa/register.js` içinde.
- Build çıktısında bu kod gerçekten `main-*.js` chunk'ına girmiş (`.next/static/chunks/main-fb60f4e0f49b8669.js` içinde `window.workbox` var). Ama App Router sayfaları bu chunk'ı yüklemiyor: `.next/build-manifest.json` → `rootMainFiles` yalnızca `webpack`, `4bd1b696`, `93794`, `main-app-*.js`; `pages` alanında sadece `"/_app": []` var. `main-fb60f4e0f49b8669` adı `.next/server` altındaki hiçbir manifest ya da HTML'de geçmiyor (grep, sonuç boş). `.next/server/app/offline.html` yalnızca `main-app-*.js` yüklüyor.
- Projede `pages/` dizini yok ve git geçmişinde hiç olmamış (`git log -- pages/` boş), yani eski bir Pages Router döneminden kalma bir `sw.js` kaydı da beklenmez.
- Kod tabanında `sw.js`'i elle kaydeden başka bir yer yok (`app components hooks lib` üzerinde `sw.js|workbox` grep, sonuç boş). Tek `navigator.serviceWorker.register` çağrısı `hooks/use-push-notifications.ts:21`: `/push-sw.js`'i `scope: "/"` ile kaydediyor. `public/push-sw.js` yalnızca `push` ve `notificationclick` dinliyor; `fetch` dinleyicisi, önbellek ya da fallback yok.

**Sonuç:** Üretimde runtime önbelleği (`others`, `start-url`) ve `/offline` belge fallback'i devreye girmiyor. Bu, orijinal rapordaki **Özellik #1 "ÇALIŞIYOR" değerlendirmesini de geçersiz kılıyor.** `sw.js` dosyası üretiliyor ve precache listesi doğru, ama dosya hiçbir istemcide kayıtlı değil. `/offline` sayfasına pratikte yalnızca adres doğrudan yazılarak ulaşılabilir. Not: Bu sonuç kod ve build çıktısı okumasına dayanıyor; canlı bir cihazda `chrome://serviceworker-internals` ile doğrulanmadı.

### İddia 1: PWA runtime cache kimlikli sayfaları 24 saat saklıyor, çıkışta temizlenmiyor
- **Karar:** çürütüldü (şu anki üretim durumu için). Gizli bir risk olarak kalıyor.
- **Not:** Yapılandırma okuması kendi içinde doğru: `next.config.js:136-152` ve üretilmiş `public/sw.js` içinde `others` rotası `/api/` dışındaki her aynı-origin GET'i `NetworkFirst` (`networkTimeoutSeconds:10`, `maxAgeSeconds:86400`) ile önbelleğe alıyor. Ayrıca `start-url` rotası `/` için `opaqueredirect` yanıtlarını 200'e çeviriyor. Workbox'ın varsayılan davranışı `Cache-Control` başlığına bakmıyor. Ancak bu SW hiçbir istemcide kayıtlı olmadığı için (yukarıdaki kök bulgu) A kullanıcısının HTML/RSC yanıtının B kullanıcısına sunulduğu somut bir senaryo bugün kurulamıyor. `push-sw.js` hiçbir şeyi önbelleğe almıyor.
- **Uyarı (bloklayıcı ön koşul):** SW kaydı düzeltildiği anda bu bulgu birebir gerçek ve yüksek önemli hale gelir. Önerilen sıra:
  1. Önce `runtimeCaching` daraltılmalı: kimlikli yollar (`/customer`, `/dealer`, `/admin`, `/admin-gate`, `/staff`, `/c/`, `/feedback/`, `/experience/`) ve `?_rsc=` istekleri `NetworkOnly` olmalı. `others` kuralı yalnızca açıkça herkese açık bir yol listesine uygulanmalı. `start-url` rotasındaki `opaqueredirect → 200` dönüşümü kaldırılmalı.
  2. Çıkış akışına `caches.keys()` ile runtime önbelleklerini silen bir yardımcı eklenmeli.
  3. Bunlardan sonra kayıt düzeltilmeli (aşağıda).

### İddia 2: "Yeniden dene" asıl isteği tekrarlamıyor, QR token URL'si kayboluyor
- **Karar:** çürütüldü (kullanıcıya bugün ulaşan bir senaryo olarak). Kod düzeyindeki kusur gerçek ama gizli.
- **Not:** `app/offline/page.tsx:29-34` gerçekten `<Link href="/">Yeniden dene</Link>` ve bu etiket yaptığı işi yanlış anlatıyor. Ancak iddianın senaryosu, `/c/<token>` isteğine SW'nin `caches.match("/offline")` ile yanıt vermesine dayanıyor. SW kayıtlı olmadığı için zayıf şebekede `/c/<token>` okutan müşteri bu ekranı değil, tarayıcının kendi bağlantı hatası sayfasını görüyor. Tarayıcının hata sayfasında adres çubuğu `/c/<token>` olarak kalır ve yenileme asıl isteği tekrarlar; yani QR → geri bildirim → puan hunisi bu sayfa yüzünden kırılmıyor. Bugünkü gerçek etkisi düşük: yalnızca `/offline` adresini doğrudan açan biri yanıltıcı etiketli bir ana sayfa linki görür.
- **Uyarı:** SW kaydı düzeltildiğinde iddia birebir gerçekleşir (fallback asıl URL'de sunulur, `Link href="/"` token'ı kaybettirir). Bu yüzden Bulgu 1'deki öneri (bağlantı yoklaması + `window.location.reload()`, ayrı "Ana sayfa" linki) kayıt düzeltmesiyle **aynı değişiklikte** gelmeli.

### Yeni öneri: SW kaydını bilinçli olarak ya düzeltin ya da kaldırın
- **Seçenek A (önerilen, çevrimdışı deneyim isteniyorsa):** `next-pwa@5.6.0` App Router'ı desteklemiyor. App Router uyumlu bir halefe geçin (`@ducanh2912/next-pwa` ya da Serwist). Kayıt `main-app` tarafında yapılır. Push dinleyicileri ana SW'ye taşınmalı (`customWorkerDir` / `importScripts("/push-sw.js")`) ve `use-push-notifications.ts:21` artık ayrı bir script kaydetmemeli, `navigator.serviceWorker.ready` kullanmalı. Aynı `scope: "/"` için iki farklı script kaydedilirse her kayıt öncekinin yerine geçer: push aboneliği ya da önbellek/fallback rastgele devre dışı kalır. Yayına almadan önce yukarıdaki İddia 1 ve İddia 2 düzeltmeleri bitmiş olmalı.
- **Seçenek B (çevrimdışı deneyim öncelikli değilse):** `withPWA` sarmalayıcısını kaldırın ya da `disable: true` yapın. Bu ekran ve onu "çalışıyor" gibi gösteren dokümantasyon bir yanılgı kaynağı olmaktan çıkar. Build'de üretilen ama hiç kullanılmayan 126 KB'lık `sw.js` ile precache listesi de ortadan kalkar.

---

## Uygulama (Dalga 2)

> Yüzey sahibi: `p-kart-masa-offline`. **Önemli tasarım kararı:** SW kaydı artık panel kabuklarında yapılıyor (P0-37) ama `config/pwa.js` rota chunk'larını ön belleğe ALMIYOR (yalnız uygulama kabuğu). Kullanıcı `/offline`'ı hiç açmadıysa sayfanın JS'i cihazda yoktur → bir React adası çevrimdışıyken hidrasyona giremez. Bu yüzden sayfa statik (`force-static`) işaretleme + HTML'e gömülü küçük bir betikle çalışır (`components/customer/p-kart-masa-offline/offline/offline-document.ts`); içerik `dangerouslySetInnerHTML` kabında olduğu için hidrasyon betiğin değişikliklerine dokunmaz. Tüm metin/sabitler sunucuda üretilir; kullanıcı verisi (kart sahibi adı) yalnız `textContent` ile yazılır. Testler: `__tests__/customer/offline-fallback.test.ts` (9 test; betik DOM taklidiyle çalıştırılır). Görsel doğrulama: Tailwind CLI + headless Chrome, 375 px, açık/koyu.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | SW belge fallback'i | ÇALIŞIYOR | Kayıt panel kabuklarında (P0-37); fallback `/offline` ön bellekte. |
| 2 | Tamamen statik render | ÇALIŞIYOR | `force-static`, veri çekmez. |
| 3 | Sayfa başlığı | ÇALIŞIYOR | `title: 'Çevrimdışısınız'` — marka şablondan, tekrar yok. |
| 4 | noindex | ÇALIŞIYOR | |
| 5 | İkon rozeti | ÇALIŞIYOR | Satır içi SVG "sinyal aranıyor" görseli (ağ gerektirmez). |
| 6 | Başlık (h1) | ÇALIŞIYOR | |
| 7 | Açıklama metni | ÇALIŞIYOR | Bağlama göre (kart / masa QR'ı / masa sinyali / cüzdan / genel); söz tutulur (otomatik açılış). |
| 8 | "Yeniden dene" | ÇALIŞIYOR | Bağlantı yoklaması (HEAD `/manifest.json`, 4 sn) → ASIL adres yeniden yüklenir (QR/kart adresi kaybolmaz); doğrudan `/offline` açıldıysa ana sayfa. Ayrı "Ana sayfa" bağlantısı. |
| 9 | Tema uyumu | ÇALIŞIYOR | Rol token'ları; koyu temada doğrulandı. |
| 10 | Mobil yerleşim | ÇALIŞIYOR | Tek sütun, ≥ 44 px hedefler. |
| 11 | Global çevrimdışı şeridi çakışması | ÇALIŞIYOR | `<html data-qx-bare>` → şerit gizlenir (`lib/pwa/bare-chrome`). |
| 12 | Kurulum bandı | ÇALIŞIYOR | Gizlenir. |
| 13 | Sohbet balonu | ÇALIŞIYOR | Yüklenmez (chunk isteği de yok). |
| 14 | Oturum/analitik arka plan istekleri | ÇALIŞIYOR | Kök sağlayıcı zinciri (çoklu kök layout gerektirir) değişmedi; hidrasyon olursa istekler sessizce başarısız olur, zararsız. Chunk yoksa hiç çalışmaz. |
| 15 | Bağlantı gelince otomatik yenileme | ÇALIŞIYOR | `online` + görünürlük + artan aralıklı yoklama (5→10→20→30 sn), görsel geri sayım. |
| 16 | Önbellekteki sayfalar | ÇALIŞIYOR | SW `others` önbelleğindeki bilinen sayfalar (en çok 8) bağlantı olarak. |
| 17 | Çevrimdışı sadakat kartı | ÇALIŞIYOR | Yalnız son doğrulanmış oturum sahibinin Kartım anlık görüntüsü (≤ 30 gün): QR (hazır görsel), ad, maskeli numara, "… itibarıyla"; "Kasada göster" tam ekranı (Esc, odak, Wake Lock). |
| 18 | Çevrimdışı geri bildirim kuyruğu | ÇALIŞIYOR | Masa sinyali kuyruğu (bkz. table-signal) + bu sayfada bekleyen sayısı. QR geri bildirim formunun kuyruğu `/feedback` yüzeyinin işi. |
| 19 | Marka kimliği | ÇALIŞIYOR | Logo işareti + Qratex sözcüğü + marka tonları (ağ gerektirmeyen). |
| 20 | Motion / azaltılmış hareket | ÇALIŞIYOR | Halkalar yalnız yoklama sırasında 2 tur (durum anlatır, sonsuz döngü yok); `prefers-reduced-motion` ve `html.reduce-animations`'ta kapalı. |
| 21 | Bağlantı durumu duyurusu | ÇALIŞIYOR | `role=status` canlı bölge yalnız durum değişiminde; saniye sayacı `aria-hidden`. |
| 22 | Çok dillilik | ÇALIŞIYOR | Cihazdaki dil tercihi (`qratex-locale`) TR/EN. |
| 23 | Çevrimdışı olay telemetrisi | ÇALIŞIYOR | Gösterim günlüğü cihazda; bağlantı gelince `SessionDeviceGuard` rızaya bağlı `offline_fallback_shown` gönderir (kart/QR kodları maskeli). |

### Kapanan bulgular (10/10)
1 (yeniden dene = yoklama + asıl adres) · **2 (paylaşılan cihaz):** `SessionDeviceGuard` (providers) — oturum açan kullanıcı değişince kişisel SW önbellekleri (`others`, `start-url`, `next-data`, `static-data-assets`) ve diğer kullanıcıların kart görüntüleri silinir; çevrimiçiyken sunucu kesin "oturum yok" derse (çıkış) hepsi silinir; çevrimdışı sayfa yalnız son oturum sahibinin kartını gösterir · 3 (otomatik toparlanma + canlı bölge) · 4 (çift mesaj / yersiz global öğeler) · 5 (marka + hafif görsel, 3B yok) · 6 (son kart, önbellekteki sayfalar, bekleyen sinyaller) · 7 (başlık) · 8 (eylemler odak halkalı, Button görünümünde) · 9 (telemetri) · 10 (yalnız tema token'ları — kabul, dokümante).

### Kalanlar
- `config/pwa.js` `others` kuralı oturumlu panel HTML'ini hâlâ 24 sa önbelleğe alıyor (PWA/perf sahibinin dosyası); risk kullanıcı değişimi/çıkış temizliğiyle azaltıldı, kural daraltılmadı.
- Eksik özellik 4 (çevrimdışı ödülsüz mini oyun) KALDIRILDI: ek chunk'ların ön belleğe alınmasını gerektirir; yedek sayfanın "en hafif sayfa" ilkesine aykırı.
