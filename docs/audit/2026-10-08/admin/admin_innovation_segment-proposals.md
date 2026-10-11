# /admin/innovation/segment-proposals

**Amaç:** Bayilerin (DEALER) kendi müşteri segmentlerine (`sleeping` / `loyal` / `first_visit`) göndermek istediği bildirim + push kampanya taslaklarını platform operatörünün onaylaması/reddetmesi. Akış: bayi taslak oluşturur (`PENDING`) → admin bu sayfada karar verir (`APPROVED` / `REJECTED`) → bayi `/dealer/innovation` sayfasından "Müşterilere gönder" ile gerçek gönderimi yapar (`SENT`).

**Genel puan: 4/10** · **Karar: yeniden tasarla** (ve `/admin/innovation` içindeki kopya kuyrukla **birleştir**)

Sayfa 111 satırlık, temiz ve okunaklı bir "onay listesi". Temel işi (listele, onayla, reddet) yapıyor; ancak bir moderasyon/onay aracı için kritik olan güvenceler yok: durum geçişi koruması yok (bayat liste ile `SENT` → `APPROVED` geri alınıp aynı kampanya ikinci kez 500 müşteriye gönderilebiliyor), "Gönderildi olarak işaretle" düğmesi hiçbir şey göndermeden kampanyayı kalıcı olarak kilitliyor, kitle büyüklüğü/önizleme olmadan onay veriliyor, karar gerekçesi ve bayiye bildirim yok, demo taslakları gerçeklerle karışıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listele/onayla/reddet çalışıyor; fakat "SENT" düğmesi yanıltıcı ve zararlı, durum makinesi yok, gerekçe/bildirim/geçmiş yok. |
| UX | 4/10 | Karar için gereken bağlam (kitle sayısı, push önizlemesi, bayinin geçmişi) yok; ham `segmentKey` gösteriliyor; reddetmede onay/geri al yok. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` + shadcn `Card` ile tutarlı, ama liste düz metin yığını; durum/öncelik/yaş görsel olarak ayrışmıyor. |
| Mimari | 4/10 | Kuyruk iki sayfada kopya; API'de durum geçişi ve denetim kaydı yok; `decidedById` ilişkisiz; `status` serbest `String`. |
| Performans | 7/10 | Tek sorgu, `take: 100`, indeksli (`@@index([status])`); sorun yok, yalnızca sayfalama ve toplam sayı eksik. |
| Erişilebilirlik + mobil | 5/10 | `flex-wrap` ile mobilde dağılmıyor; ancak yükleniyor durumu `aria-live` değil, yalnızca ikonlu "Gönder" düğmesi, `p-6` + layout dolgusu mobilde çift kenar boşluğu. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (hero) | ÇALIŞIYOR | `app/admin/innovation/segment-proposals/page.tsx:60-64` | `AdminPremiumHero`; azaltılmış hareket desteği bileşende var (`components/admin/admin-premium-hero.tsx:35,73`). |
| 2 | Kenar çubuğu menü girişi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:182`, `messages/tr.json:2486` | "Segment Önerileri"; bekleyen sayı rozeti yok. |
| 3 | Bekleyen önerileri listeleme (GET) | ÇALIŞIYOR | `page.tsx:25-32`, `app/api/admin/innovation/segment-proposals/route.ts:8-22` | Yalnızca `PENDING`, eskiden yeniye, en fazla 100. |
| 4 | Yetki kontrolü (sunucu) | ÇALIŞIYOR | `route.ts:9-10`, `[id]/route.ts:17-18` | `requireAuth(['ADMIN'])` + token-replay kontrolü (`lib/api-auth.ts:52-80`). |
| 5 | Yükleniyor durumu | KISMİ | `page.tsx:71-72` | Düz "Yükleniyor..." metni; iskelet yok, `aria-live`/`role="status"` yok. |
| 6 | Boş durum | KISMİ | `page.tsx:73-74` | "Bekleyen öneri yok." — hata ile gerçek boşluk ayırt edilmiyor (bkz. #7). |
| 7 | Hata durumu (liste) | BOZUK | `page.tsx:27-30` | `r.ok` kontrol edilmiyor; 401/403 JSON `{error}` döndüğünde `d.proposals` undefined → sessizce "Bekleyen öneri yok" gösterilir. Yalnızca ağ/JSON parse hatasında toast. Yeniden dene yok. |
| 8 | Öneri kartı: başlık | ÇALIŞIYOR | `page.tsx:81` | |
| 9 | Öneri kartı: bayi adı (fallback zinciri) | ÇALIŞIYOR | `page.tsx:83` | businessName → name → email → id. Bayi profiline link yok. |
| 10 | Öneri kartı: segment etiketi | KISMİ | `page.tsx:84` | Ham anahtar (`first_visit`, `sleeping`) gösteriliyor; Türkçe etiket/açıklama yok. |
| 11 | Öneri kartı: oluşturma tarihi | KISMİ | `page.tsx:85` | Yalnızca tarih (`toLocaleDateString`); bekleme süresi/yaşı ("3 gün önce") ve SLA yok. |
| 12 | Öneri kartı: mesaj gövdesi | ÇALIŞIYOR | `page.tsx:87` | `whitespace-pre-wrap`; uzunluk sınırı yok (bkz. Bulgu 6) — kırpma/genişlet yok. |
| 13 | "Onayla" düğmesi | KISMİ | `page.tsx:90-93`, `[id]/route.ts:36-43` | Çalışıyor ama durum geçişi koruması yok (Bulgu 1); bayiye bildirim yok (Bulgu 4); denetim kaydı yok. |
| 14 | "Reddet" düğmesi | KISMİ | `page.tsx:94-97` | Gerekçe alanı yok, onay/geri al yok, bayi bilgilendirilmiyor. |
| 15 | "Gönderildi olarak işaretle" (Send ikonu) | SAHTE / zararlı | `page.tsx:98-100`, `[id]/route.ts:10,36-43`, `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:42-45` | Hiçbir bildirim/push göndermez; yalnızca `status='SENT'` yazar. Bayinin gönderim uç noktası yalnızca `APPROVED` kabul ettiği için kampanya kalıcı olarak gönderilemez hale gelir (Bulgu 2). |
| 16 | İşlem sırasında düğme kilidi / spinner | KISMİ | `page.tsx:23,39,55,90-98` | Tek `busy` string: A işlenirken B'ye tıklanırsa A'nın düğmeleri yeniden aktifleşir; spinner yalnızca "Onayla"da. |
| 17 | Karar sonrası iyimser listeden düşürme | ÇALIŞIYOR | `page.tsx:51-52` | Başarı sonrası yerel filtre. Hata durumunda (ör. 404) satır listede kalır. |
| 18 | Başarı/hata toast'ları | KISMİ | `page.tsx:48-54`, `lib/admin-toast.ts:16-19` | Önek "Basarili: " / "Dikkat: " — Türkçe karakter yok, "Basarili: Onaylandı" gibi karışık çıktı. |
| 19 | Yenile düğmesi / otomatik yenileme | EKSİK | `page.tsx:34-36` | Yalnızca mount'ta yüklenir; başka admin karar verse de liste bayat kalır. |
| 20 | Arama / filtre (bayi, segment) | EKSİK | — | |
| 21 | Sıralama | EKSİK | `route.ts:14` | Sabit `createdAt asc`. |
| 22 | Durum sekmeleri (Onaylanan / Reddedilen / Gönderilen / Geçmiş) | EKSİK | `route.ts:13`, `page.tsx:68` | Yalnızca `PENDING`; karar geçmişi hiçbir yerde görülemiyor. |
| 23 | Sayfalama / toplam sayı | EKSİK | `route.ts:15` | 100'ün üstü sessizce görünmez. |
| 24 | Kitle büyüklüğü / hedef önizleme | EKSİK | `lib/innovation-segment-users.ts:14-70`, `send/route.ts:11,48` | Hesaplayıcı var ama sayfada kullanılmıyor; 500 üst sınır (`MAX_SEND`) sessizce kırpıyor. |
| 25 | Push/bildirim önizlemesi | EKSİK | `send/route.ts:70-95` | Admin müşterinin göreceği şeyi görmüyor. |
| 26 | Mesajı düzenleyerek onaylama | EKSİK | `[id]/route.ts:9-11` | Şema yalnızca `status` kabul ediyor. |
| 27 | Ret gerekçesi | EKSİK | `prisma/schema.prisma:2732-2747` | Modelde alan yok. |
| 28 | Bayiye karar bildirimi | EKSİK | `[id]/route.ts:36-45` | Bildirim/e-posta/push yok; bayi ancak sayfayı yenileyince görür. |
| 29 | Denetim kaydı (AuditLog) | EKSİK | `[id]/route.ts:36-45` | Diğer admin uçları `prisma.auditLog.create` kullanıyor (ör. `app/api/admin/api-keys/route.ts:74`). |
| 30 | Toplu işlem (çoklu seçim) | EKSİK | — | |
| 31 | Klavye kısayolları (J/K, A/R) | EKSİK | — | Moderasyon kuyruğu için standart. |
| 32 | Demo/gerçek ayrımı | EKSİK | `app/api/admin/innovation/demo-package/route.ts:85-94`, `demo-scenario/route.ts:99-107` | Demo taslakları gerçek bayi kuyruğuna `PENDING` olarak düşüyor, işaretsiz. |
| 33 | Özellik bayrağı durumu göstergesi | EKSİK | `lib/innovation-config.ts:32,64`, `app/api/dealer/innovation/segment-proposals/route.ts:19-22` | `segmentProposals` kapalıyken bayi gönderemez; admin sayfası bunu söylemiyor. |
| 34 | Sayfa `<title>` metadata | KISMİ | `app/admin/layout.tsx:11-21` | Client sayfa; sekme başlığı yalnızca "Admin". |
| 35 | Mobil yerleşim | KISMİ | `page.tsx:59,79,89` | `flex-wrap` ile düğmeler alta iner; `p-6` + layout yatay dolgusu çift boşluk. |

**Durum sayımı:** ÇALIŞIYOR 7 · KISMİ 11 · BOZUK 1 · SAHTE 1 · EKSİK 15 (toplam 35)

---

## Bulgular

### 1. [YÜKSEK · Veri bütünlüğü / yarış koşulu] PATCH durum geçişini doğrulamıyor — gönderilmiş kampanya yeniden açılıp ikinci kez gönderilebilir
- **Kanıt:** `app/api/admin/innovation/segment-proposals/[id]/route.ts:28-43` — `existing.status` okunuyor ama hiç kontrol edilmiyor; `update` koşulsuz. Bayi gönderimi `send/route.ts:54-62` yalnızca `status: 'APPROVED'` iken `SENT`'e claim ediyor.
- **Sorun:** Senaryo: Admin A sayfayı açar (öneri PENDING). Admin B (veya `/admin/innovation` hub'ındaki kopya kuyruk) onaylar; bayi gönderir → `SENT`, 500'e kadar müşteriye bildirim + push gider. Admin A bayat listede "Onayla"ya basar → `SENT` → `APPROVED`. Bayinin sayfasında "Müşterilere gönder" yeniden görünür (`app/dealer/innovation/page.tsx:302-306`) ve aynı kampanya ikinci kez gönderilir. Aynı yoldan "Reddet" basılırsa gerçekte gönderilmiş kampanya `REJECTED` olarak tarihe yanlış geçer. `decidedAt`/`decidedById` de her seferinde ezilir.
- **Öneri:** Açık bir durum makinesi tanımlayın (`PENDING → APPROVED|REJECTED`, `APPROVED → SENT` yalnızca gönderim ucu tarafından, geri dönüş yok). PATCH'i `updateMany({ where: { id, status: 'PENDING' }, data })` ile koşullu yapın; `count === 0` ise 409 + güncel durum döndürün; istemci 409'da satırı "başka biri karar verdi: X" bilgisiyle listeden düşürsün. Uzun vadede `status`'u Prisma `enum`'a çevirin (`schema.prisma:2738` şu an serbest `String`).
- **Efor:** S

### 2. [YÜKSEK · İşlevsellik / SAHTE aksiyon] "Gönderildi olarak işaretle" hiçbir şey göndermiyor ve kampanyayı kalıcı olarak kilitliyor
- **Kanıt:** `page.tsx:98-100` (`decide(p.id, 'SENT')`), `[id]/route.ts:10` (`'SENT'` kabul ediliyor), `send/route.ts:42-45` (yalnızca `APPROVED` gönderilebilir).
- **Sorun:** PENDING bir öneri doğrudan `SENT` yapılır; bildirim/push üretilmez, `analyticsEvent` yazılmaz. Bayi panelinde rozet "SENT" görünür (`app/dealer/innovation/page.tsx:299`) — bayi kampanyasının gittiğini sanar, oysa hiçbir müşteriye ulaşmamıştır. Ayrıca onay adımını atlayan bir kısayol oluşturur. Düğme yalnızca ikonlu, etiketi yalnızca `title`.
- **Öneri:** Bu düğmeyi kaldırın ve API şemasından `SENT`'i çıkarın (`SENT` yalnızca gerçek gönderim ucunun yazabileceği bir durum olmalı). Admin'in "bayi adına gönder" ihtiyacı varsa bunu açıkça adlandırılmış, kitle sayısını gösteren ve onay isteyen bir aksiyon olarak mevcut `send` ucuna (zaten ADMIN'e izin veriyor, `send/route.ts:26,54-57`) bağlayın.
- **Efor:** S

### 3. [YÜKSEK · UX / Karar kalitesi] Onay, kitle büyüklüğü ve önizleme olmadan veriliyor
- **Kanıt:** `page.tsx:80-88` yalnızca başlık/mesaj/segment gösteriyor; `lib/innovation-segment-users.ts:14-70` hedef kitleyi hesaplayabiliyor; `send/route.ts:11,48` 500'de sessiz kırpma.
- **Sorun:** Admin, kaç müşteriye push gideceğini, segmentin boş olup olmadığını (gönderimde 400 "uygun müşteri yok" döner, `send/route.ts:50-52`) veya bayinin son 30 günde kaç kampanya gönderdiğini bilmeden karar veriyor. Şablonlar somut vaatler içeriyor ("ikramımız hazır; kodu kasada gösterin", `lib/innovation-segment-templates.ts:13-15`) ama hiçbir kod üretilmiyor — admin bu tutarsızlığı yakalayacak bağlama sahip değil.
- **Öneri:** Liste satırı için sunucuda `audienceCount` (resolveInnovationSegmentUserIds'in sayaç sürümü; Redis'te 10 dk önbellek), `truncated: count > 500`, bayinin son 30 gün gönderim sayısı ve son kampanya tarihi döndürün. Detay panelinde müşterinin göreceği bildirim/push kartının birebir önizlemesi olsun.
- **Efor:** M

### 4. [ORTA · İşlevsellik] Karar gerekçesi, bayi bildirimi ve denetim kaydı yok
- **Kanıt:** `prisma/schema.prisma:2732-2747` (gerekçe alanı yok, `decidedById` ilişkisiz), `[id]/route.ts:36-45` (bildirim/auditLog yok); diğer admin uçlarındaki desen: `app/api/admin/api-keys/route.ts:74`, `app/api/admin/cards/[id]/route.ts:217`.
- **Sorun:** Reddedilen bayi nedenini öğrenemiyor ve düzeltip yeniden gönderemiyor; onaylanan bayi haber almıyor (gönderim fırsatı kaçıyor). Hangi adminin neyi neden onayladığı `AuditLog`'da görünmüyor; `decidedById` User'a bağlı olmadığı için UI'da adı da gösterilemez.
- **Öneri:** Modele `decisionNote String?` ve `decidedBy User? @relation(...)` ekleyin. Ret için zorunlu, onay için isteğe bağlı not alanı. Kararda tek transaction'da: koşullu update + `auditLog.create` + bayiye `notification.create` (tip `innovation_segment_decision`, onayda "/dealer/innovation" derin linki). Bayi tarafında "düzenle ve yeniden gönder" akışı.
- **Efor:** M

### 5. [ORTA · Veri bütünlüğü] Demo taslakları gerçek kuyruğa işaretsiz düşüyor ve gerçek müşterilere gönderilebilir
- **Kanıt:** `app/api/admin/innovation/demo-package/route.ts:85-94` ("Bu metin örnektir; admin onayından sonra gerçek gönderim akışına bağlanır."), `app/api/admin/innovation/demo-scenario/route.ts:99-107` ("120 sn demo — segment taslağı metni."). Her ikisi de herhangi bir gerçek `DEALER` id'si ile çalışır (`demo-package/route.ts:29-35`).
- **Sorun:** Bu kayıtlar kuyrukta gerçek önerilerden ayırt edilemez. Yanlışlıkla onaylanırsa bayi, demo metnini gerçek müşterilerine push olarak gönderebilir.
- **Öneri:** Modele `source` (`DEALER | DEMO | ADMIN`) veya `isDemo` alanı ekleyin; demo kayıtları kuyrukta "DEMO" rozetiyle ve varsayılan olarak gizli bir filtrede gösterin; gönderim ucunda `isDemo` ise reddedin.
- **Efor:** S

### 6. [ORTA · Güvenlik/kötüye kullanım] Bayi tarafında hız sınırı, tekilleştirme ve mesaj uzunluk sınırı yok — kuyruk taşabilir
- **Kanıt:** `app/api/dealer/innovation/segment-proposals/route.ts:11-16` (`message: z.string().min(1)` — `max` yok), `:78-86` (her POST yeni PENDING); admin GET `take: 100` (`route.ts:15`).
- **Sorun:** Bayi döngüyle binlerce PENDING üretebilir ya da megabaytlarca mesaj gönderebilir; admin sayfası tümünü `whitespace-pre-wrap` ile basar ve 100'ün üstünü sessizce gizler (sıralama `asc` olduğu için en yeni öneriler hiç görünmez).
- **Öneri:** `message` için `max(1000)`, bayi başına aynı segmentte tek açık PENDING kuralı (veya kısmi unique index), Upstash tabanlı hız sınırı. Admin GET'te `count` + cursor sayfalama.
- **Efor:** S

### 7. [ORTA · Hata yönetimi] Liste hatası sessizce "boş" olarak gösteriliyor
- **Kanıt:** `page.tsx:27-31` — `r.ok` kontrolü yok; `Array.isArray(d.proposals) ? ... : []`.
- **Sorun:** Oturum düşmesi (401), token-replay (403, `lib/api-auth.ts:70-76`) gibi durumlarda admin "Bekleyen öneri yok" görür ve kuyruğun temiz olduğuna inanır — bir onay kuyruğu için en tehlikeli yanlış negatif.
- **Öneri:** `!r.ok` ise `error` durumuna geçin; kart içinde hata mesajı + "Yeniden dene" düğmesi gösterin. Veri katmanını hub ile ortak bir `useSegmentProposals()` (SWR/React Query) kancasına taşıyın; odak/aralıkla yeniden doğrulama.
- **Efor:** S

### 8. [ORTA · Mimari / çakışma] Aynı onay kuyruğu `/admin/innovation` hub'ında ikinci kez, farklı davranışla uygulanmış
- **Kanıt:** `app/admin/innovation/page.tsx:57,66,101-113,296-335` — aynı GET/PATCH, `unknown` cast (`:304-310`), farklı toast ("common.updated"), tam sayfa yeniden yükleme, spinner/kilit yok.
- **Sorun:** İki ayrı yerden karar verilebilmesi Bulgu 1'deki yarışı büyütür; davranış ve metinler tutarsız; bakım iki katı.
- **Öneri:** Hub'da yalnızca bir özet kartı bırakın: "N bekleyen öneri · en eski X gün" + bu sayfaya link. Karar UI'sı tek yerde (bu sayfa) yaşasın; kenar çubuğu girişine bekleyen sayı rozeti ekleyin.
- **Efor:** S

### 9. [DÜŞÜK · UX/i18n] Ham segment anahtarı, Türkçe karaktersiz toast öneki, karışık dil
- **Kanıt:** `page.tsx:84` (`first_visit`), `page.tsx:68` ("PENDING" metni kullanıcıya gösteriliyor), `lib/admin-toast.ts:17,19` ("Basarili: ", "Dikkat: "); sayfa metinleri `useAppT` kullanmıyor (hub kullanıyor, `app/admin/innovation/page.tsx:25,28`); kenar çubuğu çevrilmiş (`messages/en.json:2486`).
- **Öneri:** `SEGMENT_LABELS` sözlüğü (Uykuda / Sadık / İlk ziyaret + kısa tanım tooltip'i, tanımlar `lib/innovation-segment-users.ts:56-67` ile aynı kaynaktan), tüm metinleri i18n anahtarlarına taşıyın, toast önekini düzeltin ("Başarılı:").
- **Efor:** S

### 10. [DÜŞÜK · Etkileşim] Tek `busy` kilidi ve geri alınamaz ret
- **Kanıt:** `page.tsx:23,39,55` — tek değer; `page.tsx:94-97` ret anında uygulanır.
- **Sorun:** Paralel kararlar kilidi karıştırır (A işlenirken B'ye basınca A'nın düğmeleri yeniden aktif). Yanlış tıklanan "Reddet" geri alınamaz (ve PATCH koşullu yapılınca hiç geri alınamaz olacak).
- **Öneri:** `busyIds: Set<string>`; ret için gerekçe isteyen küçük bir onay popover'ı veya 5 sn "Geri al" toast'ı (karar sunucuya gecikmeli yazılır).
- **Efor:** S

### 11. [DÜŞÜK · Erişilebilirlik/mobil] Durum duyurusu ve ikon düğme
- **Kanıt:** `page.tsx:72` (aria-live yok), `page.tsx:98-100` (yalnızca `title`), `page.tsx:59` (`p-6`, layout zaten `pl/pr` veriyor: `app/admin/layout.tsx:33`).
- **Öneri:** Yükleme/sonuç için `role="status"`; ikon düğmelere `aria-label`; sayfa kabında admin genel ritmiyle uyumlu `gap-6` + `px-0 sm:px-2`. Karar sonrası odağı bir sonraki karta taşıyın (klavye akışı).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Stripe Radar inceleme kuyruğu, Linear triage, Retool onay araçları ve PostHog'un kohort araçlarıyla karşılaştırıldığında:

1. **Triage görünümü (Linear Triage benzeri):** sol liste + sağ detay paneli, J/K ile gezinme, A/R ile karar, karar sonrası otomatik sonraki öğe; çoklu seçim ve toplu onay/ret.
2. **Durum sekmeleri ve karar geçmişi:** Bekleyen / Onaylanan (gönderilmeyi bekleyen) / Gönderilen (gerçek `sentCount` ile) / Reddedilen; kim, ne zaman, hangi gerekçeyle (Stripe Radar "review history").
3. **Kitle önizlemesi (PostHog kohort benzeri):** hedef sayı, 500 sınırı uyarısı, segment tanımı, bayinin son kampanya sıklığı — "yorgunluk" uyarısı.
4. **Mesaj önizlemesi ve düzenleyerek onaylama:** push/bildirim kartı birebir; admin küçük düzeltme yapıp "düzenlenerek onaylandı" diye işaretleyebilsin.
5. **Bayiye geri bildirim döngüsü:** ret gerekçesi + bildirim + "düzenle ve yeniden gönder".
6. **SLA ve operasyonel sinyaller:** bekleme yaşı, en eski bekleyen, kenar çubuğunda sayı rozeti, isteğe bağlı otomatik onay kuralları (ör. değiştirilmemiş şablon + güvenilir bayi + kitle < N).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında "kaç öneri bekliyor, en eskisi ne kadar bekliyor, hangisi riskli" sorusunun cevabını 2 saniyede görür; her öneriyi, müşterinin göreceği haliyle ve gideceği kitle büyüklüğüyle birlikte inceleyip klavyeden karar verir; karar bayiye anında, gerekçesiyle ulaşır ve denetim kaydına düşer.

**Yerleşim:**
- Üstte ince bir özet şeridi (hero küçültülür): Bekleyen · Bugün karar verilen · Onaylı-gönderilmemiş · Ortalama karar süresi.
- Sekmeler: Bekleyen | Onaylı | Gönderilen | Reddedilen | Tümü; filtre çubuğu (bayi arama, segment, kaynak: bayi/demo, tarih aralığı).
- Masaüstü: iki sütun — solda yoğun liste (bayi, segment rozeti, yaş, kitle sayısı, "değiştirilmiş şablon" işareti), sağda detay paneli: push önizleme kartı, tam mesaj, kitle sayısı + 500 uyarısı, bayinin son 5 kampanyası, karar alanı (not + Onayla / Reddet). Mobil: liste → tam ekran `Sheet` detay, karar düğmeleri altta sabit (safe-area dolgulu).
- Klavye: J/K gezinme, A onay, R ret (not alanına odak), `?` kısayol listesi.

**Motion:** Ölçülü. Karar verilen satır `m as Motion` + `AnimatePresence` ile 150–200 ms yükseklik/opaklık daralması (layout animasyonu) ve sonraki satıra odak geçişi; sekme sayaçlarında kısa sayı geçişi. `useReducedMotion` ile tümü anlık geçişe düşsün. 3D veya dekoratif efekt bu operasyonel araca uygun değil — eklenmemeli.

**Veri/API değişiklikleri:**
- Şema: `status` → Prisma `enum SegmentProposalStatus`; `decisionNote String?`; `decidedBy User? @relation`; `source` (`DEALER|DEMO|ADMIN`); `sentAt DateTime?`, `sentCount Int?`; `@@index([status, createdAt])`.
- `GET /api/admin/innovation/segment-proposals?status=&q=&segment=&cursor=` → `{ items, nextCursor, counts: {pending, approved, sent, rejected} }`; her satıra `audienceCount` (Redis önbellekli) ve `dealerRecentSends`.
- `PATCH /[id]` → `{ status: 'APPROVED'|'REJECTED', note?, title?, message? }`; `updateMany where status='PENDING'` ile koşullu, 409'da güncel durum; tek transaction'da `auditLog` + bayi `notification`.
- `POST /bulk` → toplu karar (aynı koşullu kural, satır bazlı sonuç).
- Bayi POST: `message.max(1000)`, segment başına tek açık PENDING, hız sınırı.
- İstemci: ortak `useSegmentProposals` kancası (SWR, odakta yeniden doğrulama); hub yalnızca sayaç kartı kullanır.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/innovation` (hub) — "Segment kampanya onay kuyruğu" kartı** (`app/admin/innovation/page.tsx:296-335`) bu sayfanın birebir kopyası, daha zayıf bir uygulamayla (tipsiz `unknown` cast, kilit yok, tam yeniden yükleme). **Öneri: birleştir** — karar UI'sı yalnızca bu sayfada kalsın; hub'da "N bekleyen · en eski X gün → İncele" özet kartı ve link bulunsun.
- **`/dealer/innovation` — "Segment kampanyaları"** (`app/dealer/innovation/page.tsx:267-312`) aynı kaydın bayi tarafı; çakışma değil, akışın diğer ucu. Ancak durumlar ham İngilizce (`PENDING`, `SENT`) gösteriliyor ve ret gerekçesi alanı olmadığı için iki taraf arasında geri bildirim kopuk — yeniden tasarım iki uçta birlikte yapılmalı.
- **`lib/segment-action-center.ts:75-91`** — segment eylem merkezinin VIP/Sadık/Yeni önerileri aynı bayi ucuna yönlendiriyor; onay kuyruğuna gelecek hacmi artırır, kitle önizlemesi ve tekilleştirme (Bulgu 3, 6) bu yüzden önemli.
- Sayfa **kaldırılmamalı**: onay kapısı, bayi kaynaklı push gönderiminin tek denetim noktası.

---

## Doğrulama (şüpheci inceleme)

Yöntem: salt okunur kod incelemesi (çalıştırma/DB erişimi yok). Okunan dosyalar: `app/admin/innovation/segment-proposals/page.tsx`, `app/api/admin/innovation/segment-proposals/route.ts`, `app/api/admin/innovation/segment-proposals/[id]/route.ts`, `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts`, `app/admin/innovation/page.tsx`, `app/dealer/innovation/page.tsx`, `app/api/admin/innovation/demo-package/route.ts`, `app/api/admin/innovation/demo-scenario/route.ts`, `prisma/schema.prisma:2732-2747`.

### 1. Koşulsuz PATCH ile SENT kampanya yeniden APPROVED yapılıp çift gönderim tetiklenebilir — **DOĞRULANDI**

- `app/api/admin/innovation/segment-proposals/[id]/route.ts:28-31` yalnızca varlık kontrolü için `status` okuyor; `:36-43` `update({ where: { id } })` mevcut durumdan bağımsız yazıyor. Şemada `status` düz `String` (`prisma/schema.prisma:2738`), DB düzeyinde geçiş kısıtı yok.
- Gönderim ucu yalnızca `status='APPROVED'` → `SENT` atomik claim yapıyor (`app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:54-62`); yani kayıt APPROVED'a geri dönerse claim tekrar başarılı olur ve `notification.createMany` + push (`:70-95`) ikinci kez çalışır.
- Bayi paneli `pr.status === 'APPROVED'` iken "Müşterilere gönder" düğmesini yeniden gösteriyor (`app/dealer/innovation/page.tsx:302-306`).
- Bayat liste kaynağı gerçek: liste ucu yalnızca PENDING döndürüyor (`route.ts` GET, `where: { status: 'PENDING' }`) ama iki istemci de (bu sayfa `page.tsx:25-36`, hub `app/admin/innovation/page.tsx:51-79`) sadece ilk yüklemede çekiyor, odakta/aralıkla yenilemiyor.
- **Yeniden üretim:** Admin A hub'ı açık bırakır (öneri X PENDING görünür). Admin B (veya A başka sekmede) X'i bu sayfadan onaylar; bayi "Müşterilere gönder"e basar → X `SENT`, ≤500 müşteriye bildirim+push gider. Admin A bayat hub'da X için "Onayla"ya basar → PATCH 200, X `APPROVED`, `decidedAt/decidedById` ezilir. Bayi panelini yenileyince düğme geri gelir; ikinci basışta aynı müşterilere aynı push tekrar gider. "Reddet" basılırsa gönderilmiş kampanya `REJECTED` olarak kaydedilir (geçmiş bozulur, gönderim analitiği ile çelişir).
- Not: tetiklenmesi için bayat sekme + insan eylemi gerekir, rastgele dış saldırgan vektörü değil; ancak müşteriye mükerrer push üreten bir veri bütünlüğü hatası olduğu için YÜKSEK seviyesi makul. Çözüm raporda önerilen `updateMany({ where: { id, status: 'PENDING' } })` + `count===0` → 409 desenidir.

### 2. Admin "SENT" işareti gönderim yapmadan kampanyayı kilitliyor ve bayiyi yanıltıyor — **DOĞRULANDI (önem: ORTA, "kalıcı" kısmı abartılı)**

- `page.tsx:98-100` PENDING satırda yalnızca `Send` (kâğıt uçak) ikonlu, etiketsiz, onaysız bir düğme; `decide(p.id, 'SENT')` çağırıyor. PATCH şeması `SENT`'i kabul ediyor (`[id]/route.ts:10`) ve hiçbir `notification`, push ya da `analyticsEvent` üretmiyor (`:36-45`; karşılaştırma için gerçek gönderim `send/route.ts:70-110` bunların hepsini yapar).
- Bayi tarafı `SENT` rozetini gerçek gönderimle aynı görselle gösteriyor (`app/dealer/innovation/page.tsx:299`), "Müşterilere gönder" düğmesi kayboluyor (`:302`); send ucu APPROVED dışını 400 ile reddediyor (`send/route.ts:42-45`).
- **Yeniden üretim:** Admin kuyruğunda kâğıt uçak ikonunu "gönder" sanıp basar → toast "Gönderildi olarak işaretlendi", kayıt listeden düşer. Bayi panelinde `SENT` görür; hiçbir müşteriye bir şey gitmemiştir ve bayinin bunu anlayacağı bir sinyal (sentCount, sentAt, bildirim) yoktur.
- Çürütmeye çalışılan kısım: düğmenin `title`'ı "Gönderildi olarak işaretle", yani kasıtlı bir manuel işaret özelliği olabilir (sistem dışı gönderim kaydı). Ayrıca "kalıcı kilit" yalnızca UI açısından doğru: PATCH koşulsuz olduğundan (Bulgu 1) admin API ile `APPROVED`'a geri çekebilir, fakat hiçbir ekranda SENT kaydı listelenmediği için pratikte UI'dan geri dönüş yolu yok. Gerçek kullanıcı etkisi (bayinin yanlış bilgilendirilmesi, kampanyanın sessizce ölmesi) mevcut; ancak müşteriye zarar veya veri sızıntısı yok, bu yüzden KRİTİK/YÜKSEK değil ORTA.

### 3. Demo seed taslakları gerçek bayi kuyruğuna işaretsiz düşüyor — **ÇÜRÜTÜLDÜ (iddia edilen önem ve "ayırt edilemiyor" kısmı için)**

- Doğru olan: her iki uç da gerçek bir `DEALER` için `PENDING` öneri yazıyor (`demo-package/route.ts:29-35,85-94`; `demo-scenario/route.ts:33-39,99-107`, ikincisi yalnızca `runSeed: true` iken). Modelde `source`/`isDemo` alanı yok (`schema.prisma:2732-2747`).
- Yanlış olan: "işaretsiz / admin kuyruğunda ayırt edilemiyor" iddiası. Başlıklar `Demo: İlk ziyaret kampanyası` ve `Senaryo: İlk ziyaret kampanyası`, mesajlar "Bu metin örnektir…" / "120 sn demo — segment taslağı metni." Bu sayfa başlığı (`page.tsx:81`) ve mesajın tamamını (`page.tsx:87`) gösteriyor; bayi paneli de başlığı gösteriyor (`dealer/innovation/page.tsx:296`).
- Müşteriye ulaşması için üç bilinçli insan adımı gerekir: (1) admin'in demo seed'i gerçek bir bayi id'siyle elle çalıştırması, (2) admin'in "Demo:" başlıklı taslağı onaylaması, (3) bayinin "Demo:" başlıklı kaydı için "Müşterilere gönder"e basması. Otomatik veya görünmez bir yol yok; somut bir "yanlışlıkla" senaryosu ancak iki ayrı kişinin açıkça etiketli içeriği onaylamasıyla kurulabiliyor. Bu bir veri hijyeni / ürün tasarımı konusu (raporun şema önerisindeki `source: DEALER|DEMO|ADMIN` alanı yerinde), KRİTİK/YÜKSEK güvenlik/hata bulgusu değil.
- Kapsam dışı ama daha gerçek bir yan gözlem (bu sayfaya ait değil, doğrulanmadı — ayrı denetlenmeli): aynı seed uçları `dealerFlashOffer` kaydını `isActive: true`, `validFrom: now`, %15 indirim ve bayinin `geohash5`'iyle anında canlı yazıyor (`demo-package/route.ts:53-66`, `demo-scenario/route.ts:67-80`); bu teklif onay kapısından geçmeden `app/api/customer/innovation/nearby/route.ts:35` ve `radar/route.ts:79` üzerinden gerçek müşterilere görünebilir. Demo hijyeni riski segment taslağından çok burada.

### Özet

| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | Koşulsuz PATCH → SENT→APPROVED → çift gönderim | Doğrulandı | YÜKSEK |
| 2 | Admin "SENT" işareti gönderimsiz kilit | Doğrulandı (kısmen abartılı) | ORTA |
| 3 | Demo seed taslağı işaretsiz kuyruğa düşüyor | Çürütüldü | DÜŞÜK (hijyen) |


---

## Uygulama (Dalga 2)

**Hedef:** `/admin/segments?tab=oneriler`, tek onay kuyruğu. `/admin/innovation/segment-proposals` ve `/admin/innovation` artık sorgu parametrelerini koruyarak kalıcı yönlendiriyor (`permanentRedirect`). Hub'daki kopya kuyruk sayfayla birlikte kalktı. BFF: `GET /api/admin/segments/proposals`, `GET|PATCH /api/admin/segments/proposals/[id]`, `POST /api/admin/segments/proposals/bulk` (hepsi `defineRoute`). Eski `app/api/admin/innovation/segment-proposals/**` uçları silindi. Sunucu mantığı `components/admin/a-segmentler/server/proposals.ts` içinde; jest testleri `__tests__/admin/a-segmentler/server.test.ts`.

| # | Yeni durum | Not |
|---|---|---|
| 1 | ÇALIŞIYOR | QDL `PageHeader` |
| 2 | ÇALIŞIYOR | Sekmede bekleyen sayı rozeti; sidebar girişi navigasyon ajanının |
| 3 | ÇALIŞIYOR | Durum sekmeleri + sayfalama |
| 4 | ÇALIŞIYOR | ADMIN + zod + rate limit |
| 5 | ÇALIŞIYOR | QueryState/DataTable iskeleti, `role=status` |
| 6 | ÇALIŞIYOR | Boş durum, hata ve süzgeç sonucu ayrı |
| 7 | ÇALIŞIYOR | Zarf çözülüyor; hata boş liste gibi dönmüyor; tekrar dene var |
| 8–9 | ÇALIŞIYOR | Başlık + işletme etiketi |
| 10 | ÇALIŞIYOR | Türkçe segment adı + çekmecede tanım |
| 11 | ÇALIŞIYOR | Bekleme yaşı; 48 saati aşan uyarı tonunda; "en eski bekleyen" KPI |
| 12 | ÇALIŞIYOR | Çekmecede tam mesaj (bildirim önizlemesi) |
| 13 | ÇALIŞIYOR | Koşullu geçiş (409), denetim izi, bayiye bildirim |
| 14 | ÇALIŞIYOR | Gerekçe zorunlu (5–500), bayiye iletilir, denetime yazılır |
| 15 | KALDIRILDI | "Gönderildi işaretle" düğmesi ve API'de `SENT` kabulü kaldırıldı; `SENT` yalnız gerçek gönderim ucunda yazılıyor |
| 16 | ÇALIŞIYOR | Karar başına kilit + spinner; çift tık mümkün değil |
| 17 | ÇALIŞIYOR | Karardan sonra liste/sayaç tazelenir, sıradaki öneri açılır |
| 18 | ÇALIŞIYOR | sonner + `announce`; Türkçe karakterli metin |
| 19 | ÇALIŞIYOR | Odakta + 60 sn'de bir tazeleme |
| 20 | ÇALIŞIYOR | Arama (başlık/işletme), segment, kaynak (gerçek/demo) |
| 21 | ÇALIŞIYOR | Bekleyende FIFO, diğerlerinde en yeni karar önce (sabit, anlamlı) |
| 22 | ÇALIŞIYOR | Bekleyen / Onaylı-gönderilmedi / Gönderildi / Reddedildi / Tümü, sayaçlı |
| 23 | ÇALIŞIYOR | Sunucu sayfalama + toplam |
| 24 | ÇALIŞIYOR | Gönderimle aynı hesap (segment çözümü + rıza kapısı): aday, ulaşılabilir, kapatmış, 500 tavan uyarısı, boş kitle uyarısı; 10 dk önbellek |
| 25 | ÇALIŞIYOR | Bildirim kartı önizlemesi |
| 26 | AÇIK | Mesajı düzenleyerek onaylama yok (bayinin metnini sessizce değiştirmemek için bilinçli); ret + gerekçe ile düzelttirme akışı var |
| 27 | ÇALIŞIYOR | Gerekçe `AuditLog.newData.note`'ta tutuluyor (şemasız), listede ve geçmişte gösteriliyor |
| 28 | ÇALIŞIYOR | `Notification` (onay/ret, `kind: innovation_segment_decision`, `/dealer/innovation` bağlantısı) |
| 29 | ÇALIŞIYOR | `segment_proposal.approve/reject` denetim satırı |
| 30 | ÇALIŞIYOR | Çoklu seçim + toplu onay/ret (≤50, satır bazlı sonuç) |
| 31 | ÇALIŞIYOR | Çekmecede J/K/A/R |
| 32 | ÇALIŞIYOR | `User.isDemo` rozeti + kaynak süzgeci; demo öneri onaylanamaz |
| 33 | ÇALIŞIYOR | Modül kapalıysa uyarı bandı ve Modüller sekmesine bağlantı |
| 34 | ÇALIŞIYOR | Sunucu sayfası `metadata` |
| 35 | ÇALIŞIYOR | Mobil: tablo karta dönüşür; çekmecede karar alanı altta yapışık (safe-area) |

**Kapanan bulgular:** 1 (koşullu `updateMany` + 409, test), 2 (SENT kısayolu kaldırıldı), 3 (kitle + önizleme + bayi geçmişi + yorgunluk uyarısı), 4 (gerekçe, bildirim, denetim; `decidedBy` adı gösteriliyor), 5 (demo rozeti/süzgeci/onay engeli), 7, 8, 9, 10, 11. **10/11 kapandı.**

**Kalanlar:** Bulgu 6, yani bayi POST'unda `message.max`, tekilleştirme ve hız sınırı; bayi ucunun (`app/api/dealer/innovation/segment-proposals`) sahibinde. Admin tarafı uzun mesajı kırpmadan güvenle gösteriyor. ŞEMA İSTEĞİ: `SegmentCampaignProposal.decisionNote String?`, `decidedBy User? @relation`, `source`, `sentAt`/`sentCount`, `status` enum ve `@@index([status, createdAt])`. Bugün not denetim izinden, gönderim sayısı analitik olayından okunuyor.
