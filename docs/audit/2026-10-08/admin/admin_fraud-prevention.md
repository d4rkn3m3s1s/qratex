# /admin/fraud-prevention

**Amaç:** Platform operatörüne sahtekarlık/spam sinyallerini (şüpheli aktivite kayıtları, `flagged` ve `shadow_ban` kullanıcı sayıları) göstermek ve bu sinyaller üzerinde karar verdirmek.

**Genel puan:** 2.8 / 10

**Karar:** **Yeniden inşa et.** Ardından `/admin/trust-command` ile tek bir "Güven ve Güvenlik" alanında birleştir. Sayfa, var olmayan bir tespit motorunu varmış gibi anlatıyor. Gösterdiği tek gerçek veri kaynağını (brute-force kilitleri) da yanlış etiketliyor. Üzerindeki iki buton ise canlı müşteri hesaplarının fraud durumunu değiştiriyor. Mevcut kodun korunacak bir iş akışı yok. Yalnız sunucu bileşeni iskeleti ve paralel sorgu deseni yeniden kullanılabilir.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Salt-okunur bir liste ve üç sayaçtan ibaret. Kayıtları besleyen tespit motoru ölü kod, gölge ban hiçbir yerde uygulanmıyor, çözme/aksiyon/filtre yok. |
| UX | 3/10 | Operatör listede gördüğü bir kayıt için hiçbir şey yapamıyor. Rozet, olayın değil kullanıcının o anki durumunu gösteriyor. Üretim ekranının en görünür aksiyonu "demo veri üret". |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ve shadcn kartlarıyla tutarlı ve temiz. Ancak önem derecesi yalnız renkle anlatılıyor ve amber/emerald rakamlar açık temada kontrast eşiğinin altında. |
| Mimari | 2/10 | Önem derecesi büyük/küçük harf tutarsız ve skor ölçekleri çelişkili (0–1'e karşı +50). Sahtekarlık sinyalleri altı farklı yere dağılmış. Demo tohumlama canlı veriyle aynı tabloya ve aynı kullanıcı alanlarına yazıyor. |
| Performans | 6/10 | Üç sorgu paralel ve indeksli. Yine de sayfalamasız 50 kayıt ve `include` ile iki ilişki her istekte çekiliyor. Demo tohumlama N+1 döngüsüyle çalışıyor (~15 ardışık sorgu). |
| Erişilebilirlik + Mobil | 5/10 | Mobilde kırılmadan diziliyor ve hero azaltılmış hareketi destekliyor. Önem bilgisi yalnız renkle veriliyor. Yıkıcı buton onaysız. Ham e-postalar CSS ile büyük harfe çevriliyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı ADMIN rol kontrolü (+ proxy gizli kapı) | ÇALIŞIYOR | `app/admin/fraud-prevention/page.tsx:12-16`, `proxy.ts:51,79-84` | Giriş yapmış ama admin olmayan kullanıcı `/auth/signin`'e atılıyor. 403 ekranı daha doğru olurdu, sorun küçük. |
| 2 | Hero başlık ve açıklama ("AI tabanlı analiz motoru… QR tarama hızları ve konum anormallikleri") | SAHTE | `page.tsx:34-38` | AI yok, konum analizi yok. Hız motoru (`lib/fraud/engine.ts:18`) ve `checkSuspiciousActivity` (`lib/security.ts:12`) hiçbir yerden çağrılmıyor. |
| 3 | Hero: "Demo şüpheli aktivite üret" | KISMİ | `page.tsx:41-45` → `app/api/admin/bootstrap/route.ts:281-347` | Kayıt üretiyor. Ama en yeni 30 **gerçek** müşterinin 3'ünü `fraudStatus='flagged'` yapıyor (`route.ts:329-334`). Üretimde koruma yok, idempotent değil. |
| 4 | Hero: "Demo veriyi sil" | KISMİ | `page.tsx:46-51` → `route.ts:350-383` | Onay istemiyor. Skoru 0.70–0.72 arasında olan **her** `flagged` kullanıcıyı `clean` yapıyor (`route.ts:361-370`). Gerçek bir bayrak da silinebilir. |
| 5 | KPI: Gölge banlı kullanıcı sayısı | KISMİ | `page.tsx:28,57-66` | Sorgu doğru, ama `shadow_ban` yazan tek kod ölü motor (`lib/fraud/engine.ts:53`). Bu yüzden pratikte hep 0. |
| 6 | KPI alt metni: "İşlemleri kaydedilmiyor" | SAHTE | `page.tsx:64` | `shouldApplyReward` (`lib/fraud/engine.ts:95`) hiçbir yerde çağrılmıyor. Gölge banlı kullanıcı puan kazanmaya devam ediyor. |
| 7 | KPI: Şüpheli (flagged) sayısı | KISMİ | `page.tsx:29,68-77` | `flagged` değerini yalnız bootstrap demo yazıyor (`route.ts:332`). Bu yüzden sayı demo verisini ölçüyor. |
| 8 | KPI: "Sistem Durumu: Aktif / Hız limitleri devrede" | SAHTE | `page.tsx:79-88` | Sabit metin. Hiçbir sağlık kontrolüne bağlı değil. |
| 9 | Son 50 şüpheli aktivite listesi | KISMİ | `page.tsx:20-27,117-137` | Sabit `take: 50`. Çözülmüş ve açık kayıtlar karışık, `isResolved` gösterilmiyor. |
| 10 | Önem derecesi ikon rengi | BOZUK | `page.tsx:121` | Yalnız küçük harf `'high'` kontrol ediliyor. Gerçek üreticiler `'HIGH'`/`'CRITICAL'` yazıyor (`lib/rate-limit.ts:149`, `lib/security.ts:76`, `bootstrap/route.ts:309`), bu yüzden HIGH kayıtlar amber görünüyor. |
| 11 | Kullanıcı adı ve e-posta | KISMİ | `page.tsx:125` | `userId` boş olan kayıtlar (BRUTE_FORCE, `lib/rate-limit.ts:148-153`) "Gizli Üye (Bilinmiyor)" olarak görünüyor. E-posta `uppercase` sınıfıyla bozuluyor. |
| 12 | Açıklama + bayi adı | KISMİ | `page.tsx:126` | Bayi olmayan olaylarda yanıltıcı "Bilinmeyen Bayi" çıkıyor. |
| 13 | Durum rozeti (GÖLGE BAN / ŞÜPHELİ) | BOZUK | `page.tsx:130-132` | Olayın değil kullanıcının **şu anki** durumu. `clean` kullanıcı ve kullanıcısız kayıt da "ŞÜPHELİ" görünüyor. |
| 14 | Zaman damgası | KISMİ | `page.tsx:133` | `toLocaleString('tr-TR')` sunucuda saat dilimi verilmeden çalışıyor. Vercel'de UTC gösterir (doğrulanmadı). Göreli zaman yok. |
| 15 | Boş durum + demo butonları | ÇALIŞIYOR | `page.tsx:97-115` | Hero'daki butonların kopyası. "Sistem koruma altında" iddiası (#2) ile aynı sorunu taşıyor. |
| 16 | Yükleniyor durumu | ÇALIŞIYOR | `app/admin/loading.tsx` | Genel admin iskeleti, sayfaya özel değil. |
| 17 | Hata durumu | KISMİ | `app/admin/error.tsx` | Sayfa düzeyinde try/catch yok. Tek bir sorgu hatası bütün sayfayı genel hata ekranına düşürüyor. |
| 18 | Paralel veri çekme | ÇALIŞIYOR | `page.tsx:18-30` | `Promise.all`. |
| 19 | Olay türü (`type`) gösterimi | EKSİK | `prisma/schema.prisma:1924` | RAPID_SCAN / BRUTE_FORCE / fraud_velocity ayrımı ekranda yok. |
| 20 | Kaydı çözme (resolve) | EKSİK | `app/api/security/suspicious/route.ts:117-148` | PATCH ucu var, kullanan bir arayüz yok. |
| 21 | Filtre (önem / tür / çözüldü / tarih) | EKSİK | `app/api/security/suspicious/route.ts:31-40` | GET ucu severity/resolved filtrelerini destekliyor ama kullanılmıyor. |
| 22 | Arama (kullanıcı / e-posta / IP) | EKSİK | — | |
| 23 | Sayfalama | EKSİK | `page.tsx:22` | Sayfalamalı GET ucu var (`route.ts:34-36`), sayfa onu kullanmıyor. |
| 24 | Kullanıcı aksiyonları (işaretle / temizle / gölge ban / kaldır) | EKSİK | Grep: `fraudStatus` yalnız `bootstrap/route.ts` ve ölü `lib/fraud/engine.ts` içinde yazılıyor | Admin bir kullanıcının fraud durumunu hiçbir ekrandan değiştiremiyor. |
| 25 | Kullanıcı/bayi profiline bağlantı | EKSİK | `page.tsx:125-126` | |
| 26 | Olay detayı (metadata, IP, user agent, cardId, fraudScore) | EKSİK | `page.tsx:24` | `fraudScore` seçiliyor ama kullanılmıyor (ölü veri). |
| 27 | Kural/eşik yapılandırması | EKSİK | `lib/security.ts:4-9`, `lib/fraud/engine.ts:52-60`, `lib/points-velocity.ts:8` | Eşikler kodda sabit ve birbirleriyle çelişiyor. |
| 28 | Trend/zaman grafiği | EKSİK | — | |
| 29 | Dışa aktarım (CSV) | EKSİK | — | |
| 30 | Elle yenileme / canlı güncelleme | EKSİK | — | Tek yenileme yolu bootstrap sonrası `window.location.reload()` (`bootstrap-action-button.tsx:62-64`). |
| 31 | Derin bağlantı (trust-timeline'dan gelen tıklama) | KISMİ | `app/api/admin/trust-timeline/route.ts:151` | Kayda özel `id`/anchor yok; kullanıcı listenin başına düşüyor. Açık kayıt 50'den eskiyse listede hiç görünmüyor. |
| 32 | Modül kontrolü (`fraud_prevention`, severity: critical) | KISMİ | `lib/module-controls.ts:63`, `components/dashboard/sidebar.tsx:451-455` | Kapatılınca menüden gizleniyor ama sayfa erişimi engellemiyor. |
| 33 | Demo aksiyonlarının denetim kaydı | EKSİK | `app/api/admin/bootstrap/route.ts` (auditLog çağrısı yok) | Canlı kullanıcı bayraklarını değiştiren işlem iz bırakmıyor. |
| 34 | i18n / dil tutarlılığı | KISMİ | `page.tsx:59,71,85` | Menü etiketi i18n'den geliyor (`messages/tr.json:2481`), sayfa metni sabit TR. "Gölge Banlı (Shadow Ban)", "Şüpheli (Flagged)" gibi TR/EN karışık etiketler var. |
| 35 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:56,119` | `md:grid-cols-3`, satırlar mobilde `flex-col`. |
| 36 | Azaltılmış hareket | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:73,143,35-43` | Hero `useReducedMotion` ile animasyonları kapatıyor. Sayfada başka hareket yok. |

**Toplam:** 36 özellik. 6 ÇALIŞIYOR, 12 KISMİ, 2 BOZUK, 3 SAHTE, 13 EKSİK.

---

## Bulgular

### B1. Tespit motoru ölü, gölge ban uygulanmıyor: sayfa var olmayan bir kalkanı anlatıyor
- **Önem:** Kritik · **Kategori:** Güvenlik / ürün dürüstlüğü
- **Kanıt:**
  - `lib/fraud/engine.ts:18` (`checkFraudulentActivity`) ve `:95` (`shouldApplyReward`) için kod tabanında çağıran yok.
  - `lib/security.ts:12` (`checkSuspiciousActivity`) için de çağıran yok.
  - `fraudStatus`'a yazan tek canlı kod `app/api/admin/bootstrap/route.ts:332,369`.
  - Sayfanın iddiaları: `page.tsx:37` ("AI tabanlı analiz motoru"), `:64` ("İşlemleri kaydedilmiyor"), `:85-86` ("Aktif / Hız limitleri devrede"), `:101` ("Sistem koruma altında").
- **Sorun:** Operatör ekonomiyi koruyan bir kalkan olduğunu düşünüyor, ama:
  - Hız (velocity) kontrolü hiçbir tarama/tüketim/puan yolunda çalışmıyor.
  - `shadow_ban` hiçbir yerde yazılmıyor. Yazılsa bile puan kredisi bunu kontrol etmiyor.
  - Gerçek üretim verisi neredeyse yalnız brute-force kilit olaylarından ibaret (`lib/rate-limit.ts:144-155`).
  - "Sistem Durumu: Aktif" sabit bir yalan.

  Puan ekonomisinin sahtekarlık görünürlüğü (bkz. `points_credited` değişmezleri) bu ekrandan sağlanamaz.
- **Öneri:**
  1. Hemen: sabit "Aktif" kartını ve "AI tabanlı / konum" iddialarını kaldır. Gerçek durumu göster: "Tespit kuralları: 0 aktif · Son sinyal: 3 gün önce".
  2. Bir `lib/fraud/` servis katmanı yaz:
     - `evaluate(userId, event)` ile kural tabanlı bir değerlendirme yap. Tarama hızı, `points_credited` 24 saat deltası (`lib/points-velocity.ts`), cihaz/IP çakışması ve oyun ödül tavanı bu değerlendirmeye girsin.
     - Kurallar `SuspiciousActivity` yazsın.
     - Puan veren tek kapıda (economy grant/ledger) `fraudStatus` kontrol edilsin: `shadow_ban` → kredi `void` (kullanıcıya başarılı görünsün), `flagged` → `pending`.
  3. Bu kapı devreye girmeden sayfada "Gölge ban" kavramı gösterilmemeli.
- **Efor:** XL

### B2. Demo butonları canlı üretim müşterilerinin fraud durumunu değiştiriyor, "sil" gerçek bayrakları temizleyebiliyor
- **Önem:** Kritik · **Kategori:** Veri bütünlüğü
- **Kanıt:**
  - Tohumlama, en yeni 30 gerçek `CUSTOMER` kaydını seçiyor (`bootstrap/route.ts:289-294`).
  - HIGH denk gelen 3 kullanıcıya koşulsuz `fraudStatus:'flagged', fraudScore:0.71` yazıyor (`:329-334`). Kullanıcı daha önce `shadow_ban` olsa bile durumu `flagged`'e iniyor.
  - Silme, takipçi listesine ek olarak `fraudScore` 0.70–0.72 arasında olan **her** `flagged` kullanıcıyı `clean`/0 yapıyor (`:361-370`).
  - Sayfa butonları onaysız (`page.tsx:41-51,103-113`, `bootstrap-action-button.tsx:73`), üretim ortamı koruması yok, işlem audit log'a yazılmıyor.
  - Aynı aksiyonlar `/admin/settings` toplu düğmesinde paralel olarak da tetiklenebiliyor (`app/admin/settings/settings-client.tsx:622-640`). Bu da `admin_bootstrap_tracker_v1` ayarında oku-değiştir-yaz yarışı doğuruyor (`bootstrap/route.ts:39-71`).
- **Sorun:** Bir operatör "demo veri" tıkladığında gerçek müşteriler "şüpheli" olarak işaretleniyor. Bu, fraud entegrasyonu yapıldığında puanlarının askıya alınması demek. "Sil" ise demo dışı meşru bir bayrağı sessizce kaldırabilir. DATABASE_URL canlı Neon'u gösterdiği için lokal denemeler de üretimi etkiliyor.
- **Öneri:**
  - Tohumlama gerçek kullanıcıya hiç dokunmamalı. Ya ayrık demo kullanıcıları oluştursun (`isDemo` alanı / `@demo.qratex` e-postaları), ya da yalnız `SuspiciousActivity` satırı üretsin ve kullanıcı alanlarını değiştirmesin.
  - Önceki durumu `metadata.prevFraudStatus` içinde saklasın. Geri alma, sezgisel skor aralığıyla değil bu kayıtla yapılsın.
  - Bootstrap ucunda `NODE_ENV==='production'` ise açık bir `ALLOW_DEMO_SEED` bayrağı istensin.
  - Yıkıcı işlem için onay diyaloğu (AlertDialog) olsun ve işlem `AuditLog`'a yazılsın.
  - Demo aksiyonları fraud sayfasından kaldırılıp yalnız `/admin/settings > Hızlı admin başlangıcı`nda tutulsun.
- **Efor:** M

### B3. Önem derecesi büyük/küçük harf uyumsuz: HIGH ve CRITICAL olaylar "orta" renginde görünüyor
- **Önem:** Yüksek · **Kategori:** Hata / veri modeli
- **Kanıt:**
  - Sayfa yalnız küçük harf `'high'` kontrol ediyor (`page.tsx:121`).
  - Şema sözlüğü büyük harf: `LOW, MEDIUM, HIGH, CRITICAL` (`prisma/schema.prisma:1925`).
  - `lib/rate-limit.ts:149` (BRUTE_FORCE) `'HIGH'` yazıyor, `bootstrap/route.ts:309` `'HIGH'|'MEDIUM'|'LOW'` yazıyor.
  - Ölü motor ise küçük harf `'high'|'medium'` yazıyor (`lib/fraud/engine.ts:74`).
  - `/api/security/suspicious` GET filtresi tam eşleşme yapıyor (`route.ts:39`), aynı sorunu yaşar.
- **Sorun:** Gerçekte üretilen tek yüksek önemli olay (hesap kilitlenmesi) düşük önemliymiş gibi görünüyor. CRITICAL için hiç görsel yok. Önem derecesine göre filtre ve sıralama da iki sözlük yüzünden güvenilmez.
- **Öneri:**
  - `severity`'yi Prisma `enum FraudSeverity { LOW MEDIUM HIGH CRITICAL }` yap.
  - Göçte `UPDATE … SET severity = upper(severity)` çalıştır (canlı Neon olduğundan önce yedek al).
  - `type` için de enum veya merkezi sabitler kullan (`RAPID_SCAN`, `BRUTE_FORCE`, `POINTS_VELOCITY`…).
  - UI'da tek bir `SeverityBadge` bileşeni olsun: ikon + metin + renk, dört seviye.
- **Efor:** M

### B4. Durum rozeti olayı değil kullanıcının güncel durumunu gösteriyor; kullanıcısız kayıtlar yanlış etiketleniyor
- **Önem:** Yüksek · **Kategori:** Yanlış veri / UX
- **Kanıt:**
  - `page.tsx:130-131` → `log.user?.fraudStatus === 'shadow_ban' ? 'GÖLGE BAN' : 'ŞÜPHELİ'`. `clean` kullanıcılar ve `user=null` kayıtları da "ŞÜPHELİ" alıyor.
  - BRUTE_FORCE kayıtlarında `userId` hiç yok (`lib/rate-limit.ts:148-153`). Kimlik yalnız `metadata.identifier` ve açıklamada bulunuyor. Sayfa bunları "Gizli Üye (Bilinmiyor)" ve "Bilinmeyen Bayi" olarak gösteriyor (`page.tsx:125-126`).
  - `isResolved` hiç okunmuyor.
- **Sorun:** Operatör bir olayın açık mı çözülmüş mü olduğunu göremiyor. Brute-force saldırısının hedef hesabını da göremiyor; tam bu alan için en önemli bilgi bu.
- **Öneri:**
  - Satırda üç ayrı alan göster: **olay durumu** (Açık / Çözüldü — `isResolved`, `resolvedBy`, `resolution`), **olay önemi**, **öznenin güncel fraud durumu** (ayrı küçük chip).
  - Özne çözümü: `userId` → kullanıcı, yoksa `metadata.identifier` → "Hesap: x@y.com (giriş denemesi)", yoksa `cardId` → kart, yoksa `ipAddress`.
  - `reportSuspiciousActivity` brute-force olayında e-postadan `userId` çözüp kaydetsin.
- **Efor:** S–M

### B5. Kayıt üzerinde hiçbir aksiyon yok; çözme API'si var ama kullanılmıyor
- **Önem:** Yüksek · **Kategori:** İşlevsellik / iş akışı
- **Kanıt:**
  - `app/api/security/suspicious/route.ts:117-148` (PATCH resolve) için hiçbir arayüz çağırmıyor (grep: yalnız doküman eşleşmesi var).
  - Kullanıcı `fraudStatus`'ını değiştiren admin ucu da yok (grep: yalnız bootstrap).
  - `/admin/trust-command` "Açık şüpheli aktivite" sayacını bu sayfaya yönlendiriyor (`app/admin/trust-command/page.tsx:152`), ama burada "açık" kavramı yok.
- **Sorun:** Sayfa bir "kuyruk" gibi konumlanıyor ama triage yapılamıyor. Açık kayıt sayısı (`agent-council` skorunu da etkiliyor, `lib/agent-council.ts:61`) yalnız artıyor, hiç azalamıyor.
- **Öneri:** Bir triage akışı kur.
  - Satır seçilince sağdan bir **detay çekmecesi** (Sheet) açılsın: olay metadata'sı, IP/UA, ilgili kart, kullanıcının son 30 günlük puan/tarama zaman çizelgesi, aynı IP/cihazdaki diğer hesaplar.
  - Aksiyonlar: "Çöz (yanlış alarm / doğrulandı / aksiyon alındı)", "Kullanıcıyı işaretle", "Gölge ban", "Banı kaldır", "Puanı geri al (ledger ters kaydı)".
  - Toplu seçim ile toplu çözme yapılabilsin.
  - Her aksiyon `AuditLog` + `SuspiciousActivity.resolution` yazsın, `resolvedBy` admin adıyla gösterilsin.
  - API: `PATCH /api/admin/fraud/activities/:id` ve `POST /api/admin/fraud/users/:id/status`. `requireAuth(['ADMIN'])` kullanılsın; ham `getServerSession` replay korumasını atlıyor, bkz. `docs/audit/2026-10-08/sistem/guvenlik-admin-api.md:228`.
  - Girdi Zod ile doğrulansın. PATCH şu an `id`/`resolution`'ı doğrulamadan Prisma'ya veriyor (`route.ts:127-138`): eksik `id` 500 döner.
- **Efor:** L

### B6. Filtre, arama, sayfalama yok; sabit son 50 kayıt
- **Önem:** Orta · **Kategori:** UX / ölçeklenebilirlik
- **Kanıt:** `page.tsx:20-22` (`take: 50`, filtre yok). Sayfalamalı ve filtreli GET ucu hazır (`app/api/security/suspicious/route.ts:31-60`).
- **Sorun:** Her başarısız giriş kilidi bir kayıt ürettiği için liste birkaç günde doluyor. Daha eski açık kayıtlar görünmez hale geliyor. Trust-timeline'dan gelen derin bağlantı (`trust-timeline/route.ts:151`) ilgili kayda ulaşamıyor.
- **Öneri:**
  - URL arama parametrelerine bağlı filtre çubuğu ekle: `?status=open&severity=HIGH&type=BRUTE_FORCE&q=…&from=…`. Varsayılan "Açık" olsun.
  - Cursor tabanlı sayfalama kullan (`createdAt,id`).
  - Derin bağlantı için `?id=<activityId>` gelince detay çekmecesi açılsın.
  - Sunucu bileşeni filtreyi `searchParams`'tan okusun; istemci tarafında yalnız filtre çubuğu olsun. Böylece SSR korunur ve bağlantı paylaşılabilir.
- **Efor:** M

### B7. Sahtekarlık sinyalleri altı ayrı yere dağılmış; bu sayfa yalnız birini gösteriyor
- **Önem:** Orta · **Kategori:** Mimari / bilgi mimarisi
- **Kanıt:**
  - `SuspiciousActivity` (bu sayfa).
  - `SecurityAlert` (`lib/security.ts:100`, trust-command'da yalnız sayı olarak).
  - `points_credited` velocity (`lib/points-velocity.ts:8`, yalnız leaderboard'da `needsReview`).
  - Feedback `trustFlagged`/`fraudScore` (`lib/trust-score.ts:149`, `prisma/schema.prisma:822`).
  - Oyun ödül tavanları (`app/api/customer/games/[game]/complete/route.ts:160`).
  - Bayi fraud skoru (`app/api/admin/dealers-health/route.ts:93-94`).
  - Ayrıca `fraudScore` ölçeği çelişkili: bootstrap 0–1 (`0.71`), motor `+50/+20` (`lib/fraud/engine.ts:54,58`), feedback yorumu "0-1" (`schema.prisma:822`).
- **Sorun:** Operatörün "bu kullanıcı riskli mi?" sorusunun tek bir cevabı yok. Skorlar birbiriyle karşılaştırılamıyor.
- **Öneri:**
  - Tek bir **risk sinyali** sözleşmesi tanımla: `SuspiciousActivity`'yi tüm kaynakların yazdığı olay deposu yap (`source` alanı: auth / economy / feedback / game / dealer).
  - `User.fraudScore`'u 0–100 ölçeğinde, son 30 günün ağırlıklı sinyallerinden hesaplanan türetilmiş bir alan yap (cron ya da yazım anında).
  - Sayfa bu birleşik akışı göstersin.
- **Efor:** L

### B8. Saat dilimi ve biçim: sunucuda saat dilimi verilmeden `toLocaleString`
- **Önem:** Orta · **Kategori:** Yanlış veri
- **Kanıt:** `page.tsx:133` `new Date(log.createdAt).toLocaleString('tr-TR')` bir sunucu bileşeninde çalışıyor. Projede `lib/timezone.ts` yardımcıları var (`formatDateTimeLocal`, `:39`) ama kullanılmıyor. Vercel fonksiyonlarının varsayılan TZ'si UTC (bu projede `TZ` ayarı bulunamadı; çalışma ortamında doğrulanmadı).
- **Sorun:** Olay saatleri İstanbul saatinden 3 saat geride görünür. Güvenlik incelemesinde log korelasyonunu bozar.
- **Öneri:** `timeZone: 'Europe/Istanbul'` ile ortak bir biçimleyici kullan. Göreli zaman ("12 dk önce") göster, mutlak zaman `title` ile tooltip'te `<time dateTime>` olarak dursun.
- **Efor:** S

### B9. Erişilebilirlik: önem yalnız renkle anlatılıyor, kontrast düşük, yıkıcı aksiyon onaysız
- **Önem:** Orta · **Kategori:** Erişilebilirlik
- **Kanıt:**
  - `page.tsx:121-123`: önem yalnız ikon renk tonuyla anlatılıyor, metin yok.
  - `page.tsx:74,85`: `text-amber-500` ve `text-emerald-500` büyük rakamlar beyaz zeminde yaklaşık 2.1:1 ve 2.5:1. Büyük metin için 3:1 eşiğinin altında.
  - `page.tsx:130`: `text-red-500` xs rozet metni ~3.8:1, küçük metin için 4.5:1 eşiğinin altında.
  - `page.tsx:125`: `uppercase` e-postayı ekran okuyucuda ve kopyalamada bozuyor.
  - `page.tsx:46-51`: silme onay olmadan çalışıyor.
- **Öneri:**
  - `SeverityBadge` metin içersin ("Yüksek").
  - Renk tonları açık temada `-600/-700`, koyu temada `-400` olsun.
  - E-posta `font-mono text-xs normal-case` gösterilsin.
  - Liste semantik bir `<table>` olsun (`<caption>`, `scope="col"`) ve satır klavyeyle açılabilsin (Enter → çekmece).
  - Yıkıcı aksiyonlar `AlertDialog` ile onaylansın.
- **Efor:** S

### B10. Hata dayanıklılığı ve ölü veri
- **Önem:** Düşük · **Kategori:** Mimari
- **Kanıt:**
  - `page.tsx:19-30`: try/catch yok; bir sorgu hatası tüm sayfayı `app/admin/error.tsx`'e düşürüyor.
  - `page.tsx:24`: `fraudScore` seçiliyor ama kullanılmıyor.
  - Modül kapatılınca sayfa erişilebilir kalıyor (`lib/module-controls.ts:63`; sayfada kontrol yok).
  - Tohumlama 12 ardışık `create` + `update` ile N+1 (`bootstrap/route.ts:307-336`) ve transaction yok: yarıda kalırsa izleyici güncellenmiyor, yetim demo satırları kalabiliyor (ancak `metadata.source` ile yine silinebilir).
- **Öneri:**
  - KPI'ları ve listeyi ayrı `Suspense` sınırlarına böl ve her birine yerel hata kartı ver.
  - Kullanılmayan alanı kaldır ya da detayda göster.
  - Tohumlamayı `createMany` + tek `updateMany` ile `$transaction`'a al.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Radar, Sift, PostHog, Retool iç araçları)

1. **Triage kuyruğu ve inceleme iş akışı (Stripe Radar "Review" kuyruğu):**
   - Açık / İncelemede / Çözüldü durumları.
   - Atanan kişi.
   - Çözüm nedeni (yanlış alarm / doğrulanmış fraud / politika ihlali).
   - Toplu işlem.
   - Klavye kısayolları (J/K gezinme, E çöz).
2. **Kural motoru arayüzü (Radar Rules):**
   - Kuralları listeleme, eşik düzenleme, kuralı açıp kapama.
   - "Geriye dönük test": bu kural son 30 günde kaç olay üretirdi?
   - Kural başına tetiklenme ve yanlış alarm oranı.
3. **Varlık (entity) görünümü:**
   - Kullanıcı / cihaz / IP / kart başına risk profili.
   - Bağlantılı hesaplar (aynı IP/cihaz/referral zinciri).
   - Puan defteri zaman çizelgesi.
   - "Puanı geri al" (ledger ters kaydı) aksiyonu.
4. **Trend ve dağılım panelleri (PostHog benzeri):**
   - Tür ve önem kırılımıyla günlük olay grafiği.
   - Engellenen / askıya alınan puan miktarı ("kurtarılan ekonomi").
   - En çok olay üreten bayiler.
5. **Uyarı ve bildirim yönlendirmesi:** HIGH/CRITICAL için e-posta/push/Slack webhook, eşik ve sessiz saat ayarı. Şu an yalnız tüm adminlere uygulama içi bildirim var (`lib/security.ts:112-125`).
6. **Dışa aktarım ve denetim:** filtrelenmiş CSV dışa aktarımı ve her admin aksiyonunun değiştirilemez denetim kaydı (KVKK/5651 paneliyle uyumlu).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya beş saniyede cevap alır:
- "Şu an saldırı / suistimal var mı?"
- "Benim karar vermem gereken kaç açık olay var?"
- "Kalkan gerçekten çalışıyor mu?" (kural sağlığı)

Ardından tek tıkla bir olayı açar, kanıtı görür, aksiyonu alır ve kuyruktan çıkarır.

**Yerleşim (masaüstü):**
1. **Kompakt başlık:** Pazarlama dilindeki hero kalkar.
   - Başlık "Sahtekarlık ve kötüye kullanım".
   - Sağda "Kurallar" ve "Dışa aktar" düğmeleri.
   - Gerçek veriden gelen bir "Kalkan durumu" çipi: "4 kural aktif · son değerlendirme 2 dk önce". Kural motoru sessizse turuncu.
2. **KPI şeridi (4 kart, tıklanabilir filtreler):** Açık olaylar (HIGH+ ayrı), son 24 saat olay, işaretli / gölge banlı hesaplar, son 7 gün askıya alınan puan. Her kartta 14 günlük küçük bir sparkline.
3. **Sol: kuyruk tablosu.**
   - Sütunlar: önem rozeti, tür, özne (kullanıcı / hesap / IP), bayi, olay durumu, zaman.
   - Üstte URL'ye bağlı filtre çubuğu ve arama.
   - Varsayılan görünüm "Açık · Yüksek önce".
   - Cursor ile sayfalama.
4. **Sağ: detay çekmecesi** (mobilde tam ekran sheet).
   - Olay metadata'sı, öznenin risk profili ve bağlı hesaplar.
   - Son 30 günün puan/tarama zaman çizelgesi.
   - Altta sabit bir aksiyon çubuğu: Çöz ▾ / İşaretle / Gölge ban / Puanı geri al.
5. **"Kurallar" sekmesi:** kural kartları (eşik, pencere, aksiyon, tetiklenme sayısı, yanlış alarm oranı), aç/kapa ve eşik düzenleme.
6. Demo tohumlama bu sayfadan tamamen çıkar.

**Motion / 3D:** 3D yok; bu bir operasyon aracı ve 3D burada gürültüdür. Ölçülü hareket yeterli:
- Yeni olay geldiğinde satır `m.tr` ile 150 ms opacity/translateY girişi yapar.
- Çözülen satır yükseklik çöküşüyle kuyruktan çıkar (`AnimatePresence`, `layout`).
- Çekmece shadcn Sheet'in kendi geçişini kullanır.
- KPI rakamları değişince kısa bir sayı geçişi yapar.
- Tüm hareketler `useReducedMotion` ile kapanır.
- HIGH/CRITICAL için yanıp sönen efekt kullanılmaz, kalıcı ikon + metin yeterli.

**Veri / API değişiklikleri:**
- **Şema:**
  - `severity` → `enum FraudSeverity`, `type` → merkezi sabit/enum.
  - `SuspiciousActivity`'ye `source`, `status` (OPEN / IN_REVIEW / RESOLVED), `assigneeId`, `resolutionCode` alanları.
  - İndeksler: `@@index([isResolved, severity, createdAt])` ve `@@index([userId, createdAt])`.
  - `User.fraudScore` için 0–100 ölçeği netleştirilsin.
  - Göç canlı Neon'da çalışacağı için önce yedek alınsın (`scripts/` yedek betikleri mevcut).
- **Servis:** Puan veren tek kapıda `lib/fraud/evaluate.ts` + `assertRewardAllowed`. Mevcut `lib/fraud/engine.ts`, `lib/security.ts:12-66` ve `lib/points-velocity.ts` bu serviste birleşsin.
- **API** (hepsi `requireAuth(['ADMIN'])` + Zod + `AuditLog`):
  - `GET /api/admin/fraud/activities` (filtre + cursor).
  - `PATCH /api/admin/fraud/activities/:id`.
  - `POST /api/admin/fraud/activities/bulk-resolve`.
  - `POST /api/admin/fraud/users/:id/status`.
  - `GET /api/admin/fraud/rules`, `PUT /api/admin/fraud/rules/:key`.
  - `GET /api/admin/fraud/stats?range=14d` (Upstash cache 60 sn).
- **Mevcut uç:** `/api/security/suspicious` GET/PATCH admin uçlarına taşınsın. POST ucu dahili raporlama olarak kalsın.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/trust-command`:** Aynı veri kaynağının (`SuspiciousActivity`) özet görünümü, "Açık şüpheli aktivite" kartı ve "Son şüpheli kayıtlar" listesiyle (`app/admin/trust-command/page.tsx:139-156`, `app/api/admin/trust-overview/route.ts:26,42-55`). İki sayfa aynı tabloyu farklı tanımlarla gösteriyor: trust-command yalnız açık kayıtları, bu sayfa hepsini. Öneri: **trust-command "Güven ve Güvenlik" ana sayfası olarak kalsın, fraud-prevention onun "Sahtekarlık kuyruğu" alt sekmesi olsun** (`/admin/trust-command/fraud`). Sidebar'daki iki ayrı giriş (`components/dashboard/sidebar.tsx:177-178`) tek girişe insin.
- **`/admin/compliance`:** Log sorgusu şüpheli aktiviteyi de birleştiriyor (`app/api/admin/compliance/logs/route.ts:94-111`). Bu, denetim/uyumluluk amaçlı salt-okunur bir görünüm olarak kalabilir; triage burada yapılmamalı.
- **`/admin/dealers-health`:** Bayi `fraudStatus`'ını sağlık skoruna katıyor (`app/api/admin/dealers-health/route.ts:93-94`). Birleşik risk skoru (B7) buradan da okunmalı.
- **`/admin/settings` → "Hızlı admin başlangıcı":** Aynı demo tohumlama/silme düğmelerini barındırıyor (`app/admin/settings/settings-client.tsx:839,843`). Demo aksiyonları **yalnız orada** kalmalı, fraud sayfasından kaldırılmalı (B2).
- **Leaderboard (`app/api/leaderboard/route.ts`) ve `lib/points-velocity.ts`:** `needsReview` sinyali bu sayfaya olay olarak akmalı; ayrı bir "puan hızı" ekranı açılmamalı.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod çalıştırılmadı, veritabanına dokunulmadı. Her iddia çürütülmeye çalışıldı.

### 1. Demo tohumlama canlı müşteri hesaplarının fraudStatus'unu değiştiriyor — **DOĞRULANDI (önem: orta, iddia edilen kadar yüksek değil)**

- **Kanıt:** `app/api/admin/bootstrap/route.ts:289-294` en yeni 30 gerçek `CUSTOMER`'ı çekiyor; `:306` `i % 4 === 0` → i=0,4,8 için `HIGH`; `:329-334` bu üç kullanıcıya koşulsuz `fraudStatus: 'flagged', fraudScore: 0.71` yazıyor (önceki durum saklanmıyor). `:357-370` temizlikte tracker'daki kullanıcılar **ve** `fraudScore` 0.70–0.72 aralığındaki her `flagged` kullanıcı `clean/0` yapılıyor. Uç yalnız `requireAuth(['ADMIN'])` ile korunuyor (`:105`); prod guard, onay diyaloğu ve `AuditLog` yok. Düğmeler onaysız tek tıkla `fetch` atıyor (`components/admin/bootstrap-action-button.tsx:40-47`), sayfada iki kez render ediliyor (`page.tsx:41-51`, `:103-113`).
- **Yeniden üretim:** Admin canlıda "Demo şüpheli aktivite üret"e basar → en yeni 3 gerçek müşteri `flagged` olur, adları/e-postalarıyla sahte "Kısa sürede çoklu tarama" kayıtları oluşur; bu kayıtlar `/admin/trust-command`, `/admin/compliance` (`app/api/admin/compliance/overview/route.ts:85-86`, `logs/route.ts:95`), `lib/agent-council.ts:61` sayaçlarına karışır. "Demo veriyi sil" bu kullanıcıları önceki durumlarına değil `clean/0`'a döndürür.
- **Çürütülen/abartılı kısımlar:** (a) `fraudStatus` hiçbir müşteri akışında uygulanmadığı için (bkz. iddia 2) son kullanıcıya fiilî etki yok; etki admin verisinin bütünlüğüyle sınırlı. (b) "Demo dışı meşru bayrak silinebilir": kodda bayrak üreten tek gerçek yol `lib/fraud/engine.ts` ve o +20/+50 tam sayı ekliyor (`:55,59`); 0.70–0.72 aralığına yalnız bootstrap düşer. Ayrıca motor hiç çağrılmıyor. Yani meşru bayrağın silinmesi ancak elle DB'ye yazılmış bir değerle mümkün — teorik. (c) `shadow_ban → flagged` düşürmesi de aynı nedenle pratikte erişilemez bir durum.
- **Öneri:** Demo aksiyonları `NODE_ENV === 'production'` / `ALLOW_DEMO_SEED` bayrağı arkasına alınmalı, gerçek kullanıcılar yerine `isDemo` işaretli sentetik kullanıcılar üretilmeli; değiştirilen kullanıcının önceki `fraudStatus/fraudScore`'u tracker'a yazılıp temizlikte geri yüklenmeli; aralık-temelli (`0.70–0.72`) sıfırlama kaldırılmalı; her çalıştırma `AuditLog`'a düşmeli ve UI'da onay diyaloğu olmalı. Düğmeler bu sayfadan kaldırılıp yalnız `/admin/settings` "Hızlı admin başlangıcı"nda tutulmalı.

### 2. Fraud tespit/uygulama zinciri ölü kod, sayfa korumayı varmış gibi gösteriyor — **DOĞRULANDI (kısmi abartı ile)**

- **Kanıt:** Tüm kod tabanında (`app`, `lib`, `components`) `checkFraudulentActivity` (`lib/fraud/engine.ts:18`), `shouldApplyReward` (`:95`) ve `checkSuspiciousActivity` (`lib/security.ts:12`) için çağıran yok; `lib/fraud/engine` hiçbir yerden import edilmiyor. `fraudStatus`'a yazan tek canlı yol demo tohumlama (`bootstrap/route.ts:332,369`). `shadow_ban` hiçbir puan/tüketim/oyun akışında okunmuyor (yalnız sayım/sağlık skoru: `app/api/admin/dealers-health/route.ts:94`, `trust-overview/route.ts:30`). Buna rağmen sayfa "İşlemleri kaydedilmiyor" (`page.tsx:64`), hero'da "QR tarama hızlarını ve konum anormalliklerini takip eden AI tabanlı analiz motoru" (`:37`) ve "Aktif" (`:85`) diyor.
- **Yeniden üretim:** Bir müşteri 1 saatte 10+ tüketim/tarama yapar → hiçbir `SuspiciousActivity` oluşmaz, `fraudStatus` değişmez, sayfa "Hiçbir şüpheli aktivite bulunamadı. Sistem koruma altında." gösterir. Elle `shadow_ban` yapılmış bir kullanıcı puan kazanmaya devam eder.
- **Abartılı kısımlar:** "Hız limitleri devrede" tamamen yanlış değil — IP bazlı QR tarama limiti (`lib/rate-limit.ts:168,275`, `app/api/qr-codes/public/[code]/route.ts:15`) ve login brute-force kilidi (`lib/rate-limit.ts:145-155`) gerçekten çalışıyor. "Puan ekonomisinin fraud görünürlüğü fiilen yok" da abartı: `lib/points-velocity.ts` (24 saatte 500+ puan) leaderboard'da kullanılıyor (`app/api/leaderboard/route.ts:8`) ve puan tavanları mevcut. Eksik olan, bu sinyallerin bu sayfaya/`SuspiciousActivity`'ye akmaması ve kullanıcı bazlı velocity/ban uygulamasının olmaması. Ayrıca motor hiç çalışmadığı için `shadow_ban` durumuna kodla ulaşılamıyor; "banlı kullanıcı puan kazanır" senaryosu yalnız elle DB müdahalesiyle oluşur.
- **Öneri:** Ya motor puan veren tek kapıya (`assertRewardAllowed`) bağlanmalı ya da sayfadaki "Aktif / işlemleri kaydedilmiyor / AI motoru" metinleri gerçek duruma göre (son değerlendirme zamanı, çalışan kural sayısı) dinamik üretilmeli. Yanlış güvence veren statik metin kaldırılmalı.

### 3. Önem derecesi büyük/küçük harf uyumsuzluğu — **DOĞRULANDI (filtre kısmı abartılı)**

- **Kanıt:** Sayfa yalnız küçük harf `'high'`'ı kırmızı gösteriyor (`page.tsx:121`). Gerçekte çalışan üreticiler büyük harf yazıyor: brute-force kilidi `severity: 'HIGH'` (`lib/rate-limit.ts:149`), `reportSuspiciousActivity` tipi `'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'` (`lib/security.ts:75`), POST varsayılanı `'MEDIUM'` (`app/api/security/suspicious/route.ts:100`), demo `'HIGH'` (`bootstrap/route.ts:306`), şema yorumu büyük harf (`prisma/schema.prisma:1925`). Küçük harf yazan tek yer ölü `lib/fraud/engine.ts:74`.
- **Yeniden üretim:** Bir hesap 5 başarısız girişle kilitlenir → `BRUTE_FORCE / HIGH` kaydı oluşur ve admin'e "🚨 HIGH Güvenlik Uyarısı" bildirimi gider (`lib/security.ts:98-124`), ama bu sayfada amber (orta) ikonla, `userId` olmadığı için "Gizli Üye (Bilinmiyor)" ve "ŞÜPHELİ" rozetiyle görünür. `CRITICAL` için ayrı görsel yok.
- **Abartılı kısım:** "/api/security/suspicious filtresini iki sözlük bozuyor" — küçük harf üreten motor hiç çalışmadığı için veritabanında pratikte yalnız büyük harf değerler var; `?severity=HIGH` filtresi bugün doğru çalışır. Risk, motor bağlanırsa ortaya çıkacak gizli bir tuzak.
- **Öneri:** `severity` Prisma `enum`'a çevrilmeli (göç öncesi `UPPER()` normalize + yedek), görüntüleme tek bir `severityMeta` haritasından (LOW/MEDIUM/HIGH/CRITICAL → renk, ikon, etiket) beslenmeli; `engine.ts:74` büyük harfe çekilmeli.

---

## Uygulama (Dalga 2)

Bu sayfa `/admin/trust` Güven Merkezi'ne birleşti; rota `permanentRedirect` ile `/admin/trust?tab=vakalar` (sorgu korunur) oldu. Mimari ayrıntı: `admin_trust-command.md` → "Uygulama (Dalga 2)". Tespit artık gerçek: üç kural (puan hızı — `points_credited`, hızlı tüketim — `Consumption`, çoklu hesap — `AuditLog.ipAddress` ortak genel IP) Settings `trust.rules.v1`'deki eşiklerle (sunucu varsayılanı; 409'lu, gerekçeli düzenleme) "Sinyalleri tara" ile çalışır, tekilleştirilmiş `SuspiciousActivity` vakası açar ve **kullanıcıya otomatik ceza vermez**. Gölge yasak `mintPoints` fraud kapısında zaten uygulanıyor (defter satırı `void`); ekran bunun ölçüsünü ("Korunan puan") gösteriyor. Puan geri alma yalnız `lib/economy` `adjustPointsByAdmin` üzerinden (negatif → `debitPoints`, eksi bakiye yok, tek-kez anahtarı `trust-reverse:<ledgerId>`).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Sunucu ADMIN kontrolü | ÇALIŞIYOR (proxy + `requireAuth` DB'den; API'de admin kapısı) |
| 2 | "AI tabanlı analiz motoru" hero | KALDIRILDI — sahteydi; yerine gerçek kalkan bandı (etkin kural sayısı, son tarama zamanı ve sonucu) |
| 3 | "Demo şüpheli aktivite üret" | KALDIRILDI — üretim ekranından çıkarıldı (demo araçları yalnız Ayarlar'daki hızlı başlangıçta) |
| 4 | "Demo veriyi sil" | KALDIRILDI (3 ile) |
| 5 | KPI: Gölge yasaklı | ÇALIŞIYOR — "Bayraklı hesap" kartında; operatör durumu artık ekrandan değiştirebiliyor; yasak `mintPoints`'te uygulanıyor |
| 6 | "İşlemleri kaydedilmiyor" | ÇALIŞIYOR — doğru metin ("yeni kazanımlar bakiyeye yansımaz") + "Korunan puan (7 gün)" gerçek defter toplamı |
| 7 | KPI: Şüpheli (flagged) | ÇALIŞIYOR — rol kırılımlı; değeri artık operatör kararları besliyor |
| 8 | "Sistem Durumu: Aktif" | KALDIRILDI — sabit yalandı; kalkan bandı gerçek durumu gösterir, tarama yoksa uyarı tonunda |
| 9 | Son 50 liste | ÇALIŞIYOR — sayfalı kuyruk, varsayılan Açık |
| 10 | Önem rengi | ÇALIŞIYOR — `normalizeSeverity` + `SeverityBadge` (4 seviye, ikon + metin) |
| 11 | Kullanıcı adı/e-posta | ÇALIŞIYOR — özne: hesap / giriş denemesi hedefi (e-postadan hesap eşlemesi) / IP; e-posta büyük harfe çevrilmiyor |
| 12 | Açıklama + bayi | ÇALIŞIYOR — bayi yoksa "—" |
| 13 | Durum rozeti | ÇALIŞIYOR — olay durumu (Açık / çözüm kodu) satırda; öznenin güncel durumu detayda ayrı rozet |
| 14 | Zaman damgası | ÇALIŞIYOR — Europe/Istanbul, göreli + mutlak |
| 15 | Boş durum + demo | ÇALIŞIYOR — dürüst boş durum, demo butonu yok |
| 16 | Yükleniyor | ÇALIŞIYOR (sayfaya özel iskelet) |
| 17 | Hata durumu | ÇALIŞIYOR — bölüm başına `QueryState` + `PanelErrorBoundary`; ön yükleme hatası sayfayı düşürmez |
| 18 | Paralel veri çekme | ÇALIŞIYOR |
| 19 | Olay türü | ÇALIŞIYOR — Türkçe tür etiketi + tür filtresi |
| 20 | Çözme | ÇALIŞIYOR — çöz (Yanlış alarm / Doğrulandı / Aksiyon alındı + gerekçe), yeniden aç, toplu çöz; 409 |
| 21 | Filtre | ÇALIŞIYOR — URL'de durum, önem, tür, zaman |
| 22 | Arama | ÇALIŞIYOR — e-posta, ad, IP, açıklama, bayi, vaka no |
| 23 | Sayfalama | ÇALIŞIYOR |
| 24 | Kullanıcı aksiyonları | ÇALIŞIYOR — Temiz / İşaretli / Gölge yasak (iyimser kilit, gerekçe, denetim), askıya al/kaldır (oturumlar düşer), puan geri al; yönetici ve kendi hesabı korumalı |
| 25 | Profil bağlantısı | ÇALIŞIYOR — `/admin/users/:id` |
| 26 | Olay detayı | ÇALIŞIYOR — metadata, IP, UA, kart, ölçülen/eşik, 24 sa puan/tüketim, güven puanı, defter, aynı IP'deki hesaplar, ilişkili vakalar, geçmiş |
| 27 | Kural/eşik yapılandırması | ÇALIŞIYOR — Kurallar sekmesi (aç/kapa, eşik, pencere, önem; 30 gün tetiklenme, açık, yanlış alarm oranı) |
| 28 | Trend | ÇALIŞIYOR — 14 günlük vaka sparkline'ı (İstanbul günü) |
| 29 | CSV | ÇALIŞIYOR — filtreli, BOM'lu, formül enjeksiyonuna karşı korumalı, en çok 5000 satır |
| 30 | Yenileme | ÇALIŞIYOR — Yenile + 60 sn |
| 31 | Derin bağlantı | ÇALIŞIYOR — `?case=<id>` çekmeceyi açar |
| 32 | Modül kontrolü | KISMİ (kalan) — `fraud_prevention` modülü sayfayı kapatmıyor; kritik güvenlik yüzeyini modülle kapatmak ürün kararı, `lib/module-controls.ts` sahibinin |
| 33 | Demo aksiyon denetimi | KALDIRILDI (bu yüzeyde demo aksiyonu yok); bootstrap ucunun kendisi Ayarlar yüzeyinin |
| 34 | i18n | KISMİ (kalan) — TR/EN karışık etiketler kalktı, tam Türkçe; next-intl'e taşınmadı |
| 35 | Mobil | ÇALIŞIYOR |
| 36 | Azaltılmış hareket | ÇALIŞIYOR |

### Kapanan bulgular (10 bulgudan 7'si tam, 3'ü kısmi)
B3 (önem sözlüğü) · B4 (olay/özne durumu ayrımı) · B5 (triage + aksiyonlar, zod, `requireAuth`) · B6 (filtre/arama/sayfalama/derin link) · B8 (İstanbul saati) · B9 (ikon+metin, token kontrastı, `normal-case` e-posta, onaylı yıkıcı aksiyonlar, semantik tablo, klavye) · B10 (bölümsel hata, ölü veri kaldırıldı). **Kısmi:** B1 — ölü `lib/fraud/engine.ts` yerine kural taraması gerçek veriyle çalışıyor, gölge yasak `mintPoints`'te uygulanıyor; ölü dosya paylaşılan `lib/` altında, silinmedi. B2 — demo butonları bu sayfadan kaldırıldı; `app/api/admin/bootstrap` (Ayarlar yüzeyi) davranışı o yüzeyin sahibinde. B7 — puan hızı, tüketim hızı ve çoklu hesap tek depoya akıyor; geri bildirim `trustFlagged`, oyun tavanı ve bayi skoru henüz akmıyor.

### Kalanlar ve ŞEMA İSTEKLERİ
- `SuspiciousActivity`: `status` (OPEN/IN_REVIEW/RESOLVED), `assigneeId`, `resolutionCode`, `source` alanları; `@@index([isResolved, severity, createdAt])`, `@@index([userId, createdAt])`; `severity` enum'u (göç öncesi `UPPER()` normalize).
- `SecurityAlert.suspiciousActivityId` (tekilleştirme bağı).
- `User.fraudScore` ölçeğinin 0–100'e netleştirilmesi (bugün ekranda gösterilmiyor).
- Tarama cron'a bağlanmadı (cron sahibi); `runScan` hazır.
