# /admin/dealers-health

**Amaç:** Platform operatörünün tüm bayileri tek bir 0–100 "sağlık skoru" ile görüp, en riskli bayiden başlayarak müdahale etmesini sağlamak (son 30 gün QR geri bildirimi, bayi yanıt oranı, açık olay, telafi onay kuyruğu ve fraud durumu üzerinden).

**Genel puan: 3.9/10** · **Karar: birleştir** (Dashboard'daki "Tenant health" ve churn-playbook'un kullandığı `lib/tenant-health.ts` ile tek bir "Bayi Sağlığı" modülünde birleştirilip yeniden tasarlanmalı.)

Dosyalar: `app/admin/dealers-health/page.tsx` (123 satır, client component), `app/api/admin/dealers-health/route.ts` (117 satır). Layout: `app/admin/layout.tsx`. Bileşenler: `components/admin/admin-premium-hero.tsx`, `components/ui/{card,button,badge,progress}.tsx`. Prisma modelleri: `User`, `QRCode`, `Feedback`, `Incident`, `RemedyOffer`.

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Veri gerçek ve sorgu N+1'siz, ama skor formülü sessiz bayiyi "sağlıklı" gösteriyor, 200 bayide keyfi kesiliyor ve sayfa yalnızca okuma yapıyor; hiçbir aksiyon bayiye bağlı değil. |
| UX | 3/10 | 200'e kadar dikey kart, arama/filtre/sıralama/boş durum yok; tek aksiyon ("Playbook") bağlamı taşımayan statik bir link. |
| Görsel | 5/10 | Ortak premium hero ve kart dili tutarlı, fakat skor üç kez tekrar ediliyor (rozet + "x/100" + bar), bar rengi riske göre değişmiyor, ham cuid ve "Fraud: clean" gibi gürültü var. |
| Mimari | 3/10 | Aynı kavram için ikinci, çelişen bir skor motoru (`lib/tenant-health.ts`) zaten var; eşikler üç yerde farklı (45/65, 50, 70); i18n yok; sorgu mantığı route içinde gömülü, test yok. |
| Performans | 5/10 | groupBy ile toplu sorgu iyi, ancak sınırsız `qRCode.findMany` + dev `IN (...)` listesi, cache yok (kardeş uç `tenant-health` Redis 60 sn kullanıyor). |
| Erişilebilirlik + Mobil | 4/10 | Kartlar mobilde düzgün yığılıyor; ancak Progress `aria-valuenow` almıyor (belirsiz progressbar), yükleniyor/hata için `aria-live`/`role="alert"` yok, skor yalnızca renkle kademeleniyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi (ADMIN rolü + gizli kapı cookie) | ÇALIŞIYOR | `proxy.ts:60-88` | `/admin/*` rotası rol + `admin_gate` cookie ister. |
| 2 | API erişimi (`GET /api/admin/dealers-health`) yalnız ADMIN | KISMİ | `app/api/admin/dealers-health/route.ts:13-14`, `proxy.ts:104-118` | Rol kontrolü var; ama gizli kapı cookie'si `/api/*` yolunda hiç kontrol edilmiyor (bkz. Bulgu 5). |
| 3 | Hero (eyebrow "Operasyon", başlık, açıklama, ikon) | ÇALIŞIYOR | `page.tsx:50-54` | Sabit Türkçe metin; i18n yok. |
| 4 | "Yenile" butonu + dönen ikon + yüklenirken disable | ÇALIŞIYOR | `page.tsx:55-66` | Son güncelleme zamanı gösterilmiyor. |
| 5 | İlk yükleme (mount'ta fetch) | ÇALIŞIYOR | `page.tsx:44-46` | Unmount/abort koruması yok (küçük risk). |
| 6 | Yükleniyor durumu | KISMİ | `page.tsx:76-77` | Düz "Yükleniyor…" metni; iskelet yok, `aria-live` yok. Yenilemede tüm liste kaybolup metne dönüyor (layout zıplaması). |
| 7 | Hata durumu kartı | KISMİ | `page.tsx:35-38, 69-73` | `r.json()` `r.ok`'tan önce çağrılıyor; JSON olmayan 500/HTML yanıtında kullanıcı "Unexpected token <" gibi ham İngilizce hata görür. 401/403'te "Unauthorized"/"Forbidden" İngilizce. Yeniden dene aksiyonu yok, `role="alert"` yok. |
| 8 | Boş durum (hiç bayi yok) | EKSİK | `page.tsx:79` | `rows.map` boş dizide hiçbir şey çizmiyor; sayfa boş kalıyor. |
| 9 | Bayi kartı başlığı (işletme adı / id kısaltması) | ÇALIŞIYOR | `page.tsx:84`, `route.ts:99` | businessName yoksa `id.slice(0,8)` — operatör için anlamsız. `name`/e-posta yedeği yok (tenant-health `name`'e düşüyor: `lib/tenant-health.ts:96`). |
| 10 | Bayi ID (mono, tam cuid) | KISMİ | `page.tsx:85` | Kopyala butonu yok; tıklanabilir değil; görsel gürültü. |
| 11 | Skor rozeti (45/65 eşikli renk) | KISMİ | `page.tsx:88-90` | Eşikler dashboard (70) ve churn-playbook (50) ile çelişiyor; "default" varyantı = primary, "sağlıklı" anlamı taşımıyor. |
| 12 | "Playbook" linki | SAHTE/KISMİ | `page.tsx:91-96` | Her kartta aynı statik `/admin/playbooks` linki; bayi bağlamı taşımıyor. `ExternalLink` ikonu yanlış (aynı sekmede iç link). Hedef sayfa `?dealerId` okumuyor ve bayi seçicisi yalnız 60 bayi yüklüyor (`app/admin/playbooks/page.tsx:68`). |
| 13 | Sağlık skoru bar'ı (Progress) | KISMİ | `page.tsx:101-107`, `components/ui/progress.tsx:15-31` | Renk riske göre değişmiyor; `value` Radix Root'a iletilmiyor → `aria-valuenow` yok. |
| 14 | Metrik: Geri bildirim (30g) sayısı | ÇALIŞIYOR | `route.ts:36-41, 62-68` | Yalnız QR `Feedback`; `ConsumptionReview` kanalı sayılmıyor. |
| 15 | Metrik: Ortalama puan | ÇALIŞIYOR | `route.ts:68, 81, 102` | Ağırlıklı ortalama doğru hesaplanıyor; küçük örneklem koruması yok. |
| 16 | Metrik: Yanıt oranı | KISMİ | `route.ts:42-46, 82, 103` | Geri bildirim yokken %100 sayılıyor → skoru şişiriyor (Bulgu 1). |
| 17 | Metrik: Açık olay sayısı | ÇALIŞIYOR | `route.ts:47-51` | `open/assigned/in_progress` şemaya uygun (`prisma/schema.prisma:1254`). Olayın şiddeti (severity) dikkate alınmıyor. |
| 18 | Metrik: Telafi kuyruğu | ÇALIŞIYOR | `route.ts:52-56` | `awaiting_dealer_approval`; bekleme süresi dikkate alınmıyor. |
| 19 | Metrik: Fraud durumu | KISMİ | `page.tsx:114`, `schema.prisma:100` | Ham İngilizce değer ("clean", "shadow_ban") gösteriliyor; Türkçe etiket/rozet yok. |
| 20 | Skor hesaplama | BOZUK (mantık) | `route.ts:86-95` | Sessiz bayi 83 puanla "sağlıklı"; tek yorumla −35 sapma; ayrıca kardeş formülle çelişiyor. |
| 21 | Varsayılan sıralama (en kötü üstte) | KISMİ | `route.ts:110` | Sıralama doğru ama yalnız keyfi seçilmiş ilk 200 bayi içinde (`route.ts:18-22`, `orderBy` yok). |
| 22 | 200 bayi limiti | BOZUK | `route.ts:21` | Limit aşılırsa hangi bayilerin düştüğü belirsiz; kullanıcıya "200/N gösteriliyor" bilgisi yok, sayfalama yok. |
| 23 | `periodDays` alanı | ÖLÜ | `route.ts:114` | Yanıtta var, istemci kullanmıyor; dönem seçici yok. |
| 24 | Arama / filtre (risk kademesi, fraud, olay var) | EKSİK | — | |
| 25 | Kolon sıralama (skor, olay, yanıt, hacim) | EKSİK | — | |
| 26 | Özet KPI şeridi (riskli bayi sayısı, ortalama, dağılım) | EKSİK | — | Dashboard'da benzer kart var ama farklı formülle (`app/admin/admin-dashboard-client.tsx:101-104, 306-319`). |
| 27 | Skor açıklaması / bileşen dökümü | EKSİK | `page.tsx:53` | Açıklama ağırlıkları vermiyor; bir bayinin neden 38 aldığını görmek mümkün değil. |
| 28 | Trend (önceki dönemle kıyas, sparkline) | EKSİK | — | `tenant-health` 7g/14g trendi zaten hesaplıyor. |
| 29 | Bayi detayına geçiş (drill-down) | EKSİK | — | Admin tarafında `/admin/users/[id]` gibi bir detay sayfası yok (`app/admin/users/` yalnız liste). |
| 30 | CSM görevleri (churn-playbook çıktısı) | EKSİK | `app/api/internal/inngest/churn-playbook/route.ts:33` | `CSMTask` yazılıyor ama hiçbir yerde okunmuyor; bu sayfanın doğal yeri. |
| 31 | Dışa aktarma (CSV) | EKSİK | — | |
| 32 | i18n (EN) | EKSİK | `page.tsx` tamamı | Sidebar "Dealer Health" diye İngilizce görünürken (`messages/en.json:2484`) sayfa tamamen Türkçe kalıyor. |
| 33 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:82, 108` | `flex-wrap` + `sm:grid-cols-2`; 200 kartlık dikey kaydırma mobilde yorucu. |
| 34 | Azaltılmış hareket | ÇALIŞIYOR | `admin-premium-hero.tsx:73, 35`, `progress.tsx:27` | Hero ve bar `motion-reduce` destekli; sayfada başka animasyon yok. |
| 35 | Önbellek | EKSİK | `route.ts` | Kardeş uç Redis 60 sn kullanıyor (`app/api/admin/tenant-health/route.ts:15-22`). |

Özet sayım (35 satır): ÇALIŞIYOR 11 · KISMİ 9 · BOZUK 2 (skor mantığı, 200 limiti) · SAHTE 1 (bağlamsız Playbook linki) · EKSİK 11 · ÖLÜ 1 (`periodDays`).

---

## Bulgular

### 1. Sessiz/aktivitesiz bayi "sağlıklı" görünüyor — churn sinyali tersine dönüyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu / ürün mantığı · **Efor:** M
- **Kanıt:** `app/api/admin/dealers-health/route.ts:81-90` — `const replyRate = n > 0 ? e.replied / n : 1;` ve `if (avg != null) {...}`.
- **Sorun:** Son 30 günde hiç geri bildirim almayan bayi: `72 + (1 − 0.5) × 22 = 83`. Ortalaması 4.2, yanıt oranı %40 olan aktif bir bayi: `72 + 9.8 − 2.2 ≈ 80`. Yani platformu bırakmış (en yüksek churn riskli) bayi, aktif ve iyi puan alan bayiden **daha sağlıklı** listeleniyor ve "en kötü üstte" sıralamasında dibe gömülüyor. Sayfanın tek amacı riskli bayiyi yukarı taşımak; tam tersi oluyor. `tenant-health` ise kullanım düşüşünü (`usageTrend`) cezalandırıyor (`lib/tenant-health.ts:85-86`).
- **Öneri:** Skoru "aktivite" ve "kalite" olarak iki boyuta ayırın. Aktivite boyutu: son 30g geri bildirim + tüketim yorumu hacmi, önceki 30g'ye göre değişim, son giriş/son QR taraması (`QRCode.scanCount` zaman serisi yoksa son feedback tarihi). Veri yoksa skor `null` + "Veri yetersiz / Sessiz" etiketi döndürülsün, 83 gibi sahte bir değer değil. Yanıt oranı payda 0 iken nötr (hesaba katılmayan) bileşen olsun.

### 2. Aynı kavram için iki çelişen skor motoru ve üç farklı eşik
- **Önem:** yüksek · **Kategori:** mimari / tutarlılık · **Efor:** L
- **Kanıt:** Bu sayfa: `route.ts:86-95` (baz 72, rating/yanıt/olay/telafi/fraud), eşikler `page.tsx:88` (45/65). Dashboard "Tenant health" kartı: `app/admin/admin-dashboard-client.tsx:80, 101-104` (`lib/tenant-health.ts` formülü, risk eşiği 70). Otomatik CSM görevi: `app/api/internal/inngest/churn-playbook/route.ts:12, 18` (aynı tenant-health, eşik env ile varsayılan 50).
- **Sorun:** Operatör dashboard'da "X bayi risk altında" görüp bu sayfaya geldiğinde farklı bir skorla, farklı bir sıralamayla, farklı bir "risk" tanımıyla karşılaşıyor. Otomatik sistem (CSM görevi) bir bayiyi riskli sayarken bu sayfa onu yeşil gösterebiliyor. Bu, metriğe güveni yok eder.
- **Öneri:** `lib/dealer-health/` altında tek bir saf skor fonksiyonu (`computeDealerHealth(signals) → { score, band, components[] }`) ve tek bir sinyal toplayıcı (`collectDealerSignals(dealerIds, window)`) oluşturun; bant eşiklerini tek sabitte (`HEALTH_BANDS = { critical: <40, atRisk: <60, watch: <75 }`) tutun. Dashboard kartı, churn-playbook ve bu sayfa aynı fonksiyonu çağırsın. Formül birim testlerle (sessiz bayi, tek yorum, fraud) sabitlensin.

### 3. 200 bayi sınırı sırasız uygulanıyor — liste sessizce eksik ve keyfi
- **Önem:** yüksek · **Kategori:** veri doğruluğu / ölçeklenme · **Efor:** M
- **Kanıt:** `route.ts:18-22` — `findMany({ where: { role: 'DEALER' }, ..., take: 200 })` (`orderBy` yok); sıralama sonradan `route.ts:110`.
- **Sorun:** 200'den fazla bayi olduğunda Postgres'in döndürdüğü keyfi 200 bayi alınıyor, ardından bu alt küme sıralanıyor. En riskli bayi listede hiç olmayabilir; arayüz toplam sayıyı veya kesildiğini hiç söylemiyor.
- **Öneri:** Skoru tüm bayiler için tek bir SQL geçişinde hesaplayın (tenant-health'teki gibi `JOIN QRCode` + `COUNT(*) FILTER`), sonucu Redis'e (60–300 sn) ya da günlük bir `DealerHealthSnapshot` tablosuna yazın; API sunucu taraflı sayfalama/sıralama/filtre (`?sort=score&band=critical&q=&cursor=`) desteklesin ve `total` döndürsün.

### 4. Skor küçük örneklemde aşırı oynak, kanal kapsamı eksik
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** M
- **Kanıt:** `route.ts:87-89` (ham ortalama × 14), `route.ts:34-46` (yalnız `Feedback`); `ConsumptionReview` da `rating` ve `dealerRepliedAt` taşıyor (`prisma/schema.prisma` ~1606-1610) ama sayılmıyor.
- **Sorun:** Tek bir 1 yıldızlı, yanıtsız yorum: `72 − 35 − 11 = 26` → kırmızı. Platformun ana yorum kanallarından biri (tüketim yorumu; rozet sistemi yalnız onu sayıyor) skora hiç girmiyor; telafi kuyruğu ise iki kanalı da sayıyor — tutarsız. Olay şiddeti (`Incident.severity`) ve telafi bekleme süresi dikkate alınmıyor.
- **Öneri:** Bayesyen yumuşatma (ör. platform ortalamasına doğru `(Σrating + m·μ)/(n + m)`, m≈5), minimum örneklem altında "düşük güven" rozeti; iki kanalı birleştiren sinyal toplayıcı; olayları severity ağırlığıyla (critical > high > medium), telafiyi bekleme yaşıyla cezalandırın. Her bileşenin katkısını API'de `components` dizisi olarak döndürün ki UI açıklayabilsin.

### 5. Admin "gizli kapı" yalnızca sayfa rotasını koruyor, `/api/admin/*` uçlarını değil (sistem geneli)
- **Önem:** yüksek (sistem geneli; bu sayfaya özgü değil) · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** `proxy.ts:79-88` kapı kontrolü `pathname.startsWith('/admin')` ile sınırlı; `/api/*` yolları `proxy.ts:104-118`'de `authMiddleware`'e hiç girmeden `NextResponse.next()` ile geçiyor. `lib/api-auth.ts:52-80` (`requireAuth`) yalnız rol + token-replay kontrol ediyor; `gateCookieBelongsTo` yalnız `proxy.ts:82`'de kullanılıyor.
- **Sorun:** Kapının belgelenmiş tehdit modeli "rolü kazara/kötü niyetle ADMIN yapılan kullanıcı bile gizli rakamı bilmeden panele giremez" (`proxy.ts:76-77`). Böyle bir kullanıcı sayfayı açamaz ama `GET /api/admin/dealers-health` ve diğer tüm admin uçlarını doğrudan çağırarak bayi listesi, fraud durumu vb. veriyi alabilir. Bu sayfa salt-okuma olduğu için etkisi veri ifşasıyla sınırlı; ama aynı açık yazma yapan admin uçlarında da geçerli.
- **Öneri:** Kapı kontrolünü `requireAuth(['ADMIN'])` içine (Node runtime'da `cookies()` + `gateCookieBelongsTo`) taşıyın ya da proxy'de `/api/admin/` yollarını da kapı cookie'sine tabi kılın (403 JSON döndürerek). Bir entegrasyon testi: geçerli ADMIN JWT + kapı cookie'si yok → 403.

### 6. Tek aksiyon ("Playbook") bağlamsız; operatör bir bayi için hiçbir şey yapamıyor
- **Önem:** orta · **Kategori:** UX / iş akışı · **Efor:** M
- **Kanıt:** `page.tsx:91-96` (statik `/admin/playbooks`), `app/admin/playbooks/page.tsx:44, 68` (`?dealerId` okunmuyor; bayi seçici `pageSize=60`).
- **Sorun:** Kullanıcı kırmızı bir bayide "Playbook"a tıkladığında bağlam kayboluyor; hedef sayfada o bayiyi yeniden aramak zorunda ve bayi 60'ın dışındaysa seçemiyor bile. `ExternalLink` ikonu da yanlış beklenti yaratıyor. Olaylar, telafi kuyruğu, fraud ayarı, CSM görevi gibi doğal aksiyonların hiçbiri sayfada yok.
- **Öneri:** Satır aksiyon menüsü: "Playbook uygula" (bayi önceden seçili diyalog — `POST /api/admin/playbooks/apply`'yı bu sayfadan çağırın), "CSM görevi oluştur/ata", "Olayları gör", "Fraud durumunu değiştir" (trust-command'a derin link), "Bayiyi impersonate et / detay". Playbooks sayfası `?dealerId=` ile ön seçim desteklesin, bayi seçicisi sunucu taraflı arama (combobox) olsun.

### 7. Yükleme/hata/boş durumları zayıf ve hata mesajı ham İngilizce sızabiliyor
- **Önem:** orta · **Kategori:** hata yönetimi / UX · **Efor:** S
- **Kanıt:** `page.tsx:33-35` (`r.json()` `r.ok` kontrolünden önce), `page.tsx:76-79`, `lib/api-auth.ts:24, 41`.
- **Sorun:** Vercel zaman aşımı/500 HTML yanıtında `SyntaxError` mesajı kullanıcıya basılıyor; 401/403 "Unauthorized"/"Forbidden" İngilizce görünüyor. Bayi yoksa sayfa bomboş. Yenilemede tüm liste "Yükleniyor…" metnine dönüyor (veri kayboluyor, kaydırma konumu sıfırlanıyor).
- **Öneri:** `fetchJsonSafe` benzeri ortak yardımcıyı kullanın (dashboard zaten kullanıyor: `admin-dashboard-client.tsx:80`), durum koduna göre Türkçe mesaj + "Tekrar dene" butonu; ilk yüklemede iskelet tablo, yenilemede mevcut veriyi koruyup üstte ince ilerleme göstergesi (stale-while-revalidate / SWR), boş durumda açıklayıcı illüstrasyonsuz bir "Henüz bayi yok" bloğu.

### 8. Erişilebilirlik: belirsiz progressbar, canlı bölge yok, yalnız renkle kademe
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `components/ui/progress.tsx:15-31` — `value` destructure edilip `ProgressPrimitive.Root`'a iletilmiyor, yalnız `style.width`'te kullanılıyor; `page.tsx:77` ve `page.tsx:69-73` `aria-live`/`role="alert"` taşımıyor; `page.tsx:88` kademe yalnız rozet rengiyle.
- **Sorun:** Ekran okuyucu her bayide "ilerleme çubuğu, belirsiz" duyurur; skor değeri bar üzerinden okunamaz. Yükleme/hata değişiklikleri duyurulmaz. Renk körü kullanıcı rozet kademesini ayırt edemez (metin etiketi yok). Paylaşılan `Progress` bileşeninin hatası tüm uygulamayı etkiliyor.
- **Öneri:** `Progress`'te `value`'yu Root'a da iletin (`<ProgressPrimitive.Root value={value} ...>`) ve sayfada `aria-label="Sağlık skoru"` verin; kademeyi metinle de yazın ("Kritik / Riskli / İzlenmeli / Sağlıklı"); durum mesajlarına `role="status"`/`role="alert"`.

### 9. Performans: sınırsız QR listesi, dev `IN` listesi, cache yok
- **Önem:** orta · **Kategori:** performans · **Efor:** S–M
- **Kanıt:** `route.ts:27-32` (`qRCode.findMany` limitsiz, tüm QR id'leri belleğe), `route.ts:34` (`qrCodeId: { in: qrIds }` binlerce parametre), cache yok; karşılaştırma `app/api/admin/tenant-health/route.ts:13-22` ("canlı logda ~15sn" notu + Redis 60 sn).
- **Sorun:** Bayi başına çok sayıda QR olduğunda 4 toplu sorgunun ikisi binlerce parametreli `IN` ile çalışıyor; Neon pooler + Prisma'da parametre sınırına ve gecikmeye açık. Her "Yenile" tam hesaplama yapıyor.
- **Öneri:** Tek `$queryRaw` ile `Feedback JOIN QRCode GROUP BY q."dealerId"` (index `@@index([qrCodeId, deletedAt, createdAt])` mevcut), sonuçları Redis'te kısa süre önbelleğe alın; uzun vadede gece çalışan bir cron ile `DealerHealthSnapshot(dealerId, date, score, components)` yazıp trend ve hızlı listeleme sağlayın.

### 10. i18n ve dil karışıklığı
- **Önem:** düşük · **Kategori:** tutarlılık · **Efor:** S
- **Kanıt:** `page.tsx:51-53, 64, 77, 93, 103, 109-114` sabit Türkçe; `page.tsx:114` "Fraud: clean"; `messages/en.json:2484` "Dealer Health"; 65 admin sayfasından 23'ü `useAppT` kullanıyor.
- **Sorun:** EN locale'de menü İngilizce, sayfa Türkçe; TR'de ise "Fraud" ve ham `clean/flagged/shadow_ban` değerleri İngilizce.
- **Öneri:** `useAppT('adminDealersHealth')` ile metinleri `messages/{tr,en}.json`'a taşıyın; fraud durumunu çevrilmiş rozetle gösterin ("Temiz / İşaretli / Gölge yasak").

### 11. Görsel hiyerarşi: skor üç kez, ham cuid gürültüsü, bilgi yoğunluğu düşük
- **Önem:** düşük · **Kategori:** görsel / bilgi mimarisi · **Efor:** M
- **Kanıt:** `page.tsx:88-90` (rozet), `page.tsx:104` ("x/100"), `page.tsx:106` (bar); `page.tsx:85` (tam cuid); `page.tsx:80` (her bayi için tam kart).
- **Sorun:** Her kart ~180 px; 200 bayi ≈ 36.000 px dikey kaydırma. Aynı sayı üç kez, en önemli "neden" bilgisi (hangi bileşen skoru düşürdü) hiç yok. Bar her zaman primary renkte; 20 ile 90 aynı görünüyor.
- **Öneri:** Kart listesi yerine yoğun, sıralanabilir tablo (Stripe/Linear tarzı); skor tek hücrede renkli bant + sayı; bileşen katkıları küçük yığılmış mini bar ya da "−18 puan: 3 açık olay" şeklinde en büyük iki ceza; cuid yalnız detay panelinde, kopyala butonuyla.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Sıralanabilir/filtrelenebilir veri tablosu + arama + sunucu taraflı sayfalama**, URL'e yazılan filtre durumu (paylaşılabilir görünümler — Linear "saved views").
2. **Özet KPI şeridi ve dağılım grafiği**: kademe başına bayi sayısı, ortalama skor, haftalık değişim; tıklanınca tabloyu filtreler (PostHog insight → liste).
3. **Skor açıklanabilirliği ve trend**: bayi başına bileşen dökümü ve 30/90 günlük sparkline; "son 7 günde 15 puan düştü" uyarısı.
4. **Bayi detay çekmecesi (drawer)**: son kötü yorumlar, açık olaylar, telafi kuyruğu, CSM görevleri, fraud geçmişi, playbook geçmişi tek panelde (Stripe customer detail).
5. **Aksiyon akışı**: CSM görevi oluştur/ata, playbook uygula, olaya sahip ata, toplu seçim ile toplu işlem (Retool tablo + aksiyon).
6. **Uyarı/abonelik ve dışa aktarma**: "Bir bayi kritik banda düştüğünde bildir" kuralı, CSV/JSON export.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında 5 saniyede şunu anlar: "Kaç bayi riskte, bu hafta kim kötüleşti, kime ne yapmalıyım?" — ve aynı ekrandan aksiyonu başlatır. Skor bir kara kutu değil; her sayının yanında "neden" vardır.

**Yerleşim:**
1. **Üst şerit (hero yerine kompakt başlık + 4 KPI kartı):** Kritik / Riskli / İzlenmeli / Sağlıklı sayıları (tıklanabilir filtre), ortalama skor ve önceki döneme göre delta, son hesaplama zamanı + "Yenile".
2. **Araç çubuğu:** arama (işletme adı/e-posta), kademe filtresi, fraud filtresi, "açık olayı olan", "sessiz bayiler", dönem seçici (7/30/90 gün), CSV dışa aktar.
3. **Tablo:** İşletme · Skor (bant + sayı + 30g sparkline) · Δ7g · Hacim · Ort. puan (güven göstergesiyle) · Yanıt oranı · Açık olay (severity noktalarıyla) · Telafi kuyruğu (en eski bekleme) · Fraud · CSM durumu · aksiyon menüsü. Mobilde tablo, işletme + skor + en büyük ceza gösteren kompakt satırlara dönüşür; detay çekmecede.
4. **Sağ çekmece (satıra tıklayınca):** bileşen dökümü (yatay waterfall: baz → her bileşen katkısı → skor), son 5 düşük puanlı yorum, olaylar, telafi, CSM görevleri, aksiyon butonları.

**Motion/3D:** 3D gereksiz ve yersiz — bu bir operasyon aracı. framer-motion (`m as Motion`) yalnızca ölçülü yerlerde: çekmecenin kayarak açılması, filtre değişiminde satırların `layout` geçişi, KPI sayılarında kısa sayaç animasyonu; tümü `useReducedMotion` ile kapatılabilir. Skor bandı renk değişimi için CSS geçişi yeterli.

**Veri/API değişiklikleri:**
- `lib/dealer-health/score.ts` (saf, test edilebilir) + `lib/dealer-health/signals.ts` (tek SQL geçişi: Feedback + ConsumptionReview + Incident(severity) + RemedyOffer(yaş) + aktivite trendi + CSMTask durumu).
- `GET /api/admin/dealers-health?window=30&band=&q=&sort=&cursor=` → `{ total, bands, items: [{ dealerId, label, score, band, delta7d, confidence, components[], ... }] }`, Redis 60–300 sn önbellek.
- `GET /api/admin/dealers-health/[dealerId]` → çekmece verisi.
- Gece cron'u `DealerHealthSnapshot` tablosuna günlük skor yazar (trend + delta için); churn-playbook bu snapshot'ı ve aynı eşik sabitini kullanır.
- `POST /api/admin/csm-tasks` / `PATCH` → CSMTask'ı nihayet görünür ve yönetilebilir kılar.
- Admin kapı kontrolünün API katmanına taşınması (Bulgu 5).

---

## Çakışmalar / birleştirme önerisi

- **`/admin` dashboard "Tenant health" kartı** (`app/admin/admin-dashboard-client.tsx:306-319`, `/api/admin/tenant-health`): aynı kavram, farklı formül ve eşik; kart bu sayfaya link bile vermiyor. Kart, birleşik skor motorunu kullanıp bu sayfaya (ilgili filtreyle) derin link vermeli.
- **`/api/admin/tenant-health` + `lib/tenant-health.ts` + churn-playbook** (`app/api/internal/inngest/churn-playbook/route.ts`): ikinci skor motoru. Tek motor + tek eşik setinde birleştirilmeli; `CSMTask` çıktısı bu sayfada gösterilmeli.
- **`/admin/playbooks`**: aksiyon tarafı. Ayrı sayfa olarak kalabilir ama bu sayfadan bağlamlı "uygula" diyaloğu ile çağrılmalı.
- **`/admin/trust-command`, `/admin/fraud-prevention`, `/admin/innovation` risk dashboard** (`app/api/admin/innovation/risk-dashboard/route.ts:25-28`, `app/api/admin/trust-overview/route.ts:33`): telafi kuyruğu ve fraud sinyallerini platform düzeyinde tekrar sayıyor. Bayi düzeyindeki görünüm bu sayfada, platform düzeyi oralarda kalmalı; çapraz linkler eklenmeli.
- Sidebar'da ikon çakışması: `dealers_health` ve `donations` aynı `Heart` ikonunu kullanıyor (`components/dashboard/sidebar.tsx:174, 180`); sağlık için `Activity`/`HeartPulse` daha ayırt edici.

**Öneri:** `/admin/dealers-health` sayfası korunmalı ama "Bayi Sağlığı" modülünün tek kaynağı olacak şekilde birleştirilmeli: tenant-health formülü ile bu formül tek motorda toplanmalı, dashboard kartı ve churn-playbook ona bağlanmalı, CSMTask yönetimi buraya taşınmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışıldı; kod baştan okundu (`app/api/admin/dealers-health/route.ts`, `app/admin/dealers-health/page.tsx`, `proxy.ts`, `lib/api-auth.ts`, `lib/admin-gate-edge.ts`, `lib/admin-gate.ts` kullanım yerleri, `lib/tenant-health.ts`, `app/admin/admin-dashboard-client.tsx`, `app/api/internal/inngest/churn-playbook/route.ts`). Veritabanına erişilmedi; canlı bayi sayısı bu yüzden doğrulanmadı.

### 1. Sessiz bayi skoru şişiyor — **DOĞRULANDI**
- `route.ts:81` sessiz bayide `avg = null` → `:87-89` rating bileşeni hiç uygulanmıyor (ceza yok); `:82` `replyRate = 1` → `:90` `+11`. Sonuç: 0 geri bildirimli, olaysız bayi = **83**.
- Karşılaştırma (elle hesaplandı): ort. 4.2 + %40 yanıt → 72 + 0,7×14 − 0,1×22 = 79,6 → **80**. Hatta ort. **5.0** ama %0 yanıtlı aktif bayi → 72 + 21 − 11 = **82** — yine sessiz bayinin altında.
- Yeniden üretim: 30 gündür hiç QR taraması/geri bildirimi olmayan bir bayi (veya hiç QR kodu olmayan bayi) listede 83 ve yeşil `default` rozetle (`page.tsx:88`) görünür; UI ayrıca "Yanıt: %100" (`route.ts:103`, `page.tsx:111`) yazar — gerçekte yanıtlanacak bir şey yokken. "En kötü üstte" sıralamasında (`route.ts:110`) aktif ve memnun bayilerin altına gömülür.
- Not: `lib/tenant-health.ts:78` (`usageTrend = prev7Fb > 0 ? … : 1`) aynı kusuru taşıyor — tamamen sessizleşmiş bayi orada da 100 alır. Düzeltme her iki motorda (birleştirilecekse tek motorda) yapılmalı: veri yokluğu "nötr/bilinmiyor" (güven düşük) olarak işaretlenmeli, aktivite düşüşü ayrı ve ağır bir ceza bileşeni olmalı.

### 2. 200 bayi limiti sırasız — **DOĞRULANDI (gizil; etkisi bayi sayısına bağlı)**
- `route.ts:18-22`: `findMany({ where: { role: 'DEALER' }, take: 200 })`, `orderBy` yok. Postgres sıra garantisi vermez; sıralama `:110`'da yalnız bu 200'lük alt kümede yapılır. Yanıtta `total`/`truncated` alanı yok (`:112-116`), `page.tsx` sayfalama/uyarı göstermiyor.
- Yeniden üretim: 201+ DEALER kullanıcısı olduğunda, skoru 0 olan (ör. `shadow_ban` + açık olaylı) bir bayi bu 200'lük kümeye girmezse sayfada hiç görünmez ve operatör listenin eksik olduğunu bilemez.
- Canlıdaki bayi sayısı DB'ye dokunulmadığı için doğrulanmadı; 200'ün altındaysa bugün kullanıcı etkisi yok, kod kusuru yine kesin. Ek tutarsızlık: `lib/tenant-health.ts:24-27` limitsiz, yani 200'ü aşınca dashboard ile bu sayfa farklı bayi kümeleri üzerinde konuşur.

### 3. Admin gizli kapı API katmanında uygulanmıyor — **DOĞRULANDI**
- `proxy.ts:105-119`: `/api/*` isteği `authMiddleware`'e hiç girmeden `NextResponse.next()` ile geçer; kapı kontrolü (`proxy.ts:79-88`) yalnız sayfa yollarında çalışır.
- `lib/api-auth.ts:52-80` `requireAuth` yalnız oturum + rol + token-replay bakar. Depoda `verifyGateCookie` hiçbir API yolunda çağrılmıyor (grep: yalnız `lib/admin-gate.ts:55` tanımı ve testler); `admin_gate` cookie'sine kod tarafında yalnız `app/api/admin/gate/route.ts:68` (cookie'yi yazan uç) dokunuyor.
- Yeniden üretim: rolü ADMIN yapılmış ama gizli cevabı bilmeyen kullanıcı giriş yapar; `/admin`'e gidince `/admin-gate`'e yönlenir (bu sayfa ona açık), aynı sekmede tarayıcı konsolundan `fetch('/api/admin/dealers-health')` → 200 ve tüm bayi sağlık verisi döner. Aynı yol diğer `/api/admin/*` uçları (yazma yapanlar dahil) için geçerli.
- Ek (aynı tehdit modelini zayıflatan): `lib/admin-gate-edge.ts:14-21` proxy'de HMAC'i doğrulamıyor, yalnız `<userId>.<64 hex>` biçimine bakıyor; `admin_gate=<kendi userId>.` + 64 adet `a` elle yazılarak sayfa kapısı da geçilebilir. Dolayısıyla kapı şu an hem API'de hem sayfada fiilen atlatılabilir. Düzeltme: `requireAuth`'a (ADMIN rolünde) Node tarafında `verifyGateCookie` kontrolü eklenmeli ve proxy'deki kontrol Web Crypto (`crypto.subtle`, edge'de mevcut) ile gerçek HMAC doğrulamasına yükseltilmeli.

### 4. Aynı "bayi sağlığı" için iki çelişen formül ve eşik — **DOĞRULANDI (önem: orta; güvenlik/veri bozulması değil, karar tutarsızlığı)**
- Motor A: `route.ts:86-95` (taban 72; rating, yanıt, olay, telafi, fraud), UI eşikleri `page.tsx:88` (<45 kırmızı, <65 gri).
- Motor B: `lib/tenant-health.ts:84-92` (taban 100; 7g/7g kullanım trendi, negatif trendi, aksiyon tamamlama). Dashboard "risk altında" sayımı `<70` (`admin-dashboard-client.tsx:102`, `:316`); churn-playbook `CHURN_HEALTH_THRESHOLD` varsayılan `50` ile otomatik `CSMTask` + tüm adminlere bildirim üretir (`churn-playbook/route.ts:12, 18, 34-58`).
- Somut senaryo: haftalık geri bildirimi 10'dan 4'e düşen (−30) ve son 7 gün negatif oranı 20 puandan fazla artan (−25) bayi → Motor B = 45 → dashboard'da "risk altında", churn-playbook CSM görevi + "⚠️ Churn Riski" bildirimi üretir. Aynı bayinin 30 günlük ort. puanı 4.0 ve yanıt oranı %80 ise Motor A = 72 + 7 + 6,6 ≈ **86** → bu sayfada yeşil rozetle listenin altında. Operatör bildirimden gelip bu sayfaya baktığında bayiyi sağlıklı görür.
- Kritik/yüksek bir güvenlik hatası değil; ancak ürün düzeyinde gerçek ve ölçülebilir bir tutarsızlık. Tek skor motoru + tek eşik sabiti (ör. `lib/dealer-health/score.ts` + `DEALER_HEALTH_BANDS`) önerisi (yukarıdaki "Çakışmalar" bölümü) geçerli.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/admin/dealers-health` (sekmeler: *Bayiler* · *Playbook kütüphanesi*). `/admin/playbooks` kalıcı olarak `/admin/dealers-health?tab=playbooks` adresine yönlenir. Eski `?dealerId=` bağlantısı ilgili bayinin çekmecesini açar (`?dealer=`).

**Mimari:** Sayfa sunucu bileşeni oldu (`app/admin/dealers-health/page.tsx`): yetki `requireAuth(['ADMIN'])` ile kontrol edilir, ilk liste sayfası sunucuda hesaplanır. İstemci adası `components/admin/a-bayi-sagligi/ui/*` altında. Saf skor modeli `components/admin/a-bayi-sagligi/domain.ts` dosyasında, sunucu mantığı `…/server/{signals,list,detail,csm,playbooks,schemas}.ts` dosyalarında. Bütün uçlar `defineRoute` ile yazıldı (rol, zod, hız sınırı, merkezi hata, `Idempotency-Key`):
- `GET /api/admin/dealers-health?window&q&band&flag&sort&page&size&fresh`
- `GET /api/admin/dealers-health/export` (CSV; dışa aktarma denetim kaydına yazılır)
- `GET /api/admin/dealers-health/[dealerId]?window` (çekmece)
- `POST /api/admin/dealers-health/[dealerId]/csm-tasks` · `PATCH /api/admin/dealers-health/csm-tasks/[taskId]`
- `GET /api/admin/playbooks` · `POST /api/admin/playbooks/apply` (`dryRun`)

**Skor (tek motor, şeffaf):** Skor dört bileşenden oluşur:
- Kalite (30): Bayes yumuşatılmış ortalama (m=5, μ=platform ortalaması).
- Yanıt (20): `(yanıt+1)/(n+2)`.
- Aktivite (25): ziyaret + yorum, önceki eşit döneme oranla. Hiç etkinlik yoksa 0.
- Operasyon (25): önem ağırlıklı açık olaylar ve telafi kuyruğu. 48 saati aşan telafi ek ceza alır.

Fraud cezası ayrıca düşülür: `flagged` −15, `shadow_ban` −30. Verisi olmayan bileşen sıfır puan almaz, hesaptan çıkarılır. Skor, uygulanabilir bileşenlerden alınan puanın tavana oranıdır. Bantlar tek sabitte tanımlı: `HEALTH_BANDS` (<40 kritik, <60 riskli, <75 izlenmeli). Her satır şunları taşır: bileşen puanları, en büyük kayıp, güven (n<5 → düşük), sessiz bayrağı, önceki döneme göre fark ve bağlamlı öneriler.

**Bağlamlı öneriler:** Öneriler yalnız gerçek sinyallerden çıkar ve kanıt sayılarıyla gösterilir.

Playbook önerileri:
- `low_nps_churn`: ≥3 yorum ve yumuşatılmış ortalama <3,6, ya da 1–2 puanlı yorumların payı ≥%30.
- `first_week_dropoff`: ≥5 yeni müşterinin %25'inden azı ikinci kez gelmiş.
- `silent_happy`: ≥10 ziyaret ve yorum/ziyaret oranı <%10.

Aksiyon önerileri: sessiz bayiyle görüşme, telafi kuyruğunu eritme, ağır olayları kapatma, fraud incelemesi.

"Playbook uygula" diyaloğu önce sunucudan bir önizleme alır: müşteri metni, hedef kitle sayısı ve izinli ulaşılabilir kişi, mevcut açık taslak, modül durumu. Onaylanınca tek transaction içinde kampanya taslağı oluşur, bayiye bildirim gider ve `playbook.apply` denetim kaydı yazılır. Her öneriden önceden doldurulmuş bir CSM görevi de açılabilir.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa erişimi | ÇALIŞIYOR | proxy kapısı + sunucu bileşeninde `requireAuth(['ADMIN'])` |
| 2 | API erişimi | ÇALIŞIYOR | `defineRoute` → `requireAuth`. Yönetici kapısı artık API katmanında da var (`ADMIN_GATE_REQUIRED`) |
| 3 | Hero | ÇALIŞIYOR | QDL `PageHeader` (ops, kompakt), TR/EN |
| 4 | Yenile | ÇALIŞIYOR | "Yeniden hesapla" önbelleği atlar (`fresh=1`). Son hesaplama zamanı İstanbul saatiyle gösterilir ve duyurulur |
| 5 | İlk yükleme | ÇALIŞIYOR | Sunucuda önceden hesaplanır. İstemcide react-query iptal sinyali kullanılır |
| 6 | Yükleniyor | ÇALIŞIYOR | `QueryState`/`DataTable` iskeleti. Yenilemede eski satırlar korunur (`keepPreviousData`) |
| 7 | Hata | ÇALIŞIYOR | Zarf v2 Türkçe mesaj, "Tekrar dene", `role="alert"`. JSON olmayan yanıt da Türkçe mesaja düşer |
| 8 | Boş durum | ÇALIŞIYOR | "Henüz bayi yok" ile süzgeç sonucu boş durumu ("Süzgeçleri temizle") ayrı |
| 9 | Bayi başlığı | ÇALIŞIYOR | Sıra: businessName → name → e-posta |
| 10 | Bayi ID | ÇALIŞIYOR | Yalnız çekmecede, kopyalanabilir, eş aralıklı |
| 11 | Skor rozeti | ÇALIŞIYOR | Tek bant sabiti. İkon + metin + sayı; yalnız renge dayanmaz |
| 12 | "Playbook" linki | ÇALIŞIYOR | Bağlamsız link kaldırıldı. Yerine kanıtlı öneri ve önizlemeli uygula diyaloğu geldi |
| 13 | Skor çubuğu | ÇALIŞIYOR | Bileşen başına `role="meter"` + `aria-valuenow`, renk riske göre. Paylaşılan `Progress` artık kullanılmıyor |
| 14 | Geri bildirim sayısı | ÇALIŞIYOR | QR geri bildirimi ile tüketim yorumu birleşik |
| 15 | Ortalama puan | ÇALIŞIYOR | Ham ve Bayes yumuşatılmış değer, düşük güven rozeti |
| 16 | Yanıt oranı | ÇALIŞIYOR | Yorum yoksa `null` ("—") ve skora girmez; %100 sayılmaz |
| 17 | Açık olay | ÇALIŞIYOR | Önem ağırlıklı. Kritik/yüksek olay tabloda vurgulanır, çekmecede listelenir |
| 18 | Telafi kuyruğu | ÇALIŞIYOR | En eski bekleme süresi gösterilir. 48 saati aşan ek ceza alır |
| 19 | Fraud durumu | ÇALIŞIYOR | Türkçe rozet (Temiz / İşaretli / Gölge yasak) |
| 20 | Skor hesaplama | ÇALIŞIYOR | Saf `computeHealth`, 22 birim testi |
| 21 | Varsayılan sıralama | ÇALIŞIYOR | Tüm bayiler içinde en kötü üstte |
| 22 | 200 bayi limiti | ÇALIŞIYOR | Limit kaldırıldı. Sunucu tarafında sayfalama, `total` dönüyor, sayfa boyutu 10/20/50/100 |
| 23 | `periodDays` | ÇALIŞIYOR | Dönem seçici (7/30/90 gün, URL'de) |
| 24 | Arama / filtre | ÇALIŞIYOR | Türkçe katlamalı arama + bant + 8 durum bayrağı (sessiz, 10+ düşen, olay, telafi, fraud, düşük güven, açık CSM, playbook önerilen) |
| 25 | Kolon sıralama | ÇALIŞIYOR | 8 sütun, URL'de |
| 26 | Özet KPI şeridi | ÇALIŞIYOR | 4 bant kutusu (tıklayınca süzer) + ortalama skor ve dönem farkı + sessiz bayi ve öneri sayısı |
| 27 | Bileşen dökümü | ÇALIŞIYOR | Tabloda mini yığılmış çubuk ve "en büyük kayıp". Çekmecede tam döküm ve formül |
| 28 | Trend | ÇALIŞIYOR | Önceki döneme göre skor farkı. Çekmecede 12 haftalık etkinlik ve puan çizgisi (İstanbul haftası). Günlük skor anlık görüntüsü olmadığı için skor sparkline'ı yok (ŞEMA İSTEĞİ) |
| 29 | Bayi detayına geçiş | ÇALIŞIYOR | `?dealer=` derin bağlantılı çekmece: düşük yorumlar, olaylar, telafi, CSM, playbook geçmişi |
| 30 | CSM görevleri | ÇALIŞIYOR | Listeleme, oluşturma (öneriden önceden dolu), başlat / çöz / yeniden aç / üstlen. İyimser kilit + denetim kaydı |
| 31 | CSV | ÇALIŞIYOR | Geçerli süzgeç ve sıralamayla. BOM'lu, formül enjeksiyonuna karşı korumalı, denetimli |
| 32 | i18n | ÇALIŞIYOR | Arayüz TR/EN (`useDsLocale`). Playbook içerik metinleri Türkçe kalır |
| 33 | Mobil | ÇALIŞIYOR | `DataTable` md altında kart görünümüne geçer. Çekmece alttan açılır. Dokunma hedefi ≥44px |
| 34 | Azaltılmış hareket | ÇALIŞIYOR | Yalnız CSS geçişleri ve `motion-reduce`; sonsuz döngü yok |
| 35 | Önbellek | ÇALIŞIYOR | Ağır sinyaller Redis'te 120 sn tutulur. CSM sayıları canlı okunur |

### Kapanan bulgular (11 bulgudan 10'u tam, 1'i kısmi)
1. Sessiz bayi sağlıklı görünüyordu → **kapandı**. Etkinliği olmayan bayi 50 puanla "Riskli" bandına düşer ve "Sessiz" rozeti alır. Testle sabitlendi.
2. İki skor motoru ve üç eşik → **kısmi**. Bu yüzey ve playbook önerileri artık tek motor ve tek `HEALTH_BANDS` sabitiyle çalışıyor. Dashboard'daki "Tenant health" kartı ve `churn-playbook` cron'u (`lib/tenant-health.ts`) başka yüzeylerin sahipliğinde olduğu için değiştirilmedi. Bu ikisinin `components/admin/a-bayi-sagligi/server/list.ts` içindeki `loadAllRows` ve `HEALTH_BANDS`'e bağlanması gerekiyor.
3. 200 sınırı → **kapandı**. Tüm bayiler tek geçişte işleniyor, sayfalama sunucuda.
4. Küçük örneklem ve kanal kapsamı → **kapandı**. Bayes yumuşatma, iki kanal, olay önemi ve telafi yaşı hesaba katılıyor.
5. Admin kapısı API'de yoktu → **kapandı**. Kapı sistem genelinde `requireAuth` içinde; bu yüzeyin uçları `defineRoute` ile yazıldı.
6. Bağlamsız tek aksiyon → **kapandı**. Önizlemeli playbook uygulama ve CSM görevi aynı çekmeceden yapılıyor.
7. Yükleme / hata / boş durumları → **kapandı**.
8. Erişilebilirlik → **kapandı**. Bileşen başına `meter`, canlı bölge, metinli bant. Paylaşılan `Progress` bu sayfada kullanılmadığı için ona dokunulmadı.
9. Performans → **kapandı**. `IN` listesi yerine `JOIN … GROUP BY`; Redis önbelleği; sunucuda ön hesaplama.
10. i18n → **kapandı** (yalnız arayüz; playbook içerikleri Türkçe).
11. Görsel hiyerarşi → **kapandı**. Kart listesi yerine yoğun tablo; skor tek hücrede; cuid yalnız çekmecede.

### Kalanlar
- Dashboard "Tenant health" kartı ve `churn-playbook` hâlâ eski `lib/tenant-health.ts` formülünü kullanıyor (sahiplik dışı; bkz. Bulgu 2).
- **ŞEMA İSTEĞİ:** `DealerHealthSnapshot(dealerId, day, score, components Json)` tablosu ve onu dolduran gece cron'u. Bu olmadan skor zaman serisi (sparkline) ve "son 7 günde 15 puan düştü" uyarısı yapılamaz. Şimdilik eğilim, önceki eşit döneme göre fark ve haftalık etkinlik/puan serisiyle gösteriliyor.
- "Bayi kritik banda düşünce bildir" abonelik kuralı yok. Anlık görüntü tablosu olmadan bant geçişi güvenilir biçimde saptanamıyor.
- Toplu seçim ve toplu playbook uygulama yok. Bilinçli bir tercih: her bayi için önizleme ve onay isteniyor. Ayrıca çok bayide segment sayımı pahalı.
- Admin tarafında bayi kapsamlı bir olay/telafi yönetim sayfası yok. Bu yüzden çekmecede bu kayıtlar salt okunur listeleniyor.
