# /admin/observability

**Amaç:** Platform operatörüne tek ekranda "sistem şu an sağlıklı mı?" sorusunun cevabını vermek: Vercel platform durumu, uygulama/DB sağlığı, operasyon kuyruğu (outbox), webhook teslimleri, panel RUM (Web Vitals) ve trafik özeti.

**Genel puan:** 4/10 · **Karar:** yeniden tasarla (veri katmanı kısmen yeniden inşa; `/api/admin/system-status` ile birleştir)

Kısa özet: Sayfa görsel olarak düzgün ve i18n'e bağlı. Ama gösterdiği "canlı" sayıların bir kısmı gerçek değil. "Son 60 sn" kartı ve "En çok istek alan path'ler" tablosu yalnızca bu sayfanın kendi polling isteklerini ölçüyor. RUM verisi sunucusuz örnek (instance) belleğinde tutuluyor. Kuyruk sayacı DLQ'ya düşmüş, bir daha işlenmeyecek event'leri de "bekliyor" sayıyor. Bir operasyon ekranı için en ağır kusur bu: güven vermeyen veri.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | 4 "canlı" gösterge sahte veya kendini ölçüyor, kuyruk sinyali DLQ yüzünden yanlış, alarm/geçmiş/hata takibi hiç yok. |
| UX | 4/10 | En önemli bilgi (hata banner'ı, özet kartlar) statik CWV eşik tablosunun altına gömülü; ham API değerleri (`none`, `degraded_performance`) çevrilmeden gösteriliyor. |
| Görsel | 6/10 | Ortak premium kart dili tutarlı. Ancak açık temada hero ikonları (`text-*-200`) neredeyse görünmüyor, Vercel bileşen tablosu onlarca "operational" satırla gürültülü. |
| Mimari | 3/10 | Metrikler instance-local bellek dizilerinde; 733 satırlık tek client bileşen; aynı sağlık mantığı `/api/admin/system-status` içinde kopya; veri çekme SWR/abort/yarış korumasız. |
| Performans | 5/10 | Her açık sekme, sekme gizliyken bile 30 sn'de bir 3 uç + 5 canlı Neon sorgusu (ikisi 24 saatlik `findMany`, biri `distinct`) çalıştırıyor. Neon compute'u uykuya geçemez. |
| Erişilebilirlik + mobil | 5/10 | Tablolar `overflow-x-auto` ile mobilde idare ediyor ve azaltılmış hareket global olarak destekleniyor. Ama hata banner'ında `role="alert"` yok, canlı bölge yok, tablo `caption`/`scope` yok, açık temada kontrast düşük. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: ADMIN rolü + gizli kapı cookie'si | ÇALIŞIYOR | `proxy.ts:60-88` | `/admin/*` rotası rol + `admin_gate` HMAC cookie'si istiyor. |
| 2 | API yetkisi (3 uç, `requireAuth(['ADMIN'])`) | ÇALIŞIYOR | `app/api/admin/health/route.ts:86`, `vercel-status/route.ts:36`, `web-vitals-summary/route.ts:9` | Gate cookie API katmanında kontrol edilmiyor (`proxy.ts:101-115`). Sistem genelinde böyle, bu sayfaya özgü değil. |
| 3 | Sayfa metadata'sı (başlık/açıklama) | ÇALIŞIYOR | `app/admin/observability/layout.tsx:4-6` | |
| 4 | Ambient arka plan (gradient + blur daireleri) | ÇALIŞIYOR | `page.tsx:158-162` | Dekoratif, `aria-hidden`. |
| 5 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `page.tsx:165-169` | Başlık "Sistem sağlığı", menü adı "Gözlemlenebilirlik": iki farklı ad. |
| 6 | "Canlı" rozeti (ping animasyonu) | SAHTE | `page.tsx:172-178` | Fetch başarısız olsa, veri bayat olsa bile hep yeşil "Canlı" gösteriyor. Hiçbir duruma bağlı değil. |
| 7 | Olay sayısı rozeti | ÇALIŞIYOR | `page.tsx:179-183` | `incidents.length > 0` ise görünüyor. |
| 8 | Hero: Vercel göstergesi | KISMİ | `page.tsx:188-195` | Ham değer basılıyor (`none`, `minor`) ve renk kodlaması yok. "none" operatöre "hiç durum yok" diye okunuyor. |
| 9 | Hero: uygulama sağlığı + gecikme | KISMİ | `page.tsx:196-204` | Açık temada `text-emerald-200`/`text-red-200` ikonu açık zeminde kayboluyor (hero `tone='auto'` → açık kart, `admin-premium-hero.tsx:160-170`). |
| 10 | Hero: "istek / 60 sn" | SAHTE | `page.tsx:205-211`, `lib/metrics.ts:19` | Bkz. #38: yalnızca bu sayfanın kendi istekleri sayılıyor. |
| 11 | CWV eşik tablosu (LCP/INP/CLS) | ÇALIŞIYOR (statik) | `page.tsx:218-280` | i18n'den sabit metin. FCP/TTFB eşikleri yok, oysa RUM tablosu 5 metrik gösteriyor (`lib/rum-web-vitals.ts:59`). |
| 12 | CWV notu | ÇALIŞIYOR | `page.tsx:255-257` | Metin "üretimde kalıcı RUM deposu ekleyin" diyor, yani eksikliği kendisi itiraf ediyor (`messages/tr.json`, `cwvNote`). |
| 13 | Dış linkler (web.dev, Vercel Speed Insights) | ÇALIŞIYOR | `page.tsx:259-276` | `noopener noreferrer` var. Speed Insights uygulamada kurulu (`app/layout.tsx:5,169`) ama verisi sayfaya bağlanmamış, yalnızca dokümana link veriliyor. |
| 14 | RUM özet tablosu (adet/ortalama/iyi %) | KISMİ | `page.tsx:313-338`, `lib/rum-web-vitals.ts:25-31,52-67` | Bellek içi, örnek başına, en fazla 800 kayıt. Ortalama kullanılıyor (CWV standardı p75). CLS (birimsiz) ile ms metrikleri aynı sütunda, birim yok. |
| 15 | RUM pencere bilgisi + üretim zamanı | ÇALIŞIYOR | `page.tsx:314-317` | "60 dk" yazıyor ama 800 kayıt tavanı yüzünden trafik varken gerçek pencere çok daha kısa olabilir. |
| 16 | RUM rol dağılımı | KISMİ | `page.tsx:339-350` | Ham rol kodları (`CUSTOMER: 12`) çevrilmeden gösteriliyor. |
| 17 | RUM son örnekler listesi | KISMİ | `page.tsx:351-367` | 24 kayıt. `rating` ham İngilizce (`needs-improvement`) ve renk kodu yok. Path `truncate` ediliyor ama `title` yok, tam path görülemiyor. |
| 18 | RUM JSON kopyala | ÇALIŞIYOR | `page.tsx:119-129, 293-304` | |
| 19 | RUM boş durumu | KISMİ | `page.tsx:309-310` | İlk yüklemede ve API hatasında da "Henüz örnek yok" gösteriliyor. Üç durum ayırt edilmiyor. |
| 20 | RUM yükleniyor iskeleti | EKSİK | `page.tsx:306-371` | Diğer kartlarda `Skeleton` var, burada yok. |
| 21 | RUM hata bildirimi | EKSİK | `page.tsx:58-66, 74-76` | `rumOk=false` sessizce `setRum(null)` yapıyor. Hata banner'ı RUM'u hiç hesaba katmıyor. |
| 22 | Hata banner'ı | KISMİ | `page.tsx:374-388` | İki statik bölümün altında, kullanıcı aşağı kaydırmadan görmüyor. `role="alert"` yok. JSON parse hatasında (ör. 504 HTML) catch üç veriyi birden siliyor ve ham `SyntaxError` mesajını gösteriyor (`page.tsx:55-56, 79-83`). |
| 23 | Banner içi "Yenile" | KISMİ | `page.tsx:384` | #25 ile aynı sorun: yükleniyor geri bildirimi yok. |
| 24 | "Son güncelleme" göreli zamanı | ÇALIŞIYOR | `page.tsx:95-106` | 5 sn'de bir `tick` yüzünden 733 satırlık ağacın tamamı yeniden render ediliyor. Küçük bir maliyet. |
| 25 | "Yenile" butonu | KISMİ | `page.tsx:395-398`, `page.tsx:44-87` | `setLoading(true)` yalnızca ilk state'te var. Manuel yenilemede spinner dönmüyor, buton disable olmuyor, çift tıklama paralel istek atıyor. |
| 26 | 30 sn otomatik yenileme | KISMİ | `page.tsx:19, 89-93` | Sekme gizliyken de çalışıyor. Duraklatma kontrolü yok. AbortController/sıra koruması yok, eski yanıt yenisinin üstüne yazabilir. |
| 27 | Vercel durum kartı | KISMİ | `page.tsx:414-457`, `page.tsx:21-27` | `statusBadgeClass` Statuspage'in `minor` ve `critical` göstergelerini tanımıyor ve gri (nötr) boyuyor. Kritik platform kesintisi gri rozetle görünür. |
| 28 | Vercel JSON kopyala | ÇALIŞIYOR | `page.tsx:143-153, 428-440` | |
| 29 | Sağlık kartı: Tamam/Hata + gecikme ms | KISMİ | `page.tsx:493-499`, `health/route.ts:84-100` | `latencyMs` auth + DB ping + 4 ops sorgusunun toplamı. "Uygulama gecikmesi" diye sunuluyor ama DB veya kullanıcı gecikmesi değil. |
| 30 | Bölge (`VERCEL_REGION`) | ÇALIŞIYOR | `page.tsx:500`, `health/route.ts:107` | |
| 31 | DB bağlantı durumu | ÇALIŞIYOR | `page.tsx:501-506`, `health/route.ts:88-95` | `SELECT 1`. Gecikme eşiği (warn) yok, oysa `system-status` 500 ms eşiği kullanıyor (`system-status/route.ts:26-29`). |
| 32 | İşlem e-postası yapılandırması | ÇALIŞIYOR | `page.tsx:507-523` | Yalnızca "yapılandırıldı mı" bilgisi. Teslim/bounce oranı yok. |
| 33 | Kuyruk: bekleyen outbox sayısı | BOZUK | `health/route.ts:40`, `lib/outbox.ts:34,64`, `prisma/schema.prisma:351` | `processedAt: null` sayılıyor, `deadAt: null` filtresi yok. DLQ'ya düşen poison event'ler sonsuza kadar "bekliyor" sayılıyor. |
| 34 | Kuyruk gecikmesi "N dk gecikme" | BOZUK | `health/route.ts:41-45`, `page.tsx:531-533` | En eski event de DLQ'yu içeriyor. Tek bir ölü event kalıcı sahte alarm üretiyor. "dk gecikme" sabit Türkçe kodlanmış, EN'de de Türkçe çıkıyor. |
| 35 | Webhook 24s teslim / başarısız | KISMİ | `health/route.ts:47-50, 59-62` | `take: 1000` tavanı sessiz; aşıldığında hem toplam hem başarısız sayısı eksik. `/admin/webhooks`'a link yok. |
| 36 | Aktif kullanıcı (24s) | KISMİ | `health/route.ts:52-56` | `distinct userId` + `take: 5000`: tavan sessiz ve 30 sn'de bir ağır sorgu. Bu bir iş metriği, sağlık ekranında yeri tartışmalı. |
| 37 | Sağlık JSON kopyala | ÇALIŞIYOR | `page.tsx:131-141, 474-486` | |
| 38 | "Son 60 sn" kartı (istek/hata/ort. ms) | SAHTE | `page.tsx:557-596`, `lib/metrics.ts:19-22`; çağıranlar yalnızca `health/route.ts:102,119` ve `vercel-status/route.ts:47,87,92` | `trackRequest` uygulamanın başka hiçbir yerinde çağrılmıyor. Kart, bu sayfanın kendi polling'ini ve tek bir serverless örneğinin belleğini gösteriyor. |
| 39 | Vercel bileşenleri tablosu | KISMİ | `page.tsx:601-645`, `vercel-status/route.ts:62-71` | Statuspage summary'deki tüm bileşenler (onlarca bölge/servis; tam sayı doğrulanmadı) filtresiz ve gruplamasız listeleniyor. Ham `degraded_performance` değerleri çevrilmeden gösteriliyor. Arama ve "yalnızca sorunlu" filtresi yok. |
| 40 | Bileşenler boş durumu | ÇALIŞIYOR | `page.tsx:640-642` | |
| 41 | Açık olaylar kartları | KISMİ | `page.tsx:648-684`, `page.tsx:21-27` | Incident `status` değerleri (`investigating/identified/monitoring`) `statusBadgeClass`'ta tanımlı değil, hepsi gri. `impact` alanı alınmıyor (`vercel-status/route.ts:72-81`), son güncelleme metni yok. |
| 42 | Olay "Detay" linki | ÇALIŞIYOR | `page.tsx:673-677` | |
| 43 | "En çok istek alan path'ler" tablosu | SAHTE | `page.tsx:687-729`, `lib/metrics.ts:29-63` | #38 ile aynı kaynak: tabloda en fazla iki satır görünür (`/api/admin/health`, `/api/admin/vercel-status`). |
| 44 | Toast bildirimleri | KISMİ | `lib/admin-toast.ts:15-20` | Önek `Basarili: ` / `Dikkat: ` Türkçe karakter içermiyor ve EN dilinde de Türkçe çıkıyor. Üç kopyalama işlemi de `rumCopySuccess` anahtarını kullanıyor (`page.tsx:137,149`). |
| 45 | TR/EN i18n | KISMİ | `messages/tr.json:2795-2881` | Çoğu metin çevrilmiş. Sabit `dk gecikme` (`page.tsx:532`), ham API durumları ve ham rol kodları çevrilmemiş. |
| 46 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:164, 231, 412, 616, 702` | Grid kırılıyor, tablolar yatay kayıyor. 4 sütunlu tablolar 400 px'te sıkışık ama kullanılabilir. |
| 47 | Azaltılmış hareket | ÇALIŞIYOR | `components/providers.tsx:232`, `app/globals.css:801-818` | Global `MotionConfig reducedMotion="user"` + CSS kuralı `animate-ping`'i de durduruyor. |
| 48 | Klavye / ARIA | KISMİ | `page.tsx:374-388, 232, 391-394` | Butonlar odaklanabilir. Banner'da `role="alert"`/`aria-live` yok, "son güncelleme" canlı bölge değil, tablolarda `caption`/`scope` yok, bazı dekoratif ikonlarda `aria-hidden` eksik (ör. `page.tsx:381, 396, 405`). |
| 49 | Bölüm anchor'ları (`#core-web-vitals`, `#rum-web-vitals`) | ÇALIŞIYOR | `page.tsx:218, 282`; tüketenler `app/admin/accessibility/page.tsx:92,98`, `app/admin/design-language/page.tsx:64` | |
| 50 | Trust timeline'dan gelen güvenlik uyarısı derin linki | BOZUK | `app/api/admin/trust-timeline/route.ts:193-201` | `SecurityAlert` öğeleri bu sayfaya yönlendiriliyor ama sayfa hiçbir güvenlik uyarısı göstermiyor. Kullanıcı boşluğa düşüyor. |
| 51 | Eşik tabanlı alarm / bildirim | EKSİK | — | Kuyruk birikmesi, DB hatası veya webhook hata oranı için push/e-posta uyarısı yok. Ekranı açık tutan kişiye bile görsel eşik uyarısı yok, `>50` dışında. |
| 52 | Zaman serisi / geçmiş | EKSİK | — | Tüm göstergeler anlık. "Son 24 saat nasıldı?" sorusunun cevabı yok. |
| 53 | Hata takibi (Sentry) özeti | EKSİK | `sentry.client.config.ts:8-11` | Sentry kurulu ama sayfada son hata/issue sayısı ya da linki yok. |
| 54 | Cron / iş kalp atışı | EKSİK | `app/api/cron/*` (10 uç) | Harici cron-job.org tetiklemeleri için son çalışma/başarı görünürlüğü yok. Kodda heartbeat kaydı bulunamadı. |
| 55 | DLQ görünümü ve yeniden deneme | EKSİK | `lib/outbox.ts:24-64` | `deadAt` hiçbir ekranda gösterilmiyor (grep: yalnızca `lib/outbox.ts`). |
| 56 | Bağımlılık kontrolleri (Redis, R2, AI sağlayıcı, IMAP) | EKSİK | `health/route.ts:84-113` | Yalnızca DB ve mail yapılandırması kontrol ediliyor. |

**Durum dağılımı:** ÇALIŞIYOR 22 · KISMİ 19 · BOZUK 3 · SAHTE 4 · EKSİK 8 (toplam 56)

---

## Bulgular

### 1. "Son 60 sn" ve "En çok istek alan path'ler" kendini ölçüyor (sahte metrik)
- **Önem:** yüksek · **Kategori:** veri bütünlüğü
- **Kanıt:** `lib/metrics.ts:19-22` `trackRequest` yalnızca `app/api/admin/health/route.ts:102,119` ve `app/api/admin/vercel-status/route.ts:47,87,92` içinden çağrılıyor (repo genelinde grep: 8 eşleşme, başka çağıran yok). Gösterim yerleri: `page.tsx:205-211` (hero), `557-596` (kart), `687-729` (tablo).
- **Sorun:** Operatör "istek/60 sn = 4, hata = 0" gördüğünde sistemin sakin ve hatasız olduğunu sanıyor. Oysa bu sayılar yalnızca bu dashboard'un 30 sn'lik polling'i. Üstelik değer tek bir serverless örneğinin belleğinde tutuluyor (`lib/metrics.ts:10`) ve iki ardışık istek farklı örneklere düşerse sayı sıfırlanıyor. Sağlık ekranında yanlış güven veren sinyal, hiç sinyal olmamasından daha kötü.
- **Öneri:** Bu kartı ve tabloyu kaldırın, ya da gerçek trafik kaynağına bağlayın. Seçenekler:
  - (a) Vercel Observability / Log Drain verisini çeken bir sunucu ucu. Vercel REST API erişimi doğrulanmadı.
  - (b) `proxy.ts` içinde `/api/*` için Upstash Redis'e dakikalık kova sayaçları (`INCR metrics:{yyyymmddhhmm}:{route}:{status}` + `EXPIRE 2h`). Proxy zaten her API isteğinden geçiyor; latency için `after()` ile route handler'larda ölçüm yapılabilir.
  - (c) Gerçek veri gelene kadar kartın yerine "Trafik metrikleri bağlı değil" boş durumu.

  Hero'daki "istek/60 sn" chip'i de aynı kaynağa bağlanmalı.
- **Efor:** M (Redis sayaçları + yeni uç) / S (kaldırma)

### 2. Outbox kuyruğu DLQ'yu "bekliyor" sayıyor, kalıcı sahte gecikme alarmı
- **Önem:** yüksek · **Kategori:** hata / veri bütünlüğü
- **Kanıt:** `app/api/admin/health/route.ts:40` `count({ where: { processedAt: null } })`, `:41-45` aynı filtreyle en eski event. İşleyici ise `lib/outbox.ts:34` `where: { processedAt: null, deadAt: null }` kullanıyor ve `:64` eşik aşılınca `deadAt` set ediyor. Şema: `prisma/schema.prisma:349-351`.
- **Sorun:** Bir event DLQ'ya düştüğünde bir daha işlenmiyor ama sağlık ekranında sonsuza kadar "1 bekliyor · X dk gecikme" olarak kalıyor. Gecikme sürekli büyüyor, sarı vurgu kalıcı hale geliyor ve operatör alarma duyarsızlaşıyor. Asıl önemli bilgi olan "kaç poison event var, hangi hatayla" ise hiçbir yerde görünmüyor.
- **Öneri:** Ops yanıtını üç sayaca ayırın: `pending` (`processedAt null, deadAt null`), `oldestPendingAgeSec` (aynı filtre) ve `deadLetter` (`deadAt not null`, son 7 gün + toplam). UI'da DLQ ayrı kırmızı satır olarak görünsün ve tıklanınca son 20 DLQ kaydını (`eventName`, `attemptCount`, `lastError`, `createdAt`) gösteren bir çekmece açılsın. "Yeniden dene" (deadAt=null, attemptCount=0) ve "Yok say" aksiyonları audit log'lu POST uçlarıyla eklensin. `@@index([processedAt])` mevcut, DLQ sorgusu için `@@index([deadAt])` eklenmeli.
- **Efor:** M

### 3. RUM verisi serverless örnek belleğinde tutuluyor, gösterilen sayılar tutarsız
- **Önem:** yüksek · **Kategori:** mimari / veri bütünlüğü
- **Kanıt:** `lib/rum-web-vitals.ts:1-4` ("serverless instances reset between invocations"), `:23-31` (800 kayıtlık modül dizisi). Yazan `app/api/user/web-vitals/route.ts:39`, okuyan `app/api/admin/web-vitals-summary/route.ts:12`.
- **Sorun:** POST ile GET farklı örneklere düşebilir. Sonuçta admin çoğu zaman "Henüz örnek yok" görüyor ya da her yenilemede farklı bir alt küme. Deploy ve soğuk başlangıçta veri sıfırlanıyor. 800 kayıt tüm roller arasında paylaşılıyor, "60 dk" penceresi gerçekte çok daha kısa olabiliyor. Ayrıca ortalama kullanılıyor; Google'ın CWV değerlendirmesi p75'e dayanıyor, ortalama aykırı değerlere duyarlı ve hedef tablosuyla (#11) kıyaslanamaz.
- **Öneri:** İki yol var:
  - (a) Kendi RUM'unuzu tutacaksanız Upstash Redis'te metrik başına saatlik kovalar (ör. rating sayaçları + değer histogram kovaları) tutun ve p75'i histogramdan hesaplayın. Örnekleme (ör. %20) ve kullanıcı başına rate limit ekleyin.
  - (b) Vercel Speed Insights zaten kurulu (`app/layout.tsx:169`); `/api/user/web-vitals` toplayıcısını kaldırıp bu bölümü Speed Insights'a derin link + kısa açıklamayla değiştirin.

  Her iki durumda tablo `p75`, `iyi/geliştir/zayıf` yığılmış çubuk ve metrik başına birim (`s`, `ms`, birimsiz) göstermeli. Yol (a) seçilirse rota bazlı kırılım (en kötü 5 path) en değerli içgörü olur.
- **Efor:** L (a) / S (b)

### 4. Sekme gizliyken de 30 sn'de bir canlı Neon sorguları, compute uykuya geçemiyor
- **Önem:** orta · **Kategori:** performans / maliyet
- **Kanıt:** `page.tsx:89-93` (koşulsuz `setInterval`). Sorgular `health/route.ts:89` + `:39-57`: 1 `SELECT 1` + `count` + `findFirst` + 24 saatlik `findMany` (1000) + 24 saatlik `distinct` `findMany` (5000). Cache yok (`PRIVATE_NO_STORE_HEADERS`). Hafızadaki bilgi: `DATABASE_URL` canlı Neon.
- **Sorun:** Açık unutulan tek bir admin sekmesi saatte 120 × 5 sorgu üretiyor ve Neon'un autosuspend'ini engelliyor. `distinct userId` sorgusu `analyticsEvent` büyüdükçe pahalılaşıyor (`[createdAt]` indeksi var ama `distinct` yine 5000 satıra kadar tarıyor). Birden çok admin bu yükü katlıyor.
- **Öneri:** İstemcide `document.visibilityState` dinleyip gizliyken polling'i durdurun, odakta hemen yenileyin. Hero'ya "Otomatik yenile: Açık/Kapalı + aralık" kontrolü ekleyin. Sunucuda ops bloğunu Upstash'te 30-60 sn TTL ile önbelleğe alın (proje zaten Redis cache deseni kullanıyor). "Aktif kullanıcı 24s" iş metriğini bu ekrandan çıkarın veya cron ile önceden hesaplayın. Veri çekmeyi SWR/React Query'ye taşıyın (dedupe + `refreshInterval` + `refreshWhenHidden:false`).
- **Efor:** S-M

### 5. Vercel durum renklendirmesi Statuspage değerlerini yanlış eşliyor
- **Önem:** orta · **Kategori:** hata / UX
- **Kanıt:** `page.tsx:21-27`: yalnızca `operational/none/full`, `degraded|performance`, `partial|major|outage` tanınıyor. Statuspage `indicator` değerleri `none/minor/major/critical`, incident durumları `investigating/identified/monitoring/resolved/postmortem`, bileşen durumu ayrıca `under_maintenance`. Kullanım `page.tsx:192, 448-450, 630, 672`.
- **Sorun:** `critical` (en ağır seviye) ve `minor` gri nötr rozetle gösteriliyor. Açık olayların hepsi gri. Hero chip'inde (`page.tsx:191-193`) hiç renk yok ve ham `none` yazıyor. Operatör en kötü durumda en az uyarıcı görseli görüyor.
- **Öneri:** Tip güvenli bir `StatusTone` eşleme tablosu (`lib/status-tone.ts`) oluşturun: `{ none|operational → ok, minor|degraded_performance|under_maintenance → warn, major|partial_outage → error, critical|major_outage → critical }`. Her değeri i18n anahtarıyla çevirin ("Tüm sistemler çalışıyor", "Kısmi kesinti"…). Hero'daki gösterge bu tonla renklensin ve `critical` için kırmızı vurgulu kalıcı şerit çıksın. Incident için `impact` alanını route'ta da maple'yın (`vercel-status/route.ts:72-81`).
- **Efor:** S

### 6. Hata yönetimi kırılgan: tek bir JSON parse hatası tüm veriyi siliyor; banner gömülü
- **Önem:** orta · **Kategori:** hata yönetimi / UX
- **Kanıt:** `page.tsx:55-56` iki yanıtta da `ok` kontrolünden önce koşulsuz `.json()` çağrılıyor. `:79-83` catch üç state'i de null'luyor ve ham `e.message` gösteriyor. Banner ise statik CWV ve RUM bölümlerinin altında (`page.tsx:374`). `loading` yalnızca başlangıçta true (`:36`, `:85`).
- **Sorun:** Vercel bir istekte 504 HTML döndürürse `Unexpected token '<'` gibi teknik bir İngilizce mesaj görünüyor ve son iyi veri de kayboluyor. Kullanıcı bunu ancak sayfayı kaydırınca fark ediyor. Manuel yenilemede görsel geri bildirim olmadığından hata ile yenileme ayırt edilemiyor. Eşzamanlı istekler sıra korumasız.
- **Öneri:** Her kaynak için bağımsız durum (`{ data, status: 'idle'|'loading'|'ok'|'error', error, fetchedAt }`) tutun ve `Promise.allSettled` + kaynak başına güvenli parse kullanın. Hata durumunda son iyi veriyi "bayat · 2 dk önce" etiketiyle göstermeye devam edin. Banner'ı hero'nun hemen altına `role="alert"` ile taşıyın ve hangi kaynağın düştüğünü kart üzerinde de işaretleyin. AbortController ile önceki isteği iptal edin. `isRefreshing` state'i ile buton spinner'ını gerçekten bağlayın.
- **Efor:** S-M

### 7. "Canlı" rozeti durumdan bağımsız
- **Önem:** orta · **Kategori:** UX / güven
- **Kanıt:** `page.tsx:172-178`.
- **Sorun:** API'ler düşse ve son güncelleme 10 dk önce olsa bile yanıp sönen yeşil "Canlı" görünüyor. Gözlemlenebilirlik ekranında durum göstergesinin kendisi yalan söylememeli.
- **Öneri:** Rozeti bağlantı durumuna bağlayın: veri < 2 aralık yaşında ise yeşil "Canlı", daha eski ise amber "Bayat", hata varsa kırmızı "Bağlantı yok", polling durdurulmuşsa gri "Duraklatıldı". Bu, #4'teki otomatik yenileme kontrolüyle doğal olarak birleşir.
- **Efor:** S

### 8. Trust timeline'daki güvenlik uyarıları bu sayfaya yönleniyor ama sayfa bunları göstermiyor
- **Önem:** orta · **Kategori:** kırık link / bilgi mimarisi
- **Kanıt:** `app/api/admin/trust-timeline/route.ts:193-201` (`kind: 'security'`, `href: '/admin/observability'`). Sayfada `SecurityAlert` ile ilgili hiçbir şey yok (`page.tsx` tamamı).
- **Sorun:** Trust Command'den bir güvenlik uyarısına tıklayan operatör ilgisiz bir sağlık ekranına düşüyor ve uyarıyı bulamıyor.
- **Öneri:** Ya linki güvenlik uyarılarının gerçekten listelendiği bir yüzeye (`/admin/trust-command#security` veya `/admin/audit?type=security`) çevirin, ya da bu sayfaya "Son güvenlik uyarıları" bölümü ekleyip `?alert=<id>` ile ilgili satırı vurgulayın. Ürün açısından ilki daha doğru: güvenlik, Trust Command'in sorumluluğu.
- **Efor:** S

### 9. Webhook ve aktif kullanıcı sayaçlarında sessiz tavan
- **Önem:** düşük-orta · **Kategori:** veri doğruluğu
- **Kanıt:** `health/route.ts:49` `take: 1000`, `:55` `take: 5000`, `:59-62` başarısızlıkların bellekte filtrelenmesi.
- **Sorun:** Yoğun bir günde "1000 teslim · 37 başarısız" görülür ama gerçek değerler daha yüksektir. Tavana ulaşıldığı UI'da belirtilmiyor. Başarısızlık JSON alanında, bellekte filtreleniyor.
- **Öneri:** Webhook için `count` + başarısızlık için Postgres JSON filtresi (`data->>'ok' <> 'true'`) ile `$queryRaw` kullanın, ya da teslim sonucunu ayrı bir `WebhookDelivery` tablosuna (`ok` boolean, indeksli) taşıyın; `/admin/webhooks/deliveries` da bundan faydalanır. Aktif kullanıcı için `COUNT(DISTINCT "userId")`. Tavan kalırsa UI'da "1000+" gösterin. Webhook satırı `/admin/webhooks`'a link olmalı.
- **Efor:** S-M

### 10. Sağlık mantığı iki ayrı uçta kopya
- **Önem:** düşük-orta · **Kategori:** mimari
- **Kanıt:** `app/api/admin/system-status/route.ts:14-60` (DB ping + 500 ms warn eşiği + mail + ortam), tüketenler `app/admin/admin-dashboard-client.tsx:88`, `app/admin/settings/settings-client.tsx:331`. Bu sayfa ise `/api/admin/health` kullanıyor (eşik yok).
- **Sorun:** Dashboard "degraded (DB yavaş)" derken observability "Tamam" diyebilir. İki kaynak, iki gerçek.
- **Öneri:** `lib/health/collect.ts` altında tek bir `collectPlatformHealth({ include: ['db','ops','mail','deps'] })` fonksiyonu yazın, iki uç da bunu kullansın (veya `system-status` kaldırılıp dashboard aynı uca hafif modla bağlansın). Durum hesabı (`ok/warn/error`) sunucuda tek yerde yapılsın.
- **Efor:** M

### 11. Bilgi mimarisi: statik referans içerik canlı verinin önünde
- **Önem:** düşük-orta · **Kategori:** UX
- **Kanıt:** Sıra `page.tsx`: hero → CWV eşik tablosu (218, statik) → RUM (282) → hata banner'ı (374) → son güncelleme/yenile (391) → özet kartlar (402) → bileşenler (601) → olaylar (648) → path'ler (687).
- **Sorun:** İlk ekranda (ekranın kaydırmadan görünen kısmında) operatörün "her şey yolunda mı?" sorusuna cevap yok, Google'ın sabit eşik tablosu var. Açık olaylar listenin sonunda, bileşen tablosunun altında. En kritik bilgi en aşağıda.
- **Öneri:** Yukarıdan aşağı "durum → sorunlar → detay → referans" sırası. Detay "Yeniden tasarım vizyonu"nda.
- **Efor:** M

### 12. Açık temada kontrast ve ARIA eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik
- **Kanıt:** `page.tsx:175` (`bg-emerald-200` nokta), `:199` (`text-emerald-200`/`text-red-200`), `:207` (`text-amber-200`). Hero açık temada açık kart (`admin-premium-hero.tsx` `tone='auto'`). Chip'lerde `border-border/70` var ama `border` sınıfı yok (`:189, 198, 206`), kenarlık çizilmiyor. Banner'da `role` yok (`:375-388`).
- **Sorun:** Açık temada ikon kontrastı WCAG 3:1 grafik eşiğinin altında (görsel olarak doğrulanmadı, Tailwind palet değerlerinden çıkarım). Ekran okuyucu kullanıcısı hata banner'ının belirdiğini duymuyor.
- **Öneri:** Hero içindeki tonları `text-emerald-600 dark:text-emerald-200` desenine çevirin. Durum ikonlarını tek `StatusDot` bileşenine toplayın (ikon + metin + ton). Banner'a `role="alert"`, "son güncelleme" satırına `aria-live="polite"` ekleyin. Tablolara görsel olarak gizli `caption` ve `th scope="col"` ekleyin.
- **Efor:** S

### 13. Dil karışıklığı ve toast öneki
- **Önem:** düşük · **Kategori:** i18n
- **Kanıt:** `page.tsx:532` (`dk gecikme` sabit), `:192, 449, 630, 672` (ham API durumları), `:346` (ham rol kodu), `:363` (ham rating), `lib/admin-toast.ts:16-19` (`Basarili: `, `Dikkat: `, ASCII ve dilden bağımsız), `page.tsx:137,149` (sağlık/Vercel kopyalama başarısında RUM mesaj anahtarı).
- **Öneri:** Durum, rol ve rating için çeviri haritaları ekleyin. `admin-toast` önekini locale'e bağlayın ya da kaldırın (sonner zaten ikonla tür gösteriyor). Kopyalama mesajını genel `common.copied` anahtarına taşıyın.
- **Efor:** S

### 14. RUM ingest ucu rate limit'siz
- **Önem:** düşük · **Kategori:** güvenlik / veri bütünlüğü
- **Kanıt:** `app/api/user/web-vitals/route.ts:19-52`: yalnızca auth + zod var, rate limit yok. Global proxy'de API rate limit'i görülmedi (`proxy.ts:101-115`); başka katmanda olup olmadığı doğrulanmadı.
- **Sorun:** Oturum açmış herhangi bir müşteri döngüyle sahte `path`/`value` göndererek 800 kayıtlık tamponu doldurabilir ve admin RUM görünümünü zehirleyebilir. Etki düşük (bellek içi, kalıcı değil) ama #3 kalıcı depoya geçerse önem artar.
- **Öneri:** Kullanıcı başına dakikalık Upstash rate limit (ör. 30/dk). `value` için metrik başına makul aralık doğrulaması (CLS 0-10, ms 0-60000). `path` normalize edilsin (ID'ler `:id` ile maskelensin), böylece kırılım da anlamlı olur.
- **Efor:** S

### 15. Ölü/kötü kod kokuları
- **Önem:** düşük · **Kategori:** kod kalitesi
- **Kanıt:** `page.tsx:91, 96` `const t = setInterval(...)`: çeviri fonksiyonu `t`'yi gölgeliyor. `:423, 469, 566` `group-hover:scale-105` üst `group` sınıfına bağlı (`PREMIUM_PANEL_CARD_BASE` içinde var, çalışıyor) ama kart tıklanabilir olmadığı halde hover efekti affordance yanılsaması yaratıyor. `statusBadgeClass` içindeki `'full'` hiçbir kaynakta yok. `vercel-status/route.ts:40-42` fetch fırlatırsa `clearTimeout` çağrılmıyor (zararsız ama düzensiz). `latencyMs` adı yanıltıcı (#29).
- **Öneri:** Değişken adlarını düzeltin, tıklanamayan kartlardan hover-scale/gölge efektini kaldırın, `finally { clearTimeout }` kullanın. Sayfayı ~6 alt bileşene bölün (`StatusHeader`, `IncidentStrip`, `HealthGrid`, `QueuePanel`, `RumPanel`, `ProviderComponentsTable`).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Uyarı kuralları ve bildirim (PostHog Alerts, Datadog monitor, Vercel Observability alerts):** kuyruk > N, DLQ > 0, DB hatası, webhook hata oranı > %X, LCP p75 > 2,5 s için eşik tanımlama. Bildirim mevcut push merkezi ve e-posta üzerinden gitsin, "son tetiklenme" geçmişi tutulsun.
2. **Zaman serisi ve karşılaştırma (Stripe Dashboard, Linear Insights):** her KPI için 24 saatlik sparkline ve "dünle kıyas" deltası. Şu an her şey anlık bir fotoğraf.
3. **Hata takibi özeti (Sentry entegrasyonu):** son 24 saatte yeni issue sayısı, en sık 5 hata ve Sentry'ye derin link. Sentry zaten kurulu.
4. **Zamanlanmış iş (cron) panosu (Retool / Vercel Cron Jobs ekranı):** 10 cron ucunun son çalışma zamanı, süresi, sonucu ve "şimdi çalıştır" (audit log'lu). Bunun için her cron'un sonunda Redis/DB'ye heartbeat yazılması gerekiyor.
5. **DLQ / outbox gezgini:** ölü event listesi, hata mesajı, yeniden dene/yok say aksiyonları.
6. **Bağımlılık sağlık matrisi + deploy bilgisi:** Redis (Upstash) ping, R2 HEAD, AI sağlayıcı ve IMAP erişimi, Neon gecikmesi. Ek olarak `VERCEL_GIT_COMMIT_SHA`, deploy zamanı, ortam. Statuspage'teki gibi ikon + durum + gecikme ızgarası.

(Ayrıca: otomatik yenilemeyi duraklatma ve aralık seçimi, olay için zaman çizelgesi, durum snapshot'ını Markdown/JSON olarak dışa aktarma.)

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında 2 saniyede tek bir cümle okumalı: "Tüm sistemler çalışıyor" veya "2 sorun var: DLQ'da 3 event, Vercel'de kısmi kesinti". Sonra yalnızca sorunlu alanların detayına inmeli. Referans içerik (CWV eşikleri) en alta, katlanır bir "Rehber" bölümüne inmeli.

**Yerleşim (yukarıdan aşağı):**
1. **Durum şeridi (sticky, kompakt):** genel durum (ok/warn/error/critical, tek renk + metin), bağlantı rozeti (Canlı/Bayat/Duraklatıldı), son güncelleme (`aria-live`), otomatik yenile anahtarı + aralık, Yenile butonu. Hata varsa şeridin hemen altında `role="alert"` banner'ı.
2. **Sorunlar listesi (yalnızca varsa):** Vercel incident'ları (impact rengiyle), DLQ, webhook hata oranı eşiği, DB yavaşlığı. Her satırda tek bir sonraki adım ("DLQ'yu aç", "Webhook teslimlerine git", "Statuspage'te gör").
3. **Sağlık ızgarası (4-6 kare):** DB (gecikme + eşik), Kuyruk (pending / en eski / DLQ), Webhook (24 s başarı oranı), Mail (yapılandırma + son 24 s bounce), Redis, R2/AI. Her karede değer, ton, 24 saatlik sparkline ve hedef sayfaya link.
4. **Performans (RUM):** metrik başına p75 + iyi/geliştir/zayıf yığılmış çubuk + hedef eşik çizgisi, en kötü 5 rota. Kalıcı depo yoksa Speed Insights'a yönlendiren dürüst bir boş durum.
5. **Zamanlanmış işler:** cron tablosu (son çalışma, süre, sonuç).
6. **Sağlayıcı bileşenleri (katlanır):** Vercel bileşenleri, varsayılan olarak "yalnızca sorunlular" filtreli, arama kutulu. Hepsi çalışıyorsa tek satırlık özet: "N bileşen çalışıyor".
7. **Rehber (katlanır):** CWV eşikleri ve dış linkler.

**Motion / 3B:** 3B burada yersiz, gözlemlenebilirlik ekranı sakin ve okunur olmalı. Motion yalnızca anlam taşıdığı yerde kullanılsın:
- Durum değiştiğinde kare tonunun 200 ms'lik renk geçişi ve sayı değişiminde kısa bir "flash" vurgusu (Stripe tarzı).
- Sorunlar listesine yeni öğe girişinde `AnimatePresence` ile yükseklik animasyonu.
- "Canlı" noktasının ping'i yalnızca bağlantı sağlıklıyken çalışsın.

Mevcut kart-giriş stagger'ı (`page.tsx:414-418, 460-464, 557-561`) her 30 sn'lik yenilemede tekrar etmiyor ama ilk yüklemede de katkısı yok; kaldırılabilir. Global `MotionConfig reducedMotion="user"` korunmalı.

**Veri / API değişiklikleri:**
- `GET /api/admin/observability/summary`: tek uç, `collectPlatformHealth()` üzerinden. Bölümler `Promise.allSettled` ile, kaynak başına `{status, value, fetchedAt, error}` döner. Ops bloğu Upstash'te 30 sn TTL ile önbelleklenir. `system-status` bu fonksiyona taşınır.
- Outbox sayaçları `pending` / `deadLetter` olarak ayrılır. `GET /api/admin/outbox/dead` + `POST .../retry|dismiss` (audit log, ADMIN).
- Trafik: `proxy.ts` içinde Redis dakikalık sayaç (route şablonu + durum sınıfı). `lib/metrics.ts` bellek tamponu kaldırılır.
- RUM: Redis saatlik histogram kovaları + p75. Ingest ucuna rate limit ve path normalizasyonu. Ya da Speed Insights'a devir.
- Cron heartbeat: her `app/api/cron/*` ucu sonunda `cron:last:{name}` → `{at, ms, ok, error}` yazar. Panel bunu okur.
- İstemci: SWR (`refreshInterval` kullanıcı seçimine bağlı, `refreshWhenHidden:false`, `keepPreviousData`), bileşen başına ayrı dosya, durum tonu için ortak `lib/status-tone.ts`.

---

## Çakışmalar / birleştirme önerisi

- **`/admin` (dashboard) ve `/admin/settings` sistem durumu kartları:** `/api/admin/system-status` ile aynı işi farklı eşiklerle yapıyorlar (`admin-dashboard-client.tsx:88`, `settings-client.tsx:331`). Öneri: sağlık hesabı tek fonksiyonda birleşsin; dashboard ve ayarlar yalnızca özet rozet + "Gözlemlenebilirlik'e git" linki göstersin.
- **`/admin/webhooks`:** teslim geçmişi orada (`app/api/admin/webhooks/deliveries/route.ts`). Bu sayfa yalnızca oranı göstermeli ve oraya link vermeli; teslim listesi kopyalanmamalı.
- **`/admin/trust-command`:** güvenlik uyarıları burada değil orada yaşamalı. Trust timeline'daki `href` düzeltilmeli (Bulgu 8).
- **`/admin/platform-pulse`:** "canlı UTC serileri ve platform özeti" (`messages/tr.json:161-162`) iş/aktivite odaklı. "Aktif kullanıcı 24s" gibi iş metrikleri bu sayfadan oraya taşınmalı. Observability yalnızca teknik sağlık + performansa odaklanmalı.
- **`/admin/accessibility` ve `/admin/design-language`:** CWV anchor'larına link veriyorlar (`accessibility/page.tsx:92,98`, `design-language/page.tsx:64`). Yeniden tasarımda `#core-web-vitals` ve `#rum-web-vitals` anchor'ları korunmalı (ya da yönlendirme yapılmalı).

**Sonuç:** Sayfa kaldırılmamalı. Platformun tek teknik sağlık ekranı olarak kalmalı, ama sahte/kendini ölçen göstergeler hemen kaldırılmalı ya da gerçek kaynağa bağlanmalı. DLQ hatası düzeltilmeli, sağlık mantığı `system-status` ile birleştirilmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (çağıranlar, `proxy.ts`, `requireAuth`, Prisma şeması, git geçmişi). Veritabanına dokunulmadı, hiçbir komut/sunucu çalıştırılmadı.

### 1. Sahte trafik metrikleri ("Son 60 sn" / "Top paths") — **DOĞRULANDI**

- `trackRequest` (`lib/metrics.ts:19-22`) repo genelinde yalnızca `app/api/admin/health/route.ts:102,119` ve `app/api/admin/vercel-status/route.ts:47,87,92` içinden çağrılıyor. `proxy.ts:103-121` `/api/*` için yalnızca güvenlik/CORS başlığı ekliyor, sayaç yok. Başka bir enstrümantasyon da yok.
- Tampon modül düzeyinde bir dizi (`lib/metrics.ts:11`). Vercel'de `health` ve `vercel-status` ayrı route dosyaları, büyük olasılıkla ayrı fonksiyon örneklerinde çalışıyor. Bu durumda `getSnapshot()` (`health/route.ts:99`) çoğu zaman yalnızca kendi `/api/admin/health` çağrılarını görür. Üstelik `trackRequest` çağrısı `getSnapshot()`'tan **sonra** yapılıyor (`health/route.ts:99-102`), yani o anki istek bile sayılmıyor.
- Yeniden üretim: Bir admin sayfayı açık bırakıyor. Aynı dakikada müşteriler yüzlerce `/api/feedbacks` isteği atıyor ve bunların bir kısmı 500 dönüyor. Hero chip'i (`page.tsx:205-211`) ve "Son 60 sn" kartı (`page.tsx:577-588`) yaklaşık 1-2 istek ve 0 hata gösteriyor. "En çok istek alan path'ler" tablosu (`page.tsx:701-722`) yalnızca `/api/admin/health` satırını içeriyor.
- Hafifletici: Dipnotta "Bellek içi; örnek temelli" uyarısı var (`messages/tr.json:2846`). Ama "Son 60 saniye; istek sayısına göre" başlığı (`messages/tr.json:2873-2874`) uygulama geneli izlenimi veriyor. Etki son kullanıcıya değil operatörün karar kalitesine: yanlış "sakin" sinyali olay fark edilmesini geciktirir.

### 2. Outbox DLQ event'leri "bekliyor" sayılıyor — **ÇÜRÜTÜLDÜ**

- Kod mantığı tek başına doğru: `health/route.ts:40-45` yalnızca `processedAt: null` filtreliyor, `lib/outbox.ts:34` ise `deadAt: null`'ı da hariç tutuyor (`schema.prisma:348-351`).
- Ancak somut bir senaryo kurulamıyor: **`createOutboxEvent` (`lib/outbox.ts:14`) repo genelinde hiçbir yerden çağrılmıyor.** Yalnızca tanımı var. `git log -S "createOutboxEvent("` sadece tanımın eklendiği `77a7126` commit'ini buluyor; bir çağıran hiç olmamış. `outboxEvent.create` başka bir yerde de yok. Dolayısıyla `OutboxEvent` tablosuna üretim kodundan satır yazılmıyor. `processOutbox` (`app/api/internal/inngest/outbox-process/route.ts:12`) her zaman boş liste işliyor, `deadAt` pratikte hiç set edilmiyor. Bu yüzden "kalıcı ve büyüyen sahte gecikme alarmı" oluşmuyor.
- Doğrulanamayan tek açık: tabloda elle ya da eski bir sürümden kalmış satır olup olmadığı (canlı DB okunmadı). Kodda bunu destekleyen bir iz yok.
- Asıl gerçek sorun farklı: Kuyruk satırı (`page.tsx:526-534`) **ölü bir altyapıyı** ölçüyor ve kalıcı olarak "0 bekliyor" gösteriyor. Bu da yanıltıcı bir "sağlıklı" sinyali. Öneri: Ya outbox gerçekten bir üreticiye bağlansın (ör. feedback oluşturma transaction'ı) ve sayaçlar `pending` (`processedAt: null, deadAt: null`) ile `deadLetter` (`deadAt != null`) olarak ayrılsın; ya da outbox kullanılmıyorsa satır kaldırılsın ve gerçekten kullanılan Inngest/cron kuyruklarının heartbeat'i gösterilsin. DLQ filtresinin düzeltilmesi ancak üretici bağlandığında anlam kazanır.

### 3. RUM Web Vitals instance-local bellekte — **DOĞRULANDI**

- Depo modül düzeyinde bir dizi (`lib/rum-web-vitals.ts:23-30`). Yazma `app/api/user/web-vitals/route.ts:39` içinde, okuma `app/api/admin/web-vitals-summary/route.ts:12` içinde. İkisi ayrı route dosyası, yani Vercel'de büyük olasılıkla ayrı fonksiyon örnekleri. Paylaşılan bir depo (Redis/DB) yok.
- 800 kayıt tavanı (`rum-web-vitals.ts:23,29`) zamana değil adede bağlı. Her sayfa görüntüleme 5 metrik ürettiği için (`web-vitals-reporter.tsx:33-38`) aynı örnekte yaklaşık 160 sayfa görüntülemesinden sonra en eski kayıtlar düşüyor. UI ise "Pencere: 60 dk" yazıyor (`page.tsx:309-311`, `DEFAULT_WINDOW_MS` `rum-web-vitals.ts:49`).
- Zehirleme: Ingest ucunda yalnızca `requireAuth(['CUSTOMER','DEALER','STAFF','ADMIN'])` var (`web-vitals/route.ts:20`). Rate limit yok (`proxy.ts:105-118` `/api/*` için sınırlama yapmıyor). `value: z.number()` sınırsız ve `rating` değerden bağımsız olarak istemciden alınıyor (`web-vitals/route.ts:11-13`).
- Yeniden üretim: Herhangi bir müşteri hesabıyla döngü içinde `POST /api/user/web-vitals` `{name:'LCP', value:99999, delta:0, rating:'good', id:'x'}` gönderiliyor. Aynı örneğe düşen 800 kayıt dolar ve gerçek örnekler tampondan atılır. Admin, LCP ortalamasını 99999 ms ama %100 "good" olarak görür. Ayrıca soğuk başlangıç ve deploy sonrası tablo boş kalır (`rumEmpty`).
- Hafifletici: `rumSectionHint` "bellek içi, sunucu örneği başına" diyor (`messages/tr.json:2810`). Ama "60 dk pencere" ve ortalama/iyi% tablosu güvenilir bir özet izlenimi veriyor. Veri bütünlüğü etkisi yalnızca bu panelle sınırlı; başka bir sisteme yazılmıyor.


---

## Uygulama (Dalga 2)

**Hedef rotalar:** `/admin/observability` (yeniden yazıldı), `/admin/jobs` (yeni: Arka plan işleri).
**Mimari:** sunucu önce (`app/admin/observability/page.tsx`, `app/admin/jobs/page.tsx` veriyi sunucuda okur), küçük istemci adası (`components/admin/a-gozlemlenebilirlik/**`), `defineRoute` BFF'ler: `GET /api/admin/observability?window=2h|24h`, `GET /api/admin/jobs`, `POST /api/admin/jobs/run`. Sunucu mantığı `lib/observability/**`. Eski `GET /api/admin/health`, `/api/admin/vercel-status`, `/api/admin/web-vitals-summary` ile `lib/metrics.ts` ve `lib/rum-web-vitals.ts` silindi (başka tüketicisi yoktu).

**Yeni veri kaynakları (gerçek, örnek-bağımsız):**
- API uç metrikleri: `defineRoute` her yanıttan sonra (`after()`, yanıtı bekletmez) Upstash'te saatlik hash'e istek / 5xx / 4xx / gecikme kovası yazar (`lib/observability/route-metrics.ts`). p50/p95 histogramdan, 24 saatlik saatlik seri. Redis yoksa ya da `OBS_ROUTE_METRICS=off` ise açık bir "toplanmıyor" boş durumu.
- Web Vitals: istemci örnekleri sayfa başına toplayıp tek istekte (`sendBeacon`) gönderir; uç `defineRoute` + kullanıcı başına 30/dk + değer aralığı doğrulaması; derece sunucuda değerden; yol kimlikleri maskelenir; Upstash saatlik histogram (8 gün), p75 + iyi/geliştirilmeli/zayıf kesin sayıları + en yavaş 5 sayfa (LCP, INP).
- Arka plan işleri: günlük orkestratörün kayıt defteri (`app/api/cron/daily/jobs.ts`) + `Settings[cron_daily_state]` (F şeridinin kalıcı koşu kaydı): iş başına son koşu, sonuç, süre, son başarılı koşu, son hata, ardışık hata; 14 koşuluk geçmiş; heartbeat / Sentry cron / CRON_SECRET kurulum durumu.
- Sağlık: Komuta Merkezi ile tek kaynak (`computeHealth`: DB gecikmesi + eşik, Redis yaz/oku, AI, posta). Webhook 24 sa SQL COUNT.

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Sayfa erişimi (ADMIN + kapı) | ÇALIŞIYOR (sayfa ayrıca sunucuda `requireAuth(['ADMIN'])`) |
| 2 | API yetkisi | ÇALIŞIYOR: tüm uçlar `defineRoute` (rol + zod + hız sınırı) |
| 3 | Metadata | ÇALIŞIYOR (`/admin/jobs` kendi metadata'sı ile) |
| 4 | Ambient arka plan | KALDIRILDI: ops kaydı sakin (QDL v2) |
| 5 | Hero | ÇALIŞIYOR: QDL `PageHeader`, başlık menü adıyla aynı ("Gözlemlenebilirlik") |
| 6 | "Canlı" rozeti | ÇALIŞIYOR: bağlantı durumuna bağlı (Canlı / Bayat / Otomatik yenileme kapalı / Bağlantı yok); ping yalnız canlıyken ve `motion-safe` |
| 7 | Olay sayısı rozeti | ÇALIŞIYOR: "N sorun var" durum cümlesi + Sorunlar listesi |
| 8 | Hero Vercel göstergesi | ÇALIŞIYOR: Türkçe etiket + tonlu rozet (Platform kartında) |
| 9 | Hero uygulama sağlığı | ÇALIŞIYOR: rol token'lı `StatusBadge` (açık temada kontrast sorunu yok) |
| 10 | "istek / 60 sn" | KALDIRILDI → yerine gerçek API trafiği (2 sa / 24 sa) |
| 11 | CWV eşik tablosu | ÇALIŞIYOR: katlanır Rehber'de, FCP/TTFB dahil 5 metrik (`#core-web-vitals` çapası korundu) |
| 12 | CWV notu ("kalıcı RUM ekleyin") | KALDIRILDI: kalıcı RUM eklendi |
| 13 | Dış linkler | ÇALIŞIYOR (yeni sekme uyarısı ekran okuyucuda) |
| 14 | RUM özet tablosu | ÇALIŞIYOR: p75 (ortalama değil), birimli, kesin derece dağılımı, kalıcı depo |
| 15 | RUM pencere bilgisi | ÇALIŞIYOR: gerçekten son 24 saat (saatlik kovalar; 800 kayıt tavanı yok) |
| 16 | RUM rol dağılımı | KALDIRILDI: kullanıcı/rol saklanmıyor (gizlilik); yerine en yavaş sayfa kırılımı (panel önekiyle) |
| 17 | RUM son örnekler listesi | KALDIRILDI: ham örnek saklanmıyor; toplu histogram + en yavaş sayfalar daha anlamlı |
| 18 | RUM JSON kopyala | KALDIRILDI → tek "Özeti kopyala" (olay kanalına yapıştırılabilir Markdown durum özeti) |
| 19 | RUM boş durumu | ÇALIŞIYOR: toplanmıyor / örnek yok / hata ayrı |
| 20 | RUM iskelet | ÇALIŞIYOR (sayfa iskeleti + sunucu ön yüklemesi) |
| 21 | RUM hata bildirimi | ÇALIŞIYOR: bölüm başına `ErrorState` + Tekrar dene |
| 22 | Hata banner'ı | ÇALIŞIYOR: başlığın hemen altında `role="alert"`, ham `SyntaxError` yok (504 HTML anlaşılır mesaja çevrilir), son iyi veri korunur |
| 23 | Banner "Yenile" | ÇALIŞIYOR (bekleme durumu) |
| 24 | Son güncelleme | ÇALIŞIYOR: `aria-live="polite"`, yalnız başlık meta'sı yeniden çizilir |
| 25 | Yenile butonu | ÇALIŞIYOR: dönen ikon, `disabled` + `aria-busy`, sunucu önbelleğini atlar (`fresh=1`) |
| 26 | Otomatik yenileme | ÇALIŞIYOR: 30 sn / 60 sn / Kapalı (tercih hatırlanır), sekme gizliyken durur, TanStack Query iptal/sıra korumalı |
| 27 | Vercel durum kartı | ÇALIŞIYOR: `minor/major/critical/under_maintenance` tip güvenli tonlar |
| 28 | Vercel JSON kopyala | KALDIRILDI → "Özeti kopyala" |
| 29 | Sağlık gecikmesi | ÇALIŞIYOR: yanıltıcı toplam süre kaldırıldı; DB gecikmesi ayrı ve eşikli |
| 30 | Bölge | ÇALIŞIYOR (Dağıtım kutusunda; ortam + sürüm SHA + dal ile) |
| 31 | DB bağlantı durumu | ÇALIŞIYOR: 300/1000 ms eşikli (Komuta Merkezi ile aynı) |
| 32 | İşlem e-postası | ÇALIŞIYOR (yapılandırma; teslim oranı kalan açık) |
| 33 | Bekleyen outbox sayısı | KALDIRILDI: `createOutboxEvent` hiçbir yerden çağrılmıyor; kalıcı "0 bekliyor" yanıltıcıydı |
| 34 | Kuyruk gecikmesi | KALDIRILDI (aynı gerekçe) |
| 35 | Webhook 24 sa | ÇALIŞIYOR: SQL COUNT (tavan yok), test teslimleri hariç, oran + `/admin/integrations?tab=webhooklar` bağlantısı |
| 36 | Aktif kullanıcı 24 sa | KALDIRILDI: iş metriği, Komuta Merkezi'nde |
| 37 | Sağlık JSON kopyala | KALDIRILDI → "Özeti kopyala" |
| 38 | "Son 60 sn" kartı | KALDIRILDI → gerçek API trafiği: istek, 5xx oranı, 4xx, p95 + saatlik seri |
| 39 | Vercel bileşenleri | ÇALIŞIYOR: grup satırları ayıklandı, Türkçe durum, arama, varsayılan "Yalnız sorunlular", "N / M çalışıyor" özeti |
| 40 | Bileşenler boş durumu | ÇALIŞIYOR |
| 41 | Açık olaylar | ÇALIŞIYOR: aşama Türkçe, `impact` tonu, son güncelleme metni + zamanı; planlı bakımlar da |
| 42 | Olay "Detay" linki | ÇALIŞIYOR (yalnız https bağlantı kabul edilir) |
| 43 | "En çok istek alan path'ler" | KALDIRILDI → "En çok hata veren uçlar" + "En yavaş uçlar (p95)" (gerçek trafik) |
| 44 | Toast'lar | ÇALIŞIYOR: doğrudan `sonner`, Türkçe, bağlama uygun mesaj |
| 45 | i18n | ÇALIŞIYOR: tüm durum/aşama/derece değerleri Türkçe eşlemeli; sabit "dk gecikme" yok |
| 46 | Mobil yerleşim | ÇALIŞIYOR: tablolar kaydırma kabında, ızgaralar tek sütuna iner, dokunma hedefleri ≥ 44 px |
| 47 | Azaltılmış hareket | ÇALIŞIYOR: ping/spin `motion-safe`, sorun listesi animasyonu `useReducedMotionPref` ile kapanır |
| 48 | Klavye / ARIA | ÇALIŞIYOR: `role="alert"`, `aria-live`, tablolarda `caption` + `scope="col"`, dekoratif ikonlar `aria-hidden` |
| 49 | Bölüm çapaları | ÇALIŞIYOR: `#core-web-vitals`, `#rum-web-vitals` korundu; yeni `#saglik`, `#uclar` |
| 50 | Güvenlik uyarısı derin linki | ÇALIŞIYOR (kapandı): trust-timeline emekli (410), güvenlik uyarıları `/admin/trust`'ta |
| 51 | Eşik tabanlı alarm | ÇALIŞIYOR (görsel): sunucuda eşikli Sorunlar listesi (5xx oranı, yavaş uç, Web Vitals, webhook hata oranı, iş hatası, bağımlılık, Vercel olayı). Push/e-posta bildirimi kalan açık |
| 52 | Zaman serisi | ÇALIŞIYOR: API istek ve 5xx oranı için 24 saatlik saatlik seri (sparkline + döküm tablosu), iş süreleri için 14 koşuluk seri |
| 53 | Sentry özeti | KALAN AÇIK: Sentry API belirteci yok; uç hataları kendi metriklerimizle görünür |
| 54 | Cron / iş kalp atışı | ÇALIŞIYOR: `/admin/jobs` (iş başına durum, gecikme tespiti, geçmiş, izleme kanalları, gerekçeli ve denetimli "Şimdi çalıştır") |
| 55 | DLQ görünümü | KALDIRILDI: outbox'ın üreticisi yok; DLQ'ya düşen olay oluşmuyor |
| 56 | Bağımlılık kontrolleri | ÇALIŞIYOR: Redis yaz/oku sınaması, AI hata oranı, DB, posta; dağıtım bilgisi. R2/IMAP canlı sınaması kalan açık |

### Kapanan bulgular
1 (sahte trafik metrikleri), 2 (outbox satırı kaldırıldı), 3 (RUM kalıcı + p75), 4 (gizli sekmede yoklama yok, sunucu önbellekleri, ağır `distinct` sorgusu kaldırıldı), 5 (Statuspage tonları), 6 (bölüm başına hata, son iyi veri, iptal/sıra), 7 (bağlantıya bağlı rozet), 8 (trust tarafında kapandı), 9 (SQL COUNT), 10 (sağlık Komuta Merkezi ile tek fonksiyon; `/api/admin/system-status` başka yüzeyin), 11 (durum → sorunlar → ayrıntı → rehber), 12 (kontrast/ARIA), 13 (Türkçe eşlemeler, toast öneki yok), 14 (RUM ucu hız sınırlı, aralık doğrulamalı, yol normalize), 15 (kod kokuları; sayfa bileşenlere bölündü). **15/15.**

### Arka plan işleri "Şimdi çalıştır" kuralları
Yalnız bu dönem başarılı koşusu olmayan iş (başarısız, zaman aşımı, bütçe, gecikmiş); kadans zorlama (`force`) arayüzde yok. Günlük koşu sürerken 409. Gerekçe zorunlu; denetim kaydı ÖNCE yazılır (yazılamazsa iş çalışmaz), sonuç ayrıca yazılır. İş orkestratörün kendisiyle (`/api/cron/daily?only=<ad>`) çalışır: aynı zaman aşımı, aynı durum kaydı. Kullanıcı başına 10 dk'da 6 istek.

### Kalanlar
- Push/e-posta alarm kuralları (bildirim kanalı ve sessize alma politikası ürün kararı ister).
- Sentry issue özeti (API belirteci ve proje kimliği gerekir).
- R2 / IMAP / AI sağlayıcı için canlı erişim sınaması (her yoklamada dış servise gitmenin maliyeti; şu an yapılandırma + AI hata oranı).
- Uç metrikleri yalnız `defineRoute` uçlarını kapsar; eski elle yazılmış uçlar taşındıkça kapsama girer (arayüz bunu belirtiyor).
- `/api/admin/system-status` (dashboard/ayarlar) hâlâ ayrı; sahibi o yüzeyler.
