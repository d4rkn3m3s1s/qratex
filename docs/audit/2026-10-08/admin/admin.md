# /admin

**Amaç:** Platform operatörünün (Qratex kurucuları/yöneticileri) giriş ekranı: kullanıcı, geri bildirim, kart/tüketim, AI, uyumluluk ve sistem sağlığını tek bakışta özetlemek ve diğer ~70 admin modülüne yönlendirmek.

**Genel puan:** 4.5/10 · **Karar:** **yeniden tasarla** (veri katmanının büyük kısmı kullanılabilir; ama bilgi mimarisi, metrik doğruluğu ve veri çekme modeli baştan kurgulanmalı)

> Özet hüküm: Sayfa açılıyor, yetki kontrolleri sayfa yolu için doğru ve görsel olarak "dolu" görünüyor. Ancak bir komuta merkezinin tek görevi olan **"şu an neye bakmam gerekiyor?"** sorusuna cevap vermiyor. Aynı sayılar 4-5 kez tekrarlanıyor, birkaç metrik **yanlış etiketlenmiş veya işaretini kaybetmiş** ("Toplam (30 gün)" aslında tüm zamanlar; yüzdeler adet gibi gösteriliyor; negatif büyüme yeşil). "En iyi işletmeler" listesi sıralanmamış rastgele 10 bayiden oluşuyor. Sayfa her 45 saniyede, sekme arka plandayken bile 13 isteği yeniden atıyor ve bunlardan biri (`/api/admin/settings`) admin gizli kapı ayarı dahil tüm ayar değerlerini tarayıcıya taşıyor. Ayrıca gizli kapı `/api/admin/*` uçlarını hiç kapsamıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Bölümlerin çoğu veri gösteriyor; fakat 10 özellik bozuk (yanlış etiket, kayıp işaret, uygulanmayan derin linkler, rastgele "en iyi" listesi), 4 özellik sahte trend/rozet içeriyor. |
| UX | 4/10 | ~16 bölümlük tek uzun sütun, öncelik yok, aksiyon alınabilir uyarı yok, aynı metrik 4-5 kez; KPI kartları tıklanamaz çıkmaz sokak. |
| Görsel | 6/10 | Kart dili tutarlı ve temiz, karanlık tema düşünülmüş; ama her kartta gradient+blur+gölge aşırı, başlık boyutları bölümden bölüme değişiyor, Spotlight efekti geçersiz CSS yüzünden hiç görünmüyor. |
| Mimari | 4/10 | 658 satırlık tek istemci bileşeni, 13 ayrı uç + 13 `useState`, `fetch` sonucu `res.ok` kontrolsüz, stale closure, diğer admin sayfalarının kullandığı `AdminPremiumHero`/i18n yerine ayrı bir hero ve sabit metin. |
| Performans | 4/10 | Görünürlükten bağımsız 45 sn polling; önbelleksiz ağır uçlar (10.000 müşteri + 3 alt sayım, tüm ayarlar, tüm 30 günlük ActionItem satırları); `analytics` tam yükü (root-cause, benchmark, heatmap) gereksiz yere çekiliyor; her 5 sn tüm ağaç yeniden render. |
| Erişilebilirlik + mobil | 5/10 | Mobilde grid'ler yığılıyor; fakat iç içe `<main>`, `<ul>` içinde `<div>`, metinsiz `<button>`'lar, klavyede görünmez odaklanan link, 9-10 px metinler ve 36 kısayolluk mobil kaydırma yükü var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (i18n anahtarlı) | ÇALIŞIYOR | `app/admin/page.tsx:5-7` | `segmentLayoutMetadata` ile. |
| 2 | Sayfa erişimi: ADMIN rolü + gizli kapı cookie | ÇALIŞIYOR | `proxy.ts:59-87` | Yalnızca `/admin` sayfa yolları için. |
| 3 | API yetkisi (13 uç, `requireAuth(['ADMIN'])`) | KISMİ | `lib/api-auth.ts:52-80`, `proxy.ts:105-119` | Rol + token-replay var; gizli kapı `/api/*` için hiç uygulanmıyor (Bulgu 1). |
| 4 | Route `loading.tsx` (paylaşılan iskelet) | ÇALIŞIYOR | `app/admin/loading.tsx:1` | |
| 5 | Hata sınırı (`error.tsx`, Sentry, Tekrar Dene) | ÇALIŞIYOR | `app/admin/error.tsx:13-24` | |
| 6 | İstemci iskelet durumu | ÇALIŞIYOR | `app/admin/admin-dashboard-client.tsx:203-213` | `loading.tsx` ile çift iskelet zinciri oluşuyor (önce route, sonra istemci). |
| 7 | Tam sayfa "Veriler yüklenemedi" + Yenile | ÇALIŞIYOR | `admin-dashboard-client.tsx:215-224` | Neden (401/500/ağ) ayrımı yok. |
| 8 | Otomatik yenileme (45 sn) | KISMİ | `admin-dashboard-client.tsx:182`, `admin-utils.ts:53` | Sekme gizliyken de çalışır, uçuştaki isteği beklemez, iptal (AbortController) yok. |
| 9 | "Son güncelleme" etiketi | KISMİ | `admin-dashboard-client.tsx:185-191` | İstemcinin fetch zamanı; verinin kendisi 60-300 sn önbellekli (`dashboard/route.ts:318`, `install-to-value/route.ts:31`). |
| 10 | Yenile butonu | ÇALIŞIYOR | `admin-dashboard-client.tsx:243-245` | |
| 11 | Hata toast'ları | BOZUK | `admin-dashboard-client.tsx:166-182` | Stale closure: `data` hep `null` görünür → arka plan hatasında her 45 sn toast; metinler Türkçe karaktersiz ("Baglanti hatasi olustu"). |
| 12 | Bölüm bazlı hata durumu (13 yardımcı uç) | EKSİK | `admin-dashboard-client.tsx:61-73`, `:163` | `res.ok` kontrolü yok, hata `catch {}` ile yutuluyor; bölüm sessizce kayboluyor. |
| 13 | Ambient arka plan | ÇALIŞIYOR | `admin-dashboard-client.tsx:229-233` | Dekoratif. |
| 14 | Hero: saate göre selamlama + ad | ÇALIŞIYOR | `components/HeroSection.tsx:28-33`, `:115-118` | |
| 15 | Hero: avatar + yönetici kalkanı | ÇALIŞIYOR | `HeroSection.tsx:80-95` | |
| 16 | Hero: avatar üstünde hover "Ayarlar" linki | KISMİ | `HeroSection.tsx:96-101` | Sadece hover'da görünür; klavye odağında `opacity-0` kalır, dokunmatikte erişilemez. |
| 17 | Hero: "Yönetim paneli · Canlı veri" rozeti (ping animasyonu) | SAHTE | `HeroSection.tsx:106-112` | Veri canlı değil; 60-300 sn önbellek + 45 sn polling. |
| 18 | Hero: "Son 30 gün: +X% kullanıcı · +Y% geri bildirim" | BOZUK | `HeroSection.tsx:127-145` | `dark:text-emerald-300` her durumda eklenir → karanlık temada negatif büyüme de yeşil. |
| 19 | Hero: 3 sayaç çipi | ÇALIŞIYOR | `HeroSection.tsx:151-164` | Aynı veri sağdaki "Anlık özet"te tekrar. |
| 20 | Hero: "Anlık özet" kartı + trend hapı | ÇALIŞIYOR | `HeroSection.tsx:168-219` | |
| 21 | Hero: Spotlight efekti | BOZUK | `HeroSection.tsx:71`, `components/ui/spotlight.tsx:27` | `hsl(var(--primary))` + `"40"` → `hsl(...)40` geçersiz renk; gradient hiç çizilmiyor. |
| 22 | Hero: FloatingOrbs | ÇALIŞIYOR | `components/customer/floating-orbs.tsx:13-41` | Müşteri paneli bileşeni; azaltılmış harekette opacity döngüsü sürer. |
| 23 | StatsCard: Toplam Kullanıcı + değişim | KISMİ | `app/api/admin/dashboard/route.ts:260-268`, `components/dashboard/stats-card.tsx:36,81` | Negatif değişimde eksi işareti düşüyor ("20%" kırmızı). |
| 24 | StatsCard: Toplam Yorum + değişim | KISMİ | `dashboard/route.ts:269-276`, `:43` | Soft-delete edilmiş feedback'ler sayıma dahil; işaret kaybı aynı. |
| 25 | StatsCard: Aktif Kartlar "trendi" | SAHTE | `dashboard/route.ts:280` | `change` = aktivasyon oranı; kart bunu "+X% son 30 gün" diye gösteriyor. |
| 26 | StatsCard: Tüketimler "trendi" | SAHTE | `dashboard/route.ts:288` | `change: 0` sabit → her zaman "0% son 30 gün". |
| 27 | KPI: Install-to-value (medyan, P95, n) | KISMİ | `admin-dashboard-client.tsx:255-291`, `lib/install-to-value.ts:24,79-118` | Dakika ham gösterilir (ör. "43200 dk"); kart tıklanamaz; yanıt tüm bayi dizisini taşıyor. |
| 28 | Install-to-value açıklama tooltip'i | ÇALIŞIYOR | `admin-dashboard-client.tsx:265-278` | Bilgi ikonu yerine `Circle` kullanılmış. |
| 29 | KPI: Aksiyon tamamlama (30 gün) | KISMİ | `admin-dashboard-client.tsx:292-305`, `lib/kpis/action-completion.ts:52-59` | Neyin aksiyonu olduğu yazmıyor; link yok; sunucu 30 günlük tüm ActionItem satırlarını belleğe alıyor. |
| 30 | KPI: Tenant health (ort. skor + risk sayısı) | KISMİ | `admin-dashboard-client.tsx:101-105,306-320`, `lib/tenant-health.ts:77-92` | 14 gündür hiç feedback almayan bayi 100 puan alıyor → ortalama şişiyor; eşik (70) istemcide sabit; `/admin/dealers-health`'e link yok. |
| 31 | Sunucu durumu kartı (DB gecikmesi, ortam) | KISMİ | `admin-dashboard-client.tsx:325-366`, `app/api/admin/system-status/route.ts:22-38` | Yalnız DB `SELECT 1`; Redis/AI/cron/R2 yok. Uç hata verirse kart tamamen kaybolur (en çok gerektiği an). |
| 32 | E-posta yapılandırma rozeti | ÇALIŞIYOR | `admin-dashboard-client.tsx:348-358` | |
| 33 | Ayar özeti kartı (kategori/anahtar sayısı) | KISMİ | `admin-dashboard-client.tsx:151-162,367-387`, `app/api/admin/settings/route.ts:61-110` | İki sayı için 5000'e kadar tüm ayar değeri (iki kopya) çekiliyor; gizli kapı cevabı dahil (Bulgu 1). |
| 34 | CSAT (4-5 yıldız oranı) | ÇALIŞIYOR | `admin-dashboard-client.tsx:398-415` | |
| 35 | Acil aksiyonlar (AI) toplamı | KISMİ | `admin-dashboard-client.tsx:423`, `app/api/admin/dealers-ai-stats/route.ts:25-26,100-103` | Acil+toksik+churn toplanıyor; aynı yorum birden çok kez sayılabilir; 90 gün / bayi başı 500 tavanı etiketsiz. |
| 36 | Son 7 gün mini bar grafik | ÇALIŞIYOR | `admin-dashboard-client.tsx:429-452` | 14 günlük grafikle ve "Son 7 gün" kartıyla tekrar. |
| 37 | Ana özellikler (7 modül kartı) | ÇALIŞIYOR | `admin-utils.ts:81-89`, `components/NavigationGrids.tsx:8-30` | Hızlı erişim ve sidebar ile tekrar. |
| 38 | Analitik: Kullanıcı büyüme kartı | ÇALIŞIYOR | `components/AnalyticsSection.tsx:30-39` | |
| 39 | Analitik: Geri bildirim büyüme kartı | BOZUK | `AnalyticsSection.tsx:40-49`, `app/api/admin/analytics/route.ts:145,172,315-336` | "Şimdiki/Önceki" sayıları tüketim yorumu içerir (önceki dönemde içermez), % ise yalnız QR feedback'ten → aynı kartta tutarsız iki kaynak. |
| 40 | Analitik: Ortalama puan | ÇALIŞIYOR | `AnalyticsSection.tsx:50-55` | |
| 41 | Analitik: Rol bazlı kullanıcılar | KISMİ | `AnalyticsSection.tsx:60-65`, `admin-utils.ts:72-78`, `prisma/schema.prisma:22-27` | `STAFF` rolü "Müşteri" olarak etiketleniyor → iki "Müşteri" satırı. |
| 42 | Analitik: Puan dağılımı (1-5) | ÇALIŞIYOR | `AnalyticsSection.tsx:74-92` | |
| 43 | Analitik: 14 günlük trend grafiği | KISMİ | `AnalyticsSection.tsx:95-153`, `analytics/route.ts:217-242` | Gün sınırları sunucu saat diliminde (TZ ayarı yok → UTC); TR 00:00-03:00 arası önceki güne düşer. Sadece `title` tooltip. |
| 44 | Analitik: "Duygu dağılımı (30 gün)" kartı | BOZUK | `AnalyticsSection.tsx:158-176`, `analytics/route.ts:515-519` | API yüzde döndürüyor, kart adet gibi gösteriyor ("62 Olumlu"). |
| 45 | Analitik: "Son 7 gün geri bildirim" toplamı | ÇALIŞIYOR | `AnalyticsSection.tsx:177-185` | Tekrar. |
| 46 | Analitik: "Büyüme özeti" kartı | BOZUK | `AnalyticsSection.tsx:186-198` | Renk koşulsuz `text-green-600` → negatif büyüme yeşil. |
| 47 | Analitik: "Toplam (30 gün)" kartı | BOZUK | `AnalyticsSection.tsx:199-207`, `analytics/route.ts:97,100,507-508` | Gösterilen `totalUsers`/`totalFeedbacks` tüm zamanlar; etiket "30 gün". |
| 48 | "Tüm analitik →" linki | ÇALIŞIYOR | `AnalyticsSection.tsx:210-214` | |
| 49 | AI özeti: 4 sayaç | KISMİ | `components/AiSection.tsx:25-50` | 90 gün ve bayi başı 500 tavanı belirtilmiyor. |
| 50 | AI özeti: Intent dağılımı | KISMİ | `AiSection.tsx:51-80`, `dealers-ai-stats/route.ts:62` | Ham İngilizce etiketler (complaint, praise…). |
| 51 | AI özeti: Son AI analizleri listesi | KISMİ | `AiSection.tsx:81-101` | Duygu rozeti ham "positive/negative"; satırlar tıklanamaz (feedback detayına gitmez). |
| 52 | "AI Kontrol Merkezi →" linki | ÇALIŞIYOR | `AiSection.tsx:104-108` | |
| 53 | Duygu çubuğu (3 tıklanabilir segment) | BOZUK | `components/SentimentSection.tsx:46-75`, `app/admin/feedbacks/page.tsx:172-176` | `?sentiment=` hedef sayfada okunmuyor → filtre uygulanmıyor. %15 altı segmentte buton metinsiz (erişilebilir ad yok); `min-w-[2rem]` 0 değerde de alan kaplar. |
| 54 | Duygu kartları (3 link) | BOZUK | `SentimentSection.tsx:78-110` | Aynı derin link sorunu; ayrıca çubuk ile aynı hedefe ikinci kez link. |
| 55 | Veri yokken 33/33/34 dağılım | SAHTE | `SentimentSection.tsx:13-15` | Boş veride eşit dağılım çiziliyor; "veri yok" durumu yok. Pencere tüm zamanlar, etiketlenmemiş. |
| 56 | "En iyi işletmeler" listesi | BOZUK | `dashboard/route.ts:82-86,184-192` | `orderBy` olmadan herhangi 10 bayi alınıp kendi içinde sıralanıyor; gerçek en iyiler değil. Soft-delete filtresi de yok (`:169-177`). |
| 57 | "Son yapılanlar" zaman çizelgesi (30 öğe) | KISMİ | `components/TimelineSection.tsx:13-84`, `admin-dashboard-client.tsx:193-200` | Öğeler tıklanamaz, filtre yok; `<ul>` içinde `<div>` (`TimelineSection.tsx:31`); soft-deleted feedback'ler listelenebilir (`dashboard/route.ts:69-77`). |
| 58 | "Tüm kullanıcılar / Tüm geri bildirimler" butonları | ÇALIŞIYOR | `TimelineSection.tsx:87-94` | |
| 59 | Platform özeti (5 sayaç) | KISMİ | `admin-dashboard-client.tsx:513-532` | Hero ve StatsCard ile 3. tekrar; feedback toplamı silinmişleri içerir. |
| 60 | Kartlar özeti (4 sayaç) | ÇALIŞIYOR | `admin-dashboard-client.tsx:535-558` | Aynı veri zaten `/api/admin/dashboard` yanıtında (`dashboard/route.ts:314`) varken ayrı `/api/admin/cards` isteği atılıyor. |
| 61 | "Kartlar →" linki | ÇALIŞIYOR | `admin-dashboard-client.tsx:556` | |
| 62 | Teknoloji & Entegrasyon (bayrak/webhook/API anahtarı) | ÇALIŞIYOR | `admin-dashboard-client.tsx:561-574`, `app/api/admin/tech-summary/route.ts:18-24` | |
| 63 | Teknoloji "Ekle" butonu | ÇALIŞIYOR | `admin-dashboard-client.tsx:566` | `/admin/tech/add` mevcut. |
| 64 | Müşteri segmentleri rozetleri | KISMİ | `admin-dashboard-client.tsx:578-596`, `app/api/admin/segments/route.ts:15-35` | Önbelleksiz 10.000 müşteri + 3 alt sayım her 45 sn; 10.000 üstünde sessizce yanlış; rozet linki segment filtresi taşımıyor. |
| 65 | Uyumluluk özeti (log kapsamı) | ÇALIŞIYOR | `admin-dashboard-client.tsx:597-619`, `app/api/admin/compliance/overview/route.ts:65-98` | |
| 66 | Şüpheli aktivite uyarısı | ÇALIŞIYOR | `admin-dashboard-client.tsx:609-614` | Aksiyon linki yok (fraud ekranına gitmez). |
| 67 | Son denetim kayıtları (8) | KISMİ | `admin-dashboard-client.tsx:623-645` | Ham `entity/action` kodları; satır detayına link yok; yalnızca e-posta. |
| 68 | "Tüm denetim günlüğü →" | ÇALIŞIYOR | `admin-dashboard-client.tsx:643` | |
| 69 | Hızlı erişim (36 kısayol) | ÇALIŞIYOR | `admin-utils.ts:91-128` | Tüm hedefler mevcut (doğrulandı); ama sidebar'ın kopyası, aynı ikon iki farklı modülde (Eye, Trophy). |
| 70 | Mobil yerleşim | KISMİ | `admin-dashboard-client.tsx:513-531,648-654` | Bazı bölüm başlıkları responsive değil (`text-2xl`, `w-12` sabit); 36 kısayol mobilde ~18 satır kaydırma. |
| 71 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232`, `app/globals.css:801-818` | `MotionConfig reducedMotion="user"` + global CSS var; FloatingOrbs opacity döngüsü sürer. |
| 72 | Semantik / klavye erişilebilirliği | KISMİ | `app/admin/layout.tsx:35`, `admin-dashboard-client.tsx:238` | İç içe `<main>`; `TimelineSection.tsx:39` alt'sız `AvatarImage`; segment emojileri `aria-hidden` değil. |
| 73 | Çok dilli (i18n) arayüz | EKSİK | `admin-dashboard-client.tsx` geneli | Diğer admin sayfaları `useAppT` kullanıyor (`app/admin/feedbacks/page.tsx:39,141`); bu sayfa sabit TR + yer yer EN ("Tenant health", "Install-to-value", "Intent"). |
| 74 | Tarih aralığı / karşılaştırma seçici | EKSİK | — | Pencereler karışık (tüm zamanlar, 30 g, 14 g, 7 g, 90 g) ve seçilemez. |
| 75 | Uyarı / "dikkat gerektirenler" merkezi | EKSİK | — | Acil AI, şüpheli aktivite, riskli bayi, mail hatası tek bir aksiyon listesinde değil. |
| 76 | Puan ekonomisi ve oyunlaştırma sağlığı | EKSİK | — | Basılan/harcanan puan, escrow, ödül kullanımı, oyun ödülü dolandırıcılık sinyali yok. |
| 77 | Dışa aktarma / paylaşım / anlık görüntü | EKSİK | — | |
| 78 | Kişiselleştirme (widget gizle/sırala/sabitle) | EKSİK | — | |

**Sayım:** ÇALIŞIYOR 33 · KISMİ 24 · BOZUK 10 · SAHTE 4 · EKSİK 7 (toplam 78)

---

## Bulgular

### 1. Gizli kapı `/api/admin/*` uçlarını kapsamıyor; dashboard da kapı cevabını tarayıcıya taşıyor
- **Önem:** yüksek · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** `proxy.ts:105-119` (`/api/` yolu `authMiddleware`'e hiç girmiyor, doğrudan `NextResponse.next()`), `proxy.ts:79-87` (kapı kontrolü yalnız `pathname.startsWith('/admin')`), `lib/api-auth.ts:52-80` (`requireAuth` kapı cookie'sine bakmıyor), `app/api/admin/settings/route.ts:61-110` (filtre olmadan tüm ayar değerleri), `lib/admin-gate.ts:8-15` ("Cevap İSTEMCİYE ASLA gönderilmez", ayar anahtarı `admin_gate`/`security`), `app/api/admin/settings/admin-gate/route.ts:19-26` (GET cevabı döndürüyor), `admin-dashboard-client.tsx:89`.
- **Sorun:** Gizli kapının tasarım amacı "rolü kazara ADMIN yapılmış biri panele giremesin". Ama bu kişi tarayıcı konsolundan veya curl ile `GET /api/admin/settings/admin-gate` çağırıp cevabı okuyabiliyor; daha da önemlisi kapıyı hiç geçmeden bütün `/api/admin/*` yazma uçlarını kullanabiliyor. Bu sayfa da her 45 sn'de `/api/admin/settings` çağırıyor; `admin_gate` satırı varsa (admin cevabı bir kez değiştirdiyse) cevap `settings.security.admin_gate.answer` olarak istemci belleğine ve DevTools ağ kaydına düşüyor.
- **Öneri:** (a) Kapı doğrulamasını `requireAuth` içine taşıyın: `allowedRoles` ADMIN içeriyorsa `cookies().get('admin_gate')` alınıp `verifyGateCookie(cookie, userId, answer)` ile doğrulansın (cevap Redis'te 60 sn önbellekle okunabilir); `/api/admin/gate` ve `/api/admin/settings/admin-gate` dışındaki tüm admin uçları için 403 `GATE_REQUIRED`. (b) `GET /api/admin/settings` için `security` kategorisi ve hassas anahtarlar sunucuda bir deny-list ile maskelensin. (c) Dashboard ayar özetini `/api/admin/settings?summary=1` gibi yalnız sayım döndüren bir moddan alsın. Testi `admin-gate.test.ts`'e "API kapı cookie'siz 403" senaryosu olarak ekleyin.

### 2. "En iyi işletmeler" gerçekte rastgele 10 bayi
- **Önem:** yüksek · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `app/api/admin/dashboard/route.ts:82-86` (`where: { role: 'DEALER' }, take: 10`, `orderBy` yok), `:169-177` (yalnızca bu 10 bayinin istatistikleri), `:184-192` (sıralama sonradan, sadece bu 10 içinde). Aynı kalıp `analytics/route.ts:111-115` ve `:271-284`'te de var.
- **Sorun:** Postgres `ORDER BY` olmadan dönen sıra garantisiz; bayi sayısı 10'u aştığı anda liste en çok feedback alanları değil, tablo fiziksel sırasındaki ilk 10'u gösterir. Başlık "En çok geri bildirim alan ve en yüksek puanlı işletmeler" diyor; operatör yanlış bayiyi ödüllendirebilir veya gerçek lideri hiç görmeyebilir.
- **Öneri:** Sıralamayı veritabanında yapın: `SELECT q."dealerId", COUNT(f.id) cnt, AVG(f.rating) avg FROM "Feedback" f JOIN "QRCode" q ... WHERE f."deletedAt" IS NULL AND f."createdAt" >= $from GROUP BY 1 ORDER BY cnt DESC LIMIT 10`, ardından isimleri `user.findMany({ where: { id: { in } } })` ile çekin. "En iyi"nin tanımını netleştirin (hacim mi, Bayesian ortalama puan mı) ve zaman penceresini başlıkta yazın. Her satırı bayi detayına linkleyin.

### 3. Yanlış etiketlenmiş ve işaretini kaybeden metrikler
- **Önem:** yüksek · **Kategori:** veri doğruluğu / UX · **Efor:** S
- **Kanıt:**
  - Yüzde adet gibi: `analytics/route.ts:515-519` yüzde döndürür, `AnalyticsSection.tsx:164-172` sayı gibi basar.
  - "Toplam (30 gün)" aslında tüm zamanlar: `analytics/route.ts:97,100,507-508` → `AnalyticsSection.tsx:201-205`.
  - Negatif büyüme yeşil: `AnalyticsSection.tsx:189,193` (koşulsuz `text-green-600`), `HeroSection.tsx:129-130,139-140` (`dark:text-emerald-300` her durumda).
  - Eksi işareti kayboluyor: `components/dashboard/stats-card.tsx:36,81` (`Math.abs`, negatifte `-` eklenmiyor).
  - Sahte trendler: `dashboard/route.ts:280` (aktivasyon oranı "son 30 gün değişimi" gibi), `:288` (`change: 0` sabit).
  - Geri bildirim büyüme kartında iki kaynak: `analytics/route.ts:145` (tüketim yorumları yalnız mevcut dönem), `:315-336` (current/previous) vs `:172` (yüzde yalnız QR feedback).
  - Aynı sayfada iki farklı "geri bildirim büyümesi": StatsCard `dashboard/route.ts:147-151` (QR+tüketim) ve hero `HeroSection.tsx:143` (yalnız QR, `analytics`).
- **Sorun:** Bir operatör panosunda sayıların güvenilirliği tek değerdir. Kullanıcı kaybını yeşil "büyüme" olarak görmek, yüzdeyi adet sanmak veya tüm zamanlar toplamını aylık sanmak doğrudan yanlış karara götürür; ikisi aynı ekranda farklı büyüme değeri gösterince panoya güven kalmaz.
- **Öneri:** Tek bir `MetricValue` sözleşmesi kurun: `{ value, unit: 'count'|'percent'|'minutes'|'score', window: '30d'|'all', delta?: { pct, direction }, source }`. Bütün kartlar bu tipten render etsin; işaret ve renk tek bir `<DeltaBadge>` bileşeninde yönden (`direction`) türetilsin (iyi/kötü yönü metrik başına `higherIsBetter` ile). Pencere etiketi otomatik basılsın. Büyüme hesapları tek bir sunucu fonksiyonunda (QR feedback + tüketim yorumu birleşik, iki dönem için aynı kapsam) yapılsın; `dashboard` ve `analytics` aynı fonksiyonu çağırsın. Anlamsız `change` alanları (aktivasyon oranı, sabit 0) kaldırılsın veya gerçek dönemsel değişimle değiştirilsin.

### 4. Polling modeli: gizli sekmede de 13 istek / 45 sn, önbelleksiz ağır uçlar dahil
- **Önem:** orta · **Kategori:** performans / maliyet · **Efor:** M
- **Kanıt:** `admin-dashboard-client.tsx:77-90,180-182` (13 paralel istek, `setInterval`, `visibilityState` kontrolü yok, uçuştaki istek beklenmiyor); `app/api/admin/segments/route.ts:15-47` (önbelleksiz, 10.000 müşteri × 3 `_count` + groupBy); `app/api/admin/settings/route.ts:61-66` (5000'e kadar satır, iki kopya yanıt); `lib/kpis/action-completion.ts:52-59` (30 günlük tüm ActionItem satırları JS'te gruplanıyor, önbellek yok); `analytics/route.ts` sections parametresi verilmeden çağrılıyor (`admin-dashboard-client.tsx:81`) → root-cause (1200 satır), 250 bayi benchmark ve heatmap boşuna hesaplanıp gönderiliyor; `cards?page=1&pageSize=1` (`:83`) aynı veri `dashboard` yanıtında varken (`dashboard/route.ts:314`) ekstra findMany+count+groupBy.
- **Sorun:** Açık bırakılan her admin sekmesi Neon'a sürekli yük bindiriyor (önceki oturumlarda bu uçların bazıları 11-19 sn ölçülmüştü, bkz. route yorumları). Önbelleği soğuk olan uçlar 45 sn'den uzun sürerse istekler üst üste biner.
- **Öneri:** Tek bir `GET /api/admin/overview?range=30d&sections=...` toplayıcısı yazın; içeride her bölüm kendi Redis anahtarını (farklı TTL: sağlık 15 sn, KPI 5 dk) kullanan `Promise.allSettled` ile çalışsın ve bölüm başına `{ ok, data, error, generatedAt }` döndürsün. İstemcide SWR/React Query ile `refreshInterval` + `refreshWhenHidden: false` + `dedupingInterval`; sağlık bölümünü ayrı ve sık, ağır analitik bölümünü 5 dk'da bir yenileyin. `segments` sayımını SQL `CASE` ile tek sorguya indirin ve cron'da önceden hesaplayın; `analytics` çağrısına `sections=overview,trends` geçin.

### 5. Hata yönetimi: stale closure ile toast spam'i, bölümlerin sessizce kaybolması
- **Önem:** orta · **Kategori:** güvenilirlik / UX · **Efor:** S
- **Kanıt:** `admin-dashboard-client.tsx:182` (`useEffect(..., [])` ilk render'daki `refreshAll`'u yakalar) → `:171,176` içindeki `if (!data)` her zaman `null`'ı görür; `:61-66` `res.ok` kontrolü yok; `:163` `catch { /* ignore */ }`; `:325`, `:367`, `:578`, `:597` bölümler yalnız veri varsa render ediliyor.
- **Sorun:** Ağ kesintisinde veri ekranda dururken her 45 sn "Dikkat: Baglanti hatasi olustu" toast'ı çıkar. Tersine, yardımcı uçlardan biri 500 dönerse ilgili kart hiçbir iz bırakmadan kaybolur; en kritik örnek: DB sorunu varken `system-status` 500 dönerse "Sunucu durumu" kartı görünmez, kullanıcı sorunu göremez. Oturum süresi dolunca (401) kullanıcı login'e yönlenmiyor.
- **Öneri:** Veri katmanını hook'a taşıyın (`useAdminOverview`), `res.ok` değilse tipli hata döndürün, 401'de `signIn()`/login'e yönlendirin. Her bölüm için ortak `<SectionState status="error" onRetry>` bileşeni; veri bayatsa üst barda "Son başarılı güncelleme: 3 dk önce · yeniden deneniyor" uyarısı. Toast yalnız kullanıcı tetiklemeli yenilemede çıksın. Sistem durumu kartı hata durumunda kırmızı "Durum alınamadı" olarak kalmalı (fail-visible).

### 6. Sağlık skoru ve KPI'lar yanlış güven veriyor, çıkmaz sokak
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** M
- **Kanıt:** `lib/tenant-health.ts:77-92` (son 14 günde hiç feedback almayan bayi: `usageTrend=1`, ceza yok → 100 puan), `admin-dashboard-client.tsx:102` (risk eşiği 70 istemcide sabit), `:255-320` (üç KPI kartı da link değil), `lib/install-to-value.ts:24` (30 gün tavanı → "43200 dk" gibi gösterim), `app/api/admin/system-status/route.ts:22-38` (yalnız DB kontrolü).
- **Sorun:** Tamamen ölü (churn etmiş) bayiler ortalamayı yükseltiyor; "Tenant health 96/100" en riskli durumu iyi gösterir. KPI'lar sorun gösterse bile operatör tıklayıp kimin etkilendiğini göremiyor; `/admin/dealers-health` sayfası var ama bağlı değil. "Sunucu durumu" adı Redis, AI sağlayıcı, cron, R2 ve mail teslimatını kapsamıyor.
- **Öneri:** Sağlık skoruna "aktivite yok" cezası ekleyin (ör. 14 gün sıfır feedback → -40 ve `inactive` bayrağı) ve skoru dağılım olarak gösterin (sağlıklı/izlenecek/riskli/pasif sayıları). Eşiği sunucuya taşıyın (`atRiskCount` API'den gelsin). KPI kartlarını ilgili detay sayfalarına derin linkleyin. Süreleri `formatDuration` (dk/sa/gün) ile gösterin. Sistem durumunu `lib/observability` altında genişletin: DB, Redis ping, AI sağlayıcı son hata oranı, son cron çalışma zamanları (fail-closed cron'lar için kritik), mail son gönderim sonucu; her biri `ok/warn/error` ve `/admin/observability` linki.

### 7. Duygu derin linkleri uygulanmıyor; boş veride sahte dağılım
- **Önem:** orta · **Kategori:** işlevsellik · **Efor:** S
- **Kanıt:** `SentimentSection.tsx:48,58,68,78,89,100` (`/admin/feedbacks?sentiment=...`), `app/admin/feedbacks/page.tsx:150,172-176` (yalnız `search` parametresi okunuyor, `sentimentFilter` hep `'all'` başlar), `SentimentSection.tsx:13-15` (toplam 0 iken 33.33/33.33/33.34).
- **Sorun:** Altı tıklanabilir öğe filtreli liste vaat edip filtresiz liste açıyor. Hiç veri yokken eşit üç renkli çubuk gerçek bir dağılım gibi görünüyor. Bölüm tüm zamanları gösteriyor, sayfadaki diğer duygu kartı 30 günü; ikisi de etiketsiz.
- **Öneri:** Feedbacks sayfasında `useSearchParams` ile `sentiment`, `dealer`, `from`, `to` parametrelerini başlangıç filtresine bağlayın (URL = filtre durumu). Dashboard'da duyguyu tek bir yerde, seçilen pencerede gösterin; toplam 0 ise boş durum çizin. Çubuk segmentlerine `aria-label="Olumlu: 120 (%62)"` verin, iki ayrı link yerine tek etkileşim bırakın.

### 8. Bilgi mimarisi: aynı veri 4-5 kez, 16 bölüm, öncelik yok
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi · **Efor:** L
- **Kanıt:** Toplam kullanıcı: `HeroSection.tsx:154`, `:179`, StatsCard (`dashboard/route.ts:262`), `admin-dashboard-client.tsx:520`, `AnalyticsSection.tsx:202`. Büyüme %: `HeroSection.tsx:123-147`, `:181,187`, `AnalyticsSection.tsx:35,45,189,193`. 7 günlük geri bildirim: `admin-dashboard-client.tsx:429-452`, `AnalyticsSection.tsx:177-185`, 14 gün grafiği. Navigasyon: `ANA_OZELLIKLER` (7) + `HIZLI_ERISIM` (36) + sidebar (`app/admin/layout.tsx:27`); `settings` 4 farklı yerden linkli.
- **Sorun:** Stripe/Linear/PostHog gibi araçlarda giriş ekranı "neyin değiştiği ve neyin dikkat istediği" etrafında kurulur. Burada sayfa bir modül vitrini + sayaç kataloğu; asıl dikkat gerektiren sinyaller (çözülmemiş şüpheli aktivite, acil AI yorumları, riskli bayi) sayfanın ortasında küçük kartlarda kalıyor. Hızlı erişim gridi sidebar'ın kopyası ve mobilde uzun kaydırma yaratıyor.
- **Öneri:** Aşağıdaki "Yeniden tasarım vizyonu"na göre 5 bölgeye indirin: (1) Dikkat gerektirenler, (2) KPI şeridi + dönem seçici, (3) Trend + duygu, (4) Platform sağlığı + ekonomi, (5) Aktivite akışı. Ana özellikler/Hızlı erişim yerine Cmd+K komut paleti ve "sabitlenmiş modüller" (kullanıcı başına 6) koyun.

### 9. Yumuşak silme (soft delete) tutarsızlığı
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `prisma/schema.prisma` Feedback `deletedAt` alanı; `lib/prisma.ts` içinde otomatik filtre/extension yok; `dashboard/route.ts:43,55-63,69-77,169-177` filtre yok, ama `:239` duygu SQL'i `deletedAt IS NULL` uyguluyor; `analytics/route.ts:100-102,116-124` filtre yok, `:267,:359,:443` var; `compliance/overview/route.ts:78` yok.
- **Sorun:** Silinmiş yorumlar toplamlara, büyüme oranlarına, CSAT'e ve "Son yapılanlar"a giriyor; duygu toplamı ile "Toplam Yorum" hiçbir zaman eşleşmiyor. Silinen kötü niyetli/spam bir yorum panoda görünmeye devam ediyor.
- **Öneri:** `prisma.$extends` ile Feedback okuma sorgularına varsayılan `deletedAt: null` ekleyen bir "active" istemci (veya `activeFeedbackWhere` yardımcı sabiti) oluşturun; ham SQL'lerde ortak bir `ACTIVE_FEEDBACK_SQL` parçası kullanın. Panoda gerekiyorsa "silinen" sayısını ayrı gösterin.

### 10. Rol etiketi: STAFF "Müşteri" olarak gösteriliyor
- **Önem:** düşük · **Kategori:** doğruluk · **Efor:** S
- **Kanıt:** `admin-utils.ts:72-78` (`default: 'Müşteri'`), `prisma/schema.prisma:22-27` (`STAFF` rolü var), `AnalyticsSection.tsx:60-65`, `TimelineSection.tsx:47`.
- **Sorun:** Rol dağılımında iki ayrı "Müşteri" satırı çıkar; personel kayıtları zaman çizelgesinde müşteri gibi görünür.
- **Öneri:** Rol etiket/renk eşlemesini `Record<Role, ...>` olarak `lib/roles.ts`'de tek kaynakta tanımlayın (exhaustive, TS derleme zamanında eksik rolü yakalasın), tüm admin sayfaları bunu kullansın.

### 11. Erişilebilirlik ve semantik hatalar
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** İç içe `<main>`: `app/admin/layout.tsx:35` ve `admin-dashboard-client.tsx:238`. `<ul>` içinde `<div>`: `TimelineSection.tsx:30-31`. Metinsiz butonlar: `SentimentSection.tsx:54,64,74` (%15 altı). Klavyede görünmez odak: `HeroSection.tsx:96-101` (`opacity-0`, `focus-visible` yok). Alt'sız görsel: `TimelineSection.tsx:39`. Bilgi ikonu yerine `Circle`: `admin-dashboard-client.tsx:272`. 9-10 px metinler: `:283,:360,:409,:442`. Grafikler yalnız `title` ile: `AnalyticsSection.tsx:124`, `admin-dashboard-client.tsx:440`.
- **Öneri:** İçteki `<main>`'i `<div>` yapın; dekoratif çizgiyi `<ul>` dışına alın; çubuk/grafikler için gizli bir veri tablosu (`sr-only`) veya `role="img"` + özet `aria-label`; hover linkine `focus-visible:opacity-100 focus-visible:pointer-events-auto`; minimum 12 px metin; `Info` ikonu.

### 12. Görsel gürültü ve çalışmayan efekt
- **Önem:** düşük · **Kategori:** görsel · **Efor:** S
- **Kanıt:** `components/ui/spotlight.tsx:27` + `HeroSection.tsx:71` (geçersiz renk → efekt görünmez), `HeroSection.tsx:72-76` (FloatingOrbs + iki ek blur katmanı), `admin-dashboard-client.tsx:229-233` (sabit ambient katman), hemen her kartta `backdrop-blur-sm shadow-lg hover:shadow-xl` + sol gradient şerit; bölüm başlıkları bazen responsive (`text-lg sm:text-xl md:text-2xl`) bazen sabit `text-2xl` (`:516,:539,:627,:651`).
- **Sorun:** Veri yoğun bir operatör ekranında her kartın parlaması hiyerarşiyi düzleştiriyor; önemli olan (uyarı) ile önemsiz (API anahtarı sayısı) aynı görsel ağırlıkta. Diğer admin sayfaları `AdminPremiumHero` kullanırken burada ayrı bir hero var.
- **Öneri:** Kart varyantlarını üçe indirin (nötr, vurgulu, uyarı); blur/gölgeyi yalnız hero ve modallarda bırakın. Spotlight'ı ya `hsl(var(--primary) / 0.25)` ile düzeltin ya da kaldırın. Başlık ölçeğini tek bir `SectionHeader` bileşenine bağlayın.

### 13. Mimari borç: dev istemci bileşeni, `any`, sabit metin
- **Önem:** düşük · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `admin-dashboard-client.tsx` 658 satır, 13 `useState`, her 5 sn tüm ağacı yeniden render eden `tick` (`:183`); `dashboard/route.ts:97,167,184,192,195,207` ve `analytics/route.ts:133-134,179,207,287,298,350` `any`; i18n yok (bkz. #73); `admin-toast.ts:17,19` "Basarili"/"Dikkat" önekleri Türkçe karaktersiz.
- **Öneri:** Sayfayı bir server component kabuğu + bölüm başına küçük istemci adaları olarak bölün; ilk veriyi sunucuda (Redis önbellekten) çekip `initialData` olarak verin (iskelet zincirini ortadan kaldırır). "x dk önce" etiketini kendi küçük bileşenine alın. API yanıtları için zod/TS tipleri paylaşılan `lib/admin-overview-types.ts`'de dursun. Metinleri `useAppT` anahtarlarına taşıyın.

---

## Eksik özellikler (kıyas ürünlerle)

1. **"Dikkat gerektirenler" gelen kutusu (Linear Inbox / Stripe "Needs attention"):** Çözülmemiş şüpheli aktivite, acil/toksik AI yorumları, riskli bayiler, başarısız cron/mail, bekleyen KVKK talepleri (`/admin/privacy-requests`), fraud sinyalleri; her satırda sahip ata / çözüldü işaretle / ilgili kayda git.
2. **Global dönem seçici + karşılaştırma (Stripe, PostHog):** 24s / 7g / 30g / 90g / özel; "önceki dönemle karşılaştır"; seçim URL'de saklansın ve tüm kartlara uygulansın.
3. **Puan ekonomisi ve oyunlaştırma sağlığı:** son 24 saatte basılan/harcanan puan, escrow bakiyesi, `points_credited` anomali uyarıları, ödül/sürpriz kutu kullanımı, mini oyun ödül reddi oranı. (Platformun ana iş modeli bu; panoda hiç yok.)
4. **Sparkline'lı KPI şeridi ve tıklanınca detay çekmecesi (Stripe Home):** her KPI'da mini trend, hedef çizgisi ve sağdan açılan detay paneli.
5. **Cmd+K komut paleti + sabitlenmiş modüller (Linear, Retool):** 36 kısayolluk grid yerine arama tabanlı gezinme; kullanıcı başına kişiselleştirilebilir pano.
6. **Gerçek sistem sağlığı ve olay zaman çizelgesi (Vercel/Datadog tarzı):** DB, Redis, AI sağlayıcı, cron, R2, mail için durum + son 24 saat olay şeridi; dağıtım (deploy) işaretleri trend grafiğinde.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında 5 saniye içinde üç soruya cevap alır: *Bir şey yanıyor mu? Dün/geçen haftaya göre ne değişti? Bugün neyi ele almalıyım?* Sayılar tek pencerede, tek tanımla, işaret ve renk anlamı tutarlı gösterilir; her sayı tıklanınca o sayıyı üreten kayıtlara iner.

**Yerleşim (masaüstü, 12 sütun):**
1. **Üst bar (sticky):** kompakt selamlama + dönem seçici (7g/30g/90g/özel) + "Son başarılı veri: 40 sn önce" + yenile + Cmd+K. Avatar/büyük hero kaldırılır; kişisel karşılama tek satıra iner.
2. **Dikkat şeridi (tam genişlik):** önem sırasına göre en fazla 5 aksiyon kartı (ör. "3 çözülmemiş şüpheli aktivite", "12 acil AI yorumu", "4 bayi 14 gündür pasif", "Mail teslimatı başarısız"). Hiç yoksa ince yeşil "Her şey yolunda" satırı.
3. **KPI şeridi (6 kart):** Aktif kullanıcı, Yorum (QR+tüketim), CSAT, Aktif kart, Puan dolaşımı, Bayi sağlığı dağılımı; her birinde değer + doğru işaretli delta + sparkline; tıklayınca sağ çekmece.
4. **Sol 8 sütun:** günlük yorum trendi (yığılmış olumlu/nötr/olumsuz çubuk, TR saat dilimi) + altında "En çok hareket edenler" (yükselen/düşen bayiler, gerçek SQL sıralaması).
5. **Sağ 4 sütun:** Platform sağlığı (DB/Redis/AI/cron/mail satırları) ve Uyumluluk özeti.
6. **Alt:** Aktivite akışı (kullanıcı, yorum, denetim, ödül olaylarını tek akışta, tür filtresi ve kayda link) – denetim kayıtları ve zaman çizelgesi birleşir.

Mobilde sıra: dikkat şeridi → KPI'lar 2 sütun yatay kaydırmalı → sağlık → trend → akış. Hızlı erişim grid'i kaldırılır (sidebar + Cmd+K yeterli).

**Motion / 3B:** Bu ekran bir operasyon aracı; 3B yerinde değil. Motion ölçülü olmalı: ilk yüklemede KPI sayılarında 300 ms tek seferlik count-up, sparkline çizgisinin soldan sağa 400 ms çizilmesi, yeni bir "dikkat" öğesi geldiğinde 1 kez yumuşak vurgu. FloatingOrbs, Spotlight, sürekli ping animasyonu ve ambient blur kaldırılır. Tüm geçişler `useReducedMotion` ile kapatılabilir olmalı; `MotionConfig reducedMotion="user"` zaten var, opacity döngüsü bırakılmamalı.

**Veri / API değişiklikleri:**
- `GET /api/admin/overview?range=30d&sections=attention,kpis,trend,health,activity` – tek toplayıcı, bölüm başına `Promise.allSettled`, bölüm başına Redis anahtarı ve TTL, yanıt `{ [section]: { ok, data, error?, generatedAt } }`.
- Ortak `lib/admin-metrics.ts`: `getFeedbackVolume(range)` (QR feedback + ConsumptionReview, `deletedAt IS NULL`, `Europe/Istanbul` gün kovaları `date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Istanbul')`), `getGrowth(range)`, `getTopDealers(range, by)`; hem bu sayfa hem `/admin/analytics` aynı fonksiyonları kullanır.
- `attention` bölümü: `SuspiciousActivity.isResolved=false`, `Feedback.urgency>0.7 AND dealerReply IS NULL`, `tenant-health` riskli/pasif, cron son çalışma zamanı, mail son hata, bekleyen gizlilik talepleri.
- Ağır hesaplar (segment sayıları, tenant health, install-to-value) cron ile önceden hesaplanıp Redis'e yazılır; uç yalnızca okur.
- İstemci: server component ilk veriyi gömer, SWR `refreshWhenHidden: false`, sağlık 15 sn, diğerleri 2-5 dk.
- Güvenlik: kapı kontrolü `requireAuth`'a; `settings` yanıtında `security` kategorisi maskeli.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/analytics`:** Bu sayfadaki "Analitik özeti", "Puan dağılımı", "14 günlük trend", "Duygu dağılımı" bölümleri `/admin/analytics`'in küçük kopyası ve aynı `/api/admin/analytics` ucunu çağırıyor. Panoda yalnız KPI + tek trend kalmalı, gerisi analitik sayfasına link olmalı.
- **`/admin/ai-dashboard`:** "AI özeti" bölümü (4 sayaç + intent + son analizler) aynı `dealers-ai-stats` ucunu kullanıyor; panoda yalnız "acil AI yorumları" dikkat öğesi olarak kalmalı.
- **`/admin/platform-pulse`, `/admin/ecosystem`, `/admin/insights`, `/admin/trust-command`, `/admin/observability`:** Hepsi "genel bakış" iddiası taşıyan sayfalar (hepsi `AdminPremiumHero` ile; doğrulandı: `app/admin/platform-pulse/page.tsx`, `ecosystem/page.tsx`, `insights/page.tsx`, `trust-command/page.tsx`, `observability/page.tsx`). Önerilen yapı: `/admin` = operasyon ana sayfası (dikkat + KPI + sağlık); `trust-command` + `compliance` = güven/uyum; `observability` = teknik sağlık; `platform-pulse`/`ecosystem`/`insights` tek bir "Raporlar" alanında birleştirilmeli ya da `/admin`'in bölümlerine çekilip kaldırılmalı. (Bu sayfaların içeriği ayrı raporlarda ayrıntılı incelenmeli; buradaki öneri yalnız giriş ekranı açısından.)
- **`/admin/dealers-health`:** "Tenant health" KPI'sının detay sayfası; panodaki kart buraya bağlanmalı, eşik ve skor tanımı tek kaynakta olmalı.
- **Hızlı erişim / Ana özellikler ↔ Sidebar:** Navigasyonun üçüncü kopyası; kaldırılıp Cmd+K ve kişiselleştirilebilir "sabitlenmiş modüller" ile değiştirilmeli.

---

## Doğrulama (şüpheci inceleme)

### 1. Admin gizli kapısı API katmanında uygulanmıyor; kapı cevabı ve ayarlar istemciye sızıyor — **DOĞRULANDI (ve iddiadan daha ağır)**

- `proxy.ts:105-119`: `/api/*` istekleri `authMiddleware`'e hiç girmiyor; yalnız güvenlik/CORS başlığı eklenip `NextResponse.next()` dönüyor. Kapı kontrolü (`proxy.ts:79-87`) yalnız `/admin` sayfa yollarında.
- `lib/api-auth.ts:52-80` `requireAuth` yalnız oturum + rol + token-replay bakıyor; `admin_gate` cookie'sine bakan hiçbir API kodu yok. `verifyGateCookie` (`lib/admin-gate.ts:55`) üretim kodunda **hiç çağrılmıyor** (yalnız `__tests__/lib/admin-gate.test.ts`).
- `app/api/admin/settings/admin-gate/route.ts:19-26` GET, rolü ADMIN olan herkese `answer` döndürüyor (kapıyı geçmiş olma şartı yok). Satır yoksa bile `normalizeAdminGate` varsayılanı ('7') döner.
- `app/api/admin/settings/route.ts:61-110` filtresiz `findMany`; admin bir kez kapıyı ayarlardan kaydettiyse (`admin-gate/route.ts:44`, kategori `security`) `settings.security.admin_gate.answer` olarak döner. `app/admin/admin-dashboard-client.tsx:89` bu ucu dashboard yenilemesinde çağırıyor. `lib/admin-gate.ts:8-9` ("cevap istemciye asla gönderilmez") yorumu gerçekle çelişiyor.
- **Ek bulgu (iddiada yok):** Sayfa kapısı da sahte cookie ile aşılabiliyor. `lib/admin-gate-edge.ts:14-22` `gateCookieBelongsTo` yalnız biçim kontrolü yapıyor (`<userId>.<64 hex>`), HMAC doğrulaması yok. Kullanıcı kendi userId'sini bildiği için tarayıcıda `admin_gate=<kendiId>.` + 64 adet `a` cookie'si oluşturup `/admin`'e doğrudan girebilir.
- **Yeniden üretim:** Rolü yanlışlıkla ADMIN yapılmış bir kullanıcı giriş yapar ve `/admin`'e gidince `/admin-gate`'e yönlenir. Aynı oturumla `GET /api/admin/settings/admin-gate` çağırır, yanıtta `"answer":"7"` görür. Ya da cevaba hiç gerek duymadan `PUT /api/admin/settings`, `/api/admin/*` yazma uçlarını doğrudan kullanır.
- **Etki/bağlam:** Kapının belgelenmiş tehdit modeli ("rolü kazara ADMIN yapılan stajyer", `lib/admin-gate.ts:5-6`, `proxy.ts:77`) tamamen işlevsiz. Rol zaten ADMIN olduğu için bu bir yetki yükseltmesi değil, savunma katmanının fiilen bulunmaması. Önem: YÜKSEK.
- **Öneri:** Kapıyı Node tarafına, tek bir `requireAdmin()` yardımcısına taşıyın: `requireAuth(['ADMIN'])` + `verifyGateCookie(cookie, userId, gate.answer)`. Gate ayarı Redis'te kısa TTL ile önbelleğe alınabilir. `/api/admin/gate` (POST/GET) dışındaki tüm `/api/admin/*` uçları bunu kullanmalı. proxy'de de biçim kontrolü yerine Web Crypto (`crypto.subtle`, edge'de async HMAC mevcut) ile gerçek imza doğrulaması yapılmalı. `GET /settings/admin-gate` cevabı döndürmemeli (yalnız "ayarlı/ayarsız" ve soru dönmeli; değiştirme "eski cevap + yeni cevap" ile yapılmalı). `GET /api/admin/settings` yanıtı `security` kategorisini dışlamalı veya maskelemeli.

### 2. "En iyi işletmeler" sırasız rastgele 10 bayiden oluşuyor — **DOĞRULANDI**

- `app/api/admin/dashboard/route.ts:82-86`: `prisma.user.findMany({ where: { role: 'DEALER' }, take: 10 })`, `orderBy` yok. Postgres sırası tanımsız (pratikte fiziksel/ekleme sırası). Sayım SQL'i (`:169-177`) yalnız bu 10 id için yapılır, sıralama (`:184-192`) da yalnız bu 10 içinde. UI başlığı `app/admin/admin-dashboard-client.tsx:478` "En çok geri bildirim alan ve en yüksek puanlı işletmeler" diyor.
- Aynı kalıp `app/api/admin/analytics/route.ts:111-115` (take 10, orderBy yok) + `:271-284` (bu 10 içinde sırala, ilk 5'i al) — `/admin/analytics` "En İyi Bayiler" (`app/admin/analytics/page.tsx:719`) de etkileniyor.
- Soft-delete düzeltmesi: `User` modelinde `deletedAt` yok (prisma/schema.prisma `model User`), bu yüzden bayi tarafında soft-delete iddiası geçersiz. Ama dashboard SQL'i (`dashboard/route.ts:169-177`) `Feedback."deletedAt" IS NULL` filtresi **içermiyor** (analytics sürümü içeriyor, `analytics/route.ts:~267`). Silinmiş geri bildirimler dashboard sayımına giriyor.
- **Yeniden üretim:** 11. veya daha sonra kayıtlı, en çok geri bildirim alan bayi; ilk 10 bayi satırının dışında kaldığı için listede hiç görünmez. Bu listede 0 yorumlu bayiler görünebilir.
- **Öneri:** Tek SQL ile sıralamayı DB'de yapın: `QRCode JOIN Feedback` (+ isteğe bağlı `ConsumptionReview`) `WHERE f."deletedAt" IS NULL AND createdAt >= range GROUP BY dealerId ORDER BY cnt DESC, avg DESC LIMIT 10`, ardından bu id'lerin adlarını çekin. İki sayfa ortak `getTopDealers(range, by)` yardımcısını kullansın. Tüketim yorumları da sayılıyorsa bu başlıkta açıkça belirtilsin. Önem: ORTA–YÜKSEK (bayi sayısı 10'u geçtiği anda yanlış).

### 3. Metrikler yanlış etiketleniyor ve negatif değerler pozitif görünüyor — **DOĞRULANDI (bir alt madde abartılı)**

Doğrulanan alt maddeler:
- **Yüzde, adet gibi gösteriliyor:** `analytics/route.ts:515-519` `sentimentBreakdown` değerlerini `Math.round(x/total*100)` olarak üretiyor. `app/admin/components/AnalyticsSection.tsx:164-172` bunları `%` olmadan "Olumlu 62" gibi adet biçiminde gösteriyor.
- **"Toplam (30 gün)" aslında tüm zamanlar:** `analytics/route.ts:97,100` (`prisma.user.count()`, `prisma.feedback.count()` filtresiz) → `:507-508`. Etiket `AnalyticsSection.tsx:201`.
- **Büyüme koşulsuz yeşil:** `AnalyticsSection.tsx:189,193` `text-green-600 dark:text-green-400` sabit. Eksi işareti metinde var ama renk "iyi" diyor.
- **Dark modda negatif yeşil:** `app/admin/components/HeroSection.tsx` kullanıcı/geri bildirim büyüme span'lerinde koşullu `text-red-600` ardından koşulsuz `dark:text-emerald-300` geliyor. Dark modda düşüş yeşil görünür.
- **Aktivasyon oranı "son 30 gün değişimi" gibi:** `dashboard/route.ts:280` "Aktif Kartlar" `change` = aktif/toplam oranı. `components/dashboard/stats-card.tsx:36` bunu "+X% son 30 gün" diye yazıyor ve yeşil yukarı ok çiziyor. `:288` "Tüketimler" sabit `0` → "0% son 30 gün" (veri yokken "değişim yok" iddiası).
- **İki farklı geri bildirim büyümesi:** Dashboard "Toplam Yorum" değişimi QR + ConsumptionReview (`dashboard/route.ts:147-151`). Hero/Analytics `feedbackGrowth` yalnız QR `Feedback` (`analytics/route.ts:172-174`). Aynı ekranda farklı sayılar çıkar.

Abartılı alt madde:
- `stats-card.tsx:81` `Math.abs` eksi işaretini siliyor ama aynı rozet `isNegative` olunca kırmızı arka plan + `TrendingDown` ikonu gösteriyor (`:74,79`). Yani StatsCard'da negatif "pozitif görünmüyor"; yalnız işaret metinde kayboluyor (`:36` alt metni de işaretsiz). Erişilebilirlik/okunabilirlik kusuru ama yanıltıcı yeşil değil.

- **Yeniden üretim:** Son 30 günde kayıt sayısı önceki 30 güne göre düşsün (`userGrowth = -20`). Dark temada hero "-20%"yi zümrüt yeşili, "Büyüme özeti" kartı her iki temada yeşil gösterir. "Toplam (30 gün)" kartı platformun tüm kullanıcı sayısını gösterir. "Aktif Kartlar" kartı, oranı %80 olunca "+80% son 30 gün" yazar.
- **Öneri:** Tek bir `Metric` sözleşmesi tanımlayın: `{ value, unit: 'count'|'percent'|'rating', window: '30d'|'all', delta?: { value, basis: 'prev_period', direction: 'up_good'|'down_good' } }`. Uç bunu üretsin, `StatsCard`/Hero/Analytics bileşenleri etiket, birim ve rengi buradan türetsin (renk ve işaret kodda elle yazılmasın). Delta yoksa (`Tüketimler`) rozet hiç gösterilmesin. Oranlar (aktivasyon) ayrı bir "oran" göstergesi olarak sunulsun. Geri bildirim hacmi için ortak `getFeedbackVolume(range)` (QR + tüketim, `deletedAt IS NULL`) tüm kartlarda kullanılsın. Önem: YÜKSEK (operatör kararını doğrudan yanıltır), güvenlik değil.
