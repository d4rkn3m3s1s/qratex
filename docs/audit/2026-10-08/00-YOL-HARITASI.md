# Qratex — Bütünleşik Ürün ve Mühendislik Yol Haritası (2026-10-08)

> **Belge sahibi:** CTO / baş tasarımcı sentezi · **Durum:** taslak, proje sahibi (Furkan) onayına sunulur
> **Kapsam:** sistemin tamamı. Üç panelin bütün sayfaları (müşteri 80 · bayi 45 · admin 73 = **198 sayfa**) ve 13 sistem boyutu (API mimarisi, üç güvenlik yüzeyi, veri modeli, tasarım sistemi, performans, bilgi mimarisi, oyunlar, oyunlaştırma ekonomisi, AI, arka plan sistemleri, mobil/erişilebilirlik/i18n).
> **Kaynaklar:** `musteri/00-OZET.md`, `bayi/00-OZET.md`, `admin/00-OZET.md`, `sistem/*.md` (13 rapor) ve bunların dayandığı 198 sayfa raporu. Sayfa raporlarının "Doğrulama (şüpheci inceleme)" bölümünde çürütülen iddialar bu belgeye alınmadı.
> **Yöntem:** salt okunur. Kod değiştirilmedi. Veritabanına, build'e, teste ve dev server'a dokunulmadı (`.env` içindeki `DATABASE_URL` canlı Neon'u gösteriyor). Bu sentez sırasında en kritik 20 iddia kaynak dosyadan bir kez daha okundu. Bunlar metinde **✔** ile işaretli. ✔ olmayan kanıtlar, ilgili raporun doğrulama bölümünde "doğrulandı" olarak geçenlerdir. Canlı ortam gerektiren noktalar açıkça "doğrulanmadı" diye yazıldı.
> **Ayrı ve onaylı iş:** **An Motoru** (`docs/superpowers/specs/2026-10-08-moment-engine-design.md`, dal `feat/moment-engine`, commit `3a8b00f`). Bu yol haritası An Motoru'nu yeniden tasarlamaz. Onu mevcut bir iş olarak referans verir ve yalnızca kesişim noktalarını (§5.3) koordine eder. Bugün itibarıyla An Motoru için yalnızca spesifikasyon var. `lib/moments/` ve `components/moments/` henüz yok ✔.

---

## İçindekiler

1. Yönetici özeti ve sağlık puanları
2. HEMEN düzeltilecekler (P0)
3. Kök nedenler: sistemi "eski ve dağınık" yapan kalıplar
4. Hedef durum: tasarım dili, motion dili, bilgi mimarisi, mimari ilkeler
5. Fazlı plan (Faz 0 → Faz 5), epikler, paralel yürütme
6. Kaldırılacak ve birleştirilecek sayfaların tam listesi
7. Oyunlar: portföy kararı
8. Riskler ve deploy sırası
- Ek A: 198 sayfanın tek tek karar ve epik eşlemesi
- Ek B: Panel epiklerinin yol haritası epiklerine eşlenmesi

---

## 1. Yönetici özeti

### 1.1 Bugünkü durum (dürüst)

Qratex'in **yüzeyi büyüdü ama çekirdeği aynı hızda büyümedi.** 198 sayfada envantere giren yaklaşık **8.260 özelliğin ~915'i bozuk ya da sahte** (≈ %11). "Kısmi" çalışanlar bunun yaklaşık iki katı. 198 sayfanın **hiçbiri 6/10'u geçmiyor**. En yüksek puanlı sayfalar bile (`/admin/intern-emails` 6,0; `/admin/inbox`, `/admin/platform-pulse`, `/customer/games` hub 5,5) kıyas ürünlerin (Starbucks Rewards, Duolingo, Medallia, Toast, Stripe Dashboard, Linear) taban çizgisinin altında.

Sorunlar tek tek sayfa hatası olarak görünmüyor. **Aynı 10–12 kök nedenin her sayfada yeniden üretilmesi** olarak görünüyor (§3). Bu iyi haber, çünkü düzeltmenin büyük kısmı projede zaten var olan doğru desenleri (`updateMany` guard'ları, `creditPointsAndXp`, `debitPoints`, `points_credited`, `CardAuditLog` SetNull, `lib/timezone.ts`, `lib/r2-storage.ts`, `withIdempotency`, Redis sıcak katman) **tek merkezde toplayıp zorunlu kılmak**. Sıfırdan icat gerekmiyor.

**Bugün canlıda olan en ağır riskler (hepsi kodla doğrulandı):**

1. **Kimlik zinciri delik.** Admin gizli kapısı API katmanında hiç uygulanmıyor ve edge'de imzayı doğrulamıyor ✔. Giriş ekranında ADMIN demo şifresi düz metin duruyor ✔. Bayinin "personel ekle" formu herhangi bir mevcut hesabın şifresini ve rolünü eziyor ✔. Giriş yönlendirmesi `/\evil.com` ile atlatılabiliyor ✔. Şifre sıfırlama, anonimleştirme ve rol değişikliği açık oturumları düşürmüyor ✔.
2. **Kiracı izolasyonu yok.** STAFF rolü platformdaki bütün geri bildirimleri ve müşteri e-postalarını okuyabiliyor ✔. CLV platform genelinde tutuluyor ve bayi, müşterinin rakip işletmedeki harcamasını görüyor ✔.
3. **Puan ekonomisi mint kapısız.** Bayi sınırsız mutlu saat çarpanıyla tek tüketimde milyonlarca puan basabiliyor ve bu iş `points_credited` olmadan yapılıyor ✔. Müşteri gizli olmayan rozetleri kendine verip `requirement.value` kadar puan alabiliyor ✔. Otomatik ödenen görevler ikinci kez ödeniyor. Kayıt, e-posta doğrulanmadan davet puanı basıyor. 22 oyunun skoru istemci beyanı, sayfayı yenileyen sınırsız deneme alıyor ✔.
4. **Kalıcı veri kaybı tek tıkla mümkün.** QR silmek bağlı bütün yorumları, AI analizini ve telafileri cascade ile siliyor ✔. Kullanıcı silmek denetim izini siliyor ✔. Demo/bootstrap araçları canlı veriye onaysız yazıyor.
5. **KVKK uyumu kâğıt üzerinde.** Çerez reddi hiçbir izlemeyi durdurmuyor. Şifre sıfırlama token'ı PostHog'a gidiyor. "AI kapalı" ayarı cron tarafından atlatılıyor. Veritabanı yedekleri, uygulama yüklemelerinin herkese açık sunulduğu R2 kovasına yazılıyor ✔ (kovanın public erişimi canlıda **doğrulanmadı**).
6. **Kullanıcıya gösterilen sayıların önemli kısmı yanlış ya da uydurma.** Seri sabit 0. "Kazanılan puan" yorum × 50. NPS/CSAT/CES değerleri LLM'e uydurtuluyor. "Tarama" metriği aslında geri bildirim sayısı. Isı haritası 1 gün + 3 saat kaymış. Hata durumları ~100 sayfada "henüz veri yok" boş durumu olarak gösteriliyor.
7. **Ana akışlar kırık.** Kamera taraması `Permissions-Policy: camera=()` yüzünden üretimde kapalı ✔. PWA, public klasörünün tamamını (~358 MB) her ziyaretçiye ön belleğe alıyor ✔. Tüm Radix diyalog/menü açılış animasyonları global bir CSS sınıfı tarafından eziliyor ✔.

**Güçlü taraflar (korunacak):** sıcak yollarda atomik claim desenleri, escrow net-sıfır mantığı, `debitPoints` guard'lı düşümü, fail-closed cron kimlik doğrulaması (`timingSafeEqual`), Stripe imza doğrulaması, parametreli ham SQL, hash'li token'lar, fra1 + Neon eu-central-1 aynı bölge, Redis önbelleği ve token-replay sıcak katmanı, global `LazyMotion` (`m as Motion`), lazy three.js/harita/QR/OCR, shadcn/Radix primitifleri, TR/EN katalog eşitliği (3560/3560), görsel olarak iddialı oyun ve 3D altyapısı (süperelipsoid kutu, karakter küresi), olgunlaşmaya yakın yüzeyler (ekip modülü, intern-emails, inbox, platform-pulse, points-matrix).

**Karar:** Yeni özellik eklemek **durdurulmalı.** Önce Faz 0 (≈2 hafta) ile güvenlik, ekonomi ve veri kaybı kapatılmalı. Ardından Faz 1–2'de ortak çekirdek kurulmalı: route fabrikası, oturum modeli, puan defteri, veri durumu katmanı, tasarım token'ları, navigasyon kaydı, iş omurgası, AI geçidi. Bilgi mimarisi 198 rotadan yaklaşık **105 birincil yüzeye** ancak bu çekirdeğin üzerine indirilmeli (Faz 3). Oyun portföyü ve deneyim derinliği (Faz 4) en sona kalmalı. An Motoru bu sıranın dışında, Faz 1 ile paralel yürür (§5.3).

### 1.2 Sağlık puanları

**Bütünleşik sistem sağlık puanı: 4,0 / 10.** Üç panelin ortalaması 3,87, 13 sistem boyutunun ortalaması 4,31. Doğrulanmış kritik açıkların ağırlığı nedeniyle sonuç aşağı yuvarlandı.

**Panel puanları**

| Panel | Sayfa | Sayfa ort. | Sağlık | Özellik | Bozuk+sahte | Karar dağılımı | Kaynak |
|---|---|---|---|---|---|---|---|
| Müşteri (tüketici + public + auth + oyunlar) | 80 | 4,48 | **4,2** | ~3.390 | ~360 (%11) | 40 yeniden tasarla · 20 birleştir · 13 koru · 7 yeniden inşa | `musteri/00-OZET.md` |
| Bayi / İşletme (+ personel) | 45 | 4,14 | **3,6** | 1.864 | 218 (%11,7) | 25 yeniden tasarla · 14 birleştir · 4 yeniden inşa · 1 kaldır · 1 koru | `bayi/00-OZET.md` |
| Admin / Platform | 73 | 4,10 | **3,8** | 3.004 | 337 (%11,2) | 39 yeniden tasarla · 18 birleştir · 8 yeniden inşa · 7 koru · 1 kaldır | `admin/00-OZET.md` |
| **Toplam** | **198** | — | **3,87** | **~8.260** | **~915** | | |

**Sistem boyutu puanları**

| Boyut | Puan | Tek cümlelik teşhis | Kaynak |
|---|---|---|---|
| Güvenlik — admin API, auth, cron | 5,5 | Dış kabuk sağlam, içerideki aktöre karşı zayıf: dekoratif kapı, oturum iptali yok, 2FA atlanıyor | `sistem/guvenlik-admin-api.md` |
| API mimarisi | 5,0 | Doğru araçlar yazılmış ama isteğe bağlı bırakılmış: 80 route `getServerSession`, 103 route try/catch'siz, Sentry'ye 6 route raporluyor | `sistem/mimari-api.md` |
| Veri modeli | 5,0 | Sıcak yollar olgun. Cascade refleksi, defter yok, `db push` ile 4 göç, Float para | `sistem/veri-modeli.md` |
| Tasarım sistemi | 4,5 | Token'lar var ama kullanılmıyor: 0 durum token'ı kullanımı, ~2.500 ham renk, 5 katmanlı tema | `sistem/tasarim-sistemi.md` |
| Arka plan sistemleri | 4,5 | Parçalar özenli, omurga yok: iş kaydı, kalıcı kuyruk ve alarm yok, yedekler public kovada | `sistem/arka-plan-sistemleri.md` |
| Mobil / erişilebilirlik / i18n | 4,5 | Kabuk bilinçli yazılmış, sayfa katmanı zayıf. i18n %26'da kalmış, kontrast AA altında | `sistem/mobil-erisilebilirlik-i18n.md` |
| Güvenlik — müşteri API | 4,0 | Çekirdek ekonomi sağlam, çevre uçlarda rozet self-award ve IDOR | `sistem/guvenlik-musteri-api.md` |
| Performans | 4,0 | Sunucu sıcak yolları iyi, varlık ve istemci paketi kontrolsüz: 358 MB precache, 3,4 MB avatar SVG | `sistem/performans.md` |
| Bilgi mimarisi / navigasyon | 4,0 | Menü 7 elle tutulan listede, 14 menü dışı sayfa, kopya kümeler, admin'de 68 düz öğe | `sistem/bilgi-mimarisi-navigasyon.md` |
| Oyun ekosistemi | 4,0 | İskelet sağlam, ödül istemci beyanına dayanıyor, portföy tekrarlı | `sistem/oyun-ekosistemi.md` |
| Oyunlaştırma ekonomisi | 4,0 | 23 kaynak, 6 harcama yolu, tek defter yok, yapısal hiperenflasyon | `sistem/oyunlastirma-ekonomi.md` |
| Güvenlik — bayi API | 3,5 | Hesap ele geçirme + sınırsız puan basma + kiracılar arası CLV | `sistem/guvenlik-bayi-api.md` |
| AI özellikleri | 3,5 | Kiracı sızıntısı, kalıcı prompt enjeksiyonu, LLM'e uydurtulan KPI'lar, parçalı bütçe | `sistem/ai-ozellikleri.md` |
| **Ortalama** | **4,31** | | |

---

## 2. HEMEN düzeltilecekler (P0)

Bu bölüm üç panel ve 13 sistem raporundaki P0'ların **tekilleştirilmiş ana listesidir**. Aynı açık birden çok raporda geçiyorsa tek maddede birleştirildi ve bütün kaynakları anıldı. Her maddede kanıt, etki, uygulama yaklaşımı ve bağlı epik (§5) var. **Toplam 40 P0.**

İşaretler: **✔** = bu sentezde dosyadan yeniden okundu · **[ŞEMA]** = canlı Neon'da şema değişikliği gerekir (onaylı pencere, §8) · **[VERİ]** = geçmiş etkinin salt okunur sorguyla ölçülmesi gerekir (yalnızca onayla).

### 2.1 Kimlik, oturum, yetki (12)

| # | Açık | Kanıt | Etki | Yaklaşım | Epik |
|---|---|---|---|---|---|
| P0-01 | **Admin gizli kapısı dekoratif.** API'de hiç uygulanmıyor, edge'de HMAC doğrulamıyor, cevap API'den düz metin dönüyor, varsayılan cevap kaynakta | `proxy.ts:105-120` (`/api/*` doğrudan `NextResponse.next()`) ✔; `proxy.ts:79` (kapı yalnız `/admin` sayfa önekinde) ✔; `lib/admin-gate-edge.ts:14-22` (yalnız `userId.<64 hex>` biçimi) ✔; `app/api/admin/settings/admin-gate/route.ts:19-26` (GET `answer` döndürüyor) ✔; `lib/admin-gate.ts:20` (`answer: '7'`) ✔ | Rolü ADMIN yapılmış ama cevabı bilmeyen hesap cevabı okuyabilir, PUT ile değiştirip gerçek adminleri dışarıda bırakabilir ve bütün `/api/admin/*` uçlarını kullanabilir. `document.cookie` ile sahte cookie yazılarak sayfa kapısı da geçilebilir. 20'den fazla sayfa raporu bunu bağımsız olarak buldu | Edge'de Web Crypto ile asenkron HMAC + `exp` + `cfgVer` doğrulaması. API ile aynı isomorphic fonksiyon (`lib/admin-elevation.ts`). `requireAuth(['ADMIN'])` içinde zorunlu kapı (team uçları muaf). GET cevabı döndürmesin, cevap hash'li ve yalnız yazılabilir olsun. Kümülatif kilitleme + `ADMIN_GATE_FAILED` audit + "tüm kapı oturumlarını sonlandır". **Kapı deneyimi korunur** (proje sahibinin tasarımı), ancak tek rakamlı cevap 10 olasılıklı olduğu için gerçek koruma TOTP/passkey step-up ile gelir (F1.2) | F0.3 |
| P0-02 | **Giriş yönlendirmesinde açık yönlendirme + `javascript:` DOM XSS** | `app/(auth)/auth/login/page.tsx:67,125-126` (ham `callbackUrl` → `window.location.href`); `lib/safe-callback-url.ts:13` (`startsWith('/') && !startsWith('//')`, `/\evil.com` geçiyor) ✔; `app/(auth)/auth/complete/page.tsx:24-25,44`; `app/api/auth/forgot-password/route.ts:70-73`, `magic-link/route.ts:75-77` (zararlı URL gerçek e-postaya gömülüyor); CSP `unsafe-inline` (`next.config.js:347`) ✔ | Gerçek Qratex sıfırlama ve magic link e-postaları oltalama aracına dönüşüyor | Tek `resolvePostLoginTarget(raw, role, origin)`: `new URL(raw, origin)` ile köken karşılaştırması; `\`, kontrol karakteri ve `javascript:` reddi. Bütün yollar ve NextAuth `callbacks.redirect` bunu kullansın. Birim testleri | F0.2 |
| P0-03 | **Üretim giriş ekranında ADMIN demo hesabı ve şifresi** | `app/(auth)/auth/login/page.tsx:35-45` (`admin@qratex.com` / `Admin123!`), `:285-300` koşulsuz render ✔ | Canlı DB'de şifre hâlâ geçerliyse (doğrulanmadı) herkes tek tıkla admin rolü alır. Kapı (P0-01) zaten dekoratif | Demo bloğu `NEXT_PUBLIC_DEMO_MODE` bayrağının arkasına. `authorize` üretimde demo e-postalarını reddetsin. Canlıdaki demo hesapların şifreleri onayla döndürülsün **[VERİ]** | F0.2 |
| P0-04 | **Personel ekleme ile hesap ele geçirme** | `app/api/dealer/staff/route.ts:83-103` (kayıtlı e-postada `password` ve `role:'STAFF'` koşulsuz yazılıyor) ✔; `lib/validations.ts:39` (DEALER kaydı herkese açık) | Herhangi bir müşteri hesabı ele geçirilebilir. Bayi ve admin hesapları STAFF'a düşürülebilir | Var olan kullanıcıya yazma dalı **hemen kaldırılsın**, 409 "davet akışıyla ekleyin" dönsün. Kalıcı çözüm: `StaffInvitation` (e-posta onayı), ADMIN/DEALER dönüştürülemez, şifreyi bayi belirleyemez | F0.4 → F1.2 |
| P0-05 | **STAFF rolüyle kiracılar arası okuma ve yazma** | `app/api/feedbacks/route.ts:28` (rol listesiz `requireAuth()`), `:43-51` (yalnız CUSTOMER ve DEALER daraltılıyor, STAFF "ADMIN gibi" her şeyi görüyor) ✔, `:77-79` (`user.email`); `app/api/ai/detailed/route.ts:24-37`; `app/api/ai/analyze/route.ts:212,385-390,654-660`; `app/api/ai/learning/route.ts:82-98` | Bayi kendine STAFF hesabı açarak bütün kiracıların yorumlarını, müşteri adlarını ve e-postalarını okuyabilir, başka bayinin AI öğrenme profilini zehirleyebilir | Deny-by-default `resolveDealerScope(session)` / `resolveAiScope(session)`: DEALER kendi id'si, STAFF `getStaffDealerId`, ADMIN açık `dealerId`, bilinmeyen rol 403. `userScopeWhere` ve `dealerScopeWhere` bilinmeyen rolde imkânsız filtre dönsün. Rol × kapsam Jest matrisi | F0.4 |
| P0-06 | **`/api/ai/analyze?action=analyze` IDOR yazma** | `app/api/ai/analyze/route.ts:121-173` (sahiplik yok, metin istemciden) | Müşteri kendi olumsuz yorumunun sentiment ve churn alanlarını "olumlu" yazdırabilir. SLA ve churn sinyalleri bastırılır | Yazma yolu yalnızca id alsın, metni DB'den okusun. DEALER/STAFF/ADMIN için sahiplik kontrolü yapılsın, CUSTOMER bu yolu hiç çağıramasın | F0.4 |
| P0-07 | **Oturum iptali yok** (şifre sıfırlama, rol değişikliği, silme, anonimleştirme, pasif personel) | `lib/auth-email-token.ts:54-63` (yalnız `password` + `consumedAt`) ✔; `lib/auth.ts:212-269` (rol yalnız girişte); `lib/gdpr-core.ts:154-157`; `lib/api-auth.ts:52-80,158-168` (`DealerStaff.isActive` okunmuyor) | Çalınan oturum süresiz yaşar. İşten çıkarılan personel ekip GPS pinglerini okumaya devam eder. Anonimleştirilen kullanıcı 24 saat boyunca profiline yeniden PII yazabilir | **[ŞEMA]** `User.sessionVersion` + JWT `sv` claim. `requireAuth` içinde rol, sv, ban ve isActive kontrolü Redis'te 60 sn TTL ile (token-replay sıcak katman deseni). Sıfırlama, rol değişikliği, silme ve 2FA değişikliğinde sv artırılsın. Yetki kararı token'daki rolden değil DB'deki rolden verilsin | F0.10 → F1.2 |
| P0-08 | **OAuth ile hesap ön-ele geçirme + magic link 2FA atlıyor** | `lib/auth.ts:45,52` `allowDangerousEmailAccountLinking: true` ✔; `lib/auth.ts:316-321` (`events.createUser` saldırganın doğrulanmamış satırını `emailVerified` yapıyor, saldırgan şifresi kalıyor); `lib/auth.ts:89-106` (magic dalı `twoFactorEnabled` okumuyor) | Saldırgan önceden açtığı hesapla kurbanın Google girişine ortak olur. 2FA'lı hesap magic link ile 2FA'sız açılır | Bağlamada doğrulanmamış satırın şifresi null'lansın. JWT'ye `mfa: pending|ok` eklensin, bütün giriş yollarından sonra 2FA ekranı gelsin. ADMIN için 2FA zorunlu. Kalıcı çözüm: dangerous linking kaldırılsın, açık hesap bağlama akışı kurulsun | F0.2 → F1.2 |
| P0-09 | **Kimliksiz ve kapsamsız IDOR'lar** | `app/api/gamification/badges/route.ts:79-87,147-183,286-291` ve `gamification/quests/route.ts:18-21` (oturumsuz `?userId=`); `app/api/customer/reviews/route.ts:29-58` (bayi iç notu, gizli `characterCategory`, `churnRisk` müşteriye gidiyor); `app/api/cards/[token]/route.ts:31-37,64-68` (oturumsuz ad, foto, id); `app/api/leaderboard/route.ts:78` (oturum opsiyonel, `showLeaderboard` yok sayılıyor, `needsReview` sızıyor) | Başka kullanıcının puan, seviye, rozet ve görev profili okunuyor. Kart QR'ı paylaşan kişinin kimliği açılıyor | `?userId=` yalnız `me` ve ADMIN için. Açık müşteri DTO'ları (`include` yerine `select`). Liderlik oturum zorunlu + `leaderboardVisible` + ham `userId`'siz yanıt. Kart ucu sahibi olmayana kimlik döndürmesin | F0.4 |
| P0-10 | **Ekip modülü: fail-open yetki ve kullanıcı tabanı sızıntısı** | `lib/team-access.ts:21` (`user?.adminTeamRole ?? sessionRole` fail-open); `app/api/admin/team/members/route.ts:12-28` (CUSTOMER rolündeki ekip yöneticisi boş `q` ile tüm kullanıcıların ad, e-posta ve rolünü listeliyor, rate limit yok) | Kullanıcı tabanının e-posta listesi dışarı çıkarılabilir. Çıkarılan yönetici bayat JWT ile kendini geri ekleyebilir | `team-access` yalnız DB rolüne baksın. Aday araması davet modeline geçsin, sonuçlar maskelensin, rate limit eklensin | F0.4 |
| P0-11 | **`assignedToId` doğrulanmıyor, atanan kişinin e-postası dönüyor** | `app/api/dealer/action-items/[id]/route.ts:12,51`, `route.ts:88`; `app/api/dealer/incidents/route.ts:28,114,66-68` | Liderlik veya churn uçlarından alınan id'lerle başka kiracıların müşteri e-postaları toplanabilir | Atanan kişi aktif `DealerStaff` olmalı. `...row` yayılımı yerine açık DTO kullanılsın, e-posta maskelensin | F0.4 |
| P0-12 | **CLV platform genelinde, bayi rakip işletme verisini görüyor** | `prisma/schema.prisma:2069-2071` (`CustomerLifetimeValue.userId @unique`, `dealerId` yok) ✔; `lib/clv-core.ts:79-86`; `app/api/dealer/customers/route.ts:43-88`; `dealer/segment-actions/route.ts:49-63` | Bayi (ve personeli) müşterinin rakip işletmelerdeki harcamasını, ziyaretlerini ve trust skorunu görüyor | Acil: bayi uçları `consumption.groupBy` ile `dealerId` kapsamında hesaplasın, global segment ve churn gizlensin. Kalıcı: **[ŞEMA]** `DealerCustomerStats @@unique([dealerId,customerId])` | F0.4 → F2.3 |

### 2.2 Puan ekonomisi: mint ve değişmez ihlalleri (11)

Proje kuralı (`points-economy-invariants`): escrow net-sıfır, atomik tek seferlik kredi, `points_credited` görünürlüğü, fail-closed cron. Aşağıdaki yolların her biri bu kurallardan en az birini deliyor.

| # | Açık | Kanıt | Etki | Yaklaşım | Epik |
|---|---|---|---|---|---|
| P0-13 | **Sınırsız mutlu saat çarpanı + tüketimde görünmez puan basma** | `app/api/happy-hour/route.ts:121-132` (`multiplier || 2.0`, şema yok) ✔; `app/api/dealer/consumptions/route.ts:326-350` (`passivePoints` doğrudan `points: { increment }`, `points_credited` yok, transaction dışında) ✔; `:141-178` (kart-bayi ilişkisi yok) | Bayi, suç ortağı bir müşteriyle dakikada ~250M puan basabilir. Fraud dedektörü görmez | Zod `multiplier ∈ [1,3]`, HH:mm ve gün 0–6. Pasif puan `creditPointsAndXp` + `points_credited{dealer_passive}` ile aynı `$transaction` içinde. Müşteri × bayi × gün tavanı. Mevcut çarpanı > 3 olan kayıtlar raporlansın **[VERİ]** | F0.5 |
| P0-14 | **Rozet self-award: koşulsuz rozet + puan** | `app/api/gamification/progress/route.ts:150-224`: `badgeId` gövdeden alınıyor; yalnız `hiddenUntilEarned` reddediliyor, koşul, `isActive` ve karakter kontrolü yok; `requirement.value || 100` puan ✔. Seed'de `value` 10.000'e kadar (`prisma/seed.ts:164`) | Herhangi bir müşteri gizli olmayan her rozeti kendine verip binlerce puan alabilir | POST handler kaldırılsın (istemci çağıranı yok). Rozet verme tek sunucu servisine (`awardBadge`) taşınsın. Geçmiş `points_credited{category:'badge'}` denetlensin **[VERİ]**. *An Motoru'nun 7 rozet noktasından biri bu uç; bkz. §5.3* | F0.5 |
| P0-15 | **Otomatik ödenen görevler ikinci kez ödeniyor + başarım yarışı** | `lib/visit-missions.ts:105-128`, `lib/achievements.ts:113-172` (`CLAIM_QUEST_REWARD` yazılmıyor); `app/api/gamification/quests/[id]/claim/route.ts:82-101` (yalnız bu audit'e bakıyor); `lib/achievements.ts:92-122` (`completedAt:null` guard'ı yok) | Kullanıcının tetikleyebildiği sistematik çift kredi | **[ŞEMA]** `UserQuest.rewardedAt` + tek `rewardQuestOnce()` (`updateMany({rewardedAt:null})`). Otomatik görevlerde claim düğmesi gizlensin. Geçmiş çift ödemeler ölçülsün **[VERİ]** | F0.5 + F0.10 |
| P0-16 | **Kayıt, davet puanını doğrulamasız ve limitsiz basıyor** | `app/api/auth/register/route.ts:63` (`emailVerified:null`), `:99-146` (anında COMPLETED + 1000/500 puan); modül kapısı (`referral/route.ts:120`) ve ömür/aylık limit (`:164-186`) bu yolda yok; `referral/route.ts:137-190` (karşılıklı A↔B) | Sahte e-postalarla davet çiftliği (tek IP'den günde teorik ~7,2M puan) | Kayıtta `Referral PENDING`, puan yok. Doğrulanmış e-posta ve ilk QR olayında `qualifyReferral()` ile atomik kredi. Limitler, modül kapısı ve ters yön reddi tek serviste | F0.5 |
| P0-17 | **Mini oyunlar: istemci skoru, sınırsız deneme, 409 ile kaybolan oyun, tavansız ödül, belirsiz turnuva** | `app/api/customer/games/[game]/complete/route.ts:15-22,61,81-87`; `start/route.ts:56-73` (yalnız `completed` kilitli, `active`/`failed` aynı oturumla `canPlay:true`) ✔; `lib/points-caps.ts:12-14` (yalnız feedback); `app/api/customer/tournament/route.ts:28-39` (eşitlik kırıcı yok); `components/customer/pacman-game.tsx:307-343` (stale closure, meşru oyuncu ödül alamıyor); `pacman/complete/route.ts:45-54` (`gameType` kontrolü yok) | Günde ~3.250 oyun puanı (geri bildirim tavanının 6,5 katı). Turnuvada haftalık 19.000 puanlık havuz keyfi dağılıyor. Dürüst kaybeden oyuncu 409 görüyor | Faz 0: `failed` = oynandı sayılsın, yarım deneme süre aşımında `failed`. Oyun kategorisine günlük tavan (`capGamePoints`). Turnuvada `(score desc, completedAt asc)` + `minParticipants` + tek öne çıkan oyun. Pacman hotfix + `gameType`. Sunucu otoritesi Faz 4'te (§7) | F0.5 → F4.1 |
| P0-18 | **Offline-sync tüketimi doğrulamasız ve tekrar oynatılabilir yazıyor** | `app/api/dealer/offline-sync/route.ts:101-149` (status kontrolü yok, payload gövdeden), `:200-225` (`parseFloat`, sınır yok, audit yok), `:234-251` (BLOCKED kart dahil müşteri e-postası) | Aynı kuyruk id'siyle sınırsız tüketim. Harcama ve ziyaret sayıları ile rozet ilerlemesi şişer | PATCH yalnız id listesi alsın, payload DB'den okunsun, `status`/`retries` koşuluyla atomik claim yapılsın. Canlı uçla ortak `ConsumptionService.create()` + `clientOpId` idempotency. `SCAN_CARD` kaldırılsın | F0.5 |
| P0-19 | **Admin ve otomasyon defter dışı puan basıyor** | `app/api/admin/users/route.ts:43-48,399-405` (sınırsız, negatif bakiye, `points_credited` yok); `app/api/admin/surprise-box/send/route.ts:12,65-72,86-101` (tavan ve audit yok, 500 alıcı); `automation/execute/route.ts:41-55` (Execute Now onayı atlıyor) | İz bırakmadan sınırsız mint; eksi bakiye | Tek `adjustPointsByAdmin` (`creditPointsAndXp`/`debitPoints` + `points_credited` + gerekçe + tavan + eşik üstü ikinci onay). Otomasyonda yalnız kayıtlı ve onaylı kural çalışsın, oluşturan ile onaylayan ayrı kişi olsun | F0.5 |
| P0-20 | **Klan escrow'u yok olabiliyor** | `app/api/admin/squads/battles/[id]/route.ts:95-97` (admin iptali hard delete, iade yok); `app/api/customer/squads/[id]/leave/route.ts:39-43` + `schema.prisma:464-465` (kurucu ayrılınca klan ve açık savaş cascade) | Oyuncu puanı kalıcı olarak kaybolur, net-sıfır kuralı çiğnenir | `cancelSquadBattle` / `dissolveSquad` durum makinesi: iade, `paidOutAt` idempotency, soft-cancel, audit. Kurucuya sahiplik devri | F0.5 |
| P0-21 | **Sezon bonusu tavansız, BIRTHDAY herkese uygulanıyor, puan matrisi sınırsız** | `app/api/dealer/consumptions/route.ts:323-349`; `app/api/admin/seasonal-campaigns/route.ts:20` (bonus 100.000'e kadar); `lib/seasonal-campaign-live.ts:29-33` | İşbirlikçi bayi saatte milyonlarca puan basabilir | Çarpan şelalesine toplam tavan (≤ 4). BIRTHDAY ve ANNIVERSARY için `userId` uygunluğu. Matrise alan bazlı üst sınır şeması | F0.5 |
| P0-22 | **Telafi bütünlüğü** | `app/api/customer/remedy/[offerId]/route.ts:15-18,150-190` (seçim allowlist'e karşı doğrulanmıyor); `app/api/dealer/feedbacks/[id]/remedy/route.ts:25,61-71` (500+ karakterde onay kuyruğu atlanıyor); `lib/churn-intervention-core.ts:88-110` + `customer/innovation/nearby/route.ts:35-86` (kişisel flash teklif herkese açık) | Kasada sahte "%100 indirim" ekranı. Onaysız teklif müşteriye gider. Marj kaybı | Geçersiz gövdede 400. Açık teklif varsa 409 + kısmi unique. Kabulde seçim allowlist'i + değer snapshot'ı. Flash teklif `targetUserId`'ye bağlansın | F0.5 |
| P0-23 | **Silinip yeniden kazanılan ödüller ve geri alınamaz hediye** | `app/api/admin/feedbacks/route.ts:361-364` (tüketim yorumu hard delete, aynı tüketime yeniden puanlı yorum); `character-test` reset → rozet ödülü tekrar; `app/api/customer/shop/gift/route.ts:67-76` (alıcı isimle, `orderBy`'sız `findFirst`) | Tekrarlanabilir kredi; puan yanlış kişiye gider | Yorum soft-delete + kredi kaydına bağlı tekrar koruması. `character-test` üretimde kapalı + allowlist. Hediyede `recipientUserId` + önizleme | F0.5 |

### 2.3 Kalıcı veri kaybı ve canlı veri bozulması (7)

| # | Açık | Kanıt | Etki | Yaklaşım | Epik |
|---|---|---|---|---|---|
| P0-24 | **QR silme müşteri içeriğini cascade ile yok ediyor** | `prisma/schema.prisma:834` (`Feedback.qrCode onDelete: Cascade`) ✔; `app/api/qr-codes/[id]/route.ts:123-128`; `qr-codes/bulk/route.ts:40-42` (1000'e kadar, audit ve replay korumasız); `lib/plan-limits.ts:74` | Tek tıkla yüzlerce yorum, AI analizi ve telafi geri dönüşsüz kaybolur (itibar manipülasyonu) | Önce kod: silme uçları `isActive=false` + `revokedAt` (arşiv); toplu silme kaldırılsın; kota arşivi de saysın. Sonra **[ŞEMA]** `archivedAt` + `onDelete: Restrict` | F0.6 → F0.10 |
| P0-25 | **Kullanıcı silme denetim izini siliyor** | `prisma/schema.prisma:1118` (`AuditLog.user onDelete: Cascade`) ✔; `app/api/admin/users/route.ts:676`, `bulk/route.ts:79`, `app/api/user/delete-account/route.ts:32-39` | 5651 / KVKK hesap verebilirliği çöker. Bayi silinince QR'lar ve diğer müşterilerin yorumları da gider | Silme `anonymizeUser`'a yönlendirilsin, hard delete yerine askıya alma. **[ŞEMA]** `AuditLog.userId` nullable + `SetNull` + aktör snapshot'ı | F0.6 → F0.10 |
| P0-26 | **Rozet, ödül, plan ve kart silme yıkıcı** | `app/api/gamification/badges/[id]/route.ts:127` + `schema.prisma:638`; `gamification/rewards/[id]/route.ts:118` + `:708`; `app/admin/pricing/page.tsx:426` + `api/admin/pricing/route.ts:157-160`; `app/api/admin/cards/[id]/unassign/route.ts:46-61` (BLOCKED kart UNUSED'a dönüp yeniden aktive edilebiliyor) | Müşterinin puanla aldığı kupon kodları kaybolur. Aboneler ücretsiz kademeye düşer. Çalıntı kart yeniden bağlanabilir | Varsayılan arşiv; kazanım ya da abone varsa 409 + etki önizlemeli `ConfirmAction`. Kart yaşam döngüsü durum makinesi (unassign yalnız ACTIVATED kartta) | F0.6 |
| P0-27 | **Demo/bootstrap araçları canlı veriye yazıyor** | `app/api/admin/bootstrap/route.ts:449-488` (gerçek feedback'lere sahte AI sinyali, analiz kuyruğunu boşaltıyor), `:237-279` (bütün bayilerin kategorisini null yapıyor), `:289-334,357-370` (gerçek müşterileri `flagged` yapıyor); `app/api/admin/innovation/demo-package/route.ts:53-94` (müşteriye görünen flash teklif); `lib/demo-cafes-seed.ts:102-158` (`Demo123!` şifreli doğrulanmış hesaplar) | Churn ve NBA değerleri kirlenir; müşteri sahte sektör ve teklif görür; bilinen şifreli bayi hesapları | Üretimde `ALLOW_DEMO_SEED` yoksa 403. Demo yalnız `isDemo` sentetik varlıklara yazsın, müşteri sorgularında merkezi filtreyle dışlansın. `dryRun` + tipli onay + audit. Mevcut kirli kayıtlar için onaylı temizlik betiği **[VERİ]** | F0.6 |
| P0-28 | **"Yükleme hatası, ardından Kaydet" canlı ayarları eziyor** | Admin: points-matrix `page.tsx:192-221,414`, league-settings `:19-58`, discovery `:132,146-147,418`, settings `settings-client.tsx:349-366,555`, `lib/character-thresholds.ts:65-70`, menu-groups `:38-53`. Bayi: `app/dealer/settings/page.tsx:71-87,121-123,164-181`, `app/dealer/ai-settings/page.tsx:145-149,168` | Geçici bir Neon hatasından sonraki tek Kaydet; puan matrisini, lig kurallarını, 21 sistem ayarını, işletme adını ve konumunu ya da özel AI promptunu sessizce varsayılana çevirir | `idle → loading → ready | error` durum makinesi; `ready` olmadan form render edilmesin. İstemci varsayılan kopyaları silinsin. Sunucuda `baseVersion` → 409 (F1.4'te kalıcı) | F0.6 |
| P0-29 | **Faturalama: çift Stripe aboneliği** | `lib/billing-core.ts:51-78,117-126` | Bayi iki kez ücretlendirilir; eski aboneliğin olayları planı geri yazar | Aktif abonelikte `subscriptions.update`. **[ŞEMA]** `StripeEvent` tekilliği + sıra koruması | F0.8 |
| P0-30 | **Veritabanı yedekleri uygulama kovasına, tahmin edilebilir adla, şifresiz** | `scripts/db-backup.mjs:40` (`backups/db/` öneki), `:196-206` (uygulamanın `R2_BUCKET`'ı) ✔; `scripts/db-backup-json.mjs:36,72,131-134`; `lib/r2-storage.ts:8,49-58` (aynı kova `R2_PUBLIC_URL` ile herkese açık sunuluyor) | Kova public ise tam DB dökümü (hash'ler, PII, sırlar) indirilebilir. **Canlıda public erişim doğrulanmadı** | Hemen R2 panelinden `backups/` öneki denetlensin; erişim açıksa nesneler silinsin ve sırlar döndürülsün. Ayrı, private, Object Lock'lu kova + yalnız yazma yetkili token. İstemci tarafında şifreleme (age/AES-GCM). Betikler `BACKUP_R2_*` olmadan fail etsin | F0.9 |

### 2.4 Gizlilik, KVKK ve AI yönetişimi (5)

| # | Açık | Kanıt | Etki | Yaklaşım | Epik |
|---|---|---|---|---|---|
| P0-31 | **Çerez rızası uygulanmıyor; giriş token'ları PostHog'a gidiyor** | `components/layout/cookie-consent-banner.tsx:31-39` (`optionalRejected` hiç okunmuyor), `:18-21` (tercih geri alınamıyor); `components/analytics/posthog-provider.tsx:18-25` (autocapture + session replay rızasız), `:37-41` (`$current_url` reset ve magic token'ı ile); `app/layout.tsx:170` | KVKK m.5/m.7 ihlali; 60 dakika geçerli sıfırlama token'ı üçüncü tarafta | `lib/consent` (`useConsent` + sürüm). PostHog `opt_out_capturing_by_default`; analitik ve replay ayrı kategoriler; `before_send` ile `token`/`code` redaksiyonu; `/auth/*` için replay kapalı; sayfada `history.replaceState`. Footer ve Ayarlar'dan açılan tercih merkezi | F0.7 |
| P0-32 | **"AI kapalı" ayarı cron tarafından atlatılıyor; otomatik yanıt idempotent değil** | `app/api/cron/ai-retry/route.ts:36-46,65`; `lib/inngest/feedback-analyze-pipeline.ts:30-36,56-63,136`; `lib/auto-reply-engine.ts:55-114` (`dealerRepliedAt` kontrolü yok) | AI'ı kapatan bayinin müşteri metni her gece LLM sağlayıcısına gider (sözleşme ihlali). Bayinin elle yazdığı yanıt ezilir, müşteri ikinci e-postayı alır | Pipeline başında `shouldAnalyze` kapısı; kapalı bayi cron sorgusundan dışlansın. `aiAttempts` sayacı. Yan etkiler `updateMany … WHERE dealerRepliedAt IS NULL` ile atomik | F0.7 |
| P0-33 | **Kalıcı prompt enjeksiyonu ve kiracılar arası prompt kirlenmesi** | `lib/ai-learning.ts:484-649` (bütün kiracıların ham metinleri, işletme adları ve `customPrompt`'ları), `:762-833` (LLM'in yazdığı `chatSystemPrompt` onaysız kaydediliyor); `lib/ai-engine.ts:876-903` (bu prompt güvenlik kurallarını içeren temel promptun **yerine** geçiyor) | Müşteri sohbetinin gizlilik korumaları devreden çıkar; bir kiracının içeriği diğerinin sistem promptuna sızar | Temel prompt kodda sabit ve sürümlü kalsın; öğrenilen kurallar yalnız sınırlı "ek bağlam" olsun. Sistem öğrenmesi POST'u geçici olarak kapatılsın. Kalıcı çözüm F1.8 / F2.4 (anonim toplulaştırma + admin diff onayı) | F0.7 |
| P0-34 | **KVKK DSR akışı kâğıt üzerinde** | `app/api/admin/privacy-requests/[id]/route.ts:35-46,85-91` ("Tamamlandı" silmeyi yürütmeden kapatıyor, audit yok); `lib/gdpr-core.ts:48-78,117-160` (QRA sohbet kayıtları silme, dışa aktarma ve saklama kapsamı dışında); `privacy-request` ucu keyfi adrese sınırsız e-posta | Yasal yükümlülük yerine getirilmiyor ama ekran "tamamlandı" diyor | `completed` yalnız yürütme kanıtıyla. `recordDsrEvent`. `PII_REGISTRY` (qraChatLog, PushSubscription, AuditLog.newData) + şema tarama testi. Override kaldırılsın + 3/gün limit | F0.7 → F2.8 |
| P0-35 | **Müşteriye dönük içerik güvenliği** | `lib/notify-email.ts:79,113,116` + `lib/weekly-digest-core.ts:81-92` (kaçışsız HTML; bayi adı ve LLM çıktısı); `app/api/dealer/voc-wall/route.ts:40-41,133` (mağaza TV'sinde toksik yorumlar tam adla); `app/api/dealer/campaigns/[id]/send/route.ts:96-127` + `lib/notification-prefs.ts:49-53` (kampanyalar müşterinin kapattığı bildirim tercihini yok sayıyor; win-back ve segment önerileri de aynı) | Qratex markalı e-postada oltalama bağlantısı. KVKK ve İYS ihlali; itibar riski | `escapeEmailHtml` her yerde. VoC duvarında toksik, güven ve fraud filtresi + isim maskeleme. Gönderim öncesi `isChannelEnabled` + `data.kind` filtresi; sahte "e-posta kanalı" devre dışı. Kalıcı çözüm `MarketingMessenger` (F2.6) | F0.7 |

### 2.5 Ana akışı ya da platformu kıran hatalar (5)

| # | Hata | Kanıt | Yaklaşım | Epik |
|---|---|---|---|---|
| P0-36 | **Kamera taraması üretimde kapalı** (kasa ve müşteri tarama) + düzeltilince istek fırtınası | `next.config.js:340` ve `proxy.ts:17` `camera=()` ✔; `app/dealer/scan/page.tsx:171-186,214-217` (geri çağrı bayat state'e bağlı) | Tarama rotalarında `camera=(self)`. Aynı PR'da ortak `useQrScanner` (ref kilidi, pause, idempotent async teardown; `app/customer/scan/page.tsx:126-129` cleanup istisnası) | F0.8 |
| P0-37 | **PWA, public klasörünün tamamını (~358 MB, 1.213 giriş) herkese ön belleğe alıyor** | `next.config.js:3-10` (`publicExcludes`/`buildExcludes` yok) ✔; canlı `sw.js` ölçümü `sistem/performans.md` K1; push SW'si PWA SW'siyle aynı scope'ta çakışıyor | `publicExcludes` (`!images/**`, `!videos/**`, `!mascot/**`) + `buildExcludes`. QR hunisinde SW kaydı yok. Push dinleyicisi tek SW'ye (F1.7) | F0.8 |
| P0-38 | **Global `.animate-in` bütün Radix overlay açılışlarını eziyor; koyu temada hata metni okunmuyor** | `app/globals.css:603-605` ✔ (tailwindcss-animate'in aynı adlı sınıfını eziyor; derlenmiş CSS'te doğrulandı); koyu `--destructive` 1,93:1 (`globals.css:66`) | Sınıf `qx-enter` olarak yeniden adlandırılsın, `AdminPremiumHero` güncellensin. Koyu `--danger-text` token'ı ≥ 4,5:1 | F0.8 |
| P0-39 | **Çöken/kullanılamayan sayfalar** | Admin: form render içinde tanımlı, her tuşta odak kayıp (`app/admin/{pages:150,pricing:230,quests:264,rewards:235}/page.tsx`); görev oluşturma 500 (`app/admin/quests/page.tsx:293-296` ↔ `lib/validations.ts:167,178`); tek STAFF `/admin/users`'ı çökertiyor (`users-client.tsx:150-154`); **boş Site URL bütün siteyi çökertiyor** (`app/api/admin/seo/route.ts:91-99`, `app/layout.tsx:49,65`); görsel yükleme salt-okunur FS'e (`app/api/admin/assets/upload/route.ts:81-85`). Müşteri: kampanya listesi her zaman boş (`app/customer/campaigns/page.tsx:51` ↔ `app/api/happy-hour/route.ts:94-101`); kart QR'ı mobilde kırpılıyor (`app/customer/my-card/page.tsx:174,235`); AI öneriler sekmesi çöküyor ve LLM ucu sınırsız (`app/api/customer/ai-recommendations/route.ts:48-58`); kayıt sonrası doğrulama ekranı ölü kod ve yeniden gönderim ucu yok (`app/api/auth/register/route.ts:161-167`). Bayi: segment aksiyonlarının 4/5 butonu 400 (`app/dealer/segment-actions/page.tsx:74-81`); boş seçenekli anket yayına giriyor ve doldurma ucu doğrulamıyor (`app/api/surveys/[id]/fill/route.ts:53-56,100-114`) | Sayfa başına ayrık dosyalar, dokuz alt ajana paralel bölünebilir (F0.8 alt görevleri) | F0.8 |
| P0-40 | **Arka plan: Inngest'te ~19 periyodik cron (~1.100 tetikleme/gün) tek-uyanış kuralıyla çelişiyor; günlük orkestratör her zaman 200 dönüyor** | `lib/inngest/functions.ts:24-30` (outbox her 2 dk), `:32-224`; `app/api/inngest/route.ts:233-236`; `app/api/cron/daily/route.ts:14,62-74`. Inngest'in canlıda aktif olup olmadığı **doğrulanmadı** (yerel `.env`'de anahtar yok) | Aktifse Neon'un hiç uyumaması (2026-08 duraklatmasının kök nedeni) sürüyor; değilse ekip bakımı, haftalık özet ve analitik saklama sessizce ölü. Inngest paneli kontrol edilsin; periyodik Inngest cron'ları kaldırılsın, gerekli işler `daily` kaydına taşınsın; alt iş başarısızsa non-2xx | F0.9 |

**Not — P0 dışına alınanlar:** Doğrulamada çürütülenler (negatif çarpanın puan düşürmesi, `shadow_ban` liderlik iddiası, magic link'in hesap açması, "personel metriği manipülasyonu") ve doğrulayıcının önemini düşürdüğü bulgular (inbox CSP atlatması, badges IDOR'un admin varyantı, doğum günü 500 puanlık anlık talep, `experience-share` keyfi metin) P1'e alındı.

---

## 3. Kök nedenler: sistemi "eski ve dağınık" yapan kalıplar

198 sayfa raporundaki bulguların büyük çoğunluğu aşağıdaki 12 kalıba indirgeniyor. **Her kalıp tek merkezde çözülünce onlarca sayfayı birden düzeltir.** Faz planı (§5) bu kök nedenlere göre kesildi.

| # | Kök neden | Belirtisi | Etki alanı | Çözüm (tek merkez) |
|---|---|---|---|---|
| K1 | **Güvenlik araçları isteğe bağlı, varsayılan "izin ver"** | `requireAuth` 248 route'ta ama 80 route `getServerSession`'ı doğrudan çağırıyor ve token-replay'i atlıyor (`lib/api-auth.ts:63-77`). Rol listesiz `requireAuth()`. Kapsam yardımcıları bilinmeyen rolde `{}` dönüyor (`lib/api-auth.ts:130-152`). `proxy.ts` API'de hiçbir şey yapmıyor. Modül kapısı 45 anahtarın ~10'unda. Rate limit müşteri uçlarının 4/81'inde. `createApiRoute` 1 route'ta | P0-01, -05, -06, -09, -10, -11; bütün paneller | `defineRoute` / `secureRoute` fabrikası: deny-by-default rol, kiracı bağlamı, zod, rate limit, modül, idempotency, audit, merkezi hata. ESLint ile `app/api/**` altında `getServerSession` yasak (F1.1) |
| K2 | **Tek "mint kapısı" ve kalıcı puan defteri yok** | 23 puan kaynağı, 6 harcama yolu. Her route `creditPointsAndXp`'yi kendi bağlamıyla çağırıyor ya da ham `increment` yapıyor. Tek iz `AnalyticsEvent(points_credited)` ve o da 90 günde siliniyor (`lib/analytics-event-retention.ts:9`). `points_spent` hiç yazılmıyor. Fraud motoru (`lib/fraud/engine.ts`) hiç çağrılmıyor | P0-13…23; 15+ sayfada uydurma "kazanılan puan" | `PointsLedger` + `lib/economy` (`grant/spend/reverse/adjust`): politika, tavan, fraud kapısı, `@@unique([source,sourceRef,currency])` tek-kez garantisi, An Motoru kancası. Doğrudan `user.update({points})` lint ile yasak (F1.3) |
| K3 | **İstemci otoriter tasarım** | Oyun skoru ve `won` istemciden. Admin override istemciye ulaşmıyor (20/20 oyun registry `DEF` kullanıyor). Ayar formları istemci varsayılanıyla başlıyor. Telafi seçimi istemciden | P0-17, -22, -28 | Sunucu otoritesi: kazanma ve eşik kararı sunucuda, ayar varsayılanı GET'ten, seçim allowlist'i. Oyunlarda deneme API'si + doğrulama (F4.1) |
| K4 | **Yazılan ama okunmayan kontroller ("sahte kontrol düzlemi")** | `FeatureFlag`'i hiçbir kod okumuyor. 42 modülün 15'i uygulanmıyor. Admin AI ayarlarının 14/16'sı, bayi AI ayarlarının 16'sı, sistem ayarlarının 16'sı ölü. Bakım/Kayıt/Google anahtarları hiçbir şey yapmıyor. Bayi bildirim sekmesi `setTimeout` ile sahte başarı gösteriyor | admin settings, ai-settings, modules, features, gamification-settings, dealer settings | `lib/settings/registry.ts`: her anahtar için `{key, zod, reader, ownerPage, scope, dangerLevel}`. CI okuyucusuz anahtarı yakalasın. UI'da "Etkisi: API / UI / yok" rozeti. Kural: **"tüketicisi yoksa ayar yok"** (F2.1) |
| K5 | **Hata = boş durum** | ~100 sayfada `res.ok` kontrol edilmiyor. 573 ham `fetch`, React Query yalnız 10–16 dosyada. Sunucuda 19 dosya hata durumunda `200 + sıfırlar` dönüyor (`app/api/dealer/stats/route.ts:465-501`). AbortController yok, yarış koşulları var | Üç panelde ~100 sayfa | Zarf v2 + `api-client`/`fetchJson` (`ApiError`) + tek `<QueryState>` (loading / error / empty / forbidden / moduleDisabled / stale). Sahte başarı fallback'leri 503 DEGRADED olsun (F1.1, F1.4) |
| K6 | **Aynı kavramın birden çok formülü ve kaynağı** | Seviye: geometrik (`lib/utils.ts:94-106`) ve üç doğrusal kopya. Seri: 4–5 kaynak. Bayi sağlık skoru: 3 motor, 3 eşik. Müşteri segmenti: 4 tanım. Lig: 3 varsayılan. Fiyat: landing sabiti + DB + Stripe. API anahtarı: 2 sistem. Kupon: 3 kavram. Navigasyon: 7 elle tutulan liste. DSR kuyruğu: 2 kopya | Çelişen sayılar, kayan menüler | Tek-kaynak alan modülleri (`lib/leveling`, `lib/streak`, `lib/reviews/corpus`, `lib/business-ranking`, `lib/dealer-health`, `lib/segments`, `lib/navigation/registry`) + birim testleri (F2.2, F1.6) |
| K7 | **Silme bir refleks, şema bir yan ürün** | `onDelete: Cascade` varsayılan. `archivedAt` deseni tutarsız. Şema `db push` ile canlıya uygulanıyor, yalnız 4 göç var, `User` tablosunu oluşturan göç bile yok. Para alanları Float | P0-24…26; KVKK izi | Kayıt-sistemi tablolarında `Restrict`/`SetNull` + snapshot; arşiv varsayılanı; baseline göçü + `migrate deploy`; Neon dev branch (F0.1, F0.10) |
| K8 | **Demo ile üretim ayrılmamış** | Bootstrap uçları, demo kafe seed'i, giriş ekranındaki demo hesaplar, innovation demo paketi, landing'deki "Bize güvenen işletmeler" DEMO şeridi, SSR'daki 10K+/1M+ yedek sayılar | P0-03, -27; sahte sosyal kanıt | `isDemo` varlık modeli + merkezi filtre; ortam bayrağı; sahte sosyal kanıtın kaldırılması (F0.6, F3.4) |
| K9 | **"Bakınca üret" ve "LLM'e sayı uydurt"** | GET istekleri AI görevi, olay ve rapor üretiyor (action-items, incidents, ai-insights, operations-brief). NPS/CSAT/CES, korelasyon ve tahmini puan LLM'e uydurtuluyor. Haftalık/aylık seçimi veriyi değiştirmiyor | Bayi AI yüzeyleri, admin AI dashboard | "Sayıyı kod hesaplar, LLM anlatır". "Önce oku, sonra üret": kalıcı rapor tablosu, üretim cron/olay/cooldown'lu yenileme. Tek `aiCall` geçidi (F1.8, F2.4) |
| K10 | **Zaman sunucu UTC'sinde** | Mutlu saat 3 saat kayık, ısı haritası 1 gün + 3 saat kayık, oyun günü, doğum günü, ekip bitiş tarihleri, `isOpenNow`, audit filtreleri UTC | Üç panelde ~25 sayfa | `lib/time/istanbul.ts` (dayKey, hafta/ay sınırı, SQL `AT TIME ZONE`) + `lib/period.ts` (`{range, compare}`, birimli delta) (F1.9) |
| K11 | **Tasarım dili tanımlı ama uygulanmıyor** | success/warning/info token'ları 0 kullanımda, ~2.500 ham renk sınıfı. Token'lar 5 katmandan yazılıyor ve `ThemeController` ile `SeasonalConceptApplier` birbirinin değişkenlerini siliyor. Preset'lerde `primary-foreground` hep beyaz (royalGold 2,10:1). 25+ farklı framer süresi, 89 `repeat: Infinity`. Uygulama içi "animasyonu azalt" ayarı framer'a ulaşmıyor. Hero benimsenmesi admin %71 / bayi %51 / müşteri %29. `EmptyState` 4 dosyada. Üç çelişkili tasarım belgesi var. Admin hero ve `admin-toast` müşteri paneline sızıyor. Inline transform ile framer çakışması 6 oyunda hedefleri kaydırıyor | 198 sayfanın tamamı | QDL v2 (§4.1): 3 katmanlı rol token'ları, `ops`/`play` ifade kayıtları, tek `ThemeController`, `useMotionPolicy`, ortak bileşen kiti, yaşayan rehber + CI (F1.5, F3.5) |
| K12 | **Boş kabuk + istemci fetch; varlık ve paket hattı yok; arka plan omurgası yok** | 152/200 `page.tsx` `'use client'`, sunucuda veri çeken sayfa sayısı 0. Müşteri ana sayfasının soğuk açılışı ~18 API çağrısı. TR+EN sözlükleri (98 KB gzip) her sayfada. 27 arka plan varyantı public sayfalarda. 3,4 MB avatar SVG'ler. JobRun, kalıcı kuyruk, dedupe ve alarm yok. Sentry'ye 6 route raporluyor | Performans, güvenilirlik, gözlemlenebilirlik | Server page + client island, `getShellConfig`, `(funnel)` rota grubu, varlık hattı, `JobRun` + `MessageOutbox`, `onRequestError` (F1.7, F1.11, F3.x) |

**Meta kök neden:** CI'da kalite kapısı yok. İki test paketi önceden kırık (`auth.test.ts` select uyumsuzluğu, `menu-visibility-catalog` eski href seti); menü kopmasını yakalaması gereken `verify:menu` testi de bu yüzden işlevsiz. Yüzey, kapısız bir hatta büyüdü. Faz 0'ın ilk işi bu kapıyı kurmak (F0.1).

---

## 4. Hedef durum

### 4.1 Tek tasarım dili: Qratex Design Language v2 (QDL)

**İlke:** "Mor, cam, parıltı" kimliği korunur ama ölçülebilir kurallara bağlanır. **Operasyon yüzeyleri sakin ve yoğun, ödül ve oyun yüzeyleri ifadeli olur; her temada okunurluk garanti edilir.** Müşteri raporundaki "cüzdan sakin, arena canlı", bayi raporundaki "sakin operasyon kokpiti" ve admin raporundaki "operatör konsolu" önerileri, tasarım sistemi raporundaki iki kayıtlı modelde tek dile indirgenir.

**Token mimarisi (3 katman):** tohum (`brand #7c3aed`, nötr ton, durum tohumları, mod) → rol token'ları (`--brand{,-fg,-text,-subtle,-border}`, `--surface-0..3`, `--text-1..3`, `--border-subtle/strong`, `--{success|warning|danger|info}{,-fg,-text,-subtle,-border}`, `--focus-ring`, `--category-1..8`) → bileşen token'ları. Rol değerleri OKLCH ile **fonksiyonla türetilir**: `*-text` ve `*-fg` ≥ 4,5:1, `border-strong` ≥ 3:1. Tailwind yalnızca rol token'larını açığa çıkarır; panel dizinlerinde ham palet lint uyarısı verir. Erişilebilirlik modları yalnızca rol token'larını yeniden tanımlar.

**İki ifade kaydı** (`data-register` layout'ta):

| | **ops** — admin, bayi, personel, müşteri cüzdan/ayarlar/geçmiş/yasal/auth | **play** — müşteri ana sayfa vurguları, oyunlar, rozet, kutu, seviye/lig anları, Yılım |
|---|---|---|
| Yüzey | `surface-1` düz kart, ince kenarlık, `elevation ≤ 1` | Cam, gradient kenar, `elevation 2/3`, glow |
| Renk | Rol token'ları; marka yalnız vurgu | `--category-*`, marka gradient'leri, `color-scheme: dark` arena alt ağacı |
| Tipografi | h1 28, gövde 14 (müşteride 16), `tabular-nums`, en az 12px | `display` sayılar, Space Grotesk |
| Hareket | `fast`/`base`; sonsuz döngü yok | `celebrate`, spring; `<Ambient>` döngüleri politikaya bağlı ve yalnız görünür alanda |

**Ölçekler:** 4px tabanlı boşluk; radius sm 8 / md 12 / lg 16 / xl 24; elevation 0–3; z-index token'ları (alt bant çakışmasını bitiren `FloatingLayerProvider` ile).

**Tek bileşen katmanı** (`components/ds/`; bugünkü `components/admin/kit`, `components/dealer/kit` ve `components/customer/ui` önerileri bunda birleşir):

| Grup | Bileşenler |
|---|---|
| Kabuk | `PanelShell` (3 layout'taki kopya kabuğun tek hali), `PanelContext`, `MobileTabBar`, `FloatingLayerProvider`, `CommandPalette` |
| Sayfa | `PanelPage`, `PageHeader` (`hero` yalnız ana sayfalarda, diğerleri `compact`), `PageToolbar` / `FilterBar` (URL senkronlu), `SectionTabs` (URL'de durum) |
| Veri | `MetricTile` (`MetricValue` sözleşmesi + `DeltaBadge` + `Sparkline` + n), `DataTable` (TanStack, sunucu sayfalama, toplu işlem), `DetailSheet` (`?id=` derin linki), `StatusBadge` / `SeverityBadge` (ikon + metin, yalnız renge dayanmaz) |
| Durum | `QueryState` (loading / error / empty / forbidden / moduleDisabled / stale) + iskelet presetleri, `PanelErrorBoundary` |
| Form | `Form` (rhf + paylaşılan zod), `Field`, `EntityEditorSheet`, `DirtyBar`, `ConfirmAction` (sunucudan etki önizlemesi + ad yazarak onay + geri al) |
| Erişilebilirlik | `IconButton` (label zorunlu), `RatingInput` (radiogroup), `ChoiceChips`, `PhotoPicker`, `FullscreenModal` |
| play | `PointsChip`, `XpRing`, `StreakFlame`, `RewardProgress`, `BadgeGlyph`, `RarityBadge`, `GlowCard` |

**Yönetişim:** `/admin/design-language` gerçek bileşenleri, token tablosunu (kontrast skoruyla) ve benimsenme metriklerini gösteren yaşayan rehber olur. CI'da şunlar çalışır: token kontrast testi (her preset × açık/koyu), ham palet ve keyfi boyut sayacı, 10 temsilî sayfada Playwright görsel regresyon, `qx-` önek kuralı. `MASTER.md` arşivlenir ve tek sayfalık `DESIGN-LANGUAGE.md` yazılır.

### 4.2 Tek motion dili

**İlke: hareket durum değişikliğini anlatır, dekor değildir.**

| Token | Değer | Kullanım |
|---|---|---|
| `fast` | 120 ms | hover, press, toggle |
| `base` | 200 ms | sheet, dialog, popover, sekme |
| `slow` | 320 ms | sayfa içi geçiş, liste girişi |
| `celebrate` | ≤ 1,2 sn, atlanabilir | puan kapsülü, küçük kutlama |
| `moment` | ≤ 4,5 sn, Esc/dokunuşla geçilir | An Motoru tam ekran sahneleri (seviye, lig), oturum başına kuyruklu |
| Easing | `[0.2, 0, 0, 1]` + tek spring preseti | |

**Kurallar:**
1. **Tek tercih kaynağı:** `useMotionPolicy()` = OS `prefers-reduced-motion` **VEYA** uygulama ayarı (`html.reduce-animations`). Bu kaynak `MotionConfig reducedMotion`, FX katmanı, konfeti, oyun sarsıntısı, ses, titreşim ve video otomatik oynatmayı besler. An Motoru'nun `lib/moments/effects.ts → prefersReducedMotion()` fonksiyonu bu politikanın **tek** uygulaması olmalı (§5.3). Layout init betiği `qratex-a11y`'yi ilk boyamadan önce okumalı.
2. **Konum CSS'te, animasyon framer'da:** konumlandırma framer kullanmayan sarmalayıcıda, `scale` ve `rotate` içteki `Motion` elemanında. Lint kuralı: aynı elemanda `style.transform` + `animate` yasak (bkz. `scroll-scene-traps`).
3. **Stagger bütçesi:** toplam ≤ 0,6 sn, en fazla ilk 12 satır. Yoğun tablolarda stagger yok.
4. **Sonsuz döngü** yalnız `play` kaydında, `<Ambient>` sarmalayıcısıyla, görünürken ve `document.hidden` değilken çalışır. Operasyon yüzeylerinde marquee ve nabız yok. Yükleme iskeleti statik, shimmer yok.
5. **Anlar kayıtlı ve idempotent:** seviye, lig ve rozet kutlamaları An Motoru üzerinden sunucu "görüldü" bayrağıyla tetiklenir. "Her ziyarette konfeti" sınıfındaki hatalar yapısal olarak kapanır.
6. **Paylaşılan öğe geçişi** (`layoutId`, `domMax` yalnız ilgili yüzeyde lazy): kart → "Kasada göster" paneli, ödül → cüzdandaki pass.

**3D / canvas politikası** (üç panel raporunun ortak kararı):

| Yüzey | Teknik |
|---|---|
| Sürpriz kutu açılışı, imza ödül kutusu, karakter rozeti reveal | three.js (mevcut altyapı), `next/dynamic`, statik PNG yedeği |
| An Motoru seviye, lig ve rozet sahneleri | Tek lazy `moment-stage-3d` chunk'ı (spec'teki kurallar) |
| Kartım kart yüzü | CSS 3D tilt (`useMotionValue`). three.js gereksiz. Bugünkü `perspective-[1400px]` Tailwind 3.4'te yok, tilt çalışmıyor |
| Mini oyunlar | 2D canvas, ortak sabit adımlı döngü (`lib/games/engine`) |
| Mağaza ekranı `/wall/[token]` | Düşük GPU profilli canvas/three ortam katmanı + büyük tipografi |
| Admin | 3D yalnız müşterinin gördüğü 3D içeriğin önizlemesinde (rozet test laboratuvarı, kutu önizleme). Operasyon yüzeyleri sade; tek "platform nabzı" canvas şeridi |
| Yasal, ayarlar, hareketler, auth, bayi operasyonu | Animasyonsuz ya da tek giriş. Landing zemini kaldırılır |

### 4.3 Sadeleştirilmiş bilgi mimarisi

**Mimari:** tek navigasyon kaydı `lib/navigation/registry.ts` (`id, role, href, labelKey, icon, group, parent, tab, status: primary|secondary|child|hidden|deprecated, moduleKey, teamOnly, keywords, redirectFrom, entity`). Sidebar, mobil sekme çubuğu, menü kataloğu, Qra site haritası, ⌘K paleti, `next.config.js` yönlendirmeleri, global arama hedefleri ve dosya sistemiyle iki yönlü test bu kayıttan türetilir. Menü **sunucuda** çözülür (`getShellConfig(role, locale)`, cache tag). İstemcide kabuk için istek atılmaz; gizli öğe flaşı ve her açılıştaki 5 önbelleksiz DB sorgusu ortadan kalkar.

**Karar notu:** Panel sentezleri ile sistem IA raporu bazı adlarda ayrışıyordu. Aşağıdaki menüler bağlayıcı karardır ve gerekçesi parantez içinde verilmiştir.

#### Müşteri (58 `/customer` rotası → 5 sekme + profil menüsü; ~18 birincil yüzey)

Mobilde alt sekme çubuğu, masaüstünde aynı hedefler sidebar'ın üst düzeyi:

```
[ Ana Sayfa ]   [ Keşfet ]   ( ◉ TARA )   [ Oyna ]   [ Cüzdan ]        Başlıkta: 🔔  ·  avatar → Ben
```

| Yüzey | Rota | İçerik (birleşenler) |
|---|---|---|
| Ana Sayfa | `/customer` | Bakiye + seviye halkası + "sonraki ödüle X puan", bugünkü seri, günlük 3 hedef, bekleyen aksiyonlar (yorum bekleyen tüketim, açılmamış kutu, hazır ödül, telafi teklifi), lig şeridi, günlük çark. Sunucuda ilk render + tek `/api/customer/home` BFF |
| Tara (merkez FAB) | `/customer/scan` | Tam ekran vizör. Ortak `lib/qr-resolve.ts` (`/c/`, `/feedback/`, düz kod). Kart aktivasyonu |
| Keşfet | `/customer/places` | Sekmeler: Yakınımda (`nearby`) · Kaydettiklerim (`favorites`) · Fırsatlar (`campaigns` + `event` + happy hour + flash teklif) · En iyiler (`category-leaderboard`) |
| Mekân detayı (yeni) | `/customer/places/[dealerId]` | Açık/kapalı, aktif teklif, yol tarifi, o mekândaki geçmiş, favori, "QR okut, puan kazan". `experiences` içeriği (damga kartı, iyileştirme isteği) buraya taşınır. Ölü `?focus=` ve `?dealerId=` derin linklerinin hepsi buraya bağlanır |
| Oyna | `/customer/games` | Oyunlar (tek dinamik `/customer/games/[game]`) · Görevler (`quests`) · Turnuva · Klan (`squads`) · Lig (`leaderboard`) |
| Cüzdan | `/customer/wallet` | Kartım (`my-card` + `lounge` statüsü) · Ödüller (`rewards` + `shop` kozmetik sekmesi) · Ödüllerim (alınan kodlar ve QR pass'ler, telafi kuponları, sürpriz kutular) · Hareketler (puan defteri + `consumptions` + `spending-overview`) · Bağış (`donations`) |
| Ben (profil menüsü) | `/customer/me` | İlerleme (`progress-hub` + `journey-score` + `trends` + `analytics`; Rozetler alt sayfası) · Yılım (`my-year`) · Seslerim (`feedbacks` + journey + `consumptions/[id]` yorum düzenleme + `remedy`; `ai-insights` "Sesin" özet kartına iner) · Davet (`referral`) · Ayarlar (gizlilik sekmesinde çerez tercih merkezi + yasal belgeler) · Ekip (yalnız `teamOnly`) |

*Gerekçe:* "Oyna" sekmesi, oyun ve rekabet döngüsünü cüzdandan ayırır (Duolingo deseni). "Cüzdan" ise kazan → harca → kanıtla döngüsünü tek yerde kapatır (Starbucks/Revolut deseni). Sistem raporundaki "Ödüller" sekmesi Cüzdan'ın içinde yer alır.

#### Bayi (45 rota → 9 blok, ~24 rota)

```
Bugün             /dealer                  dashboard + copilot + operasyon özeti + haftalık rapor + kurulum kartı
Gelen Kutusu [n]  /dealer/inbox            QR + tüketim yorumları · telafi onayı · vakalar · bana atananlar
Müşteriler        /dealer/customers        liste + 360 çekmece · Risk · Segmentler · Geri kazanım
Pazarlama         /dealer/campaigns · /dealer/offers · /dealer/surveys
Analitik          /dealer/analytics (+ /insights · /benchmark · /impact)
AI Asistan        /dealer/assistant        (+ her sayfadan ⌘J çekmece)
İşletme           /dealer/scan · /consumptions · /products · /qr-codes (şubeler) · /team · /voc-wall (+ /wall/[token])
Otomasyon         /dealer/automation/{replies, remedy, alerts}
Ayarlar           /dealer/settings          İşletme · Hesabım · Bildirimler · Güvenlik · AI · Abonelik
```

*Gerekçe:* Bayinin günlük ana işi bugün 5 sayfaya dağılmış durumda. Gelen Kutusu, Medallia/Qualtrics'in kapalı döngü (closed-loop) kavramının karşılığı. Kasa ve Tara başlıkta kalıcı bir buton olarak da durur. Personel paneli `/staff` tek ekran **Bugün** olur (vardiya sayacı, açık görevler, checklist, saha bildirimi); sekmeleri Görevler · Vardiyalar · İzin · Eğitim.

#### Admin (73 rota → 9 alan, ~40 yüzey)

```
Genel Bakış        Komuta Merkezi (/admin + platform-pulse + ecosystem) · Analitik (+ insights)
Müşteriler/Bayiler Kullanıcılar (+ /admin/users/[id] 360) · Bayi Sağlığı (+ playbook) · Segmentler (+ öneriler) · Klanlar (+ savaşlar) · Kartlar · Geri Bildirimler · Davet Programı
Ekonomi/Oyun       Ekonomi Stüdyosu (matris · çarpan ve tavanlar · ligler · simülasyon) · Görevler · Oyunlar · Rozetler (katalog · eşikler · test lab) · Mağaza ve Ödüller
Kampanyalar        Takvim (sezon + konsept) · Sürpriz Kutular · Kuponlar · Keşif ve Sponsorlu · Bağışlar
Yapay Zekâ         AI Operasyon · AI Kalite (+ sohbet kayıtları) · Prompt ve Model Stüdyosu · Ajan Konseyi
Güven ve Uyum      Güven Merkezi (vaka kuyruğu) · Denetim Günlüğü · KVKK (talepler · envanter · saklama)
Platform           Özellik ve Deney Kontrolü · Entegrasyonlar · Fiyatlandırma · Gözlemlenebilirlik · Arka Plan İşleri (yeni, JobRun)
İçerik/Görünüm     SEO · Tasarım Sistemi (yaşayan rehber) · Navigasyon Stüdyosu
Ekip ve İletişim   Ekip (pano · departmanlar · girişimler) · Gelen Kutusu · Stajyer Mailleri
Sistem             Ayarlar (genel · kimlik · güvenlik ve kapı · bakım)
```

Sidebar'da bekleyen sayılar rozet olarak gösterilir (segment önerileri, DSR SLA, açık vakalar, inceleme kuyruğu). ⌘K paleti bütün yüzeylere ve kayıtlara (kullanıcı, bayi, kart token'ı) doğrudan erişim verir. Kapı ekranının menüdeki kamuflajlı etiketi korunur (proje kuralı).

**Sayı özeti:** 198 rota → ~105 birincil yüzey. Diğer rotalar sekmeye dönüşür ya da 301 ile yönlendirilir. Tam liste §6'da, sayfa sayfa eşleme Ek A'da.

### 4.4 Mimari ilkeler (bağlayıcı)

1. **Varsayılan reddet.** Her route `defineRoute({auth, tenant, module, input, rateLimit, idempotent, audit})` ile tanımlanır. Rol listesiz kimlik doğrulama, ham `getServerSession`, şemasız gövde ve kapsamsız `where` CI'da kırmızıdır.
2. **Yetki kararı DB'den.** JWT yalnız kimliği taşır. Rol, `sessionVersion`, ban ve personel aktifliği Redis sıcak katmanında 60 sn TTL ile doğrulanır.
3. **Kiracı her sorguda.** `forTenant(dealerId)` Prisma uzantısı; `Feedback.dealerId` denormalize edilir; çapraz kiracı türetilmiş veri yasak; `DealerCustomerStats`.
4. **Para ve puan yalnız defterden geçer.** `economy.grant/spend/reverse/adjust`; tek-kez garantisi DB unique ile; `CHECK points >= 0`; gece mutabakatı. Para alanlarında Decimal veya kuruş.
5. **Kayıt sistemi asla cascade ile silinmez.** Arşiv, anonimleştirme ve audit snapshot'ı kullanılır. Şema değişikliği yalnız göç dosyasıyla, canlıya yalnız `migrate deploy` ile ve onayla gider.
6. **Sunucu otoriter.** Ödül, eşik, kazanma, seçim ve ayar varsayılanı sunucudan gelir. İstemci yalnız girdi ve kanıt sunar.
7. **Sayıyı kod hesaplar, LLM anlatır.** Her AI çağrısı tek `aiCall` geçidinden geçer (kapsam, politika, bütçe, PII redaksiyonu, zod, cache, kullanım kaydı). GET LLM çağırmaz.
8. **Tüketicisi olmayan ayar yoktur.** Ayarlar kayıt defterindedir; modül kapısı API seviyesinde uygulanır.
9. **Hata görünürdür.** Zarf v2 (`success`, `data`, `code`, `retryable`, `requestId`); UI'da `QueryState`; `onRequestError` → Sentry; `200 + sıfırlar` yasak.
10. **Zaman Europe/Istanbul'da.** Kovalar SQL `AT TIME ZONE` ile; dönemler `{range, compare}` sözleşmesiyle.
11. **Sunucu önce, ada sonra.** `page`/`layout` server component; kritik veri `prefetchQuery` + `HydrationBoundary`; kabuk `getShellConfig` ile; huni rotaları `(funnel)` grubunda ≤ 150 KB gzip JS.
12. **Tek uyanış, bütçeli iş, kalıcı teslimat.** Günlük tek cron + `JobRun` + `MessageOutbox` (`dedupeKey`); periyodik Inngest cron'u yok; dead-man heartbeat.
13. **Ölçerek doğrula.** Proje sahibinin tercihi: ilerleme `tsc` ile, `next build` en sonda; görsel ve 3D değişiklikler headless Chrome tezgâhında ekran görüntüsüyle doğrulanır, tahminle değil.

---

## 5. Fazlı plan

**Efor ölçeği:** S ≤ 1 gün · M 2–4 gün · L 1–2 hafta · XL 2+ hafta (tek odaklı ajan için).
**Paralel şeritler:** **A** Kimlik ve yetki · **B** Ekonomi ve oyun · **C** Veri ve şema · **D** Ön yüz çekirdeği, tasarım ve IA · **E** AI ve gizlilik · **F** Arka plan, performans ve gözlemlenebilirlik. Her şerit aynı anda bir ajana verilebilir. Aynı şeritteki epikler sıralıdır, farklı şeritlerdekiler paraleldir. İstisnalar "dosya çakışma noktaları" tablosunda (§5.4).
**Şema bekçisi:** `prisma/schema.prisma` ve `prisma/migrations/**` tek bir ajanın sorumluluğundadır. Diğer ajanlar migration SQL'i önerir, bekçi birleştirir. Canlı Neon'a uygulama yalnızca proje sahibinin onayıyla yapılır (§8).

### Takvim özeti (tahmini; çoklu ajanla, tek sahip onay döngüsüyle)

| Faz | Amaç | Süre | Çıkış kapısı |
|---|---|---|---|
| **Faz 0** | Temel ve güvenlik: kanamayı durdur | 2 hafta | 40 P0'ın tamamı yeniden üretilemiyor; CI kapısı kurulu; şema penceresi #1 uygulandı |
| **Faz 1** | Çekirdek platform | 4–5 hafta | Route fabrikası, oturum modeli, puan defteri, veri durumu katmanı, token v2, nav kaydı, iş omurgası, AI geçidi canlıda; An Motoru canlıda |
| **Faz 2** | Doğruluk ve kontrol düzlemi | 4–6 hafta | Ekranda uydurma sayı yok; okuyucusuz ayar yok; ödül zinciri kapalı döngü |
| **Faz 3** | Bilgi mimarisi ve yüzey yeniden inşası | 6–8 hafta | Üç panel yeni menüde; 198 → ~105 yüzey; mobil sekme çubuğu; sunucu-önce kabuk |
| **Faz 4** | Oyunlar ve deneyim derinliği | 5–7 hafta | Sunucu otoriter oyunlar, 10–12 oyunluk portföy, sezon ligi, Wrapped |
| **Faz 5** | Olgunluk (sürekli) | sürekli | i18n %100, deney ürünü, kullanıcı 360, para tipleri, yeni giriş yöntemleri |

---

### Faz 0 — Temel ve güvenlik (2 hafta)

**Amaç:** P0'ların tamamını kapatmak. Bunu olabildiğince şemasız hotfix'lerle yapmak, şema gerektirenleri tek bir onaylı pencerede toplamak ve sonraki fazların ölçülebilir olması için CI kapısını kurmak.

| Epik | Kapsam (sayfa / dosya) | Bağımlılık | Efor | Başarı ölçütü | Şerit / paralellik |
|---|---|---|---|---|---|
| **F0.1 Güvenlik ağı ve CI kapısı** | Yedeğin alındığının doğrulanması (`scripts/db-backup-*`); `prisma migrate diff --from-url` ile **drift raporu** (salt okunur, onayla); baseline göçü + `migrate resolve --applied`; lokal `.env`'in **Neon dev branch**'e çevrilmesi; kırık 2 test paketinin düzeltilmesi; ESLint: `app/api/**` altında `getServerSession` ve bellek içi limiter yasağı (geçici izin listesi yalnız azalabilir); `instrumentation.ts` içinde `onRequestError`; route katalog betiğinin auth / zod / rate-limit / zarf / modül / try-catch metriklerini CI raporu olarak üretmesi | — | M | Lokal ortam canlı DB'ye bağlanmıyor; `jest` yeşil; CI raporunda 398 route'un metrikleri görünüyor | C · **ilk gün**, diğer bütün epiklerin ön koşulu (yalnız şema işleri için) |
| **F0.2 Kimlik hotfix'leri** | P0-02, P0-03, P0-08 (hızlı kısım): `resolvePostLoginTarget` + NextAuth `callbacks.redirect`; demo bloğu bayrak arkasına + `authorize` reddi; OAuth bağlamada şifre null'lama; magic link'te 2FA ara adımı; `/auth/error` ve `/auth/verify` sayfaları; `/auth/signin` → `/auth/login` kalıcı yönlendirme (25 çağrı) | — | M | Açık yönlendirme test vektörlerinin (`/\`, `//`, `javascript:`, `%5C`) tamamı reddediliyor; üretimde demo bloğu yok | A · `lib/auth.ts`'te F0.10/F1.2 ile bölge ayrımı: F0.2 yalnız `callbacks.redirect` + `authorize` demo dalına dokunur |
| **F0.3 Admin kapısı: gerçek doğrulama** | P0-01: `lib/admin-gate-edge.ts` Web Crypto HMAC; `lib/admin-elevation.ts` (isomorphic); `requireAuth` ADMIN dalında kapı (team uçları muaf); `admin-gate` ve `settings` GET'lerinde maskeleme; kilitleme + audit; break-glass prosedürü (`docs/RUNBOOK.md`) | — | M | Sahte cookie ile `/admin` ve `/api/admin/*` 403 dönüyor; cevap hiçbir uçtan okunamıyor | A · `proxy.ts` çakışması F0.8 (kamera) ile: aynı PR'da ya da sıralı |
| **F0.4 Kiracı ve IDOR kapatma** | P0-04, -05, -06, -09, -10, -11, -12 (acil kısım): `lib/auth/dealer-scope.ts`, `resolveAiScope`; `/api/feedbacks`, `/api/ai/{detailed,analyze,learning}`, `gamification/{badges,quests}`, `customer/reviews`, `cards/[token]`, `leaderboard`, `admin/team/members`, `lib/team-access.ts`, `dealer/{action-items,incidents}`, `dealer/staff` (yazma dalı kaldırma), `dealer/{customers,segment-actions}` (bayi kapsamlı groupBy) | — | M | Rol × kapsam Jest matrisi (her uç × 4 rol × sahip/sahip değil) yeşil | A · F0.7 ile `app/api/ai/analyze/route.ts` paylaşılıyor: aynı ajan |
| **F0.5 Puan basma kapıları** | P0-13…23: `happy-hour` zod; `dealer/consumptions` (çarpan, sezon tavanı, `points_credited`, tek tx, kart-bayi kontrolü); `gamification/progress` POST kaldırma; `quests/[id]/claim` geçici guard'ı (rewardedAt F0.10'da); `register` → PENDING referral; `offline-sync` sertleştirme; admin `add_points`, `surprise-box/send`, automation; squad cancel/leave; sezon BIRTHDAY uygunluğu ve matris tavanı; remedy doğrulamaları; gift `recipientUserId`; `character-test` prod kapalı; oyunlarda `failed` = oynandı, `capGamePoints`, turnuva eşitlik kırıcı ve tek öne çıkan oyun, pacman hotfix'i | — | L (alt ajanlara bölünür) | Her mint yolu için "`points_credited` yazıldı mı + tavan uygulandı mı" testi; 20 paralel istekte bakiye tek kredi kadar artıyor | B · alt bölünme: B1 tüketim + happy hour + sezon + offline-sync (aynı dosya: `dealer/consumptions/route.ts`); B2 rozet + görev + referral; B3 admin + otomasyon + kutu + klan; B4 oyunlar + turnuva; B5 remedy + gift |
| **F0.6 Veri kaybını durdurma (kod tarafı)** | P0-24…28: QR silme → arşiv, toplu silme kaldırma; rozet/ödül/görev silme → 409 + arşiv; kullanıcı silme → `anonymizeUser`; kart unassign guard; plan silme bloğu; tüketim yorumu soft-delete; bootstrap/demo üretim kapısı (`ALLOW_DEMO_SEED`); "yükleme hatası → Kaydet kilitli" (admin 11 sayfa + bayi settings/ai-settings) | — | M | Hiçbir UI eyleminden hard delete + cascade tetiklenmiyor; yükleme hatasında Kaydet devre dışı | C · F0.8'in bayi `settings` maddesiyle aynı dosya: aynı ajan |
| **F0.7 KVKK ve AI acil** | P0-31…35: consent + PostHog; `privacy-request` override; DSR `completed` guard'ı; `ai-retry` / pipeline'da AI-kapalı politikası; auto-reply atomik; `escapeEmailHtml`; VoC moderasyon + maskeleme; pazarlama tercih filtresi; `chatSystemPrompt` temel promptu ezmesin + öğrenme POST'u kapalı; QRA'nın "genel konular" modunun kapatılması + anonim günlük tavan; AI uçlarına `checkRateLimitDb` | — | M | Çerez reddinde PostHog ağ isteği 0; AI kapalı bayi için LLM çağrısı 0; e-posta HTML enjeksiyon testi geçiyor | E |
| **F0.8 Kırık ana akış hotfix'leri** | P0-36…39 + P0-29: `camera=(self)` + `useQrScanner`; PWA `publicExcludes`; `.animate-in` → `qx-enter`; koyu `--danger-text`; `DashboardRouteLoading`'in içerik iskeletine indirilmesi; admin form remount (4 sayfa); quest create 500; `roleIcons` STAFF; SEO `siteUrl` zorunlu + `new URL` fallback; asset upload → R2; campaigns yanıt sözleşmesi; my-card QR kırpılması; ai-recommendations çökmesi + rate limit; segment-actions 400'leri; anket şeması (create + fill ortak discriminated union); kayıt doğrulama ekranı + `POST /api/auth/verify-email/resend`; Stripe `subscriptions.update`; digest çakışması, demo olay ve QR rotate/revoke kotası; kırık linkler (`/dealer/ai-learning`, `squads/battles/[id]`) | — | L (9+ ayrık alt ajan) | Sayfa raporlarındaki doğrulanmış P0 hata senaryolarının hiçbiri yeniden üretilemiyor; canlı `sw.js` giriş sayısı < 300 | D · alt ajanlar sayfa başına ayrık dosyalarda |
| **F0.9 Arka plan acil** | P0-30, P0-40: R2 `backups/` denetimi (proje sahibi, panelden); private yedek kovası + şifreleme; Inngest durumu kararı ve periyodik cron'ların kaldırılması; `daily` orkestratörde non-2xx + heartbeat; ai-retry'ın kısa metinleri dışlaması | — | S–M | Yedekler public URL'den erişilemiyor; günlük tetikleme sayısı ≤ 2 | F |
| **F0.10 Onaylı şema penceresi #1** | Yalnız ekleme (expand) değişiklikleri: `User.sessionVersion Int @default(0)`, `UserQuest.rewardedAt`, `AuditLog.userId` nullable + `SetNull` + `actorSnapshot`, `QRCode.archivedAt`, `StripeEvent`, `Referral` PENDING akışı için gereken alan (varsa), `CustomerMoment` (An Motoru; §5.3). İkinci adım, kod geçişi bittikten sonra: `Feedback.qrCode onDelete: Restrict` | F0.1; F0.4/F0.5/F0.6 kodu hazır | M | Göçler `migrate deploy` ile, yedekten sonra, sahibin onayıyla uygulanmış; drift 0 | C (şema bekçisi) |

**Faz 0 paralel yürütme:** İlk gün F0.1 başlar. F0.2–F0.9 hemen paralel yürür (A: F0.2 → F0.3 → F0.4, B: F0.5, C: F0.6, D: F0.8, E: F0.7, F: F0.9). F0.10 ikinci haftanın sonunda tek pencerede uygulanır. Şemaya bağlı kod (rewardedAt guard'ı, sessionVersion okuma) **tablo canlıda oluştuktan sonra** deploy edilir.

---

### Faz 1 — Çekirdek platform (4–5 hafta)

**Amaç:** Kök nedenler K1, K2, K5, K6 (kısmen), K10, K11 ve K12 için ortak çekirdeği kurmak. Bu fazda yeni ürün yüzeyi eklenmez; mevcut sayfalar çekirdeğe bağlanır.

| Epik | Kapsam | Bağımlılık | Efor | Başarı ölçütü | Şerit |
|---|---|---|---|---|---|
| **F1.1 Route çekirdeği** | `lib/server/http/` (`defineRoute`, zarf v2 geriye uyumlu, `ApiError`/`ApiErrorCode`, `getRequestContext` actor/tenant/requestId, adlandırılmış rate-limit politikaları, `cached()`); `lib/contracts/<alan>.ts` zod sözleşmeleri; `ModuleKey` union'ı katalogdan; 80 `getServerSession` route'unun taşınması (önce puan basan ve harcayan uçlar: spin, streak, birthday, tournament, referral, seasonal-event, surprise-box, shop); ADMIN'in bayi uçlarından çıkarılması + açık impersonation (başlık, audit, salt-okunur varsayılan); sahipsiz `/api/streak` POST ve `/api/push/subscribe`'ın emekliye ayrılması; Origin allowlist (CSRF) + JSON Content-Type zorunluluğu | F0.1, F0.4 | L | `getServerSession` 80 → 0; şemasız gövde 51 → 0; puan basan uçların %100'ü fabrikada | A |
| **F1.2 Oturum ve kimlik modeli** | `requireAuth` içinde Redis önbellekli sv/rol/ban/isActive; rol değişikliği, silme, sıfırlama ve 2FA olaylarında sv artırımı; JWT `mfa`/`amr` + `pending` ekranı; ADMIN için zorunlu 2FA; dangerous linking'in kaldırılıp açık hesap bağlama akışının kurulması; `StaffInvitation` akışı + bayi panelinde davet arayüzü; personel izin matrisi (Kasiyer/Şef/Müdür) + `requireStaffPermission`; admin kapısının TOTP/passkey step-up'a taşınması (kapı ekranı deneyim olarak korunur); token-replay'in yumuşatılması; hesap bazlı giriş limiti | F0.10 (sessionVersion) | L | Şifre sıfırlama sonrası eski token 60 sn içinde 401; pasif personel 60 sn içinde dışarıda; ADMIN 2FA'sız giremiyor | A (F1.1 sonrası) |
| **F1.3 Ekonomi çekirdeği** | **[ŞEMA]** `PointsLedger` (`currency`, `delta`, `source`, `sourceRef`, `status`, `balanceAfter`, `actorId`; `@@unique([source,sourceRef,currency])`) + açılış bakiyesi kayıtları; `lib/economy` (`grant/spend/reverse/adjust`; politika → tavan → çarpan → fraud kapısı → ledger → `User` atomik artış + seviye → **An Motoru `recordMoments`** → geçiş döneminde `points_credited`); `economy_policy` ayarı (zod, sürümlü); 23 kaynak + 6 harcama yolunun göçü (önce bayi, rozet, görev, oyun); ESLint: ekonomi modülü dışında `points`/`xp` yazımı yasak; gece mutabakat işi + sapma alarmı; `CHECK points >= 0`; geçmiş anomali raporu **[VERİ]** | F0.5, F0.10, F1.7 (mutabakat işi için JobRun) | XL | Ledger ile `User.points` sapması 0; `points_credited`'sız mint yolu 0; 2 hafta çift yazım temiz | B |
| **F1.4 İstemci veri katmanı** | `lib/api-client.ts` (zarf çözümü, `ApiError`, 401 → signIn, 429 → retryAfter, `MODULE_DISABLED` → standart boş durum); `hooks/queries/*` sorgu anahtarı fabrikaları; `QueryState` bileşeni; `useVisibleInterval` (görünmez sekmede polling yok); ayar ekranları için `useResourceForm` (ready kapısı + `baseVersion` → 409 + fark görünümü); `i18n/request.ts:35-37`'deki eksik anahtar davranışının düzeltilmesi + `t(x) || y` lint yasağı + CI'da eksik anahtar kontrolü; `admin-toast` yerine i18n'li tek toast fabrikası | F1.1 (zarf v2) | L | Ham `fetch('/api')` 573 → < 300 (Faz 3 sonunda < 50); ekranda ham çeviri anahtarı 0 | D |
| **F1.5 Tasarım temeli (QDL v2)** | `design-system/tokens.ts` + OKLCH türetme + Tailwind eşlemesi; `globals.css` bölme ve ölü sınıf temizliği; kontrast Jest testi; tek `ThemeController` (SSR `<style id="qx-theme">`, öncelik `base < preset < seasonal < a11y`, preset kaydında kontrast doğrulaması; `SeasonalConceptApplier` yalnız katman bildirir); `lib/motion.ts` token'ları + `useMotionPolicy` + `<Ambient>` + `<Reveal>`; `components/ds/` çekirdek bileşenleri (§4.1 tablosu); `Progress` aria düzeltmesi; transform-çakışma ve ham palet lint kuralları (uyarı seviyesinde) | F0.8 (CSS acil) | L | Token çiftlerinde AA altı kontrast 0; `success/warning/danger/info` token'ları kullanımda; `MotionConfig` uygulama ayarını uyguluyor | D (F1.4 ile paralel, farklı dizinler) |
| **F1.6 Navigasyon kaydı ve kabuk** | `lib/navigation/registry.ts` (mevcut 3 dizi + 2 katalog bire bir taşınır, davranış değişmez); `MENU_CATALOG`, Qra site haritası ve iki yönlü `verify:menu` testi kayıttan; `getShellConfig(role, locale)` ile sunucuda menü, modül, tema, dönemsel konsept ve dil; `SidebarContent` modül seviyesine (remount hatası); `aria-current`, daraltılmış modda etiketler; en uzun önek eşleşmesi; ⌘K palet (sayfalar, eylemler, veriler) | F1.5 (kabuk bileşenleri), F1.4 | L | Kabuk için istemci isteği 0; menü katalog testi CI'da zorunlu ve yeşil | D (F1.5'ten sonra) |
| **F1.7 Arka plan omurgası** | **[ŞEMA]** `JobRun` + `lib/jobs/runner.ts` + registry (global deadline, öncelik sırası, imleç, non-2xx, Sentry Cron Monitor, dead-man heartbeat); **[ŞEMA]** `MessageOutbox` (`dedupeKey @unique`) + `EmailSuppression` + `deliverMessage()` (email/push/inapp); **[ŞEMA]** `Notification.dedupeKey`; Redis okunmamış sayacı; SSE ve 20 sn polling'in tek kanala indirilmesi; tek service worker (`@serwist/next` ya da `customWorkerDir`; push handler PWA SW'de; çıkışta abonelik silme; `notificationclick` gezinme); istemci Sentry (`instrumentation-client.ts`) | F0.9 | L | Günlük iş sonuçları admin panelinde görünür; mükerrer bildirim 0; tek SW kayıtlı | F |
| **F1.8 AI geçidi** | `lib/ai/` `aiCall({task, scope, actor, input})`: kapsam zorunlu (TypeScript tipi), `tasks.ts` politika tablosu (model, fallback, maxTokens, timeout, zod şema, cacheTtl, bütçe sınıfı, promptVersion), `redactPII` + güvenilmeyen metni sınırlayıcılarla ayırma, Redis cache, token bucket (kiracı/görev/global/gün) + devre kesici, tek retry, DB kullanım kaydı (başarısızlar dahil); `lib/ai/prompts/<task>.vN.ts`; bütün LLM yollarının taşınması (`askAI`, `generateInsightReport`, `clusterThemes`, `generateAutoReply`, `chatWithQRA`, `suggestResponseWithGroq`, embedding, `ai-learning`, `action-items-ai`) | F0.7, F1.1 | L | Sayfa açılışı başına LLM çağrısı 0; kiracı başına günlük maliyet görünür; JSON geçerlilik ≥ %98 | E |
| **F1.9 Zaman, dönem ve metrik sözleşmesi** | `lib/time/istanbul.ts` (dayKey, hafta/ay sınırı, SQL `AT TIME ZONE` yardımcıları); `lib/period.ts` (`{range, compare}`, URL `?period=`); `MetricValue` (`value, unit, window, previous, delta, higherIsBetter, sampleSize, computedAt`); `activeFeedbackWhere`; soft-delete Prisma extension'ı (`deletedAt:null` varsayılan + açık `withDeleted`) | F1.1 | M | UTC'ye bağlı gün kovası 0; silinmiş kayıt sayan sorgu 0 | C |
| **F1.10 An Motoru** *(mevcut onaylı iş, ayrı spec)* | Spec'teki kapsam aynen: `CustomerMoment`, `lib/moments/*`, `MomentHost`, sahneler, konfetinin tek cepheye toplanması, `customer-dashboard.tsx` seviye hatasının silinmesi. Bu yol haritasıyla koordinasyonu §5.3'te | F0.10 (tablo önce canlıda) | spec'e göre | Spec'in başarı ölçütleri | B/D kesişimi; ayrı ajan |
| **F1.11 Varlık hattı ve paket diyeti** | Avatar, rozet, maskot ve chatbot görsellerinin sharp ile 64/128/256/512 WebP/AVIF varyantlara dönüştürülmesi (eski dosyalar bir süre yerinde kalır) + hash'li ad + immutable başlık; `UserAvatar` (next/image); liderlikte rastgele avatar atamasının kaldırılması (`app/customer/leaderboard/page.tsx:84`); `app/(funnel)` rota grubu (QR geri bildirim, `/c/[token]`) minimal layout; arka plan varyantlarının `dynamic()` ile yüklenmesi + varsayılan zeminin CSS keyframes'e çevrilmesi; `AppLocaleProvider initialLocale` (dil flaşı); chatbot'un idle anında yüklenmesi; jszip/qrcode/confetti statik import yasağı; rota başına bundle bütçesi CI'da | F0.8 | L | `/feedback/[code]` JS ≤ 150 KB gzip; liderlik görsel aktarımı ≤ 1,5 MB; precache ≤ 3 MB | F |

**Faz 1 paralel yürütme:** A (F1.1 → F1.2), B (F1.3; F1.10 ayrı ajan), C (F1.9 + şema bekçisi), D (F1.4 ∥ F1.5 → F1.6), E (F1.8), F (F1.7 ∥ F1.11). **Kritik yol:** F1.1 → F1.3 → Faz 2 ödül zinciri ve Faz 3 Cüzdan.

---

### Faz 2 — Doğruluk ve kontrol düzlemi (4–6 hafta)

**Amaç:** Ekranlardaki uydurma ve yanlış sayıları kaldırmak, bütün kontrolleri gerçek davranışa bağlamak ve değer döngüsünü kapatmak (kazan → harca → kanıtla).

| Epik | Kapsam | Bağımlılık | Efor | Başarı ölçütü | Şerit |
|---|---|---|---|---|---|
| **F2.1 Ayar kayıt defteri ve kontrol düzlemi** | `lib/settings/registry.ts` + CI okuyucu kontrolü; `/admin/settings` yeniden inşası (16 ölü alanın kaldırılması; Bakım → proxy 503, Kayıt → register guard, Google → signIn callback bağlanır); `gamification-settings` alanları ya bağlanır ya kaldırılır; derleme anında `assertModuleEnabled` taraması → katalogda `enforcement` alanı; kill-switch anlamı taşıyan modüllerin API seviyesinde kapılanması (`withDealerModule`, sunucu layout kapısı, "modül kapalı" boş durumu); `FeatureFlag` için karar (`lib/flags.ts` ile bağla ya da emekliye ayır); bayi `ai-settings`'teki 16 ve `settings`'teki sahte ayarların (bildirim matrisi, tatil modu, çalışma saatleri, dil) bağlanması ya da kaldırılması; kimliksiz `module_gate_blocked` yazımının durdurulması | F1.1, F1.4 | L | Okuyucusuz ayar 0; uygulanmayan katalog modülü 0 | A |
| **F2.2 Tek-kaynak alan servisleri** | `lib/leveling.ts` (geometrik eğri tek kaynak), `lib/streak.ts` (Europe/Istanbul, grace; 4–5 serinin birleşmesi), `lib/reviews/corpus.ts` (Feedback ∪ ConsumptionReview, `deletedAt:null`), `lib/business-ranking.ts` (Bayes, güven filtresi, Redis), `lib/dealer-health` (tek skor, `HEALTH_BANDS`, yetersiz veride null), `lib/segments` (`CustomerSegment` kayıt defteri + `classify()`), lig kurallarının sunucudan DTO ile verilmesi + son kademenin açık uçlu yapılması, `lib/customer-metrics.ts`; sahte değerlerin kaldırılması (`streak:0`, `length*50`, `rating>=4?75:50`, `amount*2`, sabit "Ücretsiz Kahve", `requirement.value`, sentetik haftalık lig 50/100, trends rozet sorgusu) | F1.3, F1.9 | L | Aynı kavram için tek formül; müşteri sayfaları arasında çelişen sayı 0 | B |
| **F2.3 Kiracı kapsamlı türetilmiş veri** | **[ŞEMA]** `DealerCustomerStats` + günlük iş; bayi uçlarının bu modele taşınması (customers, churn-risk, segment-actions, radar, campaigns VIP); **[ŞEMA]** `Feedback.dealerId` denormalize + batch'li backfill + `CONCURRENTLY` index; `DailyDealerStats`'ın günlük doldurulması ve analytics/benchmark okuyucuları; discovery/benchmark/admin analytics'in SQL `GROUP BY` + global Redis anahtarına taşınması; `/summary` uçları; gerçek tarama sayacı (`scanCount` artık geri bildirim saymıyor); benchmark rank DTO + k-anonimlik ≥ 3; `nulls:'last'`; ısı haritası gün indeksi ve TR saati + veri taşıma | F1.7, F1.9 | L | Bayi yanıtında çapraz kiracı alan 0; discovery p95 < 300 ms | C |
| **F2.4 Deterministik AI ve "önce oku, sonra üret"** | İçgörü raporu: SQL metrikleri, gerçek dönem filtresi, deterministik key-driver'lar; LLM yalnız anlatı üretir; veri yoksa NPS/CSAT/CES kartları gösterilmez; `predictedRating` kaldırılır; kalıcı rapor tablosu + cooldown'lu yenileme; operations-brief aynı kaydı kullanır; weekly brief'e gerçek AI özeti; action-items ve incidents üretiminin cron/olay işine taşınması + `dedupeKey` + kısmi unique'ler; **[ŞEMA]** `aiStatus` durum makinesi + `aiAttempts`; otomatik yanıtın varsayılan olarak taslak + onay kuyruğuna düşmesi; sistem öğrenmesinin anonim toplulaştırmayla yeniden kurulması + `pending` sürüm + admin diff onayı; müşteri ai-insights'tan churn ve aksiyon alanlarının kaldırılması; "derin öğrenme" ve "Cortex 2.0" terminolojisinin düzeltilmesi | F1.8, F2.3 | L | UI'da LLM'in ürettiği sayı 0; GET kaynaklı LLM/kayıt üretimi 0 | E |
| **F2.5 Ödül teslim zinciri** | **[ŞEMA]** `UserReward.status/expiresAt/redeemedDealerId` durum makinesi; `POST /api/dealer/rewards/redeem` (atomik tek kullanım); kısa ömürlü imzalı QR pass; kuponun bu akışa birleşmesi (3 kupon kavramı → 1 kod defteri); telafi teslimi (puan türünde atomik kredi, diğerlerinde kod); sürpriz kutu kuponlarının cüzdana bağlanması; shop'ta `isActive` + `expectedPrice` + tipli `assetKind`; bağışta durum enum'u ve gerçek PAUSED; Wallet butonlarının yalnız yapılandırılmışsa gösterilmesi | F1.3 | XL | Ödül kodu kullanım oranı ölçülebilir (hedef ≥ %60); puan düşen ama doğrulanamayan ödül 0 | B (F2.2 ile sıralı, aynı ekonomi dosyaları) |
| **F2.6 Pazarlama teslim servisi ve atıf** | `MarketingMessenger.send()` (rıza grup × kanal, frekans tavanı, alıcı bütçesi, `draft → sending → sent | failed`, `MessageOutbox` üzerinden, HTML kaçışı); **[ŞEMA]** `CampaignRecipient`; kampanya, win-back, risk-segment ve segment-proposals'ın bağlanması; **[ŞEMA]** `Feedback.campaignId` + public formun `cmp` parametresini taşıması + `lib/campaign-attribution` (copilot ile ortak) + performans hunisi | F1.7, F2.3 | L | Tercihi kapalı alıcıya gönderim 0; kampanya atıf metrikleri sıfırdan farklı ve doğrulanabilir | E (F2.4 sonrası) ya da ayrı ajan |
| **F2.7 Geri bildirim hattı** | Oturumdan bağımsız tek "feedback oluşturuldu" yan etki fonksiyonu (anonim yorumlar da AI, webhook, heatmap ve cache hattına girer); AI analizinin `after()` içinde çalışması; R2 presigned fotoğraf yükleme + istemci sıkıştırma + galeri (base64 satırları için backfill); quickTags'in metinden ayrılması (bonus yalnız kullanıcı metnine); çıkar çatışması tespiti (bayi/staff kendi QR'ı); `dealerStaffId` doğrulaması; `claimToken` ile anonim yorumun sonradan hesaba bağlanması; tüketim yorumu düzenleme | F1.3, F1.8 | L | Anonim yorumların %100'ü bayi hattına ulaşıyor; 413 hatası 0 | E/C |
| **F2.8 Denetim izi, KVKK ve yasal altyapı** | `lib/audit/write.ts` `writeAudit({actor, action enum, entity enum, before, after, redact, req})` + 88 çağrı noktasının codemod'la taşınması + `withAudit` lint kuralı; rollback'in `entityId` ile sınırlandırılması; gizli değerlerin onaylı redaksiyonu **[VERİ]**; DSR durum makinesi + `PII_REGISTRY` + self-servis export/silme'nin DSR kaydı üretmesi; `lib/retention-policy.ts` (önce dry-run sayım) + aylık R2 arşivi; **[ŞEMA]** `LegalDocument` + `LegalAcceptance`; `(legal)` rota grubu, sabit `effectiveAt`, kayıt ve OAuth sonrası onay adımı; aydınlatma metninin gerçek işleyenler, AI işleme ve yurt dışı aktarımla güncellenmesi (**metin hukuk danışmanıyla**); `/guven`'deki "signed URL" iddiasının koda göre düzeltilmesi | F0.10, F1.7 | L | Audit kapsamı %100 (lint); DSR yalnız kanıtla kapanıyor; şart onayları kayıtlı | C |
| **F2.9 Güven Merkezi** | Fraud motorunun `economy.grant()` kapısına bağlanması (`shadow_ban → void`, `flagged/velocity → pending`) ya da silinmesi; `FraudSeverity` enum'u + normalizasyon (HIGH uyarılarını gizleyen büyük/küçük harf hatası); triage kuyruğu (çöz, yanlış alarm, ata, gölge ban, puan geri al) + `/api/admin/trust/actions` + audit; moderasyonla silinen içerik için ters kayıtla clawback; KPI düzeltmeleri; timeline linklerinin sayfa içi panele çevrilmesi | F1.3, F2.8 | XL | Şüpheli kayıtlar arayüzden çözülebiliyor; "işaretli bayi" KPI'ı gerçek | B (F2.5 sonrası) |
| **F2.10 Entegrasyon ve dosya güvenliği** | API anahtarları için scope matrisi + `partnerId`/`dealerId` bağlama + iptal/süre/rotasyon; partner `qrk_` sisteminin kaldırılması; tek webhook olay kataloğu (5 olayın 4'ü bugün tetiklenmiyor); secret'ın yalnız yazılabilir ve şifreli olması + imzaya zaman damgası; `lib/safe-outbound-fetch.ts` (https, DNS sonrası özel IP engeli, manuel redirect, timeout, boyut); `lib/upload-policy.ts` (magic-byte, allowlist, aktif içerik `attachment`); private R2 + imzalı URL uç noktası (gelen kutusu ve görev ekleri, backfill); CSP nonce (önce Report-Only); PostHog aynı-origin `/ingest` proxy'si | F1.1 | L | SSRF test vektörleri reddediliyor; public ve süresiz ek URL'si 0 | A |
| **F2.11 Olay motoru: görev, kampanya, etkinlik** | `emitGameEvent()` (`feedback_created`, `review_created`, `game_won`, `visit_recorded`, `box_opened`, `referral_completed`) + abone motorlar; `lib/quests/engine.ts recordQuestEvent()` + `periodKey` (günlük/haftalık döngü; bugün görev ilerleme motoru yok); **[ŞEMA]** seasonal challenge şeması + `challengeRewardBadgeId` FK + talep penceresi; `HappyHour.timezone` ve global kampanyaların puana dahil edilmesi; BadgeRule defteri ile aktivite ve sürpriz rozet motorlarının birleşmesi + rozet ödüllerinin nadirlik bandına çekilmesi (50/150/400/1.000) | F1.3, F1.7, F2.2 | L | Custom görevler ilerliyor; rozet tek motordan veriliyor | B (F2.5 ∥ değil, sıralı) |

**Faz 2 paralel yürütme:** A (F2.1 → F2.10), B (F2.2 → F2.5 → F2.11 → F2.9), C (F2.3 → F2.8), E (F2.4 → F2.6), E/C (F2.7, ayrı ajan). D şeridi bu fazda **Faz 3 hazırlığına** geçer: sayfa göçü kodmod'ları ve `PanelPage` şablonları (F3.5'in ilk dalgası).

---

### Faz 3 — Bilgi mimarisi ve yüzey yeniden inşası (6–8 hafta)

**Amaç:** §4.3'teki menülere geçmek; birleştirme kümelerini sekmeli tek sayfalara indirmek; ürünün asıl yüzeylerini (müşteri ana sayfa ve cüzdan, bayi Bugün ve Gelen Kutusu, admin konsolları) çekirdeğin üzerine yeniden kurmak. Her küme ayrı bir PR'dır. Her PR'da `SectionTabs`, kayıtta `redirectFrom`, `next.config.js`'te 301 ve PostHog'da eski/yeni URL pageview karşılaştırması bulunur. Emekliye ayırmadan önce PostHog kullanım verisine bakılır.

| Epik | Kapsam | Bağımlılık | Efor | Başarı ölçütü | Şerit / ajan |
|---|---|---|---|---|---|
| **F3.1 Müşteri: yeni mimari** | (a) Mobil sekme çubuğu + `FloatingLayerProvider` + `useFirstRunQueue` (çerez → karşılama videosu **veya** onboarding → doğum günü → PWA; durum DB'de) + mobilde toast üst-orta; (b) Ana Sayfa: server page + `HydrationBoundary` + `/api/customer/home` BFF, oturum flaşının bitmesi, puan/XP terminolojisi, favori çift kart, sponsorlu kart linki; (c) Cüzdan çatı sayfası + puan defteri makbuzları + Puan Rehberi + günlük kalan haklar; (d) Keşfet + `/customer/places/[dealerId]` + 5 ölü derin linkin bağlanması; (e) Ben → İlerleme (4 sayfa tek sayfada), Seslerim (birleşik zaman çizelgesi + detay çekmecesi + işletme yanıtı ve telafi görünümü), Ayarlar (tercih merkezi, yasal belgeler, dil); (f) Tara ve Kart: `lib/qr-resolve.ts`, kodlu doğrulama hataları, "Kasada göster" paneli (Wake Lock, kısa ömürlü kod), çevrimdışı son kart görüntüsü, `/c/[token]` register `callbackUrl` taşıma ve yetim kart düzeltmesi; (g) yönlendirmeler | F1.4–F1.6, F2.2, F2.5 | XL (6 alt ajan: a–f) | Soğuk açılış API çağrısı ≤ 3; QR tara, Kartım ve Ödüller ≤ 1 dokunuş; müşteri birincil yüzeyi ~18 | D |
| **F3.2 Bayi: yeni mimari** | (a) **Bugün** (dikkat bekleyenler, dönem seçici, next-best-action, haftalık rapor sekmesi, kurulum kartı); (b) **Gelen Kutusu** (birleşik VoC ucu `lib/voc/` ile `source: qr|consumption`, cursor sayfalama, detay paneli, şablonlu yanıt editörü, telafi, atama, SLA, "bana atananlar"); (c) **Müşteriler 360** (liste + çekmece + Risk/Segment/Geri kazanım sekmeleri + toplu aksiyon; radar en fazla 24 öncelikli noktalı Canvas 2D); (d) **Analitik** konsolidasyonu (recharts + shadcn `ChartContainer`, boş dönem null, `role="img"` + sr-only tablo; Yoğunluk sekmesi; Etki ve ROI birleşimi; şube kırılımı; drill-down); (e) **AI Asistan** (tool-calling, kaynak çipleri, streaming, kalıcı sohbet geçmişi, yarış koşulu düzeltmesi, ⌘J çekmece; ask-analytics grounding'i korunur; pgvector F5.5'te); (f) **İşletme**: QR stüdyosu (`buildQrTargetUrl`, `/q/{code}`, `locationId` ataması, WYSIWYG baskı, şube yönetimi), Ürünler iyileştirmesi (görsel, tükendi, kategori yönetimi, TR `toLocaleLowerCase`), Ekip yeniden inşası (davet, vardiya planlayıcı, görev atama, izin onayı, eğitim ve checklist editörü, saha akışı) + personel **Bugün** ekranı; (g) **Otomasyon merkezi** (paylaşılan zod kural kurucu, dry-run, çalışma geçmişi, uyarı kuralları); (h) **Anket yaşam döngüsü** (düzenleme + sürüm, arşiv, link + QR paylaşımı, SQL toplama); (i) Ayarlar sekmeleri | F2.1–F2.6 | XL (9 alt ajan: a–i) | Bayi rotası 45 → ~24; "ne yapmalıyım" tek yüzeyde; ekip sekmelerinde salt okunur sekme kalmıyor | D (+ B/E ajanları domain kısımları için) |
| **F3.3 Admin: yeni mimari** | (a) Komuta Merkezi + tek `/api/admin/overview` toplayıcı (bölüm başına Redis TTL, `Promise.allSettled`, gizli sekmede polling yok; SQL'de sıralı top-N); (b) Ekonomi Stüdyosu (matris, çarpan ve tavan, lig, simülasyon tek sayfada; kaydetme öncesi diff ve etki önizlemesi; kaynak → havuz Sankey); (c) Rozetler (katalog + eşik + allowlist'li test lab); Mağaza ve Ödüller; Kampanyalar takvimi (sezon + konsept + kutu + kupon + davet); (d) AI Operasyon, AI Kalite (rubrikli değerlendirme, `source` alanı, sohbet `outcome` alanları, trigram), Prompt ve Model Stüdyosu (`AIPromptVersion`, üslup slug kilidi); Ajan Konseyi kararı (kalıcılık + dürüst canlı/şablon etiketi ya da gizleme); (e) KVKK (privacy-requests kanonik, compliance envanter sekmesi); Güven Merkezi UI'ı; (f) Özellik ve Deney Kontrolü, Entegrasyonlar, Fiyatlandırma (`stripePriceId` UI + landing fiyatlarının DB'den okunması); (g) Navigasyon Stüdyosu (`/admin/navigation`: dnd-kit klavye erişimli ağaç, TR/EN grup adları, canlı önizleme); Tasarım Sistemi yaşayan rehber; SEO (tek zod, sürüm zaman çizelgesi, noindex onayı); tema taslak → önizle → yayınla (`revalidateTag(expire:0)`); (h) Ekip sertleştirme (`priorityRank`, `lib/team-task-transitions.ts`, soft delete + R2 temizliği, aday maskeleme, Europe/Istanbul) + Gelen kutusu ve mail güvenliği (senkronda sanitize, UID artımlı senkron, taslak koruma, toplu gönderimin kuyruğa taşınması); (i) Arka Plan İşleri paneli | F2.1, F2.8, F2.9, F2.10 | XL (9 alt ajan) | Admin rotası 73 → ~40; bütün listeler `DataTable` + URL filtreli; bekleyen işler sidebar rozetinde | D (+ domain ajanları) |
| **F3.4 Herkese açık yüzeyler ve huni** | Landing'in tüketici (Okut → Kazan → Harca) ve `/isletmeler` olarak ayrılması; `/neden-qratex`'in işletme sayfasına alınması; sahte sosyal kanıt, DEMO şeridi ve SSR yedek sayılarının kaldırılması + `HyperText` hatası; `buildPageMetadata` (canonical, OG, Twitter) + sitemap; blog için `ArticleBody` / `@tailwindcss/typography` + CMS kararı; experience share'in sunucu bileşeni + OG kartı + moderasyon; anket cevap doğrulaması + `@@unique([surveyId,userId])`; table-signal rate limit + bayi bildirimi; `/offline` "Yeniden dene" = `location.reload()`; manifest (`orientation` kaldırma, `/app` başlangıç yönlendiricisi, maskable ikonlar) | F1.11, F2.8 | L | Landing JS ≤ 200 KB; canonical hatası 0; uydurma sosyal kanıt 0 | D (ayrı ajan) |
| **F3.5 Sayfa göçü ve erişilebilirlik dalgası** | Her sayfanın `PanelPage` + `PageHeader` + `QueryState` + motion presetlerine taşınması (sıra: bayi → müşteri operasyon sayfaları → admin → personel); kodmod'lar (durum renkleri → rol token'ları, marka literal'leri, `PREMIUM_PANEL_CARD_BASE` / ikon çipi / hero buton kopyaları, `text-[≤9px]` → `caption`, `confirm()` → `useConfirm`); hover-only aksiyonların her zaman görünür `⋯` menüye alınması; label-input bağı; `div onClick` → button; başlık hiyerarşisi + mobil `h1`; `RatingInput` / `ChoiceChips` / `PhotoPicker` QR, anket ve tüketim yorumunda; `eslint-plugin-jsx-a11y` + `@axe-core/playwright` smoke; mojibake lint'i; lint kurallarının uyarıdan hataya çekilmesi | F1.5, F1.6 | XL (panel × dizin bazında 6+ paralel ajan) | Hero/PageHeader benimsenmesi %100; axe critical/serious = 0; ham durum paleti < 150; `EmptyState` ≥ 60 dosya | D |

**Faz 3 paralel yürütme:** F3.1, F3.2 ve F3.3 birbirinden bağımsız dizinlerde (`app/customer`, `app/dealer`, `app/admin`) yürür; her biri kendi içinde 6–9 alt ajana bölünür. F3.4 ayrı ajan. F3.5 sürekli arka plan dalgasıdır ve aynı sayfaya dokunan F3.1–F3.3 alt işiyle **aynı ajana** verilir (çift dokunuş olmasın).

---

### Faz 4 — Oyunlar ve deneyim derinliği (5–7 hafta)

| Epik | Kapsam | Bağımlılık | Efor | Başarı ölçütü | Şerit |
|---|---|---|---|---|---|
| **F4.1 Oyun güven çekirdeği v2** | Deneme API'si (`POST /api/games/:g/attempts` → seed + HMAC token + etiketsiz içerik + effective config; deneme başlangıçta harcanır), checkpoint, `complete`'te `verifiedScore` + `|client − verified|` sinyali; **[ŞEMA]** `MiniGameAttempt` (mod, attemptNo, seed, verifiedScore, clientScore, verification, flags), `UserGameStats`, `GameContentItem`, `TournamentResult @@unique([gameType, weekKey, rank])`; Pratik (sınırsız, ödülsüz) / Sıralı (günde N deneme, ödüllü) modları; Redis ZSET liderlikleri; haftalık tek öne çıkan oyun turnuvası + otomatik kredi; `capGamePoints` + azalan getiri `economy_policy`'de; PostHog oyun olayları + admin oyun detay sayfası (kazanma oranı, histogram, şüpheli oturumlar) | F1.3, F2.11 | XL | Oyun kaynaklı puan payı < %25; hile sinyali oranı < %1; liderlik p95 < 100 ms | B |
| **F4.2 Ortak oyun motoru** | `lib/games/engine` (sabit adımlı döngü, pause/visibility, DPR + ResizeObserver, giriş soyutlaması: klavye/swipe/pointer/sanal d-pad, seed'li PRNG, ses master gain + haptik anahtarı); `<oyun>/sim.ts` saf mantık (istemci + sunucu ortak); `GameShell` v2 (mod seçimi, pause menüsü, öğretici overlay, sonuç + paylaşım kartı, arena token'ları ile turnuva bileşeni); tek dinamik `app/customer/games/[game]/page.tsx` + `generateMetadata(effective)`; `ArenaTarget` (transform çakışması); erişilebilirlik katmanı (klavye şeması, `aria-live` HUD, rahat mod) | F1.5, F4.1 (sözleşme) | L | 120/144 Hz'de oyun hızı sabit; 21 kopya `page.tsx` → 1 | D |
| **F4.3 Portföy yenileme** | §7'deki kararlar: birleştirmeler, kaldırmalar ve 308 yönlendirmeler, motora taşımalar, yeni oyunlar (Günün Kelimesi → Eşleştir-3 → Mekân Bilgi Yarışması) | F4.1, F4.2 | XL (oyun başına paralel ajan) | Portföy 22 → 10–12; sıralı denemede oyun başına %35–50 kazanma oranı | B/D, oyun başına bir ajan |
| **F4.4 Statü yeniden tasarımı** | Sezon XP + 8 haftalık sezonluk lig (yumuşak sıfırlama, sezon sonu ödülü, terfi/düşme, "sen" satırı); VIP = son 90 gün kazanç (günlük iş) + `lounge` statüsünün bağlanması; tek `progression` DTO; **An Motoru `league_up` tanımının sezon XP'ye göre güncellenmesi** (§5.3); Oyun Pasosu (sezonluk XP yolu, kozmetik ödüller), oyunlar arası günlük görevler, klan katkısı = ledger aktivite toplamı + hazine sink'leri; seri dondurma bileti ve diğer tekrarlayan harcama yolları | F1.3, F2.2, F2.11, An Motoru | L | Harcama yapmak ligi düşürmüyor; aylık mint/burn oranı 1,0–1,5 | B |
| **F4.5 Paylaşım, anlar ve signage** | `my-year` hikâye slaytları + yıl seçici + **[ŞEMA]** `UserYearSnapshot`; ortak `lib/share-card` (9:16 PNG, referral bağlantılı; `character-share-card` genelleştirilir); sürpriz kutuda nadirlik kademeleri ve vaadin gerçek kurala bağlanması; Kartım CSS 3D tilt + tek seferlik parıltı; bayi mağaza ekranı `/wall/[token]` (DisplayToken, tam ekran, düşük GPU ortam katmanı, SSE); bayi kilometre taşı kutlamaları (tek seferlik, kısa) | F4.4, F1.5, An Motoru | L | Paylaşım kartı üretimi < 1 sn; signage gece boyu açık kalabiliyor | D |

---

### Faz 5 — Olgunluk (sürekli)

| Epik | Kapsam | Bağımlılık | Efor |
|---|---|---|---|
| **F5.1 i18n'in tamamlanması** | Hedef kararı: EN bir ürün hedefi mi? Hedefse sunucu-otoriter locale (`<html lang>`, öncelik DB > cookie > header > tr), namespace ve dil bazında sözlük bölme, API `{error:{code,params}}`, bildirimlerin `type + params` modeline geçmesi, ICU/next-intl, JSX/toast/aria literal lint kapısı. Bugün yorum dışı ≥ 3.753 sabit TR satırı var | F1.4 | XL |
| **F5.2 Deney ürünü** | `Experiment` / `ExperimentAssignment`, hash tabanlı atama, istatistik motoru (lift, %95 GA, SRM), guardrail metrikleri, kazananı bayrağa yayınlama; ab-testing ve innovation deneylerinin birleşmesi | F2.1 | XL |
| **F5.3 Operatör verimliliği** | `/admin/users/[id]` 360 (kimlik, puan defteri, güven, aktivite, audit), süre sınırlı ve audit'li impersonation, kayıtlı görünümler, eşik tabanlı uyarı kuralları | F2.8, F2.9 | XL |
| **F5.4 Ekonomi Paneli ve simülasyon** | Ledger'dan mint/burn, kaynak payı, para arzı, medyan bakiye, Gini, şüpheli kuyruk; gerçek reward-pipeline ile taslak matris what-if analizi; son 30 gün baseline | F1.3, F4.4 | L |
| **F5.5 Veri modeli temizliği** | **[ŞEMA]** Float → Decimal/kuruş + currency (yeni sütun + çift okuma + kaldırma); 8 ölü modelin kaldırılması ya da bağlanması; ~51 gereksiz index'in `pg_stat_user_indexes` ile doğrulanıp kaldırılması; 25 FK'ye index; Json decoder katmanı; pgvector + HNSW + tek embedding modeli; `pg_trgm` GIN | F1.9 | L |
| **F5.6 Giriş yöntemleri ve onboarding** | Passkey (conditional UI), e-posta OTP, QR bağlamlı giriş bandı (işletme + kazanılacak puan), kalıcı CUSTOMER oturumu + step-up, adımlı onboarding, işletme kaydının ayrı kapıdan yapılması | F1.2 | L |
| **F5.7 Sürekli kalite kapıları** | Lighthouse CI (mobil; `/`, `/feedback/[code]`, `/customer`; LCP ≤ 2,5 sn, INP ≤ 200 ms, CLS ≤ 0,1), `public/` boyut bütçesi, kiracı izolasyonu sözleşme testleri (test DB'si, **asla canlı**), aylık restore tatbikatı (Neon branch), roadmap'in DB'ye taşınması (`RoadmapInitiative`) | hepsi | M, sürekli |

### 5.3 An Motoru ile koordinasyon (ayrı onaylı iş)

An Motoru'nun spec'i değiştirilmez. Aşağıdakiler **entegrasyon sözleşmesidir**; hangisi önce merge edilirse diğeri ona uyar.

| Kesişim | Durum | Karar |
|---|---|---|
| `creditPointsAndXp` kancası | An Motoru `level_up` ve `league_up` anlarını `creditPointsAndXp` içinde yakalıyor | F1.3'teki `economy.grant()`, `creditPointsAndXp` mantığını içeride kullanmaya devam eder. Böylece An Motoru kancası korunur, dönüş tipine dokunulmaz. Ledger göçünde "an yazımı" adımı `grant()` sırasına açıkça eklenir |
| Rozet verme noktaları (7) | Biri `app/api/gamification/progress/route.ts` POST | P0-14 bu ucu **kaldırır**. An Motoru bu uca `recordBadgeMoment` bağlamasın. F2.11'deki tek `awardBadge()` servisi `recordBadgeMoment`'ı tek yerden çağırır; diğer 6 nokta zamanla buna göç eder |
| Lig tanımı | An Motoru ligi bakiyeye göre hesaplıyor; dedupe `league:<toKey>` ömür boyu bir kez | F4.4'te lig sezon XP'ye geçer ve her sezon sıfırlanır. O noktada dedupe anahtarı `league:<seasonKey>:<toKey>` olmalı, yoksa ikinci sezondan itibaren lig kutlamaları hiç oynamaz. Ayrıca F0'da son lig kademesinin açık uçlu yapılması (100.000 üstü kullanıcının Başlangıç'a düşmesi hatası) An Motoru'nun yanlış `league_up` üretmesini önler |
| Seviye atlama hatası | `customer-dashboard.tsx` ~L362 bayat oturum karşılaştırması | An Motoru siliyor. Müşteri epiği M-E18'in "idempotent seviye atlama anı" maddesi An Motoru ile **kapanmış sayılır**; F3.1(b) bu bloğa dokunmaz |
| Azaltılmış hareket | An Motoru `lib/moments/effects.ts → prefersReducedMotion()` (OS **ve** `html.reduce-animations`) | Tek politika kaynağı olmalı. F1.5'teki `useMotionPolicy` bu fonksiyonu kullanır ya da An Motoru onu kullanır. İki ayrı uygulama olmaz. `MotionConfig reducedMotion` da aynı kaynaktan beslenir |
| Konfeti yolları | An Motoru 4 konfeti yolunu tek cepheye topluyor | F4.2 `GameShell` v2 ve F3.1 quests UI'ı doğrudan `canvas-confetti` import etmez (lint kuralı) |
| Deploy sırası | Spec: tablo canlıda olmadan kod deploy edilmez | `CustomerMoment` F0.10 şema penceresine dahil edilir; kod ondan sonra gelir (§8) |
| Dialog algılama | Host, açık dialog varken büyük anı başlatmıyor | F3.1(a) `useFirstRunQueue` ile uyumlu: ilk açılış kuyruğu da `[role="dialog"][data-state="open"]` sinyalini üretir |
| Kutlama süreleri | Seviye ~4 sn, lig ~4,5 sn | §4.2'deki `moment` token'ı (≤ 4,5 sn, atlanabilir) bu sahneler için tanımlıdır; `celebrate` (≤ 1,2 sn) puan kapsülü içindir |

### 5.4 Paralel yürütme: dosya çakışma noktaları

Aşağıdaki dosyalar birden çok epiğin kapsamında. Bu dosyalara dokunan işler **aynı ajana** verilmeli ya da sıralı birleştirilmeli.

| Dosya | Dokunan epikler | Kural |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/**` | Hepsi **[ŞEMA]** | Tek şema bekçisi ajanı; pencere bazlı birleştirme |
| `lib/auth.ts` | F0.2, F0.8 (magic 2FA), F1.2 | Bölge ayrımı: F0.2 `callbacks.redirect` + demo `authorize`; F1.2 `jwt` / `authorize` / `events` |
| `proxy.ts`, `next.config.js` | F0.3 (kapı), F0.8 (kamera, PWA), F1.1 (Origin), F2.10 (CSP nonce), F3.x (yönlendirmeler) | Faz 0'da tek "platform başlıkları" ajanı; yönlendirmeler nav kaydından üretilir (elle düzenlenmez) |
| `app/api/dealer/consumptions/route.ts` | F0.5 (B1), F1.3, F2.3 | Faz 0'da B1 alt ajanı; Faz 1'de `ConsumptionService`'e çıkarılır, route incelir |
| `app/api/feedbacks/route.ts` | F0.4 (STAFF scope), F1.3 (ledger), F2.7 (yan etkiler) | Sıralı; F2.7 yan etkileri ayrı modüle çıkarır |
| `app/api/ai/analyze/route.ts` | F0.4, F0.7, F1.8 | Aynı ajan (E şeridi) |
| `lib/points-wallet.ts` | An Motoru, F1.3 | An Motoru önce merge edilir; F1.3 onu sarar |
| `components/dashboard/sidebar.tsx` | F0.8 (a11y hızlı), F1.6, F3.1(a) | F1.6 dosyayı kayıt tabanlı yeniden yazar; diğerleri ondan sonra |
| `components/customer/customer-dashboard.tsx` | An Motoru, F3.1(b) | An Motoru önce; F3.1(b) sayfayı server page'e böler |
| `app/globals.css`, `tailwind.config.ts` | F0.8, F1.5 | D şeridi tek ajan |
| `app/dealer/feedbacks/page.tsx` | F0.5 (remedy), F0.7 (pazarlama), F3.2(b) | Faz 0'da tek ajan; Faz 3'te Gelen Kutusu'na taşınır |
| `app/api/qr-codes/**` | F0.6, F0.8 (kota), F3.2(f) | Faz 0'da tek ajan |

---

## 6. Kaldırılacak ve birleştirilecek sayfaların tam listesi

İşaretler: **KALDIR** = rota emekliye ayrılır, 301/308 ile yönlendirilir · **BİRLEŞTİR** = içerik hedef yüzeyde sekme ya da bölüm olur, eski URL yönlendirme olarak kalır · **TAŞI** = aynı işlev, yeni rota. Kesinleşmeden önce PostHog pageview verisine bakılmalı (F3 ön koşulu).

### 6.1 Müşteri ve herkese açık taraf

| Eski rota | Karar | Hedef |
|---|---|---|
| `/customer/discover` | KALDIR | `/customer` (işlev ⌘K / global arama) |
| `/customer/experiences` | KALDIR | İçerik `/customer/places/[dealerId]`'e |
| `/customer/nearby` | TAŞI | `/customer/places` (Yakınımda) |
| `/customer/favorites` | BİRLEŞTİR | Keşfet → Kaydettiklerim |
| `/customer/campaigns` | BİRLEŞTİR | Keşfet → Fırsatlar |
| `/customer/event` | BİRLEŞTİR | Keşfet → Fırsatlar |
| `/customer/category-leaderboard` | BİRLEŞTİR | Keşfet → En iyiler |
| `/customer/my-card` | TAŞI | Cüzdan → Kartım |
| `/customer/lounge` | BİRLEŞTİR | Cüzdan → Kartım → Statü |
| `/customer/rewards` | TAŞI | Cüzdan → Ödüller |
| `/customer/shop` | BİRLEŞTİR | Cüzdan → Ödüller → Kozmetik |
| `/customer/surprise-boxes` | BİRLEŞTİR | Cüzdan → Ödüllerim (günlük kutu Ana Sayfa'da) |
| `/customer/consumptions` | BİRLEŞTİR | Cüzdan → Hareketler |
| `/customer/spending-overview` | BİRLEŞTİR | Cüzdan → Hareketler → Özet |
| `/customer/donations` | BİRLEŞTİR | Cüzdan → Bağış |
| `/customer/progress-hub` | BİRLEŞTİR | Ben → İlerleme |
| `/customer/journey-score` | BİRLEŞTİR | Ben → İlerleme |
| `/customer/trends` | BİRLEŞTİR | Ben → İlerleme (öneri bölümü Keşfet'e) |
| `/customer/analytics` | BİRLEŞTİR | Ben → İlerleme |
| `/customer/badges` | TAŞI | Ben → İlerleme → Rozetler (alt sayfa) |
| `/customer/my-year` | TAŞI | Ben → Yılım |
| `/customer/feedbacks` | TAŞI | Ben → Seslerim |
| `/customer/feedbacks/[id]/journey` | BİRLEŞTİR | Seslerim detay çekmecesi |
| `/customer/consumptions/[id]` | BİRLEŞTİR | Seslerim detay çekmecesi (yorum düzenleme) |
| `/customer/remedy`, `/customer/remedy/[offerId]` | BİRLEŞTİR | Seslerim → Telafi + Cüzdan → Ödüllerim (kupon) |
| `/customer/ai-insights` | BİRLEŞTİR | Seslerim → "Sesin" özet kartı (churn ve aksiyon alanları kaldırılır) |
| `/customer/quests` | TAŞI | Oyna → Görevler |
| `/customer/squads` | TAŞI | Oyna → Klan |
| `/customer/leaderboard` | TAŞI | Oyna → Lig |
| `/customer/referral` | TAŞI | Ben → Davet |
| `/customer/settings` | TAŞI | Ben → Ayarlar |
| `/customer/games/<oyun>` × 21 | BİRLEŞTİR | Tek dinamik `/customer/games/[game]` (oyun kararları §7) |
| `/api/customer/games/pacman/*` | KALDIR | Generic `[game]` + registry |
| `/customer/ekip`, `/customer/ekip/departmanlar` | Kalır (teamOnly) | Paylaşılan `components/team/` korunur; tek `/ekip` rotası **değerlendirilir**, karar F3.3(h)'de |
| `/neden-qratex` | BİRLEŞTİR | `/isletmeler` alt bölümü |
| `/cerez-politikasi`, `/gizlilik-politikasi`, `/kvkk-aydinlatma-metni`, `/kullanim-sartlari` | TAŞI (URL'ler korunur) | `(legal)` rota grubu + `LegalDocument` |
| `/blog`, `/blog/[slug]` | Yeniden inşa | CMS kararı (Page modeli) |

### 6.2 Bayi ve personel

| Eski rota | Karar | Hedef |
|---|---|---|
| `/dealer/experience-guide` | KALDIR | `/dealer` (yardım bağlamsal "?" çekmecesine) |
| `/dealer/discover`, `/dealer/growth-hub` | KALDIR | ⌘K paleti + `/dealer/analytics` |
| `/dealer/copilot` | BİRLEŞTİR | Bugün (next-best-action) |
| `/dealer/operations-brief` | BİRLEŞTİR | Bugün |
| `/dealer/weekly-brief` | BİRLEŞTİR | Bugün → Haftalık rapor sekmesi + arşiv |
| `/dealer/onboarding` | BİRLEŞTİR | Bugün → kurulum kartı (tamamlanınca kaybolur) |
| `/dealer/feedbacks` | BİRLEŞTİR | `/dealer/inbox` |
| `/dealer/reviews` | BİRLEŞTİR | `/dealer/inbox` (kaynak: tüketim) |
| `/dealer/remedy-queue` | BİRLEŞTİR | `/dealer/inbox` → Telafi onayı |
| `/dealer/incidents` | BİRLEŞTİR | `/dealer/inbox` → Vakalar (eşikler Otomasyon → Uyarı kurallarında) |
| `/dealer/action-items` | BİRLEŞTİR | `/dealer/inbox` → Bana atananlar + Bugün → Yapılacaklar |
| `/dealer/churn-risk` | BİRLEŞTİR | Müşteriler → Risk |
| `/dealer/radar` | BİRLEŞTİR | Müşteriler → Geri kazanım |
| `/dealer/segment-actions` | BİRLEŞTİR | Müşteriler → Segmentler (yeniden inşa) |
| `/dealer/heatmap` | BİRLEŞTİR | Analitik → Yoğunluk |
| `/dealer/benchmark` | TAŞI | `/dealer/analytics/benchmark` |
| `/dealer/ai-insights` | TAŞI | `/dealer/analytics/insights` (öğrenme bölümü Ayarlar → AI'a) |
| `/dealer/roi`, `/dealer/business-outcomes` | BİRLEŞTİR | `/dealer/analytics/impact` |
| `/dealer/ai-chat`, `/dealer/ask-analytics` | BİRLEŞTİR | `/dealer/assistant` (+ ⌘J çekmece) |
| `/dealer/innovation` | PARÇALA | Flash teklif → Pazarlama/Teklifler; segment önerileri → Pazarlama/Kampanyalar; masa sinyali → Gelen Kutusu/Vakalar; haftalık özet → Bugün |
| `/dealer/settings/auto-replies` | TAŞI | `/dealer/automation/replies` |
| `/dealer/remedy-automation`, `/dealer/remedy-automation/templates` | TAŞI | `/dealer/automation/remedy` (şablonlar Pazarlama/Teklifler'de de görünür) |
| `/dealer/ai-settings`, `/dealer/billing` | BİRLEŞTİR | Ayarlar → AI, Ayarlar → Abonelik |
| `/staff/field` | BİRLEŞTİR | `/staff` (Saha bildirimi butonu) + `/dealer/team` (Saha akışı) |
| `/dealer/team` | Yeniden inşa | Aynı rota |
| `/dealer/campaigns/[id]/performance` | Yeniden inşa | Aynı rota (performans hunisi) |

### 6.3 Admin

| Eski rota | Karar | Hedef |
|---|---|---|
| `/admin/experience-pulse` | KALDIR | Uçları, modül girdisi ve menü satırıyla birlikte (iki ölü GET ucu her çağrıda `AnalyticsEvent` yazıyor) |
| `/admin/ecosystem` | KALDIR | Komuta Merkezi kartı |
| `/admin/tech/add` | KALDIR | Entegrasyonlar (üç formun kopyası) |
| `/admin/pages` | Ürün kararı | Yayın hattı kurulmayacaksa sayfa, API ve `Page` modeli birlikte kaldırılır; kurulacaksa yeniden inşa (blog CMS kararıyla birlikte) |
| Innovation demo araçları ("Paket aç", "Sadece plan"), bootstrap demo uçları | KALDIR (üretimden) | Yalnız `ALLOW_DEMO_SEED` ortamı |
| `/admin/platform-pulse` | BİRLEŞTİR | Komuta Merkezi |
| `/admin/insights` | BİRLEŞTİR | Analitik (sektör kırılımı boyut olur) |
| `/admin/dealers-health` + innovation "Sağlık 2.0" + `/admin/playbooks` | BİRLEŞTİR | Bayi Sağlığı (tek skor + bağlamlı playbook) |
| `/admin/segments` + `/admin/innovation/segment-proposals` | BİRLEŞTİR | Segmentler (kayıt defteri + tek onay kuyruğu) |
| `/admin/squads/battles` | BİRLEŞTİR | Klanlar → Savaşlar (yetim, kırık detay linki) |
| `/admin/points-matrix` + `/admin/gamification-settings` + `/admin/economy-sim` + `/admin/league-settings` | BİRLEŞTİR | Ekonomi Stüdyosu |
| `/admin/badges` + `/admin/character-thresholds` + `/admin/character-test` | BİRLEŞTİR | Rozetler (Katalog · Eşikler · Test lab) |
| `/admin/rewards` + `/admin/shop` | BİRLEŞTİR | Mağaza ve Ödüller (Ödüller · Kozmetik · Talepler) |
| `/admin/seasonal-campaigns` + `/admin/seasonal-concepts` | BİRLEŞTİR | Kampanyalar → Takvim |
| `/admin/coupons`, `/admin/surprise-boxes`, `/admin/referrals`, `/admin/discovery`, `/admin/donations` | Kalır (Kampanyalar alanında) | Ortak zaman çizelgesi ve bütçe |
| `/admin/ai-dashboard` + `/admin/ai-detailed` | BİRLEŞTİR | AI Operasyon |
| `/admin/ai-learning` + `/admin/ai-settings` + `/admin/modules/ai-tones` | BİRLEŞTİR | Prompt ve Model Stüdyosu |
| `/admin/ai-quality` + `/admin/qra-chat-logs` | BİRLEŞTİR | AI Kalite |
| `/admin/agent-council` + `/history` + `/agents` | BİRLEŞTİR | Ajan Konseyi (Oturum · Geçmiş · Ayarlar) ya da ürün kararıyla gizleme |
| `/admin/trust-command` + `/admin/fraud-prevention` | BİRLEŞTİR | Güven Merkezi |
| `/admin/privacy-requests` + `/admin/compliance` | BİRLEŞTİR | KVKK (privacy-requests kanonik) |
| `/admin/api-keys` + `/admin/partners` + `/admin/webhooks` + `/admin/api-catalog` | BİRLEŞTİR | Entegrasyonlar |
| `/admin/modules` + `/admin/features` + `/admin/ab-testing` (+ innovation deneyleri) | BİRLEŞTİR | Özellik ve Deney Kontrolü |
| `/admin/menu-groups` + `/admin/sidebar-order` (+ settings menü görünürlüğü) | BİRLEŞTİR | Navigasyon Stüdyosu (`/admin/navigation`) |
| `/admin/themes` + `/admin/design-language` + `/admin/accessibility` | BİRLEŞTİR | Tasarım Sistemi |
| `/admin/ekip` + `/admin/ekip/departmanlar` + `/admin/roadmap` | BİRLEŞTİR | Ekip (Pano · Departmanlar · Girişimler) |
| `/admin/settings`, `/admin/fraud-prevention`, `/admin/ai-dashboard`, `/admin/quests`, `/admin/squads/battles`, `/admin/segments`, `/admin/gate-settings` | Yeniden inşa | §5 F2.1, F2.9, F3.3 |

**Sayısal özet:** müşteri 58 → ~18 birincil yüzey; bayi 45 → ~24; admin 73 → ~40; public ve auth 22 → ~22 (rota grubu değişir, URL'ler korunur). Toplam **198 → ~105**.

---

## 7. Oyunlar: portföy kararı

### 7.1 Teşhis

İskelet sağlam: tek registry, generic start/complete, günlük unique kısıtı, atomik tek seferlik ödül, admin override katmanı. Ürün düzeyinde ise dört yapısal sorun var:

1. **Ödül istemci beyanına dayanıyor.** 21 oyunun ödülü betikle ~12 saniyede alınabiliyor.
2. **Ekonomi tavansız.** Günde ~3.250 puan (geri bildirim tavanının 6,5 katı). 20 paralel turnuva haftada 19.000 puanlık havuz dağıtıyor.
3. **"Günde 1 hak" bozuk.** Yenileme sınırsız deneme veriyor, kaybeden oyuncu 409 görüyor.
4. **Portföy tekrarlı.** 5 oyun aynı "sahteyi bul" mekaniğini kullanıyor. 6 oyunda okunarak doğrulanmış mantık hatası var. Açıklama ile mekanik birçok oyunda uyuşmuyor.

### 7.2 İlkeler

1. **Sunucu otoritesi:** sınıflandırma oyunlarında etiketler sunucuda tutulur, deterministik oyunlarda seed + girdi kaydı ile replay yapılır, aksiyon oyunlarında checkpoint + makullük kontrolü uygulanır. `won` bayrağı yalnız kozmetiktir.
2. **İki mod:** Pratik (sınırsız, ödülsüz) ve Sıralı (günde N deneme, ödüllü, liderlik ve turnuvaya girer).
3. **Oyunlar XP ve eğlence motorudur, ana puan kaynağı değildir.** Oyun kaynaklı puan toplam mint'in %25'ini geçemez. Ürünün kalbindeki davranış (gerçek ziyaret + kaliteli geri bildirim) ana kaynaktır.
4. **Az ama derin:** portföy tavanı **12**. Bir oyun girdiğinde, en zayıf performanslı oyun (D7 dönüşü ve oynanma payı en düşük olan) emekliye ayrılır.
5. **Ürüne bağlı anlam:** oyunlar güvenilir yorum, sahte tespiti ve mekân keşfi değer önerisini pekiştirir.

### 7.3 Oyun oyun karar (22 → 10 + 3 yeni)

| # | Mevcut oyun | Puan | Karar | Hedef | Gerekçe ve iş |
|---|---|---|---|---|---|
| 1 | `truth-vs-fake` | 4,5 | **BİRLEŞTİR → yeniden inşa** | **Sahte Avcısı** (amiral) — Kaydır modu | Çift tıklamada çift puan, 6+6 içerik havuzu. Sunucu puanlı `GameContentItem` havuzu, Elo zorluk |
| 2 | `review-detective` | 5,0 | **BİRLEŞTİR** | Sahte Avcısı — Dosya modu | Açıklamadaki "ipucu" mekaniği yok, sahte metinler karikatür |
| 3 | `word-spot` | 4,5 | **BİRLEŞTİR** | Sahte Avcısı — Kelime modu | "Hızlanan turlar" yok (sabit 5,5 sn), 10 kelime çifti |
| 4 | `bot-hunter` | 5,0 (görsel 7) | **BİRLEŞTİR** | Sahte Avcısı — Profil modu | Süre dolunca işaretlemeler yok sayılıyor (bayat closure), botlar emoji ya da isimden belli. Görsel dili amiral oyuna taşınır |
| 5 | `mind-thief` | 5,0 (görsel 7) | **KORU + cila** | Zihin Hırsızı | Görsel olarak en güçlü oyun. State updater içindeki yan etki temizlenir; `Boss3D` öfke geçişinde WebGL'i yeniden kurmaz |
| 6 | `spam-defense` | 5,0 | **BİRLEŞTİR** | **Çekirdek Savunması** | Her karede `setState`. Çekirdek HP, dalgalar, yükseltmeler |
| 7 | `troll-slayer` | 4,5 | **BİRLEŞTİR** | Çekirdek Savunması | Kaybetme koşulu yok, hareket kare hızına bağlı |
| 8 | `frost-catcher` | 5,0 | **KORU** (aile şablonu) | **Kar Tanesi Yakala** | En iyi yazılmış canvas oyunu (DPR, dt, reduced mode); motor şablonu olur |
| 9 | `guardian-of-trust` | 5,0 | **BİRLEŞTİR** | Kar Tanesi Yakala — "iyi/kötü" modifikatörü | Aynı mekanik aile |
| 10 | `pacman` | 3,8 | **MOTORA TAŞI** | Yıldız Avı | Ayrı kod yolu; liderlik, turnuva, seri ve admin desteği yok; stale closure yüzünden meşru oyuncu ödül alamıyor (Faz 0 hotfix). Registry'ye ve motora taşınır |
| 11 | `data-snake` | 5,3 | **KORU + seviye** | Veri Yılanı | Sağlam. Ödül eşiği işlevsiz (Faz 0); açıklamadaki "bot duvarları" seviye olarak gerçekleştirilir |
| 12 | `review-stack` | 5,5 | **KORU + giriş düzeltmesi** | Yorum İstifi | ≥ 640 px dokunmatik cihazda (iPad) kontrol yok |
| 13 | `spam-breaker` | 5,0 | **KORU** | Spam Kırıcı | Alt-adımlı fizik iyi. Ödül eşiği işlevsiz ve 120 Hz'de 2× hız (Faz 0 + motor) |
| 14 | `trust-merge` | 5,0 | **KORU** | Güven Birleştir | Skor birimi (karo) diğerlerinden farklı, başarımlar bozuluyor; normalizasyon gerekli |
| 15 | `signal-pipe` | 5,0 | **KORU + seviye/süre** | Sinyal Bağla | Süre ve hamle sınırı yok, garanti ödül; seviyeli ve süreli yapılır |
| 16 | `network-defender` | 3,8 | **YENİDEN İNŞA** (koşullu) | Salgın Durdur | İyi oynayan kaybediyor (enfeksiyon bir kez tohumlanıyor), id/indeks uyuşmazlığı grafı kırıyor. Faz 0'da dalga tabanlı yeniden tohumlama hotfix'i; F4.3'te ya dalga + karantina stratejisi olarak yeniden yazılır ya da portföy tavanı nedeniyle emekliye ayrılır |
| 17 | `speed-order` | 5,0 (işlev 3) | **KALDIR** (Faz 0'da düzeltilir) | — | Tek hatada tur kilitleniyor (Faz 0'da süre cezası hotfix'i). Schulte tablosu ürünle bağ kurmuyor; portföy tavanı içinde yer açmak için emekliye ayrılır |
| 18 | `memory-match` | 5,2 | **KALDIR** (Eşleştir-3 çıkınca) | — | Sabit 8 emoji, seviyesiz, kolay. Casual tutundurma rolünü yeni Eşleştir-3 üstlenir |
| 19 | `combo-tap` | 5,0 | **KALDIR** | — | mind-thief'in sade kopyası |
| 20 | `lucky-wheel` | 4,0 | **KALDIR** | — | Saf RNG, açıklamadaki "doğru anda durdur" becerisi yok; sunucu otoriter günlük çarkla (`/api/gamification/spin`) çakışıyor. Faz 0'da admin'den pasife alınır |
| 21 | `data-miner` | 4,5 | **KALDIR** | — | Saf şans; `maxScore 20` ulaşılamaz (en fazla 12). Faz 0'da pasif. Veri talep gösterirse "sayı ipuçlu Mayın Tarlası" olarak yeniden değerlendirilir |
| 22 | `/customer/games` (hub) | 5,5 | **YENİDEN TASARLA** | Oyna sekmesi | Kazanıldı/kaybedildi durumu, öne çıkan oyun, turnuva, pratik/sıralı seçimi |

**Yeni oyunlar (F4.3, sırasıyla):**

| Oyun | Tür | Neden |
|---|---|---|
| **Günün Kelimesi** | Wordle tarzı Türkçe, herkese aynı bulmaca | Tamamen sunucu doğrulamalı, paylaşılabilir sonuç kartı, günlük ritüel (Duolingo/Wordle tutundurma deseni). İlk yeni oyun |
| **Eşleştir-3** | Casual match-3, seviye haritası, Qratex rozet ikonları | Casual tutundurmanın en güçlü türü; memory-match'in yerini alır |
| **Mekân Bilgi Yarışması** | Bayi sponsorlu sorular, kategori bazlı, asenkron düello | Ürüne en sıkı bağlanan oyun; bayi için gelir ve görünürlük kanalı; mekân keşfini besler |

**Hedef portföy:** Sahte Avcısı (amiral) · Zihin Hırsızı · Çekirdek Savunması · Kar Tanesi Yakala · Yıldız Avı · Veri Yılanı · Yorum İstifi · Spam Kırıcı · Güven Birleştir · Sinyal Bağla = **10 mevcut**. Yeniler eklendikçe tavan 12 korunur: Günün Kelimesi ile 11, Eşleştir-3 ile 12. Mekân Bilgi Yarışması geldiğinde en zayıf oyun emekliye ayrılır. Salgın Durdur yalnız veri desteklerse geri döner.

**Meta katman:** tek "Oyun Pasosu" (sezonluk XP yolu, kozmetik ödüller), oyunlar arası günlük görevler ("2 farklı oyunda 1 yıldız al"), haftalık tek öne çıkan oyun turnuvası, klan liderliği entegrasyonu, paylaşılabilir sonuç kartı.

**Başarı ölçütleri:** sıralı denemede oyun başına %35–50 kazanma oranı; D7 oyun geri dönüşü izleniyor; oyun kaynaklı puan payı < %25; `|clientScore − verifiedScore| > 0` oranı < %1; liderlik p95 < 100 ms.

**Oyun yol haritası özeti:** Faz 0 (F0.5 + F0.8): tavan, deneme modeli, turnuva, 6 mantık hatası, pasife alma. Faz 1: effective config'in bileşenlere verilmesi. Faz 4: motor, sunucu otoritesi, portföy, meta.

---

## 8. Riskler ve deploy sırası

### 8.1 Değişmez kurallar

1. **Lokal ortam canlı Neon'a bağlı.** F0.1'in ilk işi lokal `.env`'i Neon dev branch'e çevirmek. O güne kadar hiçbir ajan `prisma`, seed, script, dev server, build ya da test çalıştırmaz.
2. **Canlı şemaya yalnızca göç dosyasıyla, yalnızca onayla.** Her pencereden önce yedek alınır (`scripts/db-backup-*`; F0.9'dan sonra private kovaya). Göç `migrate deploy` ile uygulanır; `db push` emekliye ayrılır.
3. **Genişlet → göç et → daralt (expand/contract).** Önce yalnız ekleyen değişiklik, sonra kod, en son kısıt veya kaldırma. Her adım ayrı deploy.
4. **Tablo önce, kod sonra.** Transaction içinde yeni tabloya yazan kod (An Motoru `CustomerMoment`, `PointsLedger`, `MessageOutbox`), tablo canlıda oluşmadan deploy edilmez. Aksi halde kredi transaction'ları iptal olur.
5. **Build-time DB fail-safe.** Statik üretilen public sayfaların yeni DB yardımcıları try/catch + varsayılan değer içermeli (proje kuralı); yoksa DB erişilemezken deploy patlar.
6. **Geçmiş etki denetimi salt okunur ve onaylı.** **[VERİ]** işaretli sorgular (çift ödenen görevler, rozet self-award kredileri, olağandışı happy-hour çarpanları, demo kirliliği) ayrı ve onaylı bir oturumda, yazma yetkisi olmayan bir rolle çalıştırılır. Düzeltme kararı (clawback ya da bırakma) ürün sahibinindir.

### 8.2 Riskler

| Risk | Olasılık / etki | Önlem |
|---|---|---|
| `db push` ile oluşmuş canlı şema `schema.prisma`'dan sapmış olabilir (drift) | Orta / yüksek | F0.1'de salt okunur `migrate diff --from-url`; baseline drift'i içermeli |
| `sessionVersion` etkinleşince bütün kullanıcıların oturumu düşer | Yüksek / orta | Kolon `@default(0)` ve JWT'de `sv` yoksa 0 kabul edilir; zorunluluk ikinci deploy'da. Kullanıcıya bildirim yapılır |
| Admin kapısı değişikliği adminleri dışarıda bırakır | Orta / yüksek | Break-glass prosedürü (env bayrağıyla geçici bypass + audit), önce staging; cevap değişince eski cookie'ler kasıtlı olarak geçersizleşir |
| `PointsLedger` göçünde bakiye sapması | Orta / yüksek | Açılış bakiyesi kaydı + 2 hafta çift yazım + gece mutabakatı; sapma 0 olmadan dedektörler ledger'a geçmez |
| `onDelete: Restrict`, silme yapan eski kodu kırar | Orta / orta | Önce kod arşive geçer (F0.6), sonra Restrict (F0.10 ikinci adım) |
| PWA değişikliği: eski SW istemcilerde önbellekte kalır | Yüksek / düşük | `skipWaiting` zaten açık; yeni SW'de eski cache'lerin temizlenmesi; QR hunisinde kayıt yok |
| Kamera izni açılınca istek fırtınası | Yüksek / orta | P0-36: `camera=(self)` ve `useQrScanner` ref kilidi **aynı PR'da** |
| Inngest kaldırılınca bazı işler sessizce durur | Orta / orta | Önce envanter (Inngest paneli); gerekli işler `daily` kaydına taşınmadan cron silinmez |
| CSP sıkılaştırması üçüncü taraf scriptleri kırar | Orta / orta | Nonce'lu CSP önce Report-Only; PostHog `/ingest` proxy'si |
| Sayfa birleştirmeleri SEO'yu ve yer imlerini kırar | Orta / düşük | Kayıttan üretilen 301'ler; PostHog'da eski/yeni pageview karşılaştırması |
| Oyun ödüllerinin düşürülmesi kullanıcı tepkisi doğurur | Orta / orta | Değişiklik "Puan Rehberi" ile şeffaf duyurulur; XP ve kozmetik ödül artırılır; sezon başlangıcına denk getirilir |
| Yasal metinlerin teknik ekip tarafından yazılması | Orta / yüksek | Metin içeriği hukuk danışmanıyla yazılır; teknik iskelet bağımsız ilerler |
| Bütçe: Neon free-tier, Vercel Hobby, Groq ücretsiz kota | Yüksek / orta | Tek uyanış ilkesi; AI token bucket ve devre kesici; Redis cache; `connection_limit=5` korunur (1 değil) |
| Çoklu ajanla paralel çalışmada çakışma | Yüksek / orta | §5.4 dosya çakışma tablosu; tek şema bekçisi; her epik kendi worktree'sinde |

### 8.3 Deploy sırası

Her sürüm bağımsız olarak geri alınabilir. **[O]** = proje sahibinin onayı gerekir.

| Sürüm | İçerik | Şema | Not |
|---|---|---|---|
| **R0** | F0.1: CI kapısı, `onRequestError`, ESLint, kırık testler; Neon dev branch; drift raporu **[O]** | Yok (yalnız baseline kaydı **[O]**) | Davranış değişmez |
| **R1** | Şemasız güvenlik hotfix'leri: F0.2, F0.3, F0.4, F0.7 (çoğu), F0.8 (`camera`, PWA, CSS, çöken sayfalar), F0.9 (Inngest cron silme) | Yok | R2 yedek kovası denetimi aynı gün **[O]** |
| **R2** | Şemasız ekonomi ve veri hotfix'leri: F0.5 (rewardedAt hariç), F0.6 | Yok | Geçmiş etki raporları **[VERİ][O]** |
| **R3** | **Şema penceresi #1** **[O]**: `sessionVersion`, `UserQuest.rewardedAt`, `AuditLog` nullable + SetNull, `QRCode.archivedAt`, `StripeEvent`, `CustomerMoment` | Yalnız ekleme | Yedek → `migrate deploy` → doğrulama |
| **R4** | R3'e bağlı kod: rewardedAt guard'ı, sv okuma (zorlamasız), audit snapshot, Stripe tekilliği | — | |
| **R5** | **An Motoru** kodu | — | Tablo R3'te oluştu |
| **R6** | `Feedback.qrCode onDelete: Restrict` + sv zorlaması **[O]** | Daraltma | Faz 0 çıkış kapısı |
| **R7…** | Faz 1: F1.1 dalgaları (alan alan); şema penceresi #2 **[O]**: `PointsLedger`, `JobRun`, `MessageOutbox`, `EmailSuppression`, `Notification.dedupeKey`; ardından ledger çift yazımı (2 hafta) → mutabakat temiz → ledger tek kaynak | Ekleme | Kritik yol |
| **Faz 2** | Şema penceresi #3 **[O]**: `DealerCustomerStats`, `Feedback.dealerId` (+ batch backfill + `CONCURRENTLY` index), `UserReward` durumları, `CampaignRecipient`, `Feedback.campaignId`, `aiStatus`, `LegalDocument`/`LegalAcceptance`, seasonal challenge alanları | Ekleme + backfill | Backfill'ler parça parça, gece |
| **Faz 3** | Yüzey sürümleri: her birleştirme kümesi ayrı sürüm + 301'ler; önce admin Güven ve Uyum (aynı kuyruğun iki yerde işlenmesi riski), sonra bayi Müşteriler, bayi Bugün, bayi Gelen Kutusu, müşteri Ben/İlerleme, müşteri sekme çubuğu | Yok ya da az | PostHog karşılaştırması |
| **Faz 4** | Şema penceresi #4 **[O]**: `MiniGameAttempt`, `UserGameStats`, `GameContentItem`, `TournamentResult`, sezon alanları, `UserYearSnapshot`; oyun sürümleri oyun başına | Ekleme | Sezon başlangıcına denk |
| **Faz 5** | Para tipleri (yeni sütun → çift okuma → kaldırma), şema temizliği (her kaldırma ayrı göç), pgvector | Genişlet/daralt | Model model |

**Doğrulama disiplini (her sürüm):** `tsc --noEmit` ile ilerlenir, `next build` en sona bırakılır. Görsel ve 3D değişiklikler headless Chrome tezgâhında ekran görüntüsüyle doğrulanır. Ekonomiye dokunan her yol için yarış testi (20 paralel istek → tek kredi). Her bayi route'u için kiracı izolasyonu sözleşme testi. Sayfa raporundaki doğrulanmış hata senaryosunun yeniden üretilemediği gösterilir. Hiçbir test canlı DB'ye bağlanmaz.

---

## Ek A — 198 sayfanın tek tek karar ve epik eşlemesi

Sütunlar: denetim puanı (genel) · denetim kararı · özellik sayısı / bozuk+sahte · hedef yüzey · yol haritası epikleri. Özellik bazında ayrıntı ve kanıt her sayfanın kendi raporunda (`musteri/*.md`, `bayi/*.md`, `admin/*.md`).

### A.1 Müşteri ve herkese açık (80)

| Route | Puan | Karar | Özl. / B+S | Hedef | Epikler |
|---|---|---|---|---|---|
| `/auth/complete` | 4,8 | yeniden tasarla | 29 / 3 | Kalır (onay adımı + gerçek davet sonucu) | F0.2, F0.5, F2.8, F5.6 |
| `/auth/forgot-password` | 5,5 | koru | 31 / 1 | Kalır | F0.2, F1.2 |
| `/auth/login` | 4,4 | yeniden tasarla | 41 / 5 | Kalır (demo kaldırılır) | F0.2, F0.3, F1.2, F5.6 |
| `/auth/magic` | 5,0 | koru | 29 / 2 | Kalır (2FA ara adımı) | F0.2, F0.7, F1.2 |
| `/auth/register` | 4,5 | yeniden tasarla | 44 / 4 | Kalır (doğrulama ekranı, onay kaydı) | F0.5, F0.8, F2.8, F5.6 |
| `/auth/reset-password` | 5,5 | koru | 36 / 0 | Kalır (oturum iptali) | F0.7, F1.2 |
| `/auth/verify-email` | 4,0 | yeniden tasarla | 29 / 2 | Kalır + yeniden gönderim | F0.8 |
| `/blog/[slug]` | 4,5 | yeniden tasarla | 35 / 2 | CMS / ArticleBody | F3.4 |
| `/blog` | 3,5 | yeniden tasarla | 37 / 3 | CMS | F3.4 |
| `/cerez-politikasi` | 3,5 | yeniden inşa | 34 / 5 | `(legal)` + tercih merkezi | F0.7, F2.8 |
| `/experience/[token]` | 3,3 | yeniden tasarla | 38 / 5 | Sunucu bileşeni + OG + moderasyon | F3.4, F4.5 |
| `/feedback/[code]` | 4,8 | yeniden tasarla | 51 / 7 | `(funnel)` + RatingInput + R2 foto | F0.8, F1.11, F2.7, F3.5 |
| `/gizlilik-politikasi` | 3,5 | yeniden inşa | 28 / 3 | `(legal)` | F2.8 |
| `/guven` | 4,0 | yeniden tasarla | 27 / 3 | Metin koda göre düzeltilir | F2.8 |
| `/kullanim-sartlari` | 3,8 | yeniden tasarla | 33 / 1 | `(legal)` + onay kaydı | F2.8 |
| `/kvkk-aydinlatma-metni` | 3,5 | yeniden inşa | 29 / 1 | `(legal)` + gerçek işleyenler | F2.8 |
| `/neden-qratex` | 5,0 | yeniden tasarla | 31 / 3 | `/isletmeler` alt bölümü | F3.4 |
| `/` | 4,5 | yeniden tasarla | 53 / 12 | Tüketici landing; sahte sosyal kanıt kalkar | F1.11, F3.4 |
| `/c/[token]` | 5,5 | yeniden tasarla | 43 / 4 | `(funnel)`; PII kalkar; callbackUrl | F0.4, F1.11, F3.1(f) |
| `/customer/ai-insights` | 4,0 | birleştir | 52 / 7 | Seslerim özet kartı | F0.8, F2.4, F3.1(e) |
| `/customer/analytics` | 4,0 | birleştir | 40 / 10 | Ben → İlerleme | F2.2, F3.1(e) |
| `/customer/badges` | 4,5 | yeniden tasarla | 52 / 12 | İlerleme → Rozetler | F0.4, F0.5, F2.11, F3.1(e), F4.5 |
| `/customer/campaigns` | 3,0 | yeniden inşa | 30 / 9 | Keşfet → Fırsatlar | F0.8, F2.11, F3.1(d) |
| `/customer/category-leaderboard` | 3,9 | birleştir | 36 / 2 | Keşfet → En iyiler | F2.2, F3.1(d) |
| `/customer/consumptions/[id]` | 4,4 | yeniden tasarla | 39 / 5 | Seslerim detay çekmecesi | F2.7, F3.1(e) |
| `/customer/consumptions` | 5,0 | yeniden tasarla | 36 / 3 | Cüzdan → Hareketler | F2.7, F3.1(c) |
| `/customer/discover` | 4,0 | birleştir | 24 / 4 | **KALDIR** → `/customer` | F3.1(g) |
| `/customer/donations` | 5,3 | koru | 57 / 4 | Cüzdan → Bağış | F2.5, F3.1(c) |
| `/customer/ekip/departmanlar` | 5,0 | koru | 35 / 1 | Kalır (teamOnly) | F3.3(h), F3.5 |
| `/customer/ekip` | 5,0 | birleştir | 78 / 4 | Kalır (teamOnly) | F0.4, F3.3(h) |
| `/customer/event` | 4,0 | birleştir | 34 / 4 | Keşfet → Fırsatlar | F2.11, F3.1(d) |
| `/customer/experiences` | 3,0 | yeniden inşa | 41 / 7 | **KALDIR** → mekân detayı | F3.1(d) |
| `/customer/favorites` | 3,8 | yeniden tasarla | 32 / 3 | Keşfet → Kaydettiklerim | F3.1(d) |
| `/customer/feedbacks/[id]/journey` | 4,8 | birleştir | 31 / 1 | Seslerim detay çekmecesi | F2.7, F3.1(e) |
| `/customer/feedbacks` | 4,5 | yeniden tasarla | 46 / 3 | Ben → Seslerim | F2.7, F3.1(e) |
| `/customer/games/bot-hunter` | 5,0 | yeniden tasarla | 50 / 3 | Sahte Avcısı (Profil) | F0.5, F4.1–F4.3 |
| `/customer/games/combo-tap` | 5,0 | yeniden tasarla | 51 / 4 | **KALDIR** | F4.3 |
| `/customer/games/data-miner` | 4,5 | yeniden tasarla | 46 / 4 | **KALDIR** (Faz 0'da pasif) | F0.5, F4.3 |
| `/customer/games/data-snake` | 5,3 | koru | 53 / 7 | Veri Yılanı | F0.8, F4.2, F4.3 |
| `/customer/games/frost-catcher` | 5,0 | birleştir | 47 / 3 | Kar Tanesi Yakala (şablon) | F4.2, F4.3 |
| `/customer/games/guardian-of-trust` | 5,0 | yeniden tasarla | 53 / 1 | Kar Tanesi Yakala (modifikatör) | F4.3 |
| `/customer/games/lucky-wheel` | 4,0 | birleştir | 44 / 3 | **KALDIR** (günlük çark kalır) | F0.5, F4.3 |
| `/customer/games/memory-match` | 5,2 | koru | 38 / 2 | **KALDIR** (Eşleştir-3 ile) | F4.3 |
| `/customer/games/mind-thief` | 5,0 | koru | 56 / 4 | Zihin Hırsızı | F4.2, F4.3 |
| `/customer/games/network-defender` | 3,8 | yeniden inşa | 48 / 5 | Salgın Durdur ya da kaldır | F0.8, F4.3 |
| `/customer/games/pacman` | 3,8 | birleştir | 49 / 5 | Yıldız Avı (motora) | F0.5, F4.2, F4.3 |
| `/customer/games` (hub) | 5,5 | yeniden tasarla | 36 / 3 | Oyna sekmesi | F0.5, F4.1, F4.3 |
| `/customer/games/review-detective` | 5,0 | birleştir | 44 / 2 | Sahte Avcısı (Dosya) | F4.3 |
| `/customer/games/review-stack` | 5,5 | koru | 54 / 1 | Yorum İstifi | F4.2, F4.3 |
| `/customer/games/signal-pipe` | 5,0 | koru | 42 / 1 | Sinyal Bağla | F4.3 |
| `/customer/games/spam-breaker` | 5,0 | koru | 50 / 5 | Spam Kırıcı | F0.8, F4.2 |
| `/customer/games/spam-defense` | 5,0 | birleştir | 45 / 2 | Çekirdek Savunması | F4.3 |
| `/customer/games/speed-order` | 5,0 | koru | 48 / 5 | Faz 0 düzeltme → **KALDIR** | F0.8, F4.3 |
| `/customer/games/troll-slayer` | 4,5 | birleştir | 55 / 3 | Çekirdek Savunması | F0.8, F4.3 |
| `/customer/games/trust-merge` | 5,0 | koru | 55 / 1 | Güven Birleştir | F4.3 |
| `/customer/games/truth-vs-fake` | 4,5 | birleştir | 46 / 4 | Sahte Avcısı (Kaydır) | F0.8, F4.3 |
| `/customer/games/word-spot` | 4,5 | birleştir | 44 / 2 | Sahte Avcısı (Kelime) | F4.3 |
| `/customer/journey-score` | 4,5 | birleştir | 47 / 8 | Ben → İlerleme | F2.2, F3.1(e) |
| `/customer/leaderboard` | 3,6 | yeniden inşa | 57 / 12 | Oyna → Lig | F0.4, F1.11, F2.2, F4.4 |
| `/customer/lounge` | 3,5 | birleştir | 36 / 8 | Cüzdan → Kartım → Statü | F4.4 |
| `/customer/my-card` | 4,5 | yeniden tasarla | 49 / 9 | Cüzdan → Kartım | F0.8, F3.1(f), F4.5 |
| `/customer/my-year` | 4,5 | yeniden tasarla | 31 / 3 | Ben → Yılım | F2.2, F4.5 |
| `/customer/nearby` | 4,0 | yeniden tasarla | 46 / 8 | **TAŞI** → `/customer/places` | F1.8, F3.1(d) |
| `/customer` (dashboard) | 4,6 | yeniden tasarla | 67 / 11 | Ana Sayfa (BFF + SSR) | An Motoru, F2.2, F3.1(b) |
| `/customer/progress-hub` | 4,0 | birleştir | 43 / 6 | Ben → İlerleme | F2.2, F3.1(e) |
| `/customer/quests` | 3,5 | yeniden inşa | 41 / 7 | Oyna → Görevler | F0.5, F2.11 |
| `/customer/referral` | 5,0 | yeniden tasarla | 36 / 3 | Ben → Davet | F0.5, F4.5 |
| `/customer/remedy/[offerId]` | 4,0 | yeniden tasarla | 33 / 4 | Seslerim / Ödüllerim | F0.5, F2.5 |
| `/customer/remedy` | 4,5 | yeniden tasarla | 32 / 4 | Seslerim → Telafi | F2.5, F3.1(e) |
| `/customer/rewards` | 4,6 | yeniden tasarla | 55 / 7 | Cüzdan → Ödüller | F2.5, F3.1(c) |
| `/customer/scan` | 5,4 | yeniden tasarla | 36 / 3 | Tara FAB | F0.8, F3.1(f) |
| `/customer/settings` | 4,3 | yeniden tasarla | 58 / 8 | Ben → Ayarlar | F0.7, F2.8, F5.1 |
| `/customer/shop` | 4,8 | yeniden tasarla | 50 / 8 | Cüzdan → Ödüller → Kozmetik | F0.5, F2.5 |
| `/customer/spending-overview` | 4,8 | birleştir | 38 / 1 | Cüzdan → Hareketler → Özet | F2.2, F3.1(c) |
| `/customer/squads` | 4,5 | yeniden tasarla | 53 / 10 | Oyna → Klan | F0.5, F4.4 |
| `/customer/surprise-boxes` | 5,0 | yeniden tasarla | 47 / 10 | Cüzdan → Ödüllerim | F2.5, F4.5 |
| `/customer/trends` | 3,9 | birleştir | 48 / 13 | Ben → İlerleme | F2.2, F3.1(e) |
| `/offline` | 4,5 | yeniden tasarla | 23 / 1 | Kalır (`location.reload`) | F1.7, F3.4 |
| `/surveys/[id]` | 4,5 | yeniden tasarla | 34 / 2 | Kalır (doğrulama, tekillik) | F0.8, F3.4 |
| `/table-signal` | 4,5 | yeniden tasarla | 39 / 1 | Kalır (rate limit, bayi bildirimi) | F3.4 |

### A.2 Bayi ve personel (45)

| Route | Puan | Karar | Özl. / B+S | Hedef | Epikler |
|---|---|---|---|---|---|
| `/dealer/experience-guide` | 2,5 | kaldır | 29 / 3 | **KALDIR** → `/dealer` | F3.2(a) |
| `/dealer/team` | 3,0 | yeniden inşa | 43 / 7 | İşletme → Ekip | F0.4, F1.2, F3.2(f) |
| `/dealer/segment-actions` | 3,0 | yeniden inşa | 31 / 7 | Müşteriler → Segmentler | F0.4, F0.8, F2.3, F2.6, F3.2(c) |
| `/staff/field` | 3,0 | birleştir | 31 / 7 | `/staff` + Ekip → Saha akışı | F0.4, F3.2(f) |
| `/dealer/campaigns/[id]/performance` | 3,2 | yeniden inşa | 25 / 5 | Pazarlama → Kampanya hunisi | F2.6 |
| `/dealer/ai-insights` | 3,5 | yeniden tasarla | 65 / 11 | Analitik → İçgörüler | F0.4, F2.4 |
| `/dealer/ai-settings` | 3,5 | yeniden tasarla | 47 / 19 | Ayarlar → AI | F0.6, F2.1 |
| `/dealer/customers` | 3,5 | yeniden inşa | 36 / 5 | Müşteriler 360 | F0.4, F2.3, F3.2(c) |
| `/dealer/incidents` | 3,5 | yeniden tasarla | 42 / 2 | Gelen Kutusu → Vakalar | F0.4, F0.8, F2.4, F3.2(b) |
| `/dealer/innovation` | 3,5 | birleştir | 41 / 7 | Parçalanır (§6.2) | F0.7, F0.8, F3.2 |
| `/dealer/weekly-brief` | 3,5 | birleştir | 31 / 4 | Bugün → Haftalık rapor | F0.7, F0.8, F2.4, F3.2(a) |
| `/dealer/ai-chat` | 3,8 | birleştir | 44 / 5 | AI Asistan | F1.8, F3.2(e) |
| `/dealer/campaigns` | 3,8 | yeniden tasarla | 38 / 4 | Pazarlama → Kampanyalar | F0.7, F2.6 |
| `/dealer/action-items` | 4,0 | yeniden tasarla | 39 / 3 | Gelen Kutusu → Bana atananlar | F0.4, F2.4, F3.2(b) |
| `/dealer/ask-analytics` | 4,0 | birleştir | 35 / 3 | AI Asistan | F1.8, F3.2(e) |
| `/dealer/business-outcomes` | 4,0 | birleştir | 31 / 2 | Analitik → Etki ve ROI | F1.9, F3.2(d) |
| `/dealer/feedbacks` | 4,0 | yeniden tasarla | 64 / 7 | Gelen Kutusu | F0.4, F0.5, F2.3, F3.2(b) |
| `/dealer/growth-hub` | 4,0 | birleştir | 28 / 0 | **KALDIR** → ⌘K | F1.6 |
| `/dealer/radar` | 4,0 | birleştir | 43 / 7 | Müşteriler → Geri kazanım | F0.7, F2.6, F3.2(c) |
| `/dealer/remedy-automation/templates` | 4,0 | yeniden tasarla | 39 / 3 | Otomasyon → Telafi | F0.5, F3.2(g) |
| `/dealer/scan` | 4,0 | yeniden tasarla | 56 / 4 | İşletme → Kasa | F0.5, F0.8, F3.2(f) |
| `/dealer/heatmap` | 4,2 | yeniden tasarla | 39 / 4 | Analitik → Yoğunluk | F1.9, F2.3, F3.2(d) |
| `/dealer/settings` | 4,2 | yeniden tasarla | 55 / 8 | Ayarlar | F0.6, F2.1, F3.2(i) |
| `/dealer/surveys/create` | 4,2 | yeniden tasarla | 42 / 2 | Pazarlama → Anketler | F0.8, F3.2(h) |
| `/staff` | 4,2 | yeniden tasarla | 44 / 4 | Personel Bugün | F1.2, F3.2(f) |
| `/dealer/benchmark` | 4,5 | yeniden tasarla | 43 / 7 | Analitik → Kıyas | F2.3, F3.2(d) |
| `/dealer/billing` | 4,5 | yeniden tasarla | 38 / 2 | Ayarlar → Abonelik | F0.8, F3.2(i) |
| `/dealer/churn-risk` | 4,5 | birleştir | 48 / 4 | Müşteriler → Risk | F0.4, F2.3, F3.2(c) |
| `/dealer/consumptions` | 4,5 | yeniden tasarla | 40 / 1 | İşletme → İşlemler | F0.4, F0.5, F3.2(f) |
| `/dealer/discover` | 4,5 | birleştir | 42 / 2 | **KALDIR** → ⌘K | F1.6 |
| `/dealer/operations-brief` | 4,5 | birleştir | 43 / 4 | Bugün | F0.7, F2.4, F3.2(a) |
| `/dealer/remedy-automation` | 4,5 | yeniden tasarla | 30 / 2 | Otomasyon → Telafi | F0.5, F3.2(g) |
| `/dealer/remedy-queue` | 4,5 | yeniden tasarla | 39 / 3 | Gelen Kutusu → Telafi onayı | F0.5, F3.2(b) |
| `/dealer/roi` | 4,5 | birleştir | 44 / 10 | Analitik → Etki ve ROI | F1.9, F3.2(d) |
| `/dealer/settings/auto-replies` | 4,5 | yeniden tasarla | 45 / 5 | Otomasyon → Yanıtlar | F0.7, F2.4, F3.2(g) |
| `/dealer/analytics` | 4,6 | yeniden tasarla | 49 / 8 | Analitik → Genel bakış | F1.9, F2.3, F3.2(d) |
| `/dealer/surveys/[id]/results` | 4,6 | yeniden tasarla | 37 / 1 | Pazarlama → Anket detayı | F0.8, F3.2(h) |
| `/dealer/qr-codes` | 4,8 | yeniden tasarla | 56 / 12 | İşletme → QR ve şubeler | F0.6, F0.8, F2.3, F3.2(f) |
| `/dealer/surveys` | 4,8 | yeniden tasarla | 31 / 2 | Pazarlama → Anketler | F0.8, F3.2(h) |
| `/dealer` | 5,0 | yeniden tasarla | 61 / 6 | Bugün | F2.3, F3.2(a) |
| `/dealer/products` | 5,0 | koru | 41 / 2 | İşletme → Ürünler | F3.2(f), F3.5 |
| `/dealer/reviews` | 5,0 | birleştir | 52 / 4 | Gelen Kutusu (tüketim) | F0.4, F0.7, F3.2(b) |
| `/dealer/voc-wall` | 5,0 | yeniden tasarla | 35 / 3 | İşletme → Mağaza ekranı + `/wall/[token]` | F0.7, F4.5 |
| `/dealer/copilot` | 5,2 | birleştir | 40 / 5 | Bugün | F2.4, F3.2(a) |
| `/dealer/onboarding` | 5,3 | yeniden tasarla | 32 / 2 | Bugün → kurulum kartı | F0.8, F3.2(a) |

### A.3 Admin (73)

| Route | Puan | Karar | Özl. / B+S | Hedef | Epikler |
|---|---|---|---|---|---|
| `/admin` | 4,5 | yeniden tasarla | 78 / 14 | Komuta Merkezi | F1.9, F3.3(a) |
| `/admin/ab-testing` | 3,0 | birleştir | 35 / 6 | Özellik ve Deney Kontrolü | F0.6, F5.2 |
| `/admin/accessibility` | 4,0 | birleştir | 27 / 1 | Tasarım Sistemi | F3.3(g) |
| `/admin/agent-council` | 4,8 | yeniden tasarla | 42 / 4 | Ajan Konseyi | F1.8, F3.3(d) |
| `/admin/agent-council/agents` | 2,5 | birleştir | 32 / 2 | Ajan Konseyi → Ayarlar | F0.6, F3.3(d) |
| `/admin/agent-council/history` | 2,5 | birleştir | 28 / 2 | Ajan Konseyi → Geçmiş | F3.3(d) |
| `/admin/ai-dashboard` | 3,5 | yeniden inşa | 42 / 9 | AI Operasyon | F0.6, F1.8, F3.3(d) |
| `/admin/ai-detailed` | 4,5 | birleştir | 34 / 4 | AI Operasyon | F0.4, F3.3(d) |
| `/admin/ai-learning` | 4,0 | yeniden tasarla | 47 / 3 | Prompt ve Model Stüdyosu | F0.7, F2.4, F3.3(d) |
| `/admin/ai-quality` | 3,9 | yeniden tasarla | 35 / 2 | AI Kalite | F0.6, F3.3(d) |
| `/admin/ai-settings` | 4,0 | yeniden tasarla | 45 / 17 | Prompt ve Model Stüdyosu | F0.7, F2.1 |
| `/admin/analytics` | 4,5 | yeniden tasarla | 50 / 7 | Analitik | F1.9, F2.3 |
| `/admin/api-catalog` | 5,0 | koru | 30 / 2 | Entegrasyonlar → Katalog | F2.10 |
| `/admin/api-keys` | 4,3 | yeniden tasarla | 42 / 3 | Entegrasyonlar | F2.10 |
| `/admin/audit` | 3,5 | yeniden tasarla | 37 / 6 | Denetim Günlüğü | F2.8 |
| `/admin/badges` | 4,5 | yeniden tasarla | 57 / 4 | Rozetler → Katalog | F0.6, F0.8, F2.11 |
| `/admin/cards` | 4,8 | yeniden tasarla | 48 / 4 | Kartlar | F0.6 |
| `/admin/character-test` | 3,9 | yeniden tasarla | 42 / 5 | Rozetler → Test lab | F0.5 |
| `/admin/character-thresholds` | 5,5 | koru | 33 / 1 | Rozetler → Eşikler | F0.6 |
| `/admin/compliance` | 4,2 | yeniden tasarla | 48 / 8 | KVKK → Envanter | F2.8 |
| `/admin/coupons` | 4,3 | yeniden tasarla | 36 / 3 | Kampanyalar → Kuponlar | F2.5 |
| `/admin/dealers-health` | 3,9 | birleştir | 35 / 3 | Bayi Sağlığı | F2.2 |
| `/admin/design-language` | 4,0 | birleştir | 32 / 1 | Tasarım Sistemi (yaşayan rehber) | F1.5, F3.3(g) |
| `/admin/discovery` | 3,5 | yeniden tasarla | 55 / 9 | Kampanyalar → Keşif ve Sponsorlu | F0.6 |
| `/admin/donations` | 3,5 | yeniden tasarla | 46 / 3 | Kampanyalar → Bağışlar | F2.5 |
| `/admin/economy-sim` | 3,0 | birleştir | 36 / 1 | Ekonomi Stüdyosu → Simülasyon | F0.8, F5.4 |
| `/admin/ecosystem` | 4,5 | birleştir | 25 / 0 | **KALDIR** → Komuta Merkezi | F3.3(a) |
| `/admin/ekip` | 5,0 | yeniden tasarla | 103 / 6 | Ekip → Pano | F0.6, F3.3(h) |
| `/admin/ekip/departmanlar` | 5,0 | yeniden tasarla | 43 / 1 | Ekip → Departmanlar | F0.6, F3.3(h) |
| `/admin/experience-pulse` | 3,5 | kaldır | 36 / 5 | **KALDIR** | F3.3 |
| `/admin/features` | 3,5 | birleştir | 34 / 4 | Özellik ve Deney Kontrolü | F0.6, F2.1 |
| `/admin/feedbacks` | 4,4 | yeniden tasarla | 65 / 8 | Geri Bildirimler | F0.5, F0.8 |
| `/admin/fraud-prevention` | 2,8 | yeniden inşa | 36 / 5 | Güven Merkezi | F0.6, F2.9 |
| `/admin/games` | 5,0 | koru | 37 / 6 | Oyunlar | F4.1 |
| `/admin/gamification-settings` | 3,5 | yeniden tasarla | 29 / 7 | Ekonomi Stüdyosu | F0.8, F2.1 |
| `/admin/gate-settings` | 3,5 | yeniden inşa | 26 / 4 | Sistem → Güvenlik ve Kapı | F0.3, F1.2 |
| `/admin/inbox` | 5,5 | koru | 42 / 0 | Gelen Kutusu | F2.10, F3.3(h) |
| `/admin/innovation` | 3,5 | yeniden tasarla | 47 / 5 | Parçalanır: Bayi Sağlığı, Segmentler, Deneyler | F0.6, F2.2 |
| `/admin/innovation/segment-proposals` | 4,0 | yeniden tasarla | 35 / 2 | Segmentler → Öneriler | F2.2, F2.6 |
| `/admin/insights` | 3,0 | birleştir | 31 / 4 | Analitik | F0.6 |
| `/admin/intern-emails` | 6,0 | koru | 45 / 1 | Stajyer Mailleri | F1.7, F3.3(h) |
| `/admin/league-settings` | 3,9 | yeniden tasarla | 30 / 4 | Ekonomi Stüdyosu → Ligler | F0.6, F2.2, F4.4 |
| `/admin/menu-groups` | 4,5 | birleştir | 38 / 3 | Navigasyon Stüdyosu | F0.6, F1.6, F3.3(g) |
| `/admin/modules` | 3,5 | birleştir | 29 / 1 | Özellik ve Deney Kontrolü | F2.1 |
| `/admin/modules/ai-tones` | 3,5 | yeniden tasarla | 30 / 2 | Prompt ve Model Stüdyosu → Üsluplar | F3.3(d) |
| `/admin/observability` | 4,0 | yeniden tasarla | 56 / 7 | Gözlemlenebilirlik + Arka Plan İşleri | F1.7, F1.9 |
| `/admin/pages` | 3,0 | yeniden inşa | 32 / 2 | Ürün kararı (kaldır ya da CMS) | F0.8, F3.4 |
| `/admin/partners` | 3,0 | birleştir | 33 / 4 | Entegrasyonlar | F2.10 |
| `/admin/platform-pulse` | 5,5 | koru | 41 / 0 | Komuta Merkezi | F3.3(a) |
| `/admin/playbooks` | 4,2 | yeniden tasarla | 42 / 3 | Bayi Sağlığı (bağlamlı) | F2.2 |
| `/admin/points-matrix` | 5,4 | koru | 48 / 4 | Ekonomi Stüdyosu → Matris | F0.5, F0.6, F1.3 |
| `/admin/pricing` | 3,8 | yeniden tasarla | 40 / 10 | Fiyatlandırma | F0.6, F0.8, F3.3(f) |
| `/admin/privacy-requests` | 4,5 | yeniden tasarla | 36 / 3 | KVKK → Talepler (kanonik) | F0.7, F2.8 |
| `/admin/qra-chat-logs` | 4,5 | yeniden tasarla | 40 / 1 | AI Kalite → Sohbet kayıtları | F0.7, F3.3(d) |
| `/admin/quests` | 3,2 | yeniden inşa | 43 / 10 | Görevler | F0.5, F0.8, F2.11 |
| `/admin/referrals` | 4,0 | yeniden tasarla | 29 / 1 | Davet Programı | F0.5 |
| `/admin/rewards` | 4,3 | yeniden tasarla | 43 / 9 | Mağaza ve Ödüller | F0.6, F0.8, F2.5 |
| `/admin/roadmap` | 4,3 | birleştir | 35 / 3 | Ekip → Girişimler | F5.7 |
| `/admin/seasonal-campaigns` | 4,0 | birleştir | 37 / 4 | Kampanyalar → Takvim | F0.5, F2.11 |
| `/admin/seasonal-concepts` | 4,3 | yeniden tasarla | 34 / 3 | Kampanyalar → Takvim (görsel katman) | F1.5 |
| `/admin/segments` | 3,9 | yeniden inşa | 35 / 3 | Segmentler | F2.2 |
| `/admin/seo` | 5,0 | yeniden tasarla | 52 / 5 | SEO | F0.8, F3.3(g) |
| `/admin/settings` | 3,0 | yeniden inşa | 80 / 26 | Sistem → Ayarlar | F0.6, F2.1 |
| `/admin/shop` | 4,8 | yeniden tasarla | 47 / 4 | Mağaza ve Ödüller → Kozmetik | F0.6, F0.8, F2.5 |
| `/admin/sidebar-order` | 4,5 | birleştir | 33 / 1 | Navigasyon Stüdyosu | F1.6, F3.3(g) |
| `/admin/squads` | 4,0 | yeniden tasarla | 34 / 2 | Klanlar | F0.5 |
| `/admin/squads/battles` | 3,5 | yeniden inşa | 37 / 8 | Klanlar → Savaşlar | F0.5, F0.8 |
| `/admin/surprise-boxes` | 5,2 | yeniden tasarla | 40 / 5 | Kampanyalar → Sürpriz Kutular | F0.5, F2.5 |
| `/admin/tech/add` | 4,0 | birleştir | 32 / 3 | **KALDIR** → Entegrasyonlar | F2.10 |
| `/admin/themes` | 4,5 | yeniden tasarla | 35 / 5 | Tasarım Sistemi → Temalar | F1.5, F3.3(g) |
| `/admin/trust-command` | 4,5 | yeniden tasarla | 46 / 8 | Güven Merkezi | F2.9 |
| `/admin/users` | 4,0 | yeniden tasarla | 69 / 8 | Kullanıcılar (+ 360) | F0.5, F0.6, F0.8, F5.3 |
| `/admin/webhooks` | 4,5 | yeniden tasarla | 42 / 3 | Entegrasyonlar → Webhook | F2.10 |

---

## Ek B — Panel epiklerinin yol haritası epiklerine eşlenmesi

Panel sentezlerindeki her epik aşağıdaki yol haritası epiklerinden birinde karşılanır. Hiçbiri düşürülmedi.

| Panel epiği | Yol haritası |
|---|---|
| **Müşteri** E1 giriş yönlendirme + demo + kapı | F0.2, F0.3 |
| E2 oturum ve hesap güvenliği | F0.2, F0.8, F0.10, F1.2 |
| E3 davet ve kayıt ekonomisi | F0.5, F0.8 |
| E4 mini oyun güven çekirdeği | F0.5 (Faz 0 kısmı), F4.1 |
| E5 puan basma yolları | F0.5 |
| E6 API yetki ve IDOR | F0.4, F1.1 |
| E7 rıza ve analitik gizliliği | F0.7, F1.7 (SW önbelleği) |
| E8 puan defteri ve tek-kaynak servisler | F1.3, F2.2 |
| E9 veri durumu katmanı ve i18n | F1.4, F3.5, F5.1 |
| E10 ödül teslim zinciri ve cüzdan | F2.5, F3.1(c) |
| E11 geri bildirim hattı | F2.7 |
| E12 Tara ve Kart | F0.8, F3.1(f) |
| E13 kampanya, etkinlik, görev motoru | F2.11 |
| E14 yasal belge altyapısı | F2.8 |
| E15 nav kaydı ve birleştirme | F1.6, F3.1 |
| E16 oyun kataloğu konsolidasyonu | F4.2, F4.3 |
| E17 lig ve sosyal rekabet | F2.2, F4.4 |
| E18 ana sayfa BFF | F3.1(b) + An Motoru (seviye anı) |
| E19 herkese açık ve SEO | F3.4 |
| E20 tasarım ve motion dili | F1.5, F3.5 |
| E21 Wrapped, paylaşım, anlar | F4.5 + An Motoru |
| E22 erişilebilirlik ve mobil | F3.1(a), F3.5, F4.2 |
| E23 giriş yöntemleri ve onboarding | F5.6 |
| **Bayi** P0-1 personel hesap güvenliği | F0.4, F1.2 |
| P0-2 kiracı kapsamı | F0.4 |
| P0-3 puan basma kapıları | F0.5 |
| P0-4 assignedToId ve PII DTO | F0.4 |
| P0-5 CLV acil yaması | F0.4 → F2.3 |
| P0-6 AI politika kapısı | F0.7 → F1.8 |
| P0-7 yıkıcı işlemler | F0.6 |
| P0-8 faturalama | F0.8, F0.10 |
| P0-9 kasa kamerası | F0.8 |
| P0-10 telafi bütünlüğü | F0.5 |
| P0-11 müşteriye dönük içerik güvenliği | F0.7 |
| P0-12 pazarlama acil kapısı | F0.7, F0.8 |
| P0-13 anket bütünlüğü | F0.8 |
| P0-14 arka plan kayıt hataları | F0.8 |
| P1-1 fetchJson + DataState | F1.4, F3.5 |
| P1-2 withDealerModule + nav | F1.6, F2.1 |
| P1-3 zaman ve dönem | F1.9, F2.3 |
| P1-4 metrik doğruluğu | F2.3 |
| P1-5 pazarlama teslim servisi | F2.6 |
| P1-6 DealerCustomerStats | F2.3 |
| P1-7 GET yan etkileri | F2.4 |
| P1-8 deterministik AI metrikleri | F2.4 |
| P1-9 kampanya atfı | F2.6 |
| P2-1 … P2-11 IA, Gelen Kutusu, Bugün, Müşteriler 360, Ekip, Analitik, AI Asistan, ayar dürüstlüğü, QR stüdyosu, anketler, otomasyon | F3.2(a–i), F2.1 |
| P3-1 … P3-5 kit ve motion, erişilebilirlik, i18n, ürünler, signage | F1.5, F3.5, F5.1, F3.2(f), F4.5 |
| **Admin** E1 kapı | F0.3, F1.2 |
| E2a görev idempotency | F0.5, F0.10 |
| E2b admin elle puan | F0.5 |
| E2c klan escrow | F0.5 |
| E2d davet kayıt yolu | F0.5 |
| E2e tüketim ve çarpan zinciri | F0.5, F1.3 |
| E2f görsel yükleme R2 | F0.8 |
| E3 demo karantinası | F0.6 |
| E4 denetim izi | F0.6, F0.10, F2.8 |
| E5 KVKK/DSR motoru | F0.7, F1.2, F2.8 |
| E6 çöken sayfalar | F0.8 |
| E7 "yükleme hatası canlıyı ezer" | F0.6, F1.4 |
| E8 yıkıcı işlemler | F0.6 |
| E9 AI kiracı sınırı | F0.4, F0.7, F1.8 |
| E10 admin UI çekirdeği | F1.4, F1.5 |
| E11a ayar kayıt defteri | F2.1 |
| E11b modül ve bayrak kontrol düzlemi | F2.1 |
| E12 Güven Merkezi | F2.9 |
| E13 ölçüm doğruluğu | F1.9, F2.3, F3.3(a) |
| E14 skor ve segment motorları | F2.2 |
| E15 entegrasyonlar | F2.10 |
| E16 oyunlaştırma doğruluğu | F2.2, F2.11, F4.1 |
| E17 teşvik ve ödül ürünleri | F2.5 |
| E18 Ajan Konseyi | F3.3(d) |
| E19 ekip sertleştirme | F3.3(h) |
| E20 menü yeniden yapılandırma | F1.6, F3.3 |
| E21 Navigasyon Stüdyosu | F3.3(g) |
| E22 içerik ve görünüm | F3.3(g), F3.4 |
| E23 gelen kutusu ve mail güvenliği | F2.10, F3.3(h) |
| E24 AI kalite döngüsü | F2.4, F3.3(d) |
| E25 erişilebilirlik ve dil | F3.5, F5.1 |
| E26 deney ürünü | F5.2 |
| E27 kullanıcı 360 | F5.3 |
| E28 ekonomi simülasyonu | F5.4 |
| E29 girişimler ve tasarım uyum ölçümü | F1.5, F5.7 |

---

*Bu belge salt okunur bir denetimin sentezidir. Burada önerilen hiçbir değişiklik uygulanmadı. Canlı veritabanı, R2 kovası, Inngest, Sentry ve PostHog yapılandırmaları doğrulanmadı. Bu noktalar metinde "doğrulanmadı" olarak işaretlendi ve Faz 0'da proje sahibinin panellerden kontrol etmesi gerekiyor.*
