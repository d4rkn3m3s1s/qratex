# /dealer/qr-codes

**Amaç:** İşletme sahibinin, müşteriden geri bildirim toplayan QR kodları oluşturması, listelemesi, özelleştirip indirmesi (PNG/SVG/ZIP) ve yaşam döngüsünü (aktif/pasif, iptal, yenileme, silme) yönetmesi. Bayi panelinin "temas noktası" (touchpoint) yönetim ekranıdır; onboarding'in zorunlu ilk adımı da buraya bağlanır (`app/api/dealer/onboarding/route.ts:49`).

**Genel puan: 4.8 / 10** · **Karar: yeniden tasarla**

Temel CRUD akışı gerçekten çalışıyor ve sunucu tarafı sahiplik kontrolleri sağlam. Ancak (1) tek tık silme, bağlı TÜM geri bildirimleri ve türev kayıtları kalıcı olarak siliyor; (2) "tarama" diye gösterilen sayı aslında geri bildirim sayısı; (3) QR içeriği, panelin açıldığı alan adına (`window.location.origin`) göre üretiliyor; (4) üst istatistikler yalnızca o anki sayfanın 12 kaydından hesaplanıyor. Şemada ve API'de zaten var olan pek çok yetenek (son kullanma tarihi, segment karşılaması, şube/lokasyon, ad düzenleme, gerçek tarama olayları) arayüze hiç bağlanmamış. Sayfa veri modeli korunarak yeniden tasarlanmalı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oluşturma/silme/iptal/yenileme/indirme çalışıyor; ama tarama metriği yanlış, arama yalnızca o sayfada çalışıyor, çerçeve şablonu sahte, düzenleme ve son kullanma tarihi arayüzde yok. |
| UX | 4/10 | Silmenin geri bildirimleri de götürdüğü söylenmiyor; aramada sonuç yokken ve yükleme hatasında "Henüz QR kod yok" ekranı çıkıyor; kartlarda gerçek QR yerine genel bir ikon var. |
| Görsel | 6/10 | Hero ve kart dili panelle tutarlı, hoş görünüyor; ama önizleme modalı yerleşik Dialog yerine elle yazılmış ve sayfanın geri kalanından ayrı bir görsel dil kullanıyor. |
| Mimari | 4/10 | 918 satırlık tek istemci bileşeni var; QR URL'si 5 ayrı yerde kopyalanmış; renk durumu QR'lar arasında sızıyor; silme cascade'i ve kota mantığı birbirini kötü yönde besliyor. |
| Performans | 6/10 | Sayfalama sunucuda yapılıyor. Ancak `jszip` ve `qrcode` statik import edildiği için ilk yüklemeye giriyor, GET gereksiz `dealer` ve `_count` alanları döndürüyor, sayfa geçişlerinde yarış koşulu var. |
| Erişilebilirlik + Mobil | 3/10 | Önizleme modalında Esc, focus trap ve `role="dialog"` yok; tıklanabilir div klavyeyle kullanılamıyor; ikon butonlarda ve checkbox'larda etiket yok; 375px'te 3 sütunlu istatistik sıkışıyor; uzun modal küçük ekranda kaydırılamıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama, i18n) | ÇALIŞIYOR | `app/dealer/qr-codes/layout.tsx:4-6` | |
| 2 | Rol kapısı (yalnızca DEALER) | ÇALIŞIYOR | `proxy.ts:50-73` | STAFF rolü bu sayfaya hiç erişemiyor; ekip içi yetki seviyesi yok. |
| 3 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `page.tsx:395-400` | |
| 4 | "Yeni QR kod" butonu ve oluşturma diyaloğu | ÇALIŞIYOR | `page.tsx:402-450` | shadcn Dialog kullanılıyor. |
| 5 | Ad alanı (zorunlu) | KISMİ | `page.tsx:200`, `lib/validations.ts:122-127` | İstemci yalnızca boşluğu kontrol ediyor; 2 karakter kuralını sunucu söylüyor, sunucu mesajı da sadece Türkçe. Karakter sayacı ve `maxLength` yok. |
| 6 | Açıklama alanı | ÇALIŞIYOR | `page.tsx:430-438` | 500 karakter sınırı istemcide gösterilmiyor. |
| 7 | `isActive` form alanı | SAHTE | `page.tsx:151`, `lib/validations.ts:122-129` | Gönderiliyor ama şema bu alanı atıyor; `Switch` import edilmiş, hiç kullanılmamış (`page.tsx:62`). |
| 8 | Oluştur butonu: yükleniyor/çift tık koruması | EKSİK | `page.tsx:444` | Disabled ve spinner yok, çift tık iki QR oluşturur. Enter ile gönderilmiyor (form yok). |
| 9 | Plan kotası (PLAN_LIMIT_REACHED) uyarısı | KISMİ | `page.tsx:219-221`, `route.ts:100-112` | Hata 6 saniyelik toast olarak çıkıyor; kullanım (x/y) ve yükseltme CTA'sı gösterilmiyor. |
| 10 | Stat kartı: Toplam QR | ÇALIŞIYOR | `page.tsx:388` | Sunucudaki `total` kullanılıyor. |
| 11 | Stat kartı: Aktif | BOZUK | `page.tsx:389` | Sadece o sayfadaki 12 kayıttan sayılıyor; iptal edilmiş veya süresi dolmuş ama `isActive=true` olanlar da "aktif" sayılıyor. |
| 12 | Stat kartı: Toplam tarama | BOZUK | `page.tsx:390`, `app/api/feedbacks/route.ts:261-264` | Sadece o sayfanın toplamı. Üstelik `scanCount` taramayı değil, gönderilen geri bildirimi sayıyor. |
| 13 | Sayı animasyonu (AnimatedNumber) | KISMİ | `page.tsx:80-108` | Her sayfa değişiminde 0'dan yeniden sayıyor; `setInterval` azaltılmış hareket ayarını dikkate almıyor. |
| 14 | Arama (ada göre) | BOZUK | `page.tsx:382-384` | Yalnızca yüklü 12 kaydı istemcide süzüyor; diğer sayfalardaki QR'lar bulunamıyor. API'de `search` parametresi yok. |
| 15 | Global arama derin linki `?search=` | BOZUK | `app/api/search/route.ts:153` | Sayfa `searchParams` okumuyor; link aramayı doldurmadan sayfayı açıyor. |
| 16 | Filtre (durum/lokasyon) ve sıralama | EKSİK | — | Sabit `createdAt desc` (`route.ts:39`). |
| 17 | Tekli seçim (kart checkbox'ı) | ÇALIŞIYOR | `page.tsx:589-594` | `aria-label` yok. |
| 18 | "Bu sayfadakileri seç" | KISMİ | `page.tsx:323-326, 564-570` | Başka sayfadan seçili kayıt varsa kutu "tümünü kaldır" yerine seçimi ezip yeniden kuruyor. |
| 19 | Toplu: Aktif yap / Pasif yap | ÇALIŞIYOR | `page.tsx:329-353`, `bulk/route.ts:45-50` | Ortak `bulkLoading` yüzünden tüm butonlarda aynı anda spinner dönüyor. |
| 20 | Toplu: Sil | BOZUK (veri riski) | `bulk/route.ts:40-42`, `schema.prisma:834` | Seçili QR'lara bağlı tüm Feedback ve türevleri hard-delete ediliyor; onay metni bunu söylemiyor. |
| 21 | Toplu: ZIP indir | KISMİ | `page.tsx:355-380` | Yalnızca o anki sayfadaki seçilileri paketliyor (`qrCodes.filter`); diğer sayfadaki seçimler sessizce atlanıyor. Önizlemede son seçilen renkler sızıyor. |
| 22 | Seçimi temizle | ÇALIŞIYOR | `page.tsx:327, 505` | |
| 23 | Yükleniyor iskeleti (6 kart) | ÇALIŞIYOR | `page.tsx:529-542` | |
| 24 | Boş durum ve "İlk QR'ını oluştur" CTA'sı | KISMİ | `page.tsx:543-561` | Arama sonucu boş olduğunda ve yükleme hatasında da aynı "Henüz QR kod yok" ekranı çıkıyor. |
| 25 | Hata durumu (yükleme başarısız) | BOZUK | `page.tsx:174-176` | Sadece toast gösteriliyor, ardından boş durum ekranı açılıyor; "Tekrar dene" yok. |
| 26 | QR kartı: önizleme alanı | KISMİ | `page.tsx:585-600` | Gerçek QR yerine genel bir lucide ikonu var; tıklanabilir `div` klavyeyle erişilemiyor. |
| 27 | Durum rozeti (İptal/Süresi dolmuş/Aktif/Pasif) | ÇALIŞIYOR | `page.tsx:603-616` | Süre, istemci saatine göre hesaplanıyor. |
| 28 | Kart: ad, kod, tarama sayısı | KISMİ | `page.tsx:623, 666, 670-676` | "tarama" etiketi yanlış (bkz. #12); açıklama ve oluşturma tarihi gösterilmiyor. |
| 29 | Kart menüsü: Önizle | ÇALIŞIYOR | `page.tsx:631-634` | Tetikleyici ikon butonda `aria-label` yok (`page.tsx:626`). |
| 30 | Kart menüsü: Sayfayı aç | ÇALIŞIYOR | `page.tsx:635-638` | `window.open`'da `noopener` yok (aynı origin, risk düşük). |
| 31 | Kart menüsü: Kodu yenile (rotate) | KISMİ | `page.tsx:269-283`, `rotate/route.ts:48-69` | Çalışıyor ama plan kotasını atlıyor; `expiresAt`, `segmentConfig` ve `locationId` yeni koda taşınmıyor; eski ve yeni kod arasında bağ kurulmuyor. |
| 32 | Kart menüsü: İptal et | ÇALIŞIYOR | `page.tsx:249-267`, `[id]/route.ts:70-72` | Geri alma arayüzü yok (API `revoke:false` destekliyor). |
| 33 | Kart menüsü: Sil | BOZUK (veri riski) | `page.tsx:230-247`, `[id]/route.ts:122-131` | Cascade ile geri bildirimler siliniyor; native `confirm()` kullanılıyor. |
| 34 | Kart: Kopyala (link) | KISMİ | `page.tsx:285-289` | try/catch yok; clipboard reddedilirse sessiz unhandled rejection. Origin hatası için bkz. #45. |
| 35 | Kart: İndir (PNG) | KISMİ | `page.tsx:291-298` | Önizlemede başka bir QR için seçilen renkleri kullanıyor; dosya adında ham `qr.name` geçiyor; iptal edilmiş QR da indirilebiliyor. |
| 36 | Tekli aktif/pasif anahtarı | EKSİK | — | Yalnızca toplu işlemle yapılabiliyor; API PATCH `isActive` destekliyor. |
| 37 | Ad/açıklama düzenleme | EKSİK | `[id]/route.ts:64-65` | API destekliyor; `Edit` ikonu import edilmiş ama kullanılmamış (`page.tsx:12`). |
| 38 | Son kullanma tarihi ayarlama | EKSİK | `[id]/route.ts:67-69` | API ve şema hazır; yalnızca rozet okunuyor. |
| 39 | Segment karşılama metni (`segmentConfig`) | EKSİK | `[id]/route.ts:73`, `public/[code]/route.ts:91-95` | Backend var, arayüz yok. |
| 40 | Şube/lokasyon atama (`locationId`) | EKSİK | `schema.prisma:729` | Şema ve `DealerLocation` API'si var, QR ekranında yok. |
| 41 | Sayfalama | KISMİ | `page.tsx:710-737` | Son sayfadaki son kayıt silinince `page > totalPages` kalıyor; boş ekran ve "Sayfa 3 / 2" görünüyor. |
| 42 | Önizleme modalı | KISMİ | `page.tsx:740-915` | Elle yazılmış overlay: Esc, focus trap, `role="dialog"`, `aria-modal` ve scroll lock yok; kapat butonunda etiket yok. |
| 43 | Renk seçici (ön plan / arka plan) | KISMİ | `page.tsx:792-815` | Kontrast ve okunabilirlik denetimi yok (ön plan = arka plan seçilebiliyor); renk kaydedilmiyor; `label`'lar `htmlFor` ile bağlı değil. |
| 44 | Hazır renk paletleri (5 adet) | KISMİ | `page.tsx:817-843` | "Ters" (beyaz/siyah) bazı tarayıcılarda okunmayabilir, uyarı yok. |
| 45 | QR içerik URL'si | BOZUK (risk) | `page.tsx:126, 183, 286, 362, 798, 809, 830` | `window.location.origin` kullanılıyor; kanonik `siteUrl` (`lib/site-config.ts:20`) kullanılmıyor. |
| 46 | Çerçeve şablonları (Yok/Yumuşak/Daire/Rozet) | SAHTE | `page.tsx:782, 848-860` | Sadece önizlemedeki `<img>`'e CSS border ekliyor; indirilen PNG/SVG/ZIP'e hiç yansımıyor. "Daire" seçimi QR'ın köşelerini kırpıyor. |
| 47 | Modal: PNG indir (800px) | ÇALIŞIYOR | `page.tsx:136-142` | |
| 48 | Modal: SVG indir | KISMİ | `page.tsx:127-135` | `revokeObjectURL` tıklamadan hemen sonra çağrılıyor; bazı tarayıcılarda indirmeyi iptal edebilir (doğrulanmadı). |
| 49 | Modal: tarama sayısı ve oluşturma tarihi | KISMİ | `page.tsx:867-877` | "tarama" etiketi yanlış. |
| 50 | Modal: link kopyala / geri bildirim sayfasını aç | ÇALIŞIYOR | `page.tsx:880-909` | |
| 51 | Baskıya hazır şablon (masa kartı/afiş/sticker), PDF | EKSİK | — | |
| 52 | Gerçek tarama analitiği (zaman serisi, dönüşüm) | EKSİK | `public/[code]/route.ts:98-111` | `qr_scanned` olayı yazılıyor ama hiçbir yerde okunmuyor. |
| 53 | UTM/kampanya linki üretici | EKSİK | `public/[code]/route.ts:38-41` | Backend utm alıyor; ancak public sayfa query'i iletmiyor (`app/(public)/feedback/[code]/page.tsx:83`). |
| 54 | Toast dili | BOZUK | `lib/admin-toast.ts:16-19` | Her toast'a "Basarili: " / "Dikkat: " önekleri ekleniyor: Türkçe karaktersiz ve EN dilinde de Türkçe. |
| 55 | Azaltılmış hareket | KISMİ | `components/providers.tsx:232` | Framer, global `reducedMotion="user"` ile uyuyor; `AnimatedNumber` ve `animate-pulse` uymuyor. |
| 56 | `layout` animasyonu (kart yeniden dizilimi) | BOZUK (etkisiz) | `page.tsx:580`, `components/providers.tsx:241` | Global `LazyMotion` yalnızca `domAnimation` yüklüyor; layout özelliği `domMax` ister, bu yüzden prop no-op kalıyor. |

**Sayım:** ÇALIŞIYOR 18 · KISMİ 20 · BOZUK 10 · SAHTE 2 · EKSİK 10 (toplam 56; satır bazında, karma durumlar baskın olana göre sayıldı)

---

## Bulgular

### 1. [KRİTİK · Veri bütünlüğü] QR silme, bağlı tüm geri bildirimleri ve türevlerini kalıcı olarak siliyor
- **Kanıt:** `prisma/schema.prisma:834` (`Feedback.qrCode ... onDelete: Cascade`); zincir `ActionItem` (`:1317`), `RemedyOffer` (`:1342`), `AIQualitySample` (`:2222`), `AIEmbedding` (`:2365`) ve `AIFeedbackCorrection` (`:2384`) üzerinden devam ediyor (hepsi Cascade). Tekli silme hard-delete yapıyor (`app/api/qr-codes/[id]/route.ts:122-131`), toplu silme `deleteMany` ile 1000 kayda kadar siliyor (`app/api/qr-codes/bulk/route.ts:40-42`). Onay metni yalnızca "Bu QR kodunu silmek istediğinizden emin misiniz?" diyor (`messages/tr.json`, `dealerQrCodes.confirmDelete`).
- **Sorun:** Bayi "eski masa QR'ını temizleyeyim" dediğinde, o QR'dan gelmiş yüzlerce yorumu, AI analizlerini, aksiyon maddelerini ve müşteriye gönderilmiş telafi tekliflerini (`RemedyOffer`, müşterinin kabul ettiği indirim veya puanlar dahil) geri dönüşsüz siler. Müşterinin "yorumlarım" geçmişinden de kaybolur. Feedback'te `deletedAt` soft-delete alanı var (`schema.prisma:830`), ama bu yol onu kullanmıyor. Bulgu 4'teki kota mantığı bayiyi silmeye de itiyor.
- **Öneri:** QR için "silme" kavramını **arşivleme** ile değiştirin: `QRCode.archivedAt` ekleyin; liste varsayılan olarak arşivi gizlesin, kota yalnızca arşivlenmemiş kodları saysın. `Feedback.qrCode` ilişkisini `onDelete: Restrict` yapın (veya `qrCodeId` alanını nullable + SetNull). Hard-delete yalnızca hiç geri bildirimi olmayan QR'da (`_count.feedbacks === 0`) izinli olsun; aksi halde API 409 dönsün. Onay diyaloğu sonucu açıkça göstersin ("Bu QR'a bağlı 214 geri bildirim var; QR arşivlenecek, veriler korunacak"). Toplu silme bir AnalyticsEvent veya denetim kaydı yazsın (şu an yazmıyor).
- **Efor:** M (şema migration + API + diyalog)

### 2. [YÜKSEK · Yanlış veri] "Tarama" metriği aslında gönderilen geri bildirim sayısını gösteriyor
- **Kanıt:** `scanCount`, yalnızca geri bildirim oluşturulunca artırılıyor (`app/api/feedbacks/route.ts:261-264`). Gerçek tarama anında public uç yalnızca `qr_scanned` AnalyticsEvent yazıyor, `scanCount`'a dokunmuyor (`app/api/qr-codes/public/[code]/route.ts:98-111`). `qr_scanned` repo içinde hiçbir yerde okunmuyor (grep: tek sonuç yazıldığı yer). Sayfa bu sayıyı "Toplam tarama" ve "tarama" olarak etiketliyor (`page.tsx:459, 673-674, 870-871`).
- **Sorun:** Bayinin en temel KPI'ı olan **tarama → geri bildirim dönüşüm oranı** hesaplanamıyor; "tarama" ile "yorum" aynı sayı olarak görünüyor. Aynı yanlış alan `/api/dealer/stats`, `/api/dealer/analytics`, admin panoları ve müşteri keşif skoru (`app/api/customer/discovery/route.ts:208`) tarafından da kullanılıyor; sistem genelinde yanlış içgörü üretiyor.
- **Öneri:** Public uçta (rate-limit'ten sonra) `scanCount: { increment: 1 }` yapın (veya `QRScanDaily(qrCodeId, day, scans, uniqueScans)` gibi bir ön-agregasyon tablosu ekleyin). Feedback POST'taki artırmayı kaldırın; geri bildirim sayısını `_count.feedbacks` üzerinden gösterin (GET bunu zaten döndürüyor, sayfa kullanmıyor). Kartta iki sayı birlikte gösterilsin: "312 tarama · 41 yorum · %13 dönüşüm". Geçmiş veriler için bir kerelik backfill, mevcut `qr_scanned` olaylarından yapılabilir.
- **Efor:** M

### 3. [YÜKSEK · Doğruluk] QR içeriği panelin açıldığı alan adına göre üretiliyor; basılı QR yanlış domaine gidebilir
- **Kanıt:** `page.tsx:126, 183, 286, 362, 798, 809, 830`, hepsinde `${window.location.origin}/feedback/${code}` var. Projede kanonik adres için `lib/site-config.ts:10-20` (`siteUrl`, `NEXT_PUBLIC_APP_URL`) mevcut, kullanılmıyor.
- **Sorun:** Bayi paneli bir Vercel preview URL'sinden, `www`'siz alias'tan, PWA içinden veya geliştirme ortamından açarsa, indirilen ve **fiziksel olarak basılan** QR o geçici domaini kodlar. Domain kapanınca tüm masa kartları ölür. Aynı URL mantığı 7 yerde kopyalandığı için tutarsızlık riski de yüksek.
- **Öneri:** Tek bir `buildQrTargetUrl(code, opts?)` yardımcısı yazın (`lib/qr-url.ts`); `NEXT_PUBLIC_APP_URL`'yi kullansın, yoksa build sırasında uyarı versin. Daha sağlam bir yol: kısa ve kalıcı bir yönlendirme yolu (`/q/{code}` → 302 `/feedback/{code}`). Böylece hedef sayfa ileride değişse bile basılı QR değişmeden kalır (Bitly/Square kalıcı QR deseni). İndirme, önizleme, ZIP ve kopyalama bu yardımcıyı kullansın.
- **Efor:** S

### 4. [YÜKSEK · İş kuralı] Rotate plan kotasını atlıyor; kota iptal edilmiş kodları da sayıyor ve bayiyi silmeye (veri kaybına) itiyor
- **Kanıt:** `rotate/route.ts:48-56` kotaya bakmadan `tx.qRCode.create` çağırıyor. `lib/plan-limits.ts:75` ise `count({ where: { dealerId } })` ile iptal edilmiş ve süresi dolmuş kodları da sayıyor.
- **Sorun:** (a) Limitte olan bir bayi rotate ile limitin üstüne çıkabiliyor (kota açığı). (b) Ters yönde: dürüst bir bayi rotate kullandıkça iptal edilen eski kodlar kotasını dolduruyor, yeni QR açabilmek için onları silmesi gerekiyor ve Bulgu 1 yüzünden geri bildirimleri de siliniyor. (c) Rotate, `expiresAt`, `segmentConfig` ve `locationId` alanlarını kopyalamıyor (`rotate/route.ts:50-55`). Eski ve yeni kod arasında ilişki tutulmadığından istatistik ikiye bölünüyor.
- **Öneri:** Kotayı "aktif (iptal/arşiv dışı) kod" üzerinden sayın; rotate'i net-sıfır bir işlem olarak tanımlayın (bir iptal + bir oluşturma = kota değişmez) ve bunu bir test ile sabitleyin. `QRCode.rotatedFromId` ekleyip tüm ayar alanlarını kopyalayın. Kart ve analitik, rotate zincirini tek bir "temas noktası" olarak toplasın. Sayfanın üstünde kota çubuğu olsun ("5/10 QR · Pro'ya yükselt").
- **Efor:** M

### 5. [YÜKSEK · Yanlış veri] Üst istatistikler yalnızca o anki sayfadan hesaplanıyor
- **Kanıt:** `page.tsx:387-391`: `active` ve `totalScans`, en fazla 12 kayıtlık `qrCodes` dizisinden hesaplanıyor; `total` ise global.
- **Sorun:** 40 QR'lı bir bayi "Toplam QR: 40 · Aktif: 12 · Tarama: 87" görüyor; sayfa değiştikçe "Aktif" ve "Tarama" değişiyor. Ayrıca iptal edilmiş veya süresi dolmuş ama `isActive=true` olan kodlar "Aktif" sayılıyor.
- **Öneri:** GET yanıtına (veya ayrı bir `/api/qr-codes/summary` ucuna) sunucu agregasyonu ekleyin: `groupBy` ile durum dağılımı (aktif / pasif / iptal / süresi dolmuş), toplam tarama, toplam yorum, son 7 günün trendi. Upstash ile kısa TTL'li cache kullanılabilir. Sayfa yalnızca bu özeti göstersin; sayfalamadan bağımsız kalsın.
- **Efor:** S

### 6. [ORTA · İşlevsellik] Arama yalnızca yüklü 12 kaydı süzüyor; boş sonuçta "Henüz QR yok" çıkıyor; global arama derin linki kırık
- **Kanıt:** `page.tsx:382-384` (istemci tarafı `filter`), `page.tsx:543-561` (tek boş durum), `app/api/search/route.ts:153` (`/dealer/qr-codes?search=...`). Sayfa `useSearchParams` kullanmıyor, GET'te `search` parametresi yok (`route.ts:24-32`).
- **Sorun:** Bayi 2. sayfadaki "Teras" QR'ını aradığında "Henüz QR kod yok – İlk QR kodunuzu oluşturun" mesajını görüyor; bu yanıltıcı ve güven kırıcı. Header'daki global aramadan gelen kullanıcı aradığı QR'ı bulamıyor.
- **Öneri:** Aramayı sunucuya taşıyın (`name`/`code`/`description` üzerinde `contains, mode: insensitive`), 250 ms debounce uygulayın ve arama terimini URL'de tutun (`?search=`, `?status=`, `?page=`). Böylece derin link ve geri tuşu çalışır. Üç ayrı boş durum tasarlayın: hiç QR yok / filtreye uyan yok ("Filtreleri temizle") / yükleme hatası ("Tekrar dene").
- **Efor:** S

### 7. [ORTA · Hata yönetimi] Yükleme hatası boş durum gibi görünüyor; sayfa geçişlerinde yarış koşulu var; son sayfa silinince geçersiz sayfada kalınıyor
- **Kanıt:** `page.tsx:174-176` (hata durumunda sadece toast, ardından `qrCodes=[]` ve boş durum); `page.tsx:156-179` (AbortController yok, `page` hızlı değişirse eski yanıt yenisini ezebilir); `page.tsx:240, 259, 344` (silme sonrası `fetchQRCodes(page)`, `page > totalPages` olabiliyor).
- **Öneri:** Veri çekmeyi SWR veya React Query'ye taşıyın (`keepPreviousData`, otomatik abort, `mutate` ile iyimser güncelleme). `page > totalPages` olduğunda sayfayı otomatik geri alın. Hata için kalıcı bir uyarı kartı gösterin.
- **Efor:** S

### 8. [ORTA · Sahte özellik] Çerçeve şablonları indirilen dosyaya hiç yansımıyor; renkler QR'lar arasında sızıyor ve kaydedilmiyor
- **Kanıt:** Çerçeve yalnızca önizleme `<img>`'inin CSS sınıfını değiştiriyor (`page.tsx:782, 854`); `downloadQR`, `handleDownloadQR` ve ZIP üretimi `qrFrame`'i hiç kullanmıyor (`page.tsx:125-144, 291-298, 355-380`). Renk durumu sayfa genelinde tek (`page.tsx:124, 145`): A QR'ının önizlemesinde seçilen renk, B kartındaki "İndir" butonunu da etkiliyor (`page.tsx:292` → `generateQRImage` → `qrFgColor`).
- **Sorun:** Kullanıcı "Rozet çerçeveli" QR indirdiğini sanıyor, sade QR alıyor. Bu, müşteriye dönük basılı malzemede görünür bir hayal kırıklığı. "Daire" çerçevesi önizlemede QR'ın köşe bulucu (finder) desenlerini kırpıyor ve yanlış bir izlenim veriyor.
- **Öneri:** Tasarımı **QR başına kalıcı bir "stil"** olarak modelleyin (`QRCode.style Json`: `fg`, `bg`, `frame`, `logoUrl`, `ecLevel`, `cta` metni). Gerçek çıktıyı `qrcode` kütüphanesiyle SVG olarak üretip çerçeve, işletme logosu ve "Bizi değerlendirin" metniyle tek bir SVG'de birleştirin (canvas veya `sharp` gerekmez). PNG'yi bu SVG'den rasterleştirin. Önizleme de aynı fonksiyonun çıktısını göstersin (WYSIWYG). Kontrast oranı < 4:1 ise uyarı verip indirmeyi engelleyin; logo eklendiğinde `errorCorrectionLevel: 'H'` kullanın.
- **Efor:** M

### 9. [ORTA · Güvenlik/tutarlılık] Toplu uç, ortak `requireAuth` ve token-replay korumasını atlıyor; denetim kaydı yok
- **Kanıt:** `bulk/route.ts:12` doğrudan `getServerSession` kullanıyor; diğer uçlar `requireAuth` (`lib/api-auth.ts:52-80`) üzerinden jti replay kontrolünden geçiyor. Toplu silme ve güncelleme için `analyticsEvent` yazılmıyor (tekli silme yazıyor: `[id]/route.ts:133-140`). Hata mesajları karışık: "Unauthorized" (EN) ve "Yetkisiz" (TR).
- **Sorun:** Çalınmış ama replay-korumasına takılacak bir oturum, en yıkıcı uçta (1000 QR silme ve cascade) bu korumayı atlayabiliyor. IDOR yok, `dealerId` filtresi doğru (`bulk/route.ts:35-38`).
- **Öneri:** `requireAuth(['DEALER','ADMIN'])` kullanın, zod şeması ekleyin (`ids: z.array(z.string().cuid()).max(1000)`), her toplu işlem için tek bir denetim olayı yazın (`qr_bulk_{action}`, `count`, `ids`). Silme için Bulgu 1'deki arşiv mantığını uygulayın.
- **Efor:** S

### 10. [ORTA · Erişilebilirlik] Önizleme modalı erişilebilir değil, küçük ekranda kaydırılamıyor
- **Kanıt:** `page.tsx:740-915`: elle yazılmış `Motion.div` overlay; `role="dialog"`, `aria-modal`, `aria-labelledby`, Esc tuşu, focus trap ve body scroll lock yok. Kapat ikon butonunda `aria-label` yok (`page.tsx:759-766`). `fixed inset-0 flex items-center` kapsayıcısında `overflow-y-auto` yok; içerik yaklaşık 730px tutuyor (başlık + 250px QR + 64px padding + renk ve çerçeve bölümü + aksiyonlar; hesap, render ile doğrulanmadı). Bu yüzden iPhone SE (667px) gibi ekranlarda alt aksiyonlar ekran dışında kalıyor.
- **Diğer a11y açıkları:** QR önizleme alanı tıklanabilir bir `div`, klavyeyle erişilemiyor (`page.tsx:585-588`); checkbox'larda etiket yok (`page.tsx:565, 590`); kart menü tetikleyicisinde `aria-label` yok (`page.tsx:626`); renk `label`'ları input'a bağlı değil (`page.tsx:794, 805`); `animate-pulse` rozeti ve `AnimatedNumber` azaltılmış hareket ayarına uymuyor.
- **Öneri:** Oluşturma diyaloğunda zaten kullanılan shadcn `Dialog`'a (Radix) geçin; Radix focus, Esc ve scroll lock'u hazır sağlıyor. Mobilde önizleme ve stüdyo bir `Sheet` (alttan çekmece) olsun, içerik `max-h-[90dvh] overflow-y-auto` ile kaydırılabilsin. Önizleme alanını `<button aria-label="{ad} QR önizle">` yapın.
- **Efor:** S

### 11. [ORTA · UX] Oluşturma akışı çok zayıf: çift gönderim, düzenleme yok, şema yeteneklerinin çoğu gizli
- **Kanıt:** Oluştur butonunda `disabled` veya spinner yok (`page.tsx:444`). Düzenleme arayüzü yok, ama API `name`/`description`/`isActive`/`expiresAt`/`segmentConfig` alanlarını destekliyor (`[id]/route.ts:63-73`). `locationId` şemada var (`schema.prisma:729`). `isActive` formda var ama sunucuda atılıyor (`page.tsx:151`).
- **Öneri:** "Oluştur/Düzenle" için tek bir sağ-panel formu kullanın: ad, açıklama, **kullanım yeri** (masa/kasa/paket/vitrin/kampanya, şablon önerisi için), **şube** (DealerLocation select), **son kullanma tarihi**, **segment karşılama metni**, **stil**. Gönderim sırasında buton kilitlensin; sunucu doğrulama hataları alanın altında gösterilsin. Masa akışı için "toplu oluştur" eklensin ("Masa 1-20" → 20 adet, tek istekte, kotaya göre).
- **Efor:** M

### 12. [DÜŞÜK · Dil] Toast önekleri Türkçe karaktersiz ve her dilde Türkçe; API hata mesajları yalnızca Türkçe
- **Kanıt:** `lib/admin-toast.ts:16-19` ("Basarili: ", "Dikkat: ", "Bilgi: "). Bayi sayfası admin toast'ını import ediyor (`page.tsx:63`). API hataları sabit Türkçe metin (`route.ts:67, 81, 147`; `[id]/route.ts:25-28` vb.). ZIP dosya adı `qr-kodlari-...zip` (`page.tsx:370`).
- **Öneri:** Bayi panelinde önek eklemeyen bir `sonner` sarmalayıcısı kullanın (ya da önekleri i18n'e taşıyın). API'ler hata **kodu** dönsün (`QR_NOT_FOUND`, `NAME_TOO_SHORT`), istemci bu kodu `t()` ile çevirsin.
- **Efor:** S

### 13. [DÜŞÜK · Performans] Ağır kütüphaneler statik import ediliyor; GET kullanılmayan alanlar döndürüyor
- **Kanıt:** `page.tsx:7` (`jszip`) ve `page.tsx:65` (`qrcode`) statik. GET her satır için `dealer` include'u ve `_count.feedbacks` alt sorgusu döndürüyor (`route.ts:40-47`), sayfa ikisini de kullanmıyor (`page.tsx:67-77`).
- **Öneri:** `const JSZip = (await import('jszip')).default` ile yalnızca ZIP anında yükleyin; `qrcode` da önizleme veya indirme anında yüklensin. GET'te `select` ile yalnızca gereken alanları alın. `_count.feedbacks` Bulgu 2 sonrası gerçekten gösterileceği için kalabilir.
- **Efor:** S

### 14. [DÜŞÜK · Motion] `layout` prop'u etkisiz; sayı animasyonu her sayfada sıfırdan başlıyor
- **Kanıt:** `page.tsx:580` `layout`; global `LazyMotion features={domAnimation}` (`components/providers.tsx:241`). Layout animasyonları `domMax` ister, bu yüzden prop no-op. `AnimatedNumber` her `value` değişiminde 0'dan sayıyor (`page.tsx:83-105`).
- **Öneri:** `layout`'u kaldırın (veya yalnızca bu listeye `LazyMotion features={domMax}` verin; gerekmiyor). Sayı animasyonu yalnızca ilk yüklemede ve önceki değerden yeni değere doğru çalışsın; `useReducedMotion` true ise doğrudan değeri yazsın.
- **Efor:** S

### 15. [DÜŞÜK · Kod kalitesi] Ölü importlar, `any` kaçağı, 918 satırlık tek bileşen
- **Kanıt:** Kullanılmayan importlar: `Image` (`page.tsx:6`), `Edit` (12), `Star` (20), `MessageSquare` (21), `Share2` (27), `Zap` (28), `TrendingUp` (29), `Activity` (30), `Switch` (62). `as any` (`page.tsx:854`). Clipboard çağrısında try/catch yok (`page.tsx:285-289`). Oluşturma POST'u, QR'ı yarattıktan sonra analytics yazımı başarısız olursa 500 dönüyor (`route.ts:122-141`), kullanıcı tekrar deneyince çift kayıt oluşuyor.
- **Öneri:** Bileşeni bölün: `QrStatsBar`, `QrToolbar` (arama/filtre/görünüm), `QrCard`, `QrStudioSheet`, `QrBulkBar`, `useQrCodes()` hook'u, `lib/qr-render.ts` (SVG/PNG üretimi, tek kaynak). Analytics yazımını `after()` ile isteğin dışına alın.
- **Efor:** M

### İlgili (sayfa dışı ama bu sayfanın değerini doğrudan kıran)
- **Public geri bildirim sayfası segment ve UTM parametrelerini API'ye iletmiyor:** `app/(public)/feedback/[code]/page.tsx:83` query'siz `fetch` yapıyor; geri bildirim POST'u da `utm*` göndermiyor (`:116-125`). Bu yüzden backend'deki segment karşılaması (`public/[code]/route.ts:38-41, 91-95`) ve tarama atıfı uçtan uca çalışmıyor; bu sayfaya bir "kampanya linki" özelliği eklense bile veri gelmez. Önce bu sızıntı kapatılmalı.

---

## Eksik özellikler (kıyas: Square Dashboard, Toast, Google Business Profile, Yelp for Business, Medallia/Qualtrics touchpoint yönetimi)

1. **Baskıya hazır materyal stüdyosu:** masa kartı (A6 çift yüz), kasa standı, kapı stickerı, afiş ve fiş altı şablonları; işletme logosu ve marka rengiyle tek tıkta PDF (Square ve Toast "QR print kit", Google Business "Get more reviews" posteri). Şu an yalnızca çıplak PNG/SVG var.
2. **Gerçek tarama analitiği ve huni:** QR başına tarama → form açılışı → gönderim dönüşümü, saatlik ve günlük ısı, cihaz ve dil dağılımı, en iyi ve en kötü temas noktası (Qualtrics touchpoint analizi). `qr_scanned` olayı zaten yazılıyor, sadece okunmuyor.
3. **Temas noktası tipi ve lokasyon:** QR'ı masa, şube veya kanalla (yerinde/paket/teslimat) ilişkilendirme; geri bildirimleri bu boyutta kırma (Medallia "touchpoint"). Şemada `locationId` hazır.
4. **Toplu üretim ve numaralandırma:** "Masa 1–N" serisi, CSV içe aktarma ve tek PDF'te çoklu sayfa (Toast masa QR'ları).
5. **Kampanya / UTM link üretici ve dinamik hedef:** aynı basılı QR'ın hedefini (form, menü, Google yorum yönlendirmesi, kampanya) panelden değiştirebilme. Kalıcı kısa yol `/q/{code}` ile.
6. **Yaşam döngüsü kontrolleri:** son kullanma tarihi seçimi, iptali geri alma, rotate geçmişi ve "bu QR basılı mı?" etiketi, kota göstergesi ve yükseltme CTA'sı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "QR kodlarım" listesi yerine **"Temas Noktaları"** ekranı. Bayi her QR'ı bir *yer* olarak görsün ("Teras – Masa 4"); o yerin bugün kaç kez tarandığını, kaçının yoruma döndüğünü ve memnuniyet eğilimini tek bakışta okusun. Yeni bir yer eklemek 30 saniyede bitsin ve basılabilir bir çıktıyla sonuçlansın.

**Yerleşim (masaüstü):**
1. **Özet şeridi (sunucu agregasyonu):** Aktif temas noktası (x/y kota halkası) · 7 günlük tarama (sparkline) · Dönüşüm oranı · En düşük puanlı nokta (tıklayınca `/dealer/feedbacks?qr=` adresine gider).
2. **Araç çubuğu (URL senkronlu):** sunucu araması · durum çipleri (Aktif / Pasif / Süresi yakında / İptal / Arşiv) · şube filtresi · sıralama (tarama, dönüşüm, puan, tarih) · görünüm değiştirici (ızgara / tablo). Tablo görünümü 20+ QR'ı olan zincirler için.
3. **Kart:** solda **gerçek QR küçük resmi** (stilinden üretilen SVG, lazy), sağda ad, şube ve tip etiketi, "312 tarama · 41 yorum · %13" ve mini 7 günlük çizgi. Satır içinde aktif/pasif `Switch`, "Yazdır" birincil aksiyonu; ikincil işlemler menüde (Düzenle, Linki kopyala, Yenile, İptal, Arşivle).
4. **QR Stüdyosu (sağ Sheet; mobilde alt çekmece):** sekmeler *Tasarım* (renk + kontrast uyarısı, logo, çerçeve, CTA metni; WYSIWYG ve indirilenle birebir aynı), *Ayarlar* (ad, şube, tip, son kullanma, segment karşılama metni), *Paylaş/Yazdır* (PNG/SVG/PDF şablonları, UTM link üretici), *Geçmiş* (rotate zinciri, iptal/geri al).
5. **Toplu çubuk (sticky alt bar):** seçim sayısı, Aktif/Pasif, Arşivle, ZIP veya çok sayfalı PDF. İşlem başına ayrı yükleniyor durumu; sayfalar arası seçimde açık "Tüm sayfalardan 37 seçili" bilgisi.

**Motion / 3D (ölçülü):** 3D gerekmiyor; burası operasyonel bir ekran. Kart girişinde yalnızca ilk yüklemede kısa bir stagger (≤ 200 ms); Stüdyo'da tasarım değiştikçe QR önizlemesinde yumuşak bir crossfade; "Yazdır" sonrası küçük bir onay mikro-animasyonu. Sayı animasyonu yalnızca delta için çalışsın; tümü `useReducedMotion` ile kapatılabilsin. `layout` gerekirse yalnızca bu liste için `domMax` yüklensin (gerekli değil). Nabız animasyonlu "Aktif" rozeti yerine statik nokta kullanılsın (sürekli hareket dikkat dağıtıyor).

**Veri / API değişiklikleri:**
- Şema: `QRCode.archivedAt`, `QRCode.style Json`, `QRCode.kind` (table/counter/takeaway/campaign/other), `QRCode.rotatedFromId`; `Feedback.qrCode` → `onDelete: Restrict` (veya SetNull + nullable). İsteğe bağlı `QRScanDaily(qrCodeId, day, scans)` ön-agregasyon tablosu.
- `GET /api/qr-codes?search=&status=&locationId=&sort=&page=`: `select` ile daraltılmış alanlar + `_count.feedbacks`.
- `GET /api/qr-codes/summary`: durum dağılımı, kota, 7 günlük tarama ve dönüşüm (Redis cache, kısa TTL).
- `POST /api/qr-codes/batch`: seri oluşturma (kota kontrollü, tek transaction).
- `GET /api/qr-codes/[id]/print?template=table-tent&format=pdf`: sunucu tarafı SVG→PDF ya da istemci tarafı tek render fonksiyonu.
- Public uç: tarama sayacını artırır (rate-limit sonrası); public sayfa `segment` ve `utm_*` parametrelerini iletir.
- Kalıcı kısa yol: `/q/[code]` → 302; QR içeriği kanonik `siteUrl` üzerinden üretilir.
- Kota: `canCreateQRCode`, arşivlenmemiş ve iptal edilmemiş kodları sayar; rotate kota-nötr işlem olur.
- Bulk uç: `requireAuth` + zod + denetim olayı.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/heatmap`:** QR başına `feedbackCount`, `avgRating` ve memnuniyet skoru gösteriyor (`app/dealer/heatmap/page.tsx:27-37`) ve iki yerden bu sayfaya link veriyor (`:236, :399`). QR performansı iki ekrana bölünmüş durumda. Öneri: QR başına performans metrikleri bu sayfanın kartlarına (ve Stüdyo'nun "Analitik" sekmesine) taşınsın; heatmap yalnızca **zaman × lokasyon** yoğunluğuna odaklansın. İki ekran aynı `summary` ucunu paylaşsın.
- **`/dealer/analytics` ve `/api/dealer/stats`:** "en çok taranan QR" listeleri aynı (yanlış) `scanCount`'u kullanıyor (`app/api/dealer/analytics/route.ts:78-108`, `app/api/dealer/stats/route.ts:112-169`). Metrik düzeltmesi (Bulgu 2) üçünü birlikte düzeltir; tanım tek bir yardımcıda tutulmalı.
- **`/dealer/remedy-automation/templates`:** Lokasyon (DealerLocation) yönetimi şu an bu alakasız ekranda (`app/dealer/remedy-automation/templates/page.tsx:61-106`). Lokasyonlar QR/temas noktası ekranının bir alt sekmesine ("Şubeler") taşınmalı.
- **`/dealer/scan`:** Personelin müşteri QR'ını taradığı ayrı bir akış (kamera/OCR); isim benzerliğine rağmen çakışmıyor, ayrı kalmalı.
- **Kaldırma veya birleştirme gerekmiyor:** Sayfa, onboarding'in zorunlu adımı ve ürünün çekirdek giriş noktası. Rolü korunarak "Temas Noktaları" olarak yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia, çağıran/çağrılan taraflar, `proxy.ts`, `lib/api-auth.ts`, `lib/token-replay.ts`, `lib/plan-limits.ts` ve `prisma/schema.prisma` baştan okunarak çürütülmeye çalışıldı. Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. QR silme cascade ile tüm Feedback ve türevlerini kalıcı siliyor — **DOĞRULANDI**
- `prisma/schema.prisma:834` `Feedback.qrCode ... onDelete: Cascade`; Feedback'ten türeyen ActionItem (`:1317`), RemedyOffer (`:1342`), AIQualitySample (`:2222`), AIEmbedding (`:2365`), AIFeedbackCorrection (`:2384`) de `onDelete: Cascade`.
- Tekli: `app/api/qr-codes/[id]/route.ts:123` (`delete`) ve `:125` (`deleteMany`) gerçek silme; `Feedback.deletedAt` (schema `:829`) hiç kullanılmıyor. Toplu: `app/api/qr-codes/bulk/route.ts:40-42` `deleteMany`, en fazla 1000 kayıt.
- Onay metinleri yalnızca "QR kodunu silmek istediğinizden emin misiniz?" diyor (`messages/tr.json:831`, `:845`); yorumların da gideceğini söylemiyor.
- `lib/plan-limits.ts:75` `qRCode.count({ where: { dealerId } })` iptal edilmiş kodları da sayıyor; bu da limitteki bayiyi eski kodları silmeye itiyor.
- **Yeniden üretim:** Bayi, 200 yorumu olan "Masa 5" QR'ını sil butonuyla siler. Bu yorumlar, AI analizleri, açık aksiyon maddeleri ve müşteriye verilmiş, henüz kabul edilmemiş telafi teklifleri geri dönüşsüz silinir; müşteri kendi teklifini de kaybeder.

### 2. `scanCount` taramayı değil gönderilen geri bildirimi sayıyor — **DOĞRULANDI**
- Tek artırma noktası `app/api/feedbacks/route.ts:261-264` (feedback create sonrası). Public tarama ucu `app/api/qr-codes/public/[code]/route.ts:98-111` yalnızca `qr_scanned` AnalyticsEvent yazıyor; repoda bu olayı okuyan kod yok (grep: yalnızca yazıldığı satır).
- Sonuç: `app/api/dealer/stats/route.ts:433` `conversionRate = feedbacks/scans` her zaman yaklaşık %100 (soft-delete edilmiş yorumlar sayaçtan düşülmediği için sapma da var); `:371` engagementScore de bozuk. Aynı alan admin panolarında (`app/api/admin/dashboard/route.ts:90`, `app/api/admin/analytics/route.ts:105`, `app/api/admin/insights/route.ts:35`), `lib/action-items-ai.ts:121` ve müşteri keşif skorunda (`app/api/customer/discovery/route.ts:208`) kullanılıyor. `app/api/admin/preagg/route.ts:130` ise açıkça `scanCount = feedbackCount` atıyor.
- **Yeniden üretim:** QR 50 kez taranır, 3 kişi yorum bırakır; panelde "3 tarama", dönüşüm "%100" görünür.

### 3. Basılı QR içeriği `window.location.origin`'e bağlı — **BELİRSİZ**
- Kod gerçeği doğrulandı: `app/dealer/qr-codes/page.tsx:126,183,286,362,798,809,830`. Kanonik `lib/site-config.ts` (`siteUrl`) kullanılmıyor; `proxy.ts` host kanonikleştirmesi (kanonik domaine yönlendirme) yapmıyor.
- Ancak kullanıcıyı etkileyen senaryo dağıtım yapılandırmasına bağlı ve koddan doğrulanamadı: Bayinin paneli kanonik olmayan bir host üzerinden (deployment'a özel `*.vercel.app` adresi, preview, repoda hâlâ duran `netlify.toml`/`qratex.netlify.app` gibi eski bir alan) açabilmesi gerekiyor. Vercel'in deployment saklama politikası eski deployment URL'lerini silerse o adresle basılmış kartlar ölür. Bu olasılık gerçek, fakat "kritik" değil; orta önem taşıyan bir sağlamlaştırma işi. Düzeltmesi ucuz: QR içeriği sunucudan gelen kanonik `siteUrl` ile üretilmeli, ideal olarak kalıcı `/q/[code]` kısa yolu üzerinden.

### 4. Rotate plan kotasını atlıyor — **DOĞRULANDI (iddiadan da güçlü)**
- `app/api/qr-codes/[id]/rotate/route.ts:48-56` `canCreateQRCode` çağırmadan `create` ediyor. Tek başına rotate, kullanılabilir kod sayısını artırmaz (eskiyi iptal eder). Ancak `PATCH /api/qr-codes/[id]` `{ revoke: false }` ile `revokedAt`'i null yapabiliyor (`app/api/qr-codes/[id]/route.ts:70-71`, `lib/validations.ts:140`) ve bu uçta kota kontrolü yok.
- **Yeniden üretim:** Planı 3 QR olan ve 3 aktif kodu bulunan bayi: (1) A'yı rotate eder, A' oluşur ve A iptal edilir; (2) `PATCH /api/qr-codes/A {"revoke":false}` ile A'yı geri açar, böylece 4 aktif kodu olur; döngüyü tekrarlayarak sınırsız aktif kod elde eder. UI `revoke:false` göndermiyor ama oturumlu bayi API'yi doğrudan çağırabilir.
- Ayrıca rotate `expiresAt`, `segmentConfig` ve `locationId`'yi yeni koda taşımıyor (`:48-56`, alanlar schema `:726-729`). Bu bir işlevsel kayıp: yenilenen kodun şube bağı ve segment karşılaması sessizce düşüyor.

### 5. Toplu uç `requireAuth`/token-replay korumasını atlıyor, denetim kaydı yazmıyor — **DOĞRULANDI (önem: orta; derinlemesine savunma açığı)**
- `app/api/qr-codes/bulk/route.ts:12` doğrudan `getServerSession`; jti→IP/UA bağlama kontrolü yalnızca `lib/api-auth.ts:63-77` içinde (`checkTokenReplay`). Tekli DELETE `qr_code_deleted` olayı yazıyor (`app/api/qr-codes/[id]/route.ts:136`), bulk hiçbir iz bırakmıyor. `dealerId` filtresi doğru (`bulk/route.ts:35-38`), IDOR yok.
- Somut senaryo (ön koşul: çalınmış oturum çerezi): Saldırgan çerezi farklı IP/UA'dan kullanır. `GET /api/qr-codes` ve tekli DELETE replay kontrolüne takılıp 403 döner. QR id'leri ise public uçtan alınabilir: `app/api/qr-codes/public/[code]/route.ts` yanıtında `id` dönüyor ve kod masadaki QR'ın üstünde basılı. Saldırgan `POST /api/qr-codes/bulk {action:"delete", ids:[...]}` ile kodları siler; Bulgu 1 nedeniyle tüm yorumlar da gider ve iz kalmaz.
- Not: Bu tek bir uçla sınırlı değil. `app/api` altında 80 route `getServerSession`'ı doğrudan kullanıyor (replay korumasız); bulk, bunlar arasında en yıkıcı olanı. Ön koşul (çerez hırsızlığı) nedeniyle "kritik" yerine "yüksek/orta" daha doğru bir sınıflandırma.


---

## Uygulama (Dalga 2)

**Hedef rota:** `/dealer/qr-codes` — "QR kodlar ve şubeler" (Kodlar + Şubeler sekmeleri, QR Stüdyosu çekmecesi).

**Mimari:** Sunucu bileşeni önce (`app/dealer/qr-codes/page.tsx`): özet + ilk liste + şubeler BFF ile aynı yükleyicilerden (`lib/dealer/qr-codes/load.server.ts`) SSR'de React Query önbelleğine gömülür; bir parça düşerse istemci aynı ucu çağırıp `QueryState` ile hata/tekrar dene gösterir. Yeni BFF uçları `defineRoute` ile (rol `DEALER`, `tenant: 'dealer'`, zod, rate limit, idempotency): `GET/POST /api/dealer/qr-codes`, `GET /summary`, `GET/PATCH /[id]`, `POST /[id]/lifecycle`, `POST /bulk`, `GET /print`, `GET/POST /locations`, `PATCH /locations/[id]`. Yazma kuralları `lib/dealer/qr-codes/actions.server.ts`; saf kurallar `rules.ts`; baskı motoru `print-layout.ts` (+ bağımlılıksız vektörel PDF `pdf.ts`, `matrix.ts`). İstemci adası `components/dealer/b-qr-kodlar/**`; oluşturma ve stüdyo çekmeceleri `next/dynamic` ile yalnız açılınca yüklenir; `jszip` ve `qrcode` artık istemci paketinde yok (QR'ı sunucu üretir).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa metadata | ÇALIŞIYOR | Değişmedi (layout). |
| 2 | Rol kapısı | ÇALIŞIYOR | Sayfa `requireAuth(['DEALER'])`; uçlar `defineRoute` + kiracı kapsamı. STAFF erişimi rol/navigasyon kararı, bu yüzeyin dışında. |
| 3 | Hero | ÇALIŞIYOR | QDL v2 `PageHeader` (compact, ops kaydı). |
| 4 | Yeni QR butonu + diyalog | ÇALIŞIYOR | `EntityEditorSheet` (sağ çekmece; mobilde tam genişlik). |
| 5 | Ad alanı | ÇALIŞIYOR | Zod tek kaynak (2–100), `maxLength`, sunucu alan hatası alanın altında. |
| 6 | Açıklama | ÇALIŞIYOR | 500 sınırı + sayaç. |
| 7 | `isActive` form alanı (sahte) | KALDIRILDI → ÇALIŞIYOR | Oluşturmada gönderilmiyor; aktiflik kartta ve Ayarlar'da gerçek `Switch` (PATCH `isActive`). |
| 8 | Çift tık koruması | ÇALIŞIYOR | Gönderim kilitli + `Idempotency-Key`; Enter ile gönderim. |
| 9 | Kota uyarısı | ÇALIŞIYOR | Özet kartında kota çubuğu (x/y, plan); oluşturmada kalan hak + aşımda yükseltme bağlantısı; sunucu 402 `PLAN_LIMIT_REACHED`. |
| 10 | Toplam QR | ÇALIŞIYOR | Sunucu sayımı (sekme rozeti + durum çipleri). |
| 11 | Aktif sayısı | ÇALIŞIYOR | `deriveQrStatus`/`statusWhere` tek tanım; iptal/süresi dolmuş/arşiv aktif sayılmaz; sayfadan bağımsız. |
| 12 | Toplam tarama | ÇALIŞIYOR | Tarama = tekilleştirilmiş `qr_scanned` olayı (`scanCount` değil); 7 gün + önceki 7 güne göre değişim + 14 gün çizgisi. |
| 13 | Sayı animasyonu | ÇALIŞIYOR | Özel sayaç kaldırıldı; `MetricTile` (azaltılmış harekete uyar). |
| 14 | Arama | ÇALIŞIYOR | Sunucuda (ad/kod/not/şube, büyük-küçük harf duyarsız), 300 ms bekleme, URL'de `?q=`. |
| 15 | `?search=` derin link | ÇALIŞIYOR | `normalizeQrFilters` `search`→`q`; SSR'de de uygulanır. |
| 16 | Filtre ve sıralama | ÇALIŞIYOR | Durum çipleri (sayılı), şube (şubesiz dahil), sıralama (yeni/eski/ad/son kullanma); URL senkron. |
| 17 | Tekli seçim | ÇALIŞIYOR | `aria-label`'lı, 44 px hedef. |
| 18 | Sayfadakileri seç | ÇALIŞIYOR | Yalnız bu sayfanınkileri ekler/kaldırır; diğer sayfadaki seçimler korunur; kısmi durum `indeterminate`. |
| 19 | Toplu aktif/pasif | ÇALIŞIYOR | İşlem başına yükleniyor durumu; iptal/arşiv kodlar atlanır ve sayısı söylenir; denetim kaydı. |
| 20 | Toplu sil | KALDIRILDI | Silme yok (C1); kodlar arşivlenir, yorumlar korunur. |
| 21 | Toplu ZIP | KALDIRILDI → toplu PDF | Sayfalar arası seçimin tamamı (en çok 50) tek PDF'te masa kartı; iptal/arşiv seçimler hariç. ZIP'in tek amacı toplu baskıydı. |
| 22 | Seçimi temizle | ÇALIŞIYOR | Toplu çubukta. |
| 23 | Yükleniyor iskeleti | ÇALIŞIYOR | `QueryState` iskeletleri. |
| 24 | Boş durum | ÇALIŞIYOR | Üç ayrı durum: hiç kod yok (ilk kullanım CTA) / süzgece uyan yok ("Süzgeçleri temizle") / hata. |
| 25 | Hata durumu | ÇALIŞIYOR | `QueryState` hata + "Tekrar dene"; veri varken gelen hata veriyi silmez. |
| 26 | Kart önizleme | ÇALIŞIYOR | Sunucunun ürettiği gerçek QR (lazy SVG), `<button aria-label>`. |
| 27 | Durum rozeti | ÇALIŞIYOR | Sunucu saatine göre; statik nokta (nabız kaldırıldı); "sona eriyor" rozeti. |
| 28 | Ad, kod, tarama | ÇALIŞIYOR | "312 tarama · 41 yorum · %13 dönüşüm · ★ 4,2" (30 gün) + 14 günlük çizgi + şube. |
| 29 | Menü: Önizle | ÇALIŞIYOR | "Yazdır ve indir" → Stüdyo; tetikleyici `aria-label`'lı. |
| 30 | Menü: Sayfayı aç | ÇALIŞIYOR | Stüdyo'da `rel="noopener noreferrer"`. |
| 31 | Kodu yenile | ÇALIŞIYOR | Kota-nötr (1 iptal + 1 oluşturma, kilit altında); son kullanma/karşılama/şube taşınır; zincir "Geçmiş" sekmesinde. |
| 32 | İptal et | ÇALIŞIYOR | Onay diyaloğu + "İptali geri al" (kota denetimli). |
| 33 | Sil | KALDIRILDI → Arşivle | Arşiv/arşivden geri alma; onay metni sonucu ve korunan yorum sayısını söyler. |
| 34 | Link kopyala | ÇALIŞIYOR | try/catch + görünür hata; kanonik adres. |
| 35 | Kart PNG indir | ÇALIŞIYOR | Stüdyo'dan; QR başına renk durumu (sızma yok), ASCII güvenli dosya adı, iptal/arşiv kod basılamaz (sunucu 409). |
| 36 | Tekli aktif/pasif | ÇALIŞIYOR | Kartta `Switch`. |
| 37 | Ad/açıklama düzenleme | ÇALIŞIYOR | Stüdyo › Ayarlar (yalnız değişen alanlar gönderilir). |
| 38 | Son kullanma tarihi | ÇALIŞIYOR | Oluşturma ve Ayarlar'da; İstanbul gününün sonunda biter; geçmiş tarih reddedilir. |
| 39 | Segment karşılama | ÇALIŞIYOR | "Karşılama bağlantıları" (en çok 8) ↔ `segmentConfig`; bağlantıya özel baskı ve bağlantıya göre tarama kırılımı. |
| 40 | Şube atama | ÇALIŞIYOR | Oluşturma/Ayarlar'da; arşivli ya da başka bayinin şubesi sunucuda reddedilir. Şubeler sekmesi: ekle, düzenle, arşivle/geri al (silme yok), plan şube kotası. |
| 41 | Sayfalama | ÇALIŞIYOR | Sunucu sayfayı sıkıştırır, URL düzelir; `keepPreviousData` + otomatik iptal (yarış yok). |
| 42 | Önizleme modalı | ÇALIŞIYOR | Radix tabanlı `DetailSheet` (odak tuzağı, Esc, kaydırma), `?qr=&qrtab=` derin linkli. |
| 43 | Renk seçici | ÇALIŞIYOR | `label htmlFor`; kontrast denetimi (< 4,5:1 ya da ters → indirme kapalı, sunucu da reddeder). Renk kalıcı değil (ŞEMA İSTEĞİ 1). |
| 44 | Hazır paletler | ÇALIŞIYOR | 5 okunur palet; "Ters" palet kaldırıldı. |
| 45 | QR içerik URL'si | ÇALIŞIYOR | Tek kaynak `buildQrTargetUrl` → `siteUrl`; sunucu üretir. |
| 46 | Çerçeve şablonları (sahte) | KALDIRILDI → gerçek şablonlar | Masa kartı (A6), katlanır masa standı (A4, iki yüz), sticker (90 mm), yalnız QR; önizleme = SVG = PNG = PDF. |
| 47 | PNG indir | ÇALIŞIYOR | Sunucu SVG'sinden ~300 dpi. |
| 48 | SVG indir | ÇALIŞIYOR | mm ölçülü; `revokeObjectURL` gecikmeli. |
| 49 | Modal tarama/tarih | ÇALIŞIYOR | Stüdyo › İstatistik ve Geçmiş. |
| 50 | Link kopyala / aç | ÇALIŞIYOR | |
| 51 | Baskıya hazır şablon, PDF | ÇALIŞIYOR | Sunucu PDF (`GET /api/dealer/qr-codes/print`), toplu çok sayfalı. |
| 52 | Gerçek tarama analitiği | ÇALIŞIYOR | Kart (30 gün + çizgi), özet (7/14/30 gün, dönüşüm, en düşük puanlı nokta), Stüdyo (günlük tarama/yorum, tablo, bağlantı kırılımı). |
| 53 | UTM/kampanya linki | ÇALIŞIYOR | Stüdyo › Yazdır › "Kampanya bağlantısı (UTM)". |
| 54 | Toast dili | ÇALIŞIYOR | Bu yüzey doğrudan `sonner` kullanır (öneksiz, Türkçe karakterli). |
| 55 | Azaltılmış hareket | ÇALIŞIYOR | `Reveal` (bütçeli kademe, azaltılmışta düz), geçişler `motion-reduce`, nabız yok. |
| 56 | `layout` animasyonu | KALDIRILDI | Etkisizdi; gerek yok. |

### Kapanan bulgular (15/15)
1 Cascade silme → arşiv (silme ucu ve toplu silme yok) · 2 Tarama metriği → `qr_scanned` · 3 Origin → kanonik `siteUrl`, sunucu üretimi · 4 Rotate kotası/ayar taşıma/zincir · 5 Sayfa bazlı istatistik → sunucu özeti · 6 Arama/derin link/boş durumlar · 7 Hata/yarış/geçersiz sayfa · 8 Sahte çerçeve + renk sızıntısı → tek yerleşim motoru · 9 Toplu uç → `defineRoute` (token-replay, zod, denetim kaydı) · 10 Erişilebilir modal/etiketler · 11 Oluşturma akışı (kilit, düzenleme, şube, son kullanma, karşılama, numaralı seri) · 12 Toast/hata dili · 13 Ağır kütüphaneler istemciden çıktı, `select` daraltıldı · 14 Motion · 15 918 satırlık bileşen bölündü.

Eksik özelliklerden uygulananlar: 1 (baskı stüdyosu; logo hariç), 2 (tarama analitiği; cihaz/dil hariç), 3 (şube), 4 (numaralı seri + tek PDF), 5 (UTM; dinamik hedef hariç), 6 (son kullanma, iptali geri alma, rotate geçmişi, kota göstergesi).

### Testler
`__tests__/lib/dealer/qr-codes-actions.test.ts` ve `__tests__/lib/dealer/qr-codes-print.test.ts` — 26/26 geçti.

### Kalanlar (gerekçeli)
- QR başına kalıcı stil (renk/şablon/CTA) ve işletme logosu: şemada alan yok → ŞEMA İSTEĞİ 1 (`QRCode.style Json`).
- `kind` (masa/kasa/paket) etiketi ve `rotatedFromId` ilişkisi: ŞEMA İSTEĞİ 2; zincir şimdilik `qr_code_rotated` olayından okunuyor.
- Kalıcı kısa yol `/q/[code]` ve dinamik hedef: yeni herkese açık rota + proxy kararı bu yüzeyin sahipliği dışında.
- Eski `/api/qr-codes/**` uçları başka yüzeylerce kullanıldığı için dokunulmadı; bu sayfa artık onları çağırmıyor.
- `QRCode.scanCount`'u okuyan admin/analitik panoları başka yüzeylerin işi.
- Cihaz/dil dağılımı: tarama olayı bu boyutları taşımıyor.
