# Sabah Raporu — Platform Overhaul (2026-10-11)

> Dal: `feat/platform-overhaul` · main'den fark: **236 commit, ~4.160 dosya** · **push yok, deploy yok, canlı DB'ye dokunulmadı.**
> Son sürüm kontrolü `78b11b11`: tsc 0 hata · jest 351/351 suite (5.044 test) · eslint 0 hata / 34 uyarı · `next build` başarılı.

## 1. Özet

8 Ekim denetiminin bulduğu 40 P0'ın **tamamı kodda kapatıldı**. 13 sistem boyutunun hepsi kendi raporunda "Uygulama sonrası durum" bölümüyle şimdiki koda karşı yeniden denetlendi. 198 sayfanın 197'sinde özellik özellik "Uygulama (Dalga 2)" tablosu var. Bilgi mimarisi tek navigasyon kaydına geçti, oyunlar ortak motora ve sunucu doğrulamasına taşındı (13 canlı oyun, 3'ü yeni). **Bunların hiçbiri canlıda değil.** Bu dal yeni şema kolonlarını SELECT ediyor. Expand göçü canlı Neon'a uygulanmadan deploy edilirse girişte dahil neredeyse her istek `P2022` ile çöker, bu yüzden sıra (§7) pazarlık konusu değil. Puanlar ajanların kendi değerlendirmesi. Aşağıda bunları ~1 puan aşağı çektim, çünkü hiçbir sayfa tarayıcıda gözle görülmedi (dev sunucusu yasaktı), Playwright/axe testleri koşmadı ve yük/Lighthouse ölçümü yapılmadı. Ayrıca birkaç P0'ın tam etkisi göç ve canlı veri işi bekliyor.

## 2. Önce / sonra puanlar

"Ajan" sütunu ilgili raporun kendi yazdığı puan. "Benim tahminim" sütununda tarayıcıda doğrulanmamış görsel/UX iddialarını ve göç bekleyen kısımları düştüm.

| Alan | Önce | Ajan | Benim tahminim | Not |
|---|---|---|---|---|
| Müşteri paneli | 4,2 | — | **6,5** | Kod derinden değişti, görsel kontrol yok; QR hunisi JS'i hâlâ ağır |
| Bayi paneli | 3,6 | — | **6,5** | Gelen Kutusu/kasa birleşti; personel yetki matrisi şema bekliyor |
| Admin paneli | 3,8 | — | **6,5** | 9 alana indi; çok sayfa yeniden yazıldı, gözle bakılmadı |
| Güvenlik — admin API | 5,5 | 9 | **8** | B11 kısmi, B15'te bir madde açık |
| API mimarisi | 5,0 | 9 | **8** | Korkuluk testleri CI'da; B12 kısmi, B13 şema |
| Veri modeli | 5,0 | 8,5 | **7** | Float para, FK Restrict, CHECK, baseline göçü hâlâ şema işi |
| Tasarım sistemi | 4,5 | 9 | **7,5** | Kontrast matematikle kanıtlı, ekranda görülmedi |
| Arka plan sistemleri | 4,5 | 9 | **8** | Inngest'in canlı durumu bilinmiyor |
| Mobil / a11y / i18n | 4,5 | 8,5 | **7** | Mobil testi hiç koşmadı; i18n 7,5 |
| Güvenlik — müşteri API | 4,0 | 9,5 | **8,5** | 17/17 kapandı (Y4 küçük kalıntı) |
| Performans | 4,0 | 9 | **7** | Kazançlar hesaplandı, ölçülmedi; `/feedback/[code]` 150 KB hedefinin çok üstünde |
| Bilgi mimarisi / navigasyon | 4,0 | 9,5 | **8,5** | `verify:menu` 74/74, CI'da zorunlu |
| Oyun ekosistemi | 4,0 | 9,5 | **8** | 13/13 sunucu doğrulamalı; oyun içi i18n kısmi |
| Oyunlaştırma ekonomisi | 4,0 | 8,5 | **7,5** | PointsLedger çift yazım/mutabakat henüz başlamadı |
| AI özellikleri | 3,5 | 9 | **8** | O4/D2 şema bekliyor |
| Güvenlik — bayi API | 3,5 | 9 | **8** | Y4 personel yetki matrisi, O7 plan kotası şema bekliyor |
| **13 boyut ortalaması** | **4,31** | **~9,0** | **~7,8** | |

## 3. 40 P0'ın durumu

"Kod" sütunu bu daldaki durumu gösteriyor. "Canlıda tam etki" sütunu, düzeltmenin çalışması için §7'deki göçün (R3/R6) ya da sonraki veri adımının gerekip gerekmediğini söylüyor.

| P0 | Konu | Kod | Canlıda tam etki için |
|---|---|---|---|
| 01 | Admin gizli kapısı dekoratif | Kapandı (API + edge HMAC) | Env: kapı cevabı (§8) |
| 02 | Açık yönlendirme / `javascript:` XSS | Kapandı | — |
| 03 | Girişte ADMIN demo hesabı | Kapandı (kaynakta yok) | Canlıdaki demo hesabın şifresi/rolü kontrol edilmeli |
| 04 | Personel ekleme ile hesap ele geçirme | Kapandı (davet akışı) | R3 (`StaffInvitation`) |
| 05 | STAFF kiracılar arası okuma/yazma | Kapandı | — |
| 06 | `/api/ai/analyze` IDOR | Kapandı (uç 410) | — |
| 07 | Oturum iptali yok | Kapandı | R3 (`sessionVersion`); zorlama ayrı deploy'da |
| 08 | OAuth ön-ele geçirme / magic link 2FA | Kapandı | — |
| 09 | Kimliksiz IDOR'lar (rozet/görev) | Kapandı | — |
| 10 | Ekip modülü fail-open | Kapandı | — |
| 11 | `assignedToId` + e-posta sızıntısı | Kapandı | — |
| 12 | CLV platform geneli | Kapandı | R3 (`DealerCustomerStats`) |
| 13 | Sınırsız mutlu saat çarpanı | Kapandı (1–3 clamp, toplam ≤4×) | — |
| 14 | Rozet self-award | Kapandı (POST kaldırıldı) | — |
| 15 | Görevlerin çift ödenmesi | Kapandı | R3 (`rewardedAt`) + geçmiş çift ödeme ölçümü (runbook §5) |
| 16 | Kayıt davet puanı doğrulamasız | Kapandı | — |
| 17 | Oyunlarda istemci skoru | Kapandı (13/13 sunucu doğrulayıcı) | R3 (`MiniGameSession` kolonları) |
| 18 | Offline-sync tekrar oynatma | Kapandı | R3 (`clientOpId` unique) |
| 19 | Admin/otomasyon defter dışı puan | Kapandı (dört göz eşiği) | — |
| 20 | Klan escrow kaybı | Kapandı (soft-cancel + iade) | R3 (`SquadBattle` kolonları) |
| 21 | Sezon bonusu/BIRTHDAY/matris tavansız | Kapandı | — |
| 22 | Telafi bütünlüğü | Kapandı | Göç `…000200_remedy_open_offer_unique` (son savunma, sıra bağımsız) |
| 23 | Silinip yeniden kazanılan ödüller | Kapandı | R3 (`deletedAt`) |
| 24 | QR silme cascade | Kapandı (arşiv) | R3 + R6 (Restrict) |
| 25 | Kullanıcı silme denetim izini siliyor | Kapandı (anonimleştirme) | R3 (`AuditLog` SET NULL) |
| 26 | Rozet/ödül/plan/kart hard delete | Kapandı (arşiv) | R3 (`archivedAt`) |
| 27 | Demo araçları canlı veriye yazıyor | Kapandı | R3 (`isDemo`) |
| 28 | Yükleme hatası sonra Kaydet canlıyı eziyor | Kapandı | — |
| 29 | Çift Stripe aboneliği | Kapandı (bayi kilidi) | R3 (`StripeEvent`) |
| 30 | Yedekler public kovada, şifresiz | Kapandı (ayrı kova + AES-256-GCM, R2'ye geri düşüş yok) | **Sizin işiniz:** §8 (kova, env, sır döndürme) |
| 31 | Çerez rızası uygulanmıyor | Kapandı | R3 (`ConsentRecord`) |
| 32 | "AI kapalı" cron'la atlatılıyor | Kapandı | R3 (`aiAttempts`) |
| 33 | Kalıcı prompt enjeksiyonu | Kapandı | — |
| 34 | KVKK DSR kâğıt üzerinde | Kapandı | R3 (`DsrEvent`, `dueAt`) + açık DSR'lere `dueAt` doldurma |
| 35 | Müşteriye dönük içerik güvenliği | Kapandı | — |
| 36 | Kamera taraması kapalı | Kapandı | Canlıda telefonla denenmeli |
| 37 | PWA 358 MB precache | Kapandı | Deploy sonrası SW boyutu kontrol edilmeli |
| 38 | Global `.animate-in` overlay'leri eziyor | Kapandı | — |
| 39 | Çöken/kullanılamayan sayfalar | Kapandı (formlar dışarı alındı, sayfalar yeniden yazıldı) | Tarayıcıda gözle kontrol edilmedi |
| 40 | Inngest ~19 periyodik cron | Kapandı (Inngest'te yalnız olay tetiklemeli 1 iş) | **Sizin işiniz:** Inngest panelinde eski cron'ların durduğunu doğrulayın |

**Sonuç:** 40/40 kodda kapandı. Bunların ~20'sinin canlıda gerçekten koruma sağlaması R3 göçüne bağlı.

## 4. 915 bozuk/sahte özelliğin akıbeti

Özellik bazında önceki ve sonraki durumu birebir eşleyen tek bir tablo yok. Denetim 915'i panel düzeyinde saymıştı, Dalga 2 tabloları ise **yeni durumu** sayfa bazında yazıyor. Bu yüzden 915'i tek tek izleyemiyorum. Elimdeki en dürüst sayım, 197 sayfa raporundaki "Uygulama (Dalga 2)" tablolarının satırları (yaklaşık; tablo biçimleri tam tek tip değil):

| Panel | Satır | ÇALIŞIYOR | KALDIRILDI | KISMİ | KALAN | BOZUK/SAHTE etiketi | TAŞINDI |
|---|---|---|---|---|---|---|---|
| Admin | ~2.677 | 2.222 | 326 | 35 | 15 | 0 | — |
| Bayi | ~1.790 | 1.467 | 248 | 5 | 14 | 0 | — |
| Müşteri | ~2.647 | 1.934 | 615 | 117 | 25 | 36 | 15 |
| **Toplam** | **~7.110** | **~5.620** | **~1.190** | **~157** | **~54** | **~36** | 15 |

Bundan çıkan sonuç:
- Bozuk/sahte özelliklerin büyük çoğunluğu ya **düzeltildi** (ÇALIŞIYOR) ya da **kaldırıldı**. Kaldırılanlar ~1.190; bunlar yalnız bozuk özellikler değil, birleştirilen kopya sayfalar ve sahte vaatler de bu sayıya giriyor.
- **Hâlâ tam çalışmayan: ~250 satır** (KISMİ + KALAN + BOZUK/SAHTE etiketli). Bunların önemli kısmı şema isteğine bağlı. Müşteri tarafındaki 36 BOZUK/SAHTE etiketinin bir kısmı muhtemelen eski durumun not sütununda geçiyor. Bunu tek tek ayıklamadım, bu yüzden üst sınır olarak okuyun.
- 1 sayfa raporunda Dalga 2 bölümü yok (198 sayfadan 197'sinde var).

## 5. Yeni bilgi mimarisi ve oyunlar

**Menüler** tek kayıttan (`lib/navigation/registry.ts`) üretiliyor. Eski adresler yönlendiriliyor; eski sayfa dosyası varsa doğru sekmeye yönlendirmeyi kendisi yapıyor. CI'da `verify:menu` 74/74 geçiyor.
- **Müşteri** (58 rota → 5 sekme): Ana Sayfa · Keşfet · (Tara) · Oyna · Cüzdan. Avatar menüsünde "Ben" var (ilerleme, yılım, seslerim, ayarlar).
- **Bayi** (45 rota → 9 blok): Bugün · Gelen Kutusu · Müşteriler · Pazarlama · Analitik · AI Asistan · İşletme · Otomasyon · Ayarlar (sekmeli: İşletme/Hesabım/Bildirimler/Güvenlik/AI/Abonelik).
- **Admin** (73 rota → 9 alan): Genel Bakış · Müşteriler/Bayiler · Ekonomi/Oyun · Kampanyalar · Yapay Zekâ · Güven ve Uyum · Platform · İçerik/Görünüm (+ ekip).

**Oyunlar:** 22 eski oyun ortak `lib/games/` motoruna taşındı ve elendi.
- **Canlı:** 13 oyun, hepsi sunucu doğrulamalı.
- **Kaldırılan:** 6 oyun emekli edildi. 8 eski oyun kimliği yeni oyunlara yönlendiriliyor.
- **Yeni:** Günün Kelimesi, Eşleştir-3 ve Mekân Bilgi Yarışması (düello dahil).
- **Birleşenler:** Sahte Avcısı 4 oyunu (truth-vs-fake, review-detective, word-spot, bot-hunter), Çekirdek Savunması 2 oyunu (spam-defense, troll-slayer) birleştirdi. pacman, Yıldız Avı olarak motora taşındı.
- **Oyun kuralları:** Günde 1 hak. Deneme başlarken harcanıyor, pratik modu var.
- **Turnuva:** Haftaya sabitlenmiş bir takvimle dönüyor. İlk 3'e ödül günlük işle otomatik veriliyor, çift ödeme olmuyor.

## 6. Kalanlar (dürüst liste)

1. **Hiçbir şey canlıda değil.** Bütün iş deploy'a ve R3 göçüne bağlı.
2. **Görsel ve tarayıcı doğrulaması yapılmadı.** Dev sunucusu yasaktı. Yeniden yazılan yüzlerce sayfa yalnız tsc, jest ve build ile doğrulandı. Mobil Playwright/axe testi yazıldı ama hiç koşmadı.
3. **`/feedback/[code]` QR hunisi:** ilk yük JS'i 150 KB hedefinin çok üstünde. Bu, müşterinin ilk temas ettiği sayfa.
4. **Şema istekleri** (`SCHEMA-REQUESTS.md`, `SCHEMA-REQUESTS-ek.md`; ajanların `schema.prisma`'ya dokunması yasaktı):
   - personel yetki matrisi (`DealerStaff.permissions`)
   - plan kotaları (`maxStaff`, `aiDailyTokens`)
   - `ApiKey.keyHash @unique` ve iptal/son kullanma sütunları
   - para alanlarında Float → Decimal
   - kayıt sistemi FK'lerinde Cascade → Restrict
   - `User.points >= 0` CHECK
   - ölü tabloların düşürülmesi ve index diyeti
   - durum alanları için enum'lar
   - `Feedback.dealerId` bileşik index
   - oyun sıralama index'leri
   - lig/VIP'in harcanabilir bakiyeden ayrılması
   - magic link neden ayrımı ve OTP kodu
5. **Baseline göçü yok.** Şema geçmişte `db push` ile kurulmuş. Önce `0000_baseline` + `migrate resolve` gerekiyor, aksi halde `migrate deploy` güvenli değil (runbook Yol B bu yüzden var).
6. **PointsLedger:** tablo R3 ile geliyor. Açılış bakiyeleri, 2 haftalık çift yazım ve gece mutabakatı ayrı bir sürüm.
7. **`sessionVersion` zorlaması:** eski JWT'lerin reddi ayrı bir deploy. Kullanıcılara "yeniden giriş" bildirimi gerekiyor.
8. **Kısmi kalan bulgular:**
   - Güvenlik: admin B11/B15, bayi Y4/O7
   - Mimari ve veri: mimari B12/B13, veri modeli B4/B11/B12 kısmi, B6/B8 kaldı
   - Tasarım: O2/O3/D2
   - Arka plan: O2/O7, Y5 kaynak haritaları
   - Performans: O5 (şema), D4 (`geist`, `zustand`, `@tanstack/react-table` kullanılmıyor ama `package.json`'da)
   - Mobil/i18n: B1/B10/B11/B13
   - Oyun ve ekonomi: oyun O7 (oyun içi i18n), ekonomi Y2/Y3/Y6, AI O4/D2
9. **Lint:** 34 uyarı. Uyarıların 4'ü exhaustive-deps: `admin/referrals`, `incidents-screen`, `providers` ×2.
10. **Commit dışında kalan iş:** `lib/idempotency.ts`, `app/api/admin/dealers-ai-stats/route.ts`, `lib/data/admin-api-catalog.json` ve `__tests__/lib/idempotency-reservation.test.ts` başka bir ajanın commit'lenmemiş değişikliği. Deploy'dan önce gözden geçirilip commit'lenmeli ya da atılmalı.
11. **Kural notu:** veri modeli ajanı bir kez `git reset -q <dosya>` ve bir kez `git update-index` çalıştırdı. Etkisi olmadığı raporlandı.
12. **An Motoru:** spec onaylı, R5'te `CustomerMoment` tablosuna yazacak. Ayrı iş olarak kalıyor.

## 7. Canlıya alma (onayınız gerekiyor; sırayla)

Ayrıntı ve SQL için `DEPLOY-RUNBOOK.md`. Kısa sıra:

**0. Yedek**
- Neon konsolu → Branches → canlıdan `pre-overhaul-2026-10-08` branch'ini açın, en az 14 gün tutun.
- Bağımsız döküm alın, şifreleyin ve özel bir yerde saklayın:
  ```bash
  node scripts/db-backup.mjs --local-only   # BACKUP_ENCRYPTION_KEY tanımlı olmalı
  ```

**1. Salt okunur ön kontrol** (`psql "$DIRECT_URL"`)
- `_prisma_migrations` var mı?
- Uzun süren işlem var mı?
- Satır sayılarını not alın:
  ```sql
  SELECT (SELECT count(*) FROM "User") u, (SELECT count(*) FROM "Feedback") f, (SELECT count(*) FROM "AuditLog") a;
  ```
- Drift'e bakın:
  ```bash
  npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
  ```
  Çıktıda bu pencerenin göçlerinden fazlası varsa **durun**.

**2. Prova**
- Canlıdan `overhaul-rehearsal` branch'ini açın.
- 3. adımı orada **iki kez** uygulayın (idempotent olmalı).
- Bu dalın preview'ini prova branch'ine bağlayıp `P2022` görmediğinizi kontrol edin: giriş, müşteri paneli, bayi gelen kutusu, QR listesi, admin kullanıcılar, denetim kaydı.

**3. Expand göçü (R3).** Göç geçmişi tablosu yoksa ya da baseline işaretli değilse Yol B'yi kullanın:
```bash
npx prisma db execute --url "$DIRECT_URL" --file prisma/migrations/20261008000000_platform_overhaul_expand/migration.sql
DATABASE_URL="$DIRECT_URL" npx prisma migrate resolve --applied 20261008000000_platform_overhaul_expand
# telafi tekilliği (sıra bağımsız; yinelenen açık teklifleri 'expired' yapar)
npx prisma db execute --url "$DIRECT_URL" --file prisma/migrations/20261008000200_remedy_open_offer_unique/migration.sql
DATABASE_URL="$DIRECT_URL" npx prisma migrate resolve --applied 20261008000200_remedy_open_offer_unique
```
DDL yalnız `DIRECT_URL` ile çalıştırılır. `db push` kullanmayın. `lock timeout` hatası alırsanız bekleyip aynı komutu tekrarlayın.

**4. Doğrulama** (runbook Adım 4)
- 7 yeni tablo var.
- `AuditLog.userId` nullable.
- `User.sessionVersion` varsayılanı 0.
- `AuditLog_userId_fkey = n`.
- Satır sayıları 1. adımdakiyle aynı.

**5. Push ve deploy (R4).** Önce §6 madde 10'daki commit'lenmemiş dosyaları netleştirin.
```bash
git push origin feat/platform-overhaul        # önce preview deploy → duman testi
# preview temizse: main'e merge + push (prod deploy)
```

**6. Duman testi** (prod)
- Müşteri, bayi ve admin girişi (admin kapısı dahil)
- QR ile geri bildirim (`/feedback/[code]`)
- Bayi kasa tüketimi ve kamera taraması (telefonda)
- Mini oyun başlat/bitir
- Admin denetim kaydı
- `/api/health`
- `/sw.js` precache boyutu
- Vercel loglarında `P2022` olmamalı

**7. Sonra, ayrı pencerelerde:**
- R6 Restrict göçü (`…000100_platform_overhaul_feedback_restrict`). Doğrulama: `confdeltype = r`.
- `sessionVersion` zorlaması ve kullanıcılara duyuru.
- PointsLedger açılış bakiyeleri.
- Runbook §5 veri işleri: P0-15 çift ödeme ölçümü, DSR `dueAt` doldurma, negatif bakiye raporu.

**Geri dönüş** (her zaman önce kod, sonra şema):
1. **Kod:** Vercel → Deployments → önceki sürüm → **Instant Rollback**. Eski kod yeni şemayla uyumlu olduğu için şema yerinde kalabilir. Çoğu sorun burada biter.
2. **R6:** Gerekirse FK'yi Cascade'e çevirin (runbook §4.2).
3. **R3:** Yalnız aynı pencerede ve yeni tablolar veri almadan önce `DROP` yapılabilir (runbook §4.3). Veri yazılmaya başladıysa geri almayın, ileri düzeltme yapın.
4. **Felaket:** `pre-overhaul-2026-10-08` branch'inden geri yükleyin. Arada yazılan veri kaybolur. Son çare şifreli `pg_dump`.

## 8. Sizin elle yapmanız gerekenler

1. **Sırları döndürün.** Eski yedekler uygulama kovasında, tahmin edilebilir adla ve şifresiz duruyordu (P0-30), yani DB içeriği açıkta kalmış sayılmalı.
   - **Neon:** DB şifresini döndürün; `DATABASE_URL` ve `DIRECT_URL` **ikisini de** güncelleyin.
   - **`NEXTAUTH_SECRET`:** döndürün. Tüm oturumlar düşer, bu beklenen bir durum.
   - **Diğer API anahtarları:** OpenAI/Anthropic, Stripe (secret + webhook secret), SMTP/Resend, R2 erişim anahtarları, Upstash Redis, cron/internal Bearer sırları, Inngest anahtarları, PostHog/Sentry token'ları ve IMAP şifresi.
   - **Eski yedekler:** `backups/db/` altındaki dosyaları uygulama kovasından **silin**.
2. **R2:** uygulama kovasının public erişimini gözden geçirin; `backups/` öneki dışarıdan erişilemez olmalı. Ayrı, **private** ve Object Lock'lu bir yedek kovası açın.
3. **Yedek env'leri:** Vercel'e `BACKUP_R2_*` ekleyin (ayrı kova, ayrı token; `R2_BUCKET` ile aynı olursa betik hata verir). `BACKUP_ENCRYPTION_KEY` için 32 bayt üretin: `openssl rand -hex 32`. Bu anahtarı kasaya yedekleyin; kaybolursa yedekler açılamaz.
4. **Inngest paneli:** Apps'te yalnız olay tetiklemeli `analyzeFeedbackFn` kalmalı. Eski periyodik cron'lar duruyor mu bakın, gerekirse eski app'i sync'leyip temizleyin. `INNGEST_SIGNING_KEY` Vercel'de tanımlı olmalı.
5. **Admin kapı cevabı:** `ADMIN_GATE_DEFAULT_ANSWER` env'ini koddaki varsayılandan (7) farklı bir değere ayarlayın. Varsayılan bilindiği için kapı ancak böyle anlam taşır.
6. **Gelen kutusu:** `MAIL_AUTHSERV_ID` env'ini posta sağlayıcınızın Authentication-Results kimliğine ayarlayın. Ayarlanmazsa SPF/DKIM/DMARC'a dayanan otomatik durum değişiklikleri devre dışı kalır.
7. **Cron-job.org:** harici cron'lar yeni `app/api/cron/daily` kayıt defterine uyuyor mu kontrol edin. Sahipsiz kalan `rate-limit-cleanup` ve `squad-battles-finish` uçları raporda notlu.
8. **Canlıdaki demo hesaplar:** `admin@qratex.com` ve `Demo123!` ile oluşturulmuş demo kafe hesapları canlıda varsa şifrelerini ve rollerini kapatın. Kod artık bunları üretmiyor, ama var olan satırları silmiyor.
