# /admin/users

**Amaç:** Platform operatörünün tüm hesapları (ADMIN / DEALER / CUSTOMER — ve fiilen STAFF) listeleyip araması, rol değiştirmesi, silmesi, tekil kullanıcıya puan/XP/seviye/rozet/ödül/bildirim uygulaması, bayiye konum bilgisi ve fiyatlandırma planı ataması; ikinci sekmede ise kural tabanlı toplu "kullanıcı otomasyonu" (puan/XP dağıtımı) çalıştırması.

**Genel puan:** 4/10 · **Karar:** **yeniden tasarla** (liste/arama/sayfalama iskeleti ve API'lerin çoğu korunabilir; ancak sayfa, Stripe "Customer" / Linear "Member" ekranları gibi bir **Kullanıcı 360** deneyimine ve güvenli, defterli (ledger) bir aksiyon katmanına yeniden kurulmalı)

> Özet hüküm: Liste, arama, rol filtresi, sayfalama, kullanıcı oluşturma, bayi bilgisi ve plan atama gerçekten çalışıyor. Ama sayfa **platformun en yetkili ve en yıkıcı ekranı** olmasına rağmen birkaç ağır sorun taşıyor: (1) DB'de gerçekten var olan `STAFF` rolündeki tek bir kullanıcı listeye düştüğünde tablo `undefined` bir bileşen render etmeye çalışıp **sayfanın tamamını hata ekranına düşürüyor**; (2) "Sil" tek tıkla **hard delete** yapıyor ve şema kaskadı yüzünden bayinin tüm QR kodlarını, onlara bırakılmış tüm müşteri yorumlarını ve silinen kişinin **kendi audit log'larını** yok ediyor; (3) yöneticinin puan ekleme/düşme yolu ekonomi değişmezlerini (`points_credited`, negatif bakiye koruması, üst sınır) çiğniyor; (4) "Seviye Ayarla" kanonik geometrik seviye formülüyle çelişen doğrusal XP yazıyor; (5) detaydaki **Rozetler sekmesi her zaman boş** (API'nin dönmediği bir alan okunuyor) ve dolayısıyla rozet geri alma erişilemez; (6) Otomasyon sekmesindeki "onay akışı" hem kendi kendini onaylamaya hem de kayıtsız (ad-hoc) çalıştırmayla tamamen atlanmaya açık.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Temel CRUD ve aksiyonların çoğu uçtan uca çalışıyor; fakat STAFF çökmesi, boş rozet sekmesi, yanlış seviye formülü, sayfaya-özel istatistikler ve kırık derin bağlantı gibi gerçek hatalar var. |
| UX | 4/10 | Tek bir 1.638 satırlık ekranda liste + 4 diyalog + otomasyon iç içe; yıkıcı işlemler (rol → ADMIN, toplu rol, tekil silme) onaysız ya da etki özeti göstermeden yapılıyor; aksiyon sonrası detay ekranı bayat kalıyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ve shadcn tabloyla tutarlı, sade; fakat açık temada beyaz metinli sekme anahtarı, İngilizce/Türkçe karışık etiketler, `emerald-900` gibi marka dışı sabit renkler ve emoji/rarity ham değerleri cilayı düşürüyor. |
| Mimari | 3/10 | Tek dev istemci bileşeni + 7 eylemli tek bir `PATCH` "god endpoint"; puan defteri yok, soft-delete yok, audit kapsamı eksik, rol değişimi JWT'ye yansımıyor, iki ayrı puan basma yolu farklı kurallarla çalışıyor. |
| Performans | 6/10 | `ssr:false` code-split, debounce'lu arama, sunucu taraflı sayfalama ve paralel `count` iyi; fakat rozet/ödül katalogları her filtre/sayfa değişiminde yeniden çekiliyor, istekler iptal edilmiyor, detay açılışı ağır bir rozet ucunu bekliyor. |
| Erişilebilirlik + mobil | 4/10 | Kolonlar kırılım noktasında gizleniyor ve diyaloglar mobilde genişliğe uyuyor; ama tıklanabilir satır klavyeyle açılamıyor, ikon butonlarının `aria-label`'ı yok, rozet kaldırma butonu yalnızca hover'da görünüyor (dokunmatikte/klavyede erişilemez), sekme anahtarında tab semantiği yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: ADMIN rolü + gizli kapı çerezi | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-87` | Sayfa yolu korunuyor. `/api/*` proxy'de auth'tan muaf (`proxy.ts:104-118`); her uç kendi `requireAuth`'unu yapmak zorunda. |
| 2 | API yetkisi (`/api/admin/users` GET/POST/PUT/PATCH/DELETE, bulk, plan, automation) | ÇALIŞIYOR | `app/api/admin/users/route.ts:93,227,297,391,649`, `bulk/route.ts:25`, `[id]/plan/route.ts:119` | `requireAuth(['ADMIN'])` + token-replay kontrolü (`lib/api-auth.ts:52-80`). |
| 3 | Code-split: `dynamic(..., { ssr:false })` + iskelet | ÇALIŞIYOR | `app/admin/users/page.tsx:10-23` | İlk yükte 1.638 satırlık gövde ayrı chunk. |
| 4 | Rota `loading.tsx` iskeleti (`role=status`, `aria-busy`) | ÇALIŞIYOR | `app/admin/users/loading.tsx:3-15` | İki farklı iskelet (page.tsx'teki ile loading.tsx'teki) aynı anda tutarsız şekiller çiziyor; kozmetik. |
| 5 | Hero: başlık/açıklama/ikon | ÇALIŞIYOR | `users-client.tsx:709-713` | |
| 6 | "Users / Automation" ana sekme anahtarı | KISMİ | `users-client.tsx:715-734` | Etiketler İngilizce; `role="tablist"/aria-selected` yok; URL'ye yazılmıyor (yenilemede kaybolur); pasif buton `text-white` + `bg-white/10` — `tone='auto'` açık temada açık kart çizdiği için (`admin-premium-hero.tsx:33-39,111`) metin neredeyse görünmez (koddan çıkarım; görsel olarak doğrulanmadı). |
| 7 | "Kullanıcı Ekle" butonu | KISMİ | `users-client.tsx:738`, diyalog `1533` | Diyalog `mainTab !== 'automation'` dalının **içinde** (`760-1635`). Otomasyon sekmesindeyken tıklanınca hiçbir şey olmuyor; kullanıcı "Users" sekmesine dönünce diyalog kendiliğinden açılıyor. |
| 8 | CSV dışa aktarma | KISMİ | `users-client.tsx:305-326`, `lib/export-utils.ts:56-63` | Yalnızca **o anki sayfadaki** 10-100 satırı aktarıyor (buton "CSV" diyor, filtrelenmiş tüm seti değil); `=`/`+`/`-`/`@` ile başlayan alanlar nötrlenmiyor (CSV/formül enjeksiyonu); STAFF için `roleLabels[u.role]` boş. |
| 9 | "Yenile" butonu | ÇALIŞIYOR | `users-client.tsx:752` | Otomasyon sekmesinde de kullanıcı listesini yeniliyor (otomasyon panelinin kendi yenileme butonu ayrı). |
| 10 | İstatistik kartı: Toplam | ÇALIŞIYOR | `users-client.tsx:688`, `route.ts:198` | Sunucudan gelen filtreli `total`. |
| 11 | İstatistik kartları: Admin / Bayi / Müşteri | BOZUK | `users-client.tsx:689-691` | Yalnızca **mevcut sayfadaki** (varsayılan 20) satırdan sayılıyor. "Toplam 4.812 · Admin 1 · Bayi 3 · Müşteri 16" gibi yanıltıcı KPI üretir. |
| 12 | STAFF rolündeki kullanıcıların gösterimi | BOZUK | `prisma/schema.prisma:22-27` (enum'da `STAFF`), `app/api/dealer/staff/route.ts:101,126` (STAFF yaratılıyor), `users-client.tsx:91,144-160,906,939,1070` | `roleIcons['STAFF']` `undefined` → `<RoleIcon/>` React "Element type is invalid" fırlatır → `app/admin/error.tsx` hata ekranı. Varsayılan sıralama `createdAt desc` olduğu için son 20 kayıttan biri STAFF ise sayfa açılmaz. |
| 13 | Arama (isim/e-posta/işletme, 400 ms debounce, büyük-küçük harf duyarsız) | ÇALIŞIYOR | `users-client.tsx:230-234`, `route.ts:117-123`, `lib/validations-admin.ts:22-24` | |
| 14 | Rol filtresi | KISMİ | `users-client.tsx:833-844`, `lib/validations-admin.ts:105` | STAFF seçeneği yok, şema da kabul etmiyor; STAFF kullanıcılar yalnızca "Tümü"nde (ve çökme ile) görünür. Geçersiz query sessizce varsayılana düşüyor (`route.ts:105-107`). |
| 15 | Filtre/arama değişince 1. sayfaya dönme | KISMİ | `users-client.tsx:236-244` | 3. sayfadayken filtre değişince önce `page=3` ile, sonra `page=1` ile **iki istek** atılır; sıra garantisi yok (bkz. #16). |
| 16 | İstek iptali / yanıt sırası koruması | EKSİK | `users-client.tsx:250-274` | `AbortController` ya da istek kimliği yok; hızlı yazma/sayfalamada geç dönen eski yanıt yeni sonucu ezer. |
| 17 | Yükleniyor durumu (tablo) | KISMİ | `users-client.tsx:852-856` | Her tuş vuruşu/sayfa değişiminde tablo tamamen spinner'a dönüyor (layout sıçraması, seçimin bağlamı kayboluyor); sayfa iskeletiyle tutarsız. |
| 18 | Boş durum | KISMİ | `users-client.tsx:857-861` | "Kullanıcı bulunamadı" — aramanın mı boş döndüğü yoksa hiç kullanıcı olmadığı ayrılmıyor; "filtreyi temizle" eylemi yok. |
| 19 | Hata durumu | KISMİ | `users-client.tsx:266-271` | Yalnızca toast; liste eski veriyle kalıyor, ekranda kalıcı hata/yeniden dene bandı yok. |
| 20 | Tablo kolonları (kullanıcı, rol, puan, seviye, rozet sayısı, kayıt tarihi) + duyarlı gizleme | ÇALIŞIYOR | `users-client.tsx:885-965` | Puan `toLocaleString()` yerel ayarsız (tarayıcı diline göre). |
| 21 | Satıra tıklayınca detay diyaloğu | KISMİ | `users-client.tsx:913-914`, `462-475` | Diyalog, rozet isteği **bitene kadar açılmıyor** (`await fetchUserBadges` → `setDetailsOpen`) ve geri bildirim yok; satır `tabIndex`/`role` taşımadığı için klavyeyle açılamaz. |
| 22 | Satır giriş animasyonu (framer `Motion.tr`, kademeli) | ÇALIŞIYOR | `users-client.tsx:908-912`, `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` sayesinde azaltılmış hareket gözetiliyor. Ölçülü. |
| 23 | Satır seçimi (checkbox, `aria-label`'lı) | ÇALIŞIYOR | `users-client.tsx:916-921` | |
| 24 | Tümünü seç | KISMİ | `users-client.tsx:457-460`, `889-893` | Yalnız mevcut sayfa; seçim sayfa/filtre değişiminde **temizlenmiyor** → görünmeyen satırlar seçili kalıp toplu işleme girer, başlık checkbox'ı yanlış durumda görünebilir. |
| 25 | Toplu rol değiştirme | KISMİ | `users-client.tsx:403-423`, `867-876`; `bulk/route.ts:42-65` | Select'ten seçim anında **onaysız** uygular (100 kişiyi ADMIN yapmak tek tık); son-admin koruması yok; `updated` gerçek `count` değil `ids.length`. Audit var. |
| 26 | Toplu silme | KISMİ | `users-client.tsx:425-446`; `bulk/route.ts:66-90` | Tarayıcı `confirm()` (uygulamanın diyalog diliyle tutarsız); hard delete + kaskad (bkz. Bulgu 2); `deleted` gerçek sayı değil. |
| 27 | Seçimi temizle | ÇALIŞIYOR | `users-client.tsx:880` | |
| 28 | Sayfalama: Önceki / Sonraki + "Sayfa x / y" | ÇALIŞIYOR | `users-client.tsx:1023-1048`, `route.ts:206-213` | Sayfa numarasına atlama yok. |
| 29 | Sayfa boyutu (10/20/50/100) | ÇALIŞIYOR | `users-client.tsx:1030-1040`, `lib/validations-admin.ts:7-11` | `total <= pageSize` iken tüm çubuk gizleniyor. |
| 30 | Satır menüsü: Puan Ekle / XP Ekle / Rozet Ver / Ödül Ver | ÇALIŞIYOR | `users-client.tsx:976-991` | Arka uç sorunları #44-49'da. Menüde "Puan Düş / Seviye / Bildirim" yok — detaydaki set ile tutarsız alt küme. |
| 31 | Satır menüsü: Rol değiştir (ADMIN/Bayi/Müşteri) | KISMİ | `users-client.tsx:994-1003`, `625-643`; `route.ts:294-383` | Onaysız; kendi rolünü düşürmeye ve son admini kaldırmaya engel yok; STAFF→başka rol `DealerStaff` kaydını sahipsiz bırakır; değişiklik hedefin JWT'sine 24 saate kadar yansımaz (`lib/auth.ts:212-240`, `31-39`). |
| 32 | Satır menüsü: Sil | KISMİ | `users-client.tsx:1005-1010`, `645-666`; `route.ts:646-702` | Kendini silme engelli; ama hard delete + kaskad, etki özeti yok. |
| 33 | Detay başlığı: avatar, ad, e-posta, rol rozeti | ÇALIŞIYOR | `users-client.tsx:1058-1075` | STAFF için aynı çökme (`1070`). |
| 34 | Detay: Puan / Seviye / XP kartları | KISMİ | `users-client.tsx:1086-1102`, `580-587` | Aksiyon başarılı olunca liste yenileniyor ama `selectedUser` güncellenmiyor → diyalog kapatılıp açılana kadar eski değerler. |
| 35 | Detay: seviye ilerleme çubuğu | BOZUK | `users-client.tsx:1104-1114`; kanonik formül `lib/utils.ts:94-135` | `xp % 1000` doğrusal varsayım; sistem geometrik (1000, 1500, 2250 …). Gösterilen ilerleme ve "Seviye N+1" hedefi yanlış. `calculateLevelProgress` hazır duruyor ama kullanılmamış. |
| 36 | Detay: e-posta + "Doğrulanmış", kayıt tarihi, işletme adı | ÇALIŞIYOR | `users-client.tsx:1117-1137` | |
| 37 | Detay: aktivite sayaçları (geri bildirim, QR, rozet) | ÇALIŞIYOR | `users-client.tsx:1140-1155`, `route.ts:189-195` | |
| 38 | Detay: Bayi konum/işletme formu + kaydet | ÇALIŞIYOR | `users-client.tsx:1157-1204`, `477-516`; `route.ts:15-32` | Enlem/boylam sunucuda aralık doğrulamalı. Harita/geokodlama yok; etiketler "Latitude/Longitude" İngilizce. |
| 39 | Detay: Fiyatlandırma planı atama | ÇALIŞIYOR | `users-client.tsx:1206-1240`, `363-389`; `[id]/plan/route.ts:115-173` | Rol ve plan varlığı sunucuda doğrulanıyor, audit yazılıyor. İyi örnek. |
| 40 | Detay: "Rozetler" sekmesi (kazanılan rozetler listesi) | BOZUK | `users-client.tsx:391-401` (`data.userBadges` okunuyor); `app/api/gamification/badges/route.ts:287-292` (yanıtta `userBadges` alanı **yok**) | Her kullanıcı için "Henüz rozet yok" gösterir. Sekme başlığı her zaman "(0)". |
| 41 | Detay: rozet geri alma (X) | BOZUK | `users-client.tsx:1272-1279`, `598-623`; `route.ts:547-578` | #40 nedeniyle liste boş olduğundan erişilemez; buton `opacity-0 group-hover:opacity-100` (dokunmatik/klavyede görünmez), `aria-label` yok; sunucu tarafında audit log yazılmıyor. |
| 42 | Detay → Rozetler: "Rozet Ver" kısa yolu | ÇALIŞIYOR | `users-client.tsx:1249` | |
| 43 | Detay → İşlemler sekmesi (7 aksiyon kartı + Sil) | ÇALIŞIYOR | `users-client.tsx:1288-1356` | |
| 44 | Aksiyon: Puan Ekle | KISMİ | `users-client.tsx:526-527`; `route.ts:399-431` | Ham `increment`; `points_credited` olayı yazılmıyor (fraud/cap dedektörlerine görünmez); `amount` için tamsayı/üst sınır yok; negatif girilirse "Puan Ekle" düşürme yapar. Audit var. |
| 45 | Aksiyon: Puan Düş | KISMİ | `users-client.tsx:529-531`; `route.ts:401-405` | `debitPoints` yerine ham `increment(-n)` → bakiye **negatife** düşebilir. |
| 46 | Aksiyon: XP Ekle | KISMİ | `route.ts:434-471`; `lib/points-wallet.ts:31-32` | Kanonik `creditPointsAndXp` kullanılıyor (iyi); ama audit log yok; negatif değer sessizce 0'a kırpılıp kullanıcıya yine "-50 XP kazandınız" bildirimi gidiyor; UI yardım metni "Her 1000 XP = 1 Seviye" yanlış (`users-client.tsx:1406-1408`). |
| 47 | Aksiyon: Seviye Ayarla | BOZUK | `route.ts:473-494` | `xp = (level-1)*1000` doğrusal yazılıyor; geometrik formülle (`lib/utils.ts:94-106`) çelişir (ör. seviye 5 → 4000 XP, formüle göre seviye 3). Audit log yok. |
| 48 | Aksiyon: Rozet Ver | KISMİ | `users-client.tsx:328-338` (`/api/gamification/badges` `admin=1` olmadan); `badges/route.ts:91-118,268-273`; `route.ts:496-545` | Katalog müşteri görünümünde çekiliyor → karakter (dizi) rozetleri ve `hiddenUntilEarned` rozetler **seçilemez**. Çift verme koruması + audit var. |
| 49 | Aksiyon: Ödül Ver | KISMİ | `route.ts:580-614`; `prisma/schema.prisma:680-711` | `isActive`/`stock` kontrolü yok, stok düşülmüyor, audit yok; kupon dışı ödülde de bildirim `data.code` taşıyor. |
| 50 | Aksiyon: Bildirim Gönder | KISMİ | `users-client.tsx:554-567`; `route.ts:616-629` | Yalnızca uygulama içi; başlık/mesaj uzunluk sınırı yok; audit yok; kullanıcının `notificationPrefs`'i dikkate alınmıyor; önizleme yok. |
| 51 | Kullanıcı oluşturma diyaloğu | KISMİ | `users-client.tsx:1533-1601`, `276-303`; `route.ts:224-289` | Çalışıyor ve audit yazıyor; ama davet e-postası yok (admin şifreyi elle iletmek zorunda), `emailVerified` otomatik "now", ADMIN yaratma ek onaysız, zod varsayılan İngilizce hata metinleri kullanıcıya sızıyor (`route.ts:236`), formda `<form>`/Enter ile gönderim yok. |
| 52 | Tekil silme onay diyaloğu | KISMİ | `users-client.tsx:1604-1633` | Kişi kartı gösteriliyor ama silinecek QR/yorum/puan/rozet sayısı gibi **etki özeti** yok; yazarak onaylama yok; buton loading durumu yok (çift tıklama iki DELETE). |
| 53 | Rozet/ödül/plan kataloglarının yüklenmesi | KISMİ | `users-client.tsx:240-248` | Rozet ve ödül katalogları her filtre/arama/sayfa değişiminde **yeniden** çekiliyor (statik veriler). |
| 54 | Global aramadan derin bağlantı (`/admin/users?id=…`) | BOZUK | `app/api/search/route.ts:165`; `app/admin/users/*` içinde `useSearchParams` yok | Header aramasındaki kullanıcı sonucu sayfayı açar ama ilgili kullanıcıyı açmaz/filtrelemez. |
| 55 | Otomasyon: kural editörü / "Kural Kaydet" | KISMİ | `components/admin/users-automation-panel.tsx:108-130,186-273` | Yalnızca **yeni** kural oluşturur; mevcut kural seçilince form dolmuyor, düzenleme/silme/pasifleştirme UI'ı yok; seçim temizlenemiyor. Etiketler karışık ("Min Points", "Priority", "Customer"). |
| 56 | Otomasyon: Dry-run | ÇALIŞIYOR | `users-automation-panel.tsx:132-149`; `automation/dry-run/route.ts` | Sonuçta ham cuid listesi gösteriliyor; insan-okur örnek (ad/e-posta) ve toplam puan etkisi yok. |
| 57 | Otomasyon: "Execute Now" | KISMİ | `users-automation-panel.tsx:151-168`; `automation/execute/route.ts:41-55` | Onay diyaloğu yok. Kural seçili değilse **kaydedilmemiş form** doğrudan çalışır (varsayılan: tüm CUSTOMER'lara 100 puan, limit 500) ve `requiresApproval` kontrolü tamamen atlanır. |
| 58 | Otomasyon: onay akışı ("Onay Gereksin" + "Onayla") | SAHTE | `automation/rules/[id]/route.ts:61-79`; `execute/route.ts:46-55` | Kuralı oluşturan admin kendi kuralını onaylayabiliyor (dört göz yok); onaydan sonra koşul/aksiyon değiştirildiğinde onay sıfırlanmıyor; ad-hoc çalıştırma onayı hiç sormuyor. Güvence izlenimi veriyor ama güvence sağlamıyor. |
| 59 | Otomasyon: 24 saat KPI kartları | ÇALIŞIYOR | `users-automation-panel.tsx:284-294` | |
| 60 | Otomasyon: kural listesi + durum rozetleri | ÇALIŞIYOR | `users-automation-panel.tsx:296-324` | "Onayli" ASCII yazılmış (`312`). |
| 61 | Otomasyon: çalıştırma geçmişi | ÇALIŞIYOR | `users-automation-panel.tsx:326-349` | Başlık "Run History", mod/durum ham İngilizce değerler; hata ayrıntısına inilemiyor. |
| 62 | Yönetici aksiyonlarının audit kapsamı | KISMİ | Var: `route.ts:272,360,420,533,681`, `bulk/route.ts:58,83`, `plan/route.ts:161`. Yok: `add_xp` (`434-471`), `set_level` (`473-494`), `revoke_badge` (`547-578`), `grant_reward` (`580-614`), `send_notification` (`616-629`) | Üstelik `AuditLog.user` `onDelete: Cascade` (`schema.prisma:1118`). |
| 63 | İkon butonlarında erişilebilir ad (`aria-label`) | EKSİK | `users-client.tsx:969-971`, `1272-1279` | "⋮" menü tetikleyicisi ve rozet kaldırma X'i ekran okuyucuda adsız. |
| 64 | Kolon sıralama (puan, seviye, kayıt, son aktivite) | EKSİK | `route.ts:168` sabit `createdAt desc` | |
| 65 | Hesap askıya alma / yasaklama / dondurma | EKSİK | `schema.prisma` User modelinde yalnızca `fraudStatus` var; sayfada hiç gösterilmiyor | Tek "yaptırım" seçeneği kalıcı silme. |
| 66 | Şifre sıfırlama bağlantısı / oturumları sonlandırma / 2FA durumu | EKSİK | — | Rol düşürme veya ihlal sonrası oturum iptali yapılamıyor. |
| 67 | Kullanıcı aktivite + audit zaman çizelgesi, puan defteri (ledger) | EKSİK | — | Bir kullanıcının puanının nereden geldiği görülemiyor. |
| 68 | Gelişmiş filtreler (fraud/trust tier, plan, doğrulanmış, kayıt aralığı, son giriş) ve kayıtlı görünümler | EKSİK | `route.ts:111-123` | `trustScore`, `trustTier`, `fraudStatus`, `pricingPlan` verisi DB'de hazır. |
| 69 | Kullanıcı taklidi (impersonate / "kullanıcı gözünden gör") | EKSİK | — | Destek ve hata ayıklama için standart iç araç özelliği. |

---

## Bulgular

### 1. STAFF rolündeki bir kullanıcı tüm sayfayı çökertiyor
- **Önem:** kritik · **Kategori:** hata / veri modeli uyumsuzluğu · **Efor:** S
- **Kanıt:** `prisma/schema.prisma:22-27` (`enum Role { ADMIN DEALER CUSTOMER STAFF }`); `app/api/dealer/staff/route.ts:101,126` (bayiler STAFF kullanıcı yaratıyor); `app/admin/users/users-client.tsx:91` (`role: 'ADMIN' | 'DEALER' | 'CUSTOMER'`), `144-160` (renk/ikon/etiket haritaları STAFF içermiyor), `906` (`const RoleIcon = roleIcons[user.role]`), `939` (`<RoleIcon …/>`); `/api/admin/users` GET rolü filtrelemeden döndürüyor (`route.ts:111-115`).
- **Sorun:** İstemci tipi, Prisma enum'unun bir alt kümesi. Bir bayi personel eklediği anda kayıt `STAFF` olarak oluşuyor; varsayılan sıralama en yeni kayıtları gösterdiği için bu kişi ilk sayfaya düşüyor, `RoleIcon` `undefined` oluyor ve React render hatası `app/admin/error.tsx`'e düşürüyor. Sonuç: operatör kullanıcı yönetimine hiç giremiyor. Detay diyaloğu (`1070`) ve CSV (`318`) da aynı kusuru taşıyor. Rol filtresi de STAFF'ı kabul etmiyor (`lib/validations-admin.ts:105`).
- **Öneri:** Rol sözlüğünü tek kaynaktan türetin: `@prisma/client`'tan `Role` tipini alıp `Record<Role, {label, icon, tone}>` biçiminde paylaşılan bir `lib/roles.ts` oluşturun; TypeScript, eksik anahtarda derleme hatası verir (bugünkü sorun tam olarak bu güvenceyi yok sayan elle yazılmış birleşim tipinden kaynaklanıyor). Bilinmeyen rol için güvenli bir varsayılan (nötr rozet) render edin. STAFF'ı filtreye, `adminUsersQuerySchema`'ya ve otomasyon koşullarına ekleyin; STAFF satırında bağlı olduğu bayiyi gösterin (`DealerStaff.dealerId`). STAFF'ın rolünü değiştirme aksiyonunu, `DealerStaff` kaydını da yöneten bir sunucu işlemine bağlayın.

### 2. Tek tıkla hard delete: bayinin tüm QR'ları, müşteri yorumları ve silinen kişinin audit izi kaskadla yok oluyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü / uyumluluk · **Efor:** L
- **Kanıt:** `route.ts:676-678` ve `bulk/route.ts:79-81` (`prisma.user.delete/deleteMany`); `prisma/schema.prisma:1118` (`AuditLog.user … onDelete: Cascade`); QRCode → `dealer User … onDelete: Cascade`, Feedback → `qrCode … onDelete: Cascade` (şemada Feedback/QRCode modelleri); `users-client.tsx:1005-1010` (satır menüsünde doğrudan "Sil"), `1604-1633` (etki özeti olmayan onay).
- **Sorun:** Bir bayiyi silmek, onun QR kodlarını ve bu kodlara bırakılmış **diğer kullanıcıların** tüm yorumlarını siler; o yorumlardan kazanılmış puanlar ise müşterilerde kalır (ekonomi tutarsızlığı). Bir yöneticiyi silmek, onun **yaptığı tüm işlemlerin audit kayıtlarını** da siler; yani bir admin, başka bir admini silerek iz silebilir. Silme işleminin kendi audit kaydı yazılıyor, ancak kurbanın geçmişi geri gelmiyor. KVKK silme talepleri için ayrı bir akış (`/admin/privacy-requests`) varken bu ekran onu baypas ediyor.
- **Öneri:** (a) `User`'a `deletedAt`/`status` (`active | suspended | deleted`) ekleyip varsayılan aksiyonu **askıya alma** yapın; kalıcı silmeyi yalnızca KVKK akışının anonimleştirme işine bırakın (PII'yi temizle, kimliği "Silinmiş kullanıcı" yap, ilişkileri koru). (b) `AuditLog.user` ilişkisini `onDelete: SetNull` + `actorEmail` gibi denormalize alanlara çevirin; audit asla kaskadla silinmemeli. (c) Silme diyaloğunu sunucudan gelen bir "etki önizlemesi" (`GET /api/admin/users/:id/impact` → QR, yorum, ödül, rozet, puan sayıları) ile besleyin, e-posta yazarak onay isteyin, ADMIN silmeyi ikinci bir admin onayına bağlayın. (d) Toplu silmeyi tamamen kaldırın ya da yalnızca "askıya al" olarak sunun.

### 3. Yönetici puan ekleme/düşme yolu ekonomi değişmezlerini çiğniyor
- **Önem:** yüksek · **Kategori:** ekonomi / güvenlik · **Efor:** M
- **Kanıt:** `route.ts:43-48` (`amount: z.number()` — tamsayı, alt/üst sınır yok), `399-405` (ham `points: { increment }`), `users-client.tsx:529-531` (Puan Düş = negatif increment), `1380-1384` (`min={1}` yalnızca ipucu); karşılaştırma: otomasyon motoru aynı işi `creditPointsAndXp` + `points_credited` olayı ile yapıyor (`lib/users-automation/engine.ts:47-61`); bakiye korumalı borç `lib/points-wallet.ts:75-105`.
- **Sorun:** Proje kuralı "puan basan her yol aynı transaction'da `points_credited` yazmalı, yoksa fraud/cap dedektörlerine görünmez" der; bu yol yazmıyor. "Puan Düş" `debitPoints` kullanmadığı için bakiye negatife düşebilir (sonraki harcama mantığı negatif bakiyeyi beklemiyor). Üst sınır olmadığından tek istekte milyarlarca puan basılabilir; ondalık bir değer Prisma `Int` alanında 500'e düşer. Aynı sayfanın iki sekmesi (tekil aksiyon vs. otomasyon) aynı işi iki farklı kural setiyle yapıyor.
- **Öneri:** Tüm yönetici puan hareketlerini tek bir `adjustPointsByAdmin({ userId, delta, reason, actorId })` sunucu fonksiyonuna toplayın: transaction içinde pozitifte `creditPointsAndXp` + `points_credited` (`category: 'admin_adjustment'`), negatifte `debitPoints` (yetersiz bakiyede açık hata), zorunlu **gerekçe** (sabit sebep kodları + serbest not), `z.number().int()` ve konfigüre edilebilir üst sınır (ör. 10.000 üstü ikinci admin onayı). Bu fonksiyonu hem bu uç hem otomasyon motoru kullanmalı. UI'da "Puan Ekle/Düş"ü tek bir "Bakiye düzeltmesi" formuna çevirip önce/sonra bakiyesini ve kullanıcının son 30 günlük puan hareketini gösterin.

### 4. "Seviye Ayarla" ve ilerleme çubuğu geometrik seviye formülüyle çelişiyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** `route.ts:473-482` (`xp: (data.level - 1) * 1000`); kanonik formül `lib/utils.ts:94-106` (1000 × 1,5^(n-1) artan eşikler); aynı dosyada XP ekleme bunu açıkça düzeltmiş (`route.ts:447-449` yorumu); UI `users-client.tsx:1110-1113` (`xp % 1000`), `1406-1408` ("Her 1000 XP = 1 Seviye").
- **Sorun:** Seviye 5 atanınca XP 4000 yazılır; formüle göre 4000 XP seviye 3'tür. `creditPointsAndXp` seviyeyi yalnızca yükselttiği için (`lib/points-wallet.ts:52-56`) kullanıcı XP'si tutarsız biçimde "seviye 5" olarak kalır, ilerleme göstergeleri (müşteri tarafında `calculateLevelProgress`) negatif/anlamsız olur. Bu aksiyon audit'e de yazılmıyor.
- **Öneri:** Seviye için gereken minimum toplam XP'yi döndüren `xpForLevel(level)` fonksiyonunu `lib/utils.ts`'e ekleyip `set_level`'da kullanın; audit + `points_credited` benzeri bir `xp_adjusted` olayı yazın. UI'daki ilerleme ve yardım metnini `calculateLevelProgress`/`calculateXpToNextLevel` ile hesaplayın. Uzun vadede seviyeyi saklamak yerine XP'den türetin (tek doğruluk kaynağı).

### 5. Rol değişimi tek tık, onaysız; kendi rolünü düşürme ve son admin kaybı engellenmiyor; değişiklik JWT'ye 24 saate kadar yansımıyor
- **Önem:** yüksek · **Kategori:** güvenlik / yetki · **Efor:** M
- **Kanıt:** `users-client.tsx:994-1003` ve `625-643` (doğrudan `PUT`); `867-876` (toplu, onaysız); `route.ts:294-383` (PUT'ta self/son-admin kontrolü yok); `lib/auth.ts:212-240` (rol yalnızca girişte DB'den okunuyor), `31-39` (varsayılan 24 saat oturum).
- **Sorun:** Menüden yanlışlıkla "Admin" seçmek bir müşteriyi anında tam yetkili yapar. Yetkisi alınan bir admin ya da silinen bir kullanıcı, mevcut token'ıyla 24 saate kadar admin uçlarını kullanmaya devam eder (`requireAuth` rolü token'dan okuyor). Son admin kendini düşürürse platform yöneticisiz kalır.
- **Öneri:** Rol değişikliğini ayrı bir "Erişim" paneline taşıyın: yükseltmede gerekçe + yazarak onay, ADMIN'e yükseltmede ikinci admin onayı (four-eyes); sunucuda `self` ve "son aktif admin" korumaları. `User`'a `sessionVersion` (ya da `roleChangedAt`) ekleyip JWT'ye gömün; `requireAuth` içinde Redis'te önbellekli bir kontrol ile (token-replay için kullanılan sıcak katman deseni) eski sürümlü token'ları reddedin. Böylece rol düşürme, askıya alma ve silme anında etkili olur.

### 6. Detaydaki "Rozetler" sekmesi her zaman boş; rozet geri alma erişilemez
- **Önem:** yüksek · **Kategori:** hata · **Efor:** S
- **Kanıt:** `users-client.tsx:393-397` (`setUserBadges(data.userBadges || [])`); `app/api/gamification/badges/route.ts:287-292` (yanıt: `data`, `userProgress`, `userPoints` — `userBadges` yok); `268-273` (admin olmayan `userId` sorgusunda yalnız kazanılanlar `data` içinde).
- **Sorun:** Sözleşme uyuşmazlığı yüzünden her kullanıcı "Henüz rozet yok" görünür; operatör yanlış bilgiyle "Rozet Ver" der, sunucu "zaten sahip" hatası döner. Rozet geri alma (X) hiç görünmez. Ayrıca detay açılışı bu ağır ucu (500 rozet + ilerleme hesabı) bekliyor.
- **Öneri:** Kullanıcı rozetleri için admin'e özel, hafif bir uç açın: `GET /api/admin/users/:id/badges` → `userBadge` + `badge` (id, ad, ikon, rarity, `earnedAt`, kaynak). Detay diyaloğunu hemen açıp sekmeyi kendi yükleniyor durumu ile doldurun (SWR/React Query). Rozet kaldırmayı onaylı yapın, audit'e yazın ve butonu her zaman görünür (`aria-label="… rozetini kaldır"`) hale getirin. Rozet verme kataloğunu `?admin=1` ile çekin ki karakter ve gizli rozetler de verilebilsin (`users-client.tsx:330`, `badges/route.ts:91-92`).

### 7. Otomasyon "onay akışı" güvence sağlamıyor; "Execute Now" kayıtsız formla tüm müşterilere puan basabiliyor
- **Önem:** yüksek · **Kategori:** güvenlik / süreç · **Efor:** M
- **Kanıt:** `users-automation-panel.tsx:151-168` (kural seçili değilse `buildPayload()` çalıştırılır, onay diyaloğu yok), `45-55` (varsayılan: CUSTOMER, minPoints 0, add_points 100); `execute/route.ts:41-55` (`requiresApproval` yalnız `ruleId` varsa kontrol ediliyor), `18` (limit 500, en fazla 1000); `rules/[id]/route.ts:61-79` (onaylayan = oluşturan olabilir; koşul/aksiyon güncellemesi `approvedAt`'i sıfırlamıyor); motor `set_role` aksiyonunu da destekliyor (`lib/users-automation/types.ts:13-17`, `engine.ts:87-88`).
- **Sorun:** "Onay Gereksin" anahtarı bir güvenlik kontrolü gibi görünüyor ama ad-hoc yol tamamen bypass ediyor; aynı admin kendi kuralını onaylayabiliyor; onaylanan kural sonradan istenen herhangi bir aksiyona (API'den `set_role: ADMIN` dahil) çevrilebiliyor. Bir yanlış tıklama 500 kullanıcıya puan basıyor.
- **Öneri:** Çalıştırmayı **yalnızca kayıtlı ve onaylı kurallarla** sınırlayın; ad-hoc çalıştırmayı kaldırın (dry-run serbest kalsın). Onaylayan ≠ oluşturan/son düzenleyen kuralı sunucuda zorlayın; `condition/actions` değiştiğinde `approvedAt/approvedById`'yi null'layın. "Çalıştır"dan önce dry-run sonucunu (etkilenen kişi sayısı, toplam puan etkisi, 5 örnek ad/e-posta) gösteren ve sayıyı yazdırarak onaylatan bir diyalog koyun. `set_role` aksiyonunu motor seviyesinde ADMIN'e yükseltmeyi reddedecek şekilde kısıtlayın.

### 8. `/api/gamification/badges?userId=…` kimlik doğrulamasız başka kullanıcının verisini döndürüyor (IDOR)
- **Önem:** yüksek · **Kategori:** güvenlik · **Efor:** S
- **Kanıt:** `app/api/gamification/badges/route.ts:78-87` (`userIdParam` oturumdan bağımsız kullanılıyor), `146-185` (kazanılan rozetler + puan/seviye/geri bildirim/görev sayıları), `285-292` (yanıt); `proxy.ts:104-118` (`/api/*` proxy'de auth'suz geçiyor).
- **Sorun:** Bu sayfanın çağırdığı uç, oturum açmamış herhangi birine verilen bir kullanıcı kimliğinin kazandığı rozetleri, `earnedAt` zamanlarını, toplam puanını, seviyesini ve geri bildirim sayısını döndürüyor. Etki oyunlaştırma verisiyle sınırlı ama yine de kişiye ait davranış verisi (kimlikler liderlik tablosu gibi yüzeylerden elde edilebiliyorsa sömürülebilir; bu ayrıca doğrulanmadı).
- **Öneri:** `userId` parametresini yalnızca `'me'` ya da ADMIN oturumu için kabul edin; aksi halde 403. Admin ihtiyacını Bulgu 6'daki `GET /api/admin/users/:id/badges` ucuna taşıyın ve bu genel uçtan `userId` desteğini kaldırın.

### 9. Üst istatistik kartları sayfaya özel; yanıltıcı KPI
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** S
- **Kanıt:** `users-client.tsx:687-692`.
- **Sorun:** "Toplam" küresel, diğer üç kart yalnız ekrandaki 20 satırdan. Operatör "3 bayimiz var" sanabilir.
- **Öneri:** `GET /api/admin/users/stats` ile `groupBy(role)` + son 7 gün yeni kayıt + askıdaki/flag'li hesap sayısını döndürün, Upstash Redis'te 60 sn önbellekleyin. Kartları tıklanabilir filtre olarak kullanın (karta tıklamak rol filtresini ayarlar).

### 10. İstek yarışı, çift fetch ve sayfalar arası kalıcı seçim
- **Önem:** orta · **Kategori:** hata / performans · **Efor:** M
- **Kanıt:** `users-client.tsx:236-244` (iki efekt aynı anda tetikleniyor), `250-274` (iptal yok), `177` + `457-460` (seçim sayfa değişiminde temizlenmiyor), `240-244` (rozet/ödül katalogları her değişimde yeniden).
- **Sorun:** Filtre değişiminde eski sayfa ve yeni sayfa için iki istek gider; hangisinin son döneceği belirsiz. Görünmeyen seçili kayıtlar toplu silmeye girebilir.
- **Öneri:** Liste durumunu URL'ye taşıyın (`?q=&role=&page=&size=&sort=`; `useSearchParams` + `router.replace`), veriyi SWR/React Query ile anahtar = query string olacak şekilde çekin (otomatik iptal/dedupe/önceki veriyi koruma — `keepPreviousData`). Katalogları ayrı, uzun `staleTime`'lı sorgulara ayırın ve yalnızca ilgili diyalog açıldığında yükleyin. Seçimi sorgu anahtarı değiştiğinde sıfırlayın ya da "tüm filtre sonucunu seç (N)" modelini (Gmail/Linear) açıkça sunun.

### 11. Global aramadan gelen `?id=` derin bağlantısı çalışmıyor
- **Önem:** orta · **Kategori:** kırık bağlantı · **Efor:** S
- **Kanıt:** `app/api/search/route.ts:165`; `app/admin/users/users-client.tsx` içinde `useSearchParams` kullanımı yok.
- **Sorun:** Header'daki aramada kullanıcıya tıklayan operatör genel listeye düşüyor ve kişiyi yeniden aramak zorunda kalıyor.
- **Öneri:** Kullanıcı detayını tam sayfa rotası yapın: `/admin/users/[id]` (Stripe'ın müşteri sayfası gibi). Hem global arama hem `trust-command`, `platform-pulse`, `ecosystem` gibi sayfalardaki bağlantılar doğrudan kişiye gitsin; liste satırı da bu rotaya `Link` olsun (yeni sekmede açma, paylaşılabilir URL, geri tuşu doğal çalışır).

### 12. Aksiyon sonrası detay bayat; diyaloglar arası durum karmaşası
- **Önem:** orta · **Kategori:** UX / durum yönetimi · **Efor:** M
- **Kanıt:** `users-client.tsx:580-587` (`selectedUser` güncellenmiyor), `462-475` (açılış ağ isteğini bekliyor), `760` + `1533` ("Kullanıcı Ekle" diyaloğu otomasyon sekmesinde mount değil), `170-228` (20+ `useState`).
- **Sorun:** Puan ekleyen admin, diyalogda eski bakiyeyi görmeye devam eder; tekrar eklemeye yönelebilir. Tek bileşende 4 diyalog ve 20'den fazla durum değişkeni, bu tür senkron hatalarını kaçınılmaz kılıyor.
- **Öneri:** Detayı kendi veri sorgusuna sahip ayrı bir rota/bileşene ayırın (`useUser(id)`); mutasyonlardan sonra ilgili sorguyu `invalidate` edin ya da sunucunun döndürdüğü güncel kullanıcıyla iyimser güncelleme yapın (uç zaten güncel `user` döndürüyor: `route.ts:431,470,493`). Aksiyon formlarını `react-hook-form` + zod (sunucuyla paylaşılan şema) ile tek tek bileşenlere bölün. Global diyalogları sekme koşulunun dışına taşıyın.

### 13. Ödül verme stok/aktiflik kontrolsüz; audit kapsamı delikli
- **Önem:** orta · **Kategori:** veri bütünlüğü / izlenebilirlik · **Efor:** S
- **Kanıt:** `route.ts:580-614` (stok/isActive yok, stok düşülmüyor, audit yok), `434-494` ve `547-578` ve `616-629` (audit yok); `schema.prisma:680-693` (`stock`, `isActive`).
- **Sorun:** Stoğu bitmiş ya da pasif fiziksel ödül "hediye" edilebilir; kimin hangi ödülü/bildirimi/rozet kaldırmayı yaptığı izlenemez.
- **Öneri:** Ödül verme işlemini mağaza tarafındaki ödül talep (redeem) servisinin "maliyetsiz" varyantı olarak yazın: aynı transaction'da stok koşullu düşüm (`updateMany where stock > 0 or stock = -1`), `isActive` kontrolü, audit. Tüm `PATCH` aksiyonlarını tek bir `withAdminAudit(action, fn)` sarmalayıcısıyla audit'e zorunlu bağlayın.

### 14. CSV dışa aktarma eksik ve formül enjeksiyonuna açık
- **Önem:** orta · **Kategori:** güvenlik / işlevsellik · **Efor:** S
- **Kanıt:** `users-client.tsx:305-326` (`users` = mevcut sayfa), `lib/export-utils.ts:56-63` (yalnız tırnak kaçışı).
- **Sorun:** Kullanıcı adını `=HYPERLINK(...)` yapan biri, CSV'yi Excel'de açan operatörde formül çalıştırabilir. Ayrıca operatör tüm listeyi aldığını sanırken yalnızca 20 satır alır.
- **Öneri:** `= + - @ \t \r` ile başlayan hücrelerin başına `'` ekleyin (OWASP CSV injection önerisi) — bu düzeltme `lib/export-utils.ts` içinde yapılırsa tüm admin dışa aktarımları korunur. Dışa aktarmayı sunucu tarafına taşıyın (`GET /api/admin/users/export?…filters`, akışlı CSV, satır sınırı ve audit kaydı); butonda "Filtre sonucunu dışa aktar (N satır)" yazsın.

### 15. Dil karışıklığı ve marka dışı sabit renkler
- **Önem:** düşük · **Kategori:** tutarlılık / görsel · **Efor:** S
- **Kanıt:** `users-client.tsx:723,732` ("Users", "Automation"), `1176,1188` ("Latitude/Longitude"), `1269,1442` (ham "legendary/rare"), `720,729,738` (`text-emerald-900`); `users-automation-panel.tsx:227-229,234,255,271,328` ("Customer", "Min Points", "Priority", "Execute Now", "Run History"), `312` ("Onayli"); `lib/admin-toast.ts:17,19` ("Basarili: ", "Dikkat: " — Türkçe karakter yok, her toast'a önek); `lib/users-automation/engine.ts:71-72` (kullanıcıya giden "Puan Degisikligi", "uygulandi"); `route.ts:236` (zod İngilizce varsayılan mesajlar).
- **Sorun:** Operatör arayüzü iki dilli, kullanıcıya giden bildirimler Türkçe karaktersiz.
- **Öneri:** Admin metinlerini mevcut `i18n` katmanına (`t(locale, …)`) alın; rarity için `RARITY_LABELS` (Yaygın/Nadir/Epik/Efsanevi); zod şemalarına Türkçe mesajlar ya da merkezi `zodErrorMap`. `admin-toast` önekini kaldırın (sonner zaten ikon/renkle durumu belirtiyor) veya doğru yazımla tek yerden yönetin. Sabit `emerald-900` yerine tema token'ları (`primary`/`primary-foreground`).

### 16. Erişilebilirlik: klavyeyle açılamayan satırlar, adsız ikon butonları, hover'a gizli aksiyonlar
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `users-client.tsx:908-915` (tıklanabilir `tr`, `tabIndex`/`role`/`onKeyDown` yok), `969-971` (adsız "⋮"), `1272-1279` (`opacity-0 group-hover:opacity-100`, adsız X), `715-734` (tab semantiği yok).
- **Öneri:** Satırın birincil hücresine gerçek bir `Link`/`button` koyun (tüm satırı tıklanabilir yapan desen için `::after` overlay), ikon butonlarına `aria-label`, gizli aksiyonlara `focus-visible:opacity-100` ve dokunmatik cihazlarda her zaman görünürlük; ana sekmeleri shadcn `Tabs` ile kurun.

### 17. Ölü kod ve küçük temizlik
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** Kullanılmayan importlar `Edit`, `Award`, `Target`, `ChevronRight`, `CardHeader`, `CardTitle`, `CardDescription` (`users-client.tsx:10,24,26,31,37`); `filteredUsers = users` takma adı (`685`); `route.ts:95` GET'te kullanılmayan `session`; `route.ts:127-199` iki dalda kopyalanmış 30 satırlık `select`; liste yanıtı `phone`, `address`, koordinatlar gibi listede gösterilmeyen PII'yi her satır için döndürüyor (`route.ts:141-149,175-183`).
- **Öneri:** `select`'i `listSelect` / `detailSelect` olarak ikiye ayırın; liste PII'yi yalnız detay ucunda versin.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool iç araçları, PostHog)

1. **Kullanıcı 360 sayfası** (`/admin/users/[id]`): kimlik, rol/erişim, plan/fatura, oyunlaştırma (puan defteri, XP, rozet, ödül), güven/fraud (`trustScore`, `trustTier`, `fraudStatus`), aktivite zaman çizelgesi (giriş, yorum, QR tarama, otomasyon etkileri) ve **o kullanıcıyla ilgili audit log** tek ekranda — Stripe Customer ve PostHog Person sayfası benzeri.
2. **Puan defteri (ledger)**: her puan hareketinin kaynağı, gerekçesi, yapanı; "bu bakiyeyi geri al" ve düzeltme işlemleri. Şu an bakiye yalnızca bir sayı.
3. **Askıya alma / dondurma / shadow-ban** ve **oturumları sonlandır**, **şifre sıfırlama bağlantısı gönder**, **e-posta doğrulamayı yeniden gönder** — kalıcı silmeden önce gelen standart yaptırım ve destek aksiyonları.
4. **Gelişmiş filtreleme + sıralama + kayıtlı görünümler**: rol, plan, güven kademesi, fraud durumu, doğrulanmış mı, kayıt/son aktivite aralığı, puan aralığı; kolon başlığından sıralama; Linear tarzı filtre çipleri ve kaydedilebilir görünümler ("Flag'li müşteriler", "Plansız bayiler").
5. **Kullanıcı taklidi (impersonation)**: süre sınırlı, audit'li, ekranda belirgin bantlı "kullanıcı gözünden görüntüle" — destek ve hata ayıklama için iç araçlarda standart.
6. **Komut paleti ve klavye kısayolları** (`/` arama, `j/k` gezinme, `⌘K` aksiyon), seçim üzerinde Linear tarzı alt aksiyon çubuğu; davetle kullanıcı oluşturma (şifreyi admin belirlemeden, tek kullanımlık bağlantıyla).

---

## Yeniden tasarım vizyonu

**Hedef deneyim.** Operatör bu sayfaya üç işten biri için gelir: (1) birini bulmak, (2) bir kişinin durumunu anlamak, (3) güvenli bir düzeltme yapmak. Ekran bu üç işi sırasıyla ve hızlıca karşılamalı; yıkıcı aksiyonlar her zaman bir adım geride, gerekçeli ve geri alınabilir olmalı.

**Yerleşim.**
- **Liste görünümü (`/admin/users`)**: üstte tıklanabilir rol/segment KPI şeridi (sunucu `stats` ucundan, Redis önbellekli), altında Linear tarzı filtre çipleri + arama + kayıtlı görünüm seçici; URL senkron. Tablo: avatar+ad+e-posta, rol, plan, güven kademesi rozeti, puan, seviye, son aktivite, kayıt tarihi; sıralanabilir başlıklar; sanal kaydırma ya da sayfalama + "sayfaya git". Seçim yapıldığında ekranın altında yüzen bir aksiyon çubuğu (rol, askıya al, bildirim, dışa aktar) — her biri onay diyaloğuyla.
- **Detay (`/admin/users/[id]`)**: solda sabit kimlik kartı (avatar, rol, plan, durum, hızlı aksiyonlar: bildirim gönder, bakiye düzelt, askıya al); sağda sekmeler: *Genel* (KPI'lar, seviye ilerlemesi doğru formülle), *Ekonomi* (puan defteri tablosu + düzeltme formu), *Rozet ve ödüller* (kazanılanlar, ver/geri al), *Aktivite* (zaman çizelgesi), *Güven* (trust/fraud sinyalleri, `/admin/trust-command`'a bağlantı), *Erişim* (rol, ekip departmanı, oturumlar), *Audit*. Bayi ise ek *İşletme* sekmesi (konum haritası, plan, QR kotası, personel/STAFF listesi).
- **Otomasyon**: bu sayfadan çıkarılıp `/admin/users/automation` ya da mevcut kural/segment ekranlarının yanına taşınmalı (aşağıda).

**Motion / 3D.** Bu bir veri yoğun iç araç; 3D gereksiz ve yersiz. Motion ölçülü kalmalı: satır girişindeki kademeli animasyon yalnız ilk yüklemede (her filtrede tekrar etmesin — `keepPreviousData` ile içerik yerinde değişsin), seçim aksiyon çubuğunun alttan 150 ms kayarak gelmesi, bakiye düzeltmesinden sonra puan değerinde kısa bir sayı geçişi (`useSpring`, `reducedMotion="user"` zaten global). Yükleme durumunda spinner yerine satır iskeleti; tabloyu boşaltmak yerine üstte ince bir ilerleme çubuğu.

**Veri / API değişiklikleri.**
1. `lib/roles.ts` — Prisma `Role`'den türetilmiş tek rol sözlüğü (Bulgu 1).
2. Şema: `User.status` (`active | suspended | deleted`), `deletedAt`, `sessionVersion`; `AuditLog.user` → `onDelete: SetNull` + `actorEmail`; `PointLedger` modeli (`userId, delta, balanceAfter, source, reason, actorId, createdAt`) — mevcut `points_credited` olayları bu tabloya bağlanabilir.
3. Uçlar: `GET /api/admin/users` (sort, gelişmiş filtreler, liste için dar `select`), `GET /api/admin/users/stats`, `GET /api/admin/users/:id` (360 özeti), `GET /api/admin/users/:id/badges|ledger|activity|audit|impact`, `POST /api/admin/users/:id/points` (`adjustPointsByAdmin`), `POST /api/admin/users/:id/suspend`, `POST /api/admin/users/:id/sessions/revoke`, `PATCH /api/admin/users/:id/role` (four-eyes), `GET /api/admin/users/export` (akışlı, enjeksiyon korumalı). Bugünkü 7 eylemli `PATCH` "god endpoint" bu kaynak-odaklı uçlara bölünmeli; her mutasyon `withAdminAudit` ile sarılmalı ve `checkAdminRateLimit` uygulanmalı (şu an yalnızca bulk ve execute'ta var).
4. `requireAuth` içinde `sessionVersion` kontrolü (Redis sıcak katman + DB doğruluk kaynağı).

---

## Çakışmalar / birleştirme önerisi

- **Otomasyon sekmesi ↔ `/admin/segments`, `/admin/seasonal-campaigns`, `/admin/points-matrix`:** "rol + min puan koşulu → puan/XP ver" mantığı segment tabanlı kampanyaların özel bir hali. Otomasyonu kullanıcı listesinin içine gömülü bir sekme olarak tutmak yerine segmentlerle birleşik bir "Kurallar ve kampanyalar" modülüne taşıyın; koşul olarak kayıtlı segment seçilebilsin, çıktılar aynı `adjustPointsByAdmin`/ledger yolundan geçsin.
- **Detaydaki "Bildirim Gönder" ↔ push merkezi:** tekil bildirim, bildirim/push yönetimiyle aynı şablon ve tercih (`notificationPrefs`) altyapısını kullanmalı; ayrı, tercihleri yok sayan bir yol olarak kalmamalı.
- **Silme ↔ `/admin/privacy-requests`:** kalıcı silme yalnızca KVKK akışında (anonimleştirme) yapılmalı; bu sayfa askıya alma sunmalı ve gerekiyorsa KVKK talebi oluşturmaya yönlendirmeli.
- **Güven/fraud ↔ `/admin/trust-command`, `/admin/fraud-prevention`:** bu sayfalar `/admin/users`'a genel bağlantı veriyor (`app/admin/trust-command/page.tsx:172`); kişi bazlı derin bağlantı (`/admin/users/[id]?tab=trust`) ile iki yönlü bağlanmalı, güven verisi kullanıcı detayında görünmeli.
- **Admin rolü/departman ↔ `/admin/ekip`:** `adminDepartment`/`adminTeamRole` PUT ucunda var (`route.ts:29-31`) ama bu sayfada yönetilmiyor; iç ekip üyeliği `/admin/ekip`'te kalmalı, kullanıcı detayındaki *Erişim* sekmesi oraya bağlantı vermeli.
- **Sonuç:** Sayfa kaldırılmamalı — platformun çekirdek ekranı. Ancak otomasyon dışarı alınarak sadeleştirilmeli ve liste + Kullanıcı 360 olarak yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: her iddia çürütülmeye çalışıldı; çağıran/çağrılan taraflar, `proxy.ts`, `lib/api-auth.ts`, `lib/auth.ts`, `lib/points-wallet.ts`, `lib/users-automation/engine.ts` ve `prisma/schema.prisma` baştan okundu. Kod çalıştırılmadı, veritabanına dokunulmadı; kararlar yalnız statik okumaya dayanır.

| # | İddia | Karar | Önem (yeniden) |
|---|---|---|---|
| 1 | STAFF kullanıcısı sayfayı çökertiyor | **Doğrulandı** | Kritik |
| 2 | Hard delete kaskadı (QR, yorum, audit) | **Doğrulandı** | Yüksek |
| 3 | Admin puan ekleme/düşme ekonomi değişmezleri | **Doğrulandı (kısmen abartılı)** | Orta |
| 4 | `set_level` doğrusal XP | **Doğrulandı** | Orta |
| 5 | Rol/silme JWT'ye yansımıyor, self-demotion, onaysız ADMIN | **Doğrulandı** | Yüksek |
| 6 | `/api/gamification/badges?userId=` IDOR | **Doğrulandı (etki düşük)** | Düşük–Orta |
| 7 | Otomasyon onay akışı bypass / kayıtsız form toplu puan | **Doğrulandı** | Yüksek |
| 8 | Rozetler sekmesi her zaman boş | **Doğrulandı** | Orta |

**1 — STAFF çökmesi: doğrulandı.** `Role` enum'unda `STAFF` var (`prisma/schema.prisma:22-27`); `/api/dealer/staff` hem yeni kullanıcıyı `role: 'STAFF'` ile oluşturuyor (`app/api/dealer/staff/route.ts:126`) hem de var olan bir kullanıcıyı STAFF'a çeviriyor (`:101`). `GET /api/admin/users` rol filtresi yokken `where = {}` ile tüm rolleri döndürüyor, sıralama `createdAt desc` (`app/api/admin/users/route.ts:115-119,168`); `adminUsersQuerySchema.role` yalnız üç rol kabul ediyor (`lib/validations-admin.ts:105`), yani STAFF filtrelenemez de. İstemcide `roleIcons` yalnız üç anahtar içeriyor (`app/admin/users/users-client.tsx:150-154`); `const RoleIcon = roleIcons[user.role]` (`:906`) STAFF için `undefined`, `<RoleIcon .../>` (`:939`) React'te "Element type is invalid" fırlatır ve `app/admin/error.tsx` sınırına düşer. Detay diyaloğundaki `React.createElement(roleIcons[selectedUser.role])` (`:1070`) da aynı hatayı verir. **Yeniden üretim:** bir bayi `/dealer` personel ekranından personel ekler → admin `/admin/users`'ı açar → yeni STAFF ilk sayfada (createdAt desc) → tablo render'ı patlar, sayfa hata ekranına düşer. Tek koşul canlıda en az bir STAFF kullanıcısının ilk sayfaya düşmesi; kod yolu kesin.

**2 — Silme kaskadı: doğrulandı.** `prisma.user.delete` (`app/api/admin/users/route.ts:676-678`) ve `deleteMany` (`app/api/admin/users/bulk/route.ts:79-81`) hard delete. Şemada User'a bağlı hiçbir ilişki `Restrict` değil (grep: `Restrict|NoAction` sonuçsuz; onDelete'siz User ilişkisi yok), dolayısıyla silme hiçbir yerde engellenmez. `QRCode.dealer` → Cascade (`schema.prisma:733`), `Feedback.qrCode` → Cascade (`:834`), `AuditLog.user` → Cascade (`:1118`). Feedback'in `deletedAt` soft-delete alanı olmasına rağmen kaskad onu atlayıp satırı fiziksel siler. **Yeniden üretim:** admin bir bayiyi siler → bayinin tüm QR'ları ve bu QR'lara başka müşterilerin bıraktığı tüm Feedback satırları gider (müşterideki puan kalır, yorum kaybolur); admin A, admin B'yi silerse B'nin yazdığı tüm `AuditLog` satırları da gider (yeni yazılan silme kaydı A'ya ait olduğu için kalır, ama B'nin geçmişi yok olur). Tekil silmede onay diyaloğu var (`users-client.tsx:1604`), toplu silmede yalnız `confirm()` (`:428`); hiçbirinde etki özeti yok.

**3 — Admin puan: doğrulandı, ama "otomasyon doğru yapıyor" karşılaştırması kısmen yanlış.** `add_points` ham `increment` kullanıyor, `points_credited` yazmıyor (`route.ts:399-405`); `amount: z.number()` int/üst sınır yok (`:43-48`). `User.points` `Int` (`schema.prisma:47`), ondalık değer Prisma doğrulama hatası → genel `catch` → 500 (ZodError değil). "Puan Düş" negatif `amount` ile aynı ucu çağırıyor (`users-client.tsx:529-531`), `debitPoints` (`lib/points-wallet.ts:75`) kullanılmadığı için bakiye negatife iner. **Düzeltme notu:** otomasyon motorunun pozitif yolu gerçekten doğru (`creditPointsAndXp` + `points_credited`, `lib/users-automation/engine.ts:51-60`), ancak negatif yolu da aynı şekilde ham `increment` yapıyor ve taban kontrolü yok (`:61-65`); yani negatif bakiye her iki yolda da mümkün. Ayrıca PUT ucu `points: z.number()` ile bakiyeyi doğrudan ezmeye de izin veriyor (`route.ts:19`). Önem "Orta": aktör güvenilir ADMIN ve `AuditLog` yazılıyor; risk, ele geçmiş/kötü niyetli bir admin hesabının velocity/cap dedektörlerine görünmemesi ve operatör hatasıyla negatif bakiye. **Yeniden üretim:** 100 puanlı kullanıcıya "Puan Düş" 500 → `points = -400`.

**4 — `set_level`: doğrulandı.** `xp: (level-1)*1000` (`route.ts:477`); `calculateLevel` geometrik (1000, 1500, 2250…; `lib/utils.ts:94-106`). Seviye 5 → xp 4000; eşikler 1000/2500/4750 olduğundan formüle göre seviye 3. `creditPointsAndXp` seviyeyi yalnız `level < nextLevel` iken günceller (`lib/points-wallet.ts:52-56`), dolayısıyla kullanıcı DB'de seviye 5'te kalır ama sonraki `add_xp` yanıtı `level: nextLevel` (ör. 4) döndürür — yanıt ile DB bile çelişir. `set_level` dalında `auditLog.create` yok (`route.ts:472-492`); aynı eksik `add_xp`, `revoke_badge`, `grant_reward`, `send_notification` dallarında da var. **Yeniden üretim:** seviye 5 ata → kullanıcı 1000 XP kazanır → DB level 5, xp 5000 (formül 4), ilerleme göstergesi negatif/yanlış.

**5 — JWT/rol: doğrulandı.** Rol yalnız girişte (`if (user)`) DB'den okunup JWT'ye yazılıyor (`lib/auth.ts:212-240`); `trigger === 'update'` dalı rolü güncellemiyor (`:271-280`). `requireAuth` DB'ye bakmıyor (`lib/api-auth.ts:56-84`), oturum ömrü varsayılan 24 saat (`lib/auth.ts:31-39`). Önemli ek: `proxy.ts:104-118` tüm `/api/*` isteklerini auth ve gizli-kapı kontrolü olmadan geçirir; admin gizli kapısı yalnız `/admin` **sayfalarını** korur, `/api/admin/*` uçlarını korumaz. PUT ucunda `userId === session.user.id` kontrolü yok (`route.ts:294-383`; toplu uçta var: `bulk/route.ts:48-49`), son-admin sayımı da yok. Satır menüsü (`users-client.tsx:994-1003`) ve toplu Select (`:867-876`) onaysız rol değiştiriyor. **Yeniden üretim:** (a) admin B'nin rolü CUSTOMER yapılır veya B silinir → B'nin mevcut JWT'si 24 saate kadar `/api/admin/users` DELETE/PATCH dahil tüm admin uçlarını çağırabilir; (b) admin kendi satırındaki menüden "Bayi"ye tıklar → DB rolü DEALER, tek admin ise oturum bittiğinde panelde admin kalmaz; (c) yanlış satırda "Admin" tıklanır → kişi yeniden giriş yapınca gizli kapıyı bilmese de `/api/admin/*` uçlarını doğrudan kullanabilir.

**6 — Rozet IDOR: doğrulandı, etkisi iddiadan düşük.** `GET /api/gamification/badges` oturum zorunlu tutmuyor; `userId` parametresi oturumdan bağımsız kullanılıyor (`app/api/gamification/badges/route.ts:78-87`) ve o kullanıcının kazanılmış rozetleri, `earnedAt`, `totalPoints`, `level`, geri bildirim ve görev sayıları dönüyor (`:146-185,285-292`); proxy `/api/*`'ı geçiriyor (`proxy.ts:104-118`). Kimliklerin elde edilebilirliği doğrulandı: `/api/leaderboard` de oturumsuz çalışıyor ve `id`, ad, avatar, puan, seviye, geri bildirim/rozet sayısı döndürüyor (`app/api/leaderboard/route.ts:78,330-338`). Dolayısıyla bu uç sızıntıya yeni olarak yalnızca **hangi rozetlerin hangi zamanda** kazanıldığını ve görev sayısını ekliyor; karakter rozetleri admin dışı modda zaten hariç (`badges/route.ts:111-115`). Önem Düşük–Orta. **Yeniden üretim:** anonim olarak `/api/leaderboard` → `id` al → `/api/gamification/badges?userId=<id>` → rozet listesi ve kazanılma zaman damgaları.

**7 — Otomasyon onayı: doğrulandı.** Kural seçili değilken `executeRule` kayıtsız formu gönderiyor (`components/admin/users-automation-panel.tsx:151-155`); varsayılan form CUSTOMER + minPoints 0 + `add_points` 100 (`:45-55`), execute şeması varsayılan `limit: 500` (`app/api/admin/users/automation/execute/route.ts:19`). `requiresApproval` yalnız `ruleId` dalında kontrol ediliyor (`:48-53`); ad-hoc payload'daki `requiresApproval` Zod tarafından atılıyor. "Execute Now" butonunda onay yok (`users-automation-panel.tsx:271`). Kural PUT ucu onaylayanın oluşturan kişiden farklı olmasını aramıyor ve `condition`/`actions` değişince `approvedAt`'i sıfırlamıyor (`approved` gönderilmezse `undefined` → alan korunur; `rules/[id]/route.ts:61-79`). Motor `set_role` destekliyor (`lib/users-automation/engine.ts:87-90`) ve execute ucu aksiyonları `z.record` ile şekil doğrulamadan kabul ediyor (`execute/route.ts:16-17`). **Yeniden üretim:** Otomasyon sekmesini aç, kural seçmeden "Execute Now" → ilk 500 müşteriye onaysız 100'er puan (toplam 50.000 puan); ya da API'ye `{actions:[{type:'set_role',role:'ADMIN'}], condition:{role:'CUSTOMER'}}` → onaysız toplu ADMIN yükseltmesi.

**8 — Rozetler sekmesi boş: doğrulandı.** İstemci `data.userBadges` okuyor (`users-client.tsx:393-397`); API yanıtı yalnız `success, data, userProgress, userPoints` içeriyor (`badges/route.ts:287-292`). `userBadges` her zaman `[]`, sekme "Henüz rozet yok" gösterir (`users-client.tsx:1254-1257`) ve geri alma butonları hiç render edilmez. Ek not: `data.data` okunsa bile admin dışı mod karakter rozetlerini dışladığı için liste eksik kalırdı; doğru çözüm admin'e özel `GET /api/admin/users/:id/badges` ucudur. **Yeniden üretim:** rozeti olan herhangi bir kullanıcının detayını aç → Rozetler sekmesi boş, tablodaki rozet sayısı (`_count.badges`) ise sıfırdan büyük.

**Özet:** Sekiz iddianın hiçbiri çürütülemedi. Ancak #3'teki "otomasyon motoru doğru yapıyor" karşılaştırması negatif yol için yanlış (orada da taban kontrolü yok) ve #6'nın etkisi, liderlik tablosu aynı kimlik/puan/seviye bilgisini zaten açık verdiği için iddiadan düşük. Öncelik sırası: 1 (sayfa tamamen kullanılamaz hale gelebilir) → 5 ve 7 (yetki/ekonomi kontrolü) → 2 (geri alınamaz veri kaybı) → 8, 4, 3 → 6.
