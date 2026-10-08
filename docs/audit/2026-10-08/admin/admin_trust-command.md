# /admin/trust-command

**Amaç:** Platform operatörüne Trust & Safety (güven ve güvenlik) durumunu tek ekranda göstermek: denetim günlüğü hacmi, açık şüpheli aktiviteler, fraud bayraklı hesaplar, telafi onay kuyruğu, güvenlik uyarıları ve son 48 saatin birleşik "operasyonel zaman çizelgesi".

**Genel puan: 4.5 / 10** · **Karar: yeniden tasarla** (konsept doğru ve gerekli; ama KPI'ların ikisi yanlış veri sayıyor, linklerin üçü yanlış/erişilemez yere gidiyor ve sayfada tek bir aksiyon yok; `/admin/fraud-prevention` bu sayfanın içine sekme olarak alınmalı)

Dosyalar: `app/admin/trust-command/page.tsx` (304 satır, `'use client'`), `app/api/admin/trust-overview/route.ts`, `app/api/admin/trust-timeline/route.ts`, layout `app/admin/layout.tsx`, hero `components/admin/admin-premium-hero.tsx`, sidebar girişi `components/dashboard/sidebar.tsx:178`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | 5 KPI'dan 2'si yanlış sayıyor (bayi bayrağı yapısal olarak 0, güvenlik uyarısı sayımı HIGH'ı dışlıyor), 7 timeline linkinden 3'ü yanlış sayfaya gidiyor ve hiçbir kayıt üzerinde işlem yapılamıyor. |
| UX | 4/10 | "Komuta merkezi" adı verilmiş ama salt-okunur bir link sayfası; ham enum'lar (`remedy_queue`, `flagged / shadow_ban`, `HIGH`), aynı olay iki kez, filtre/arama yok. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ve kart dili tutarlı; ama önem derecesi tek renk (amber), güvenlik uyarısı KPI'ı küçük gri bir paragraf, "Uyumluluk özeti" kartı boş. |
| Mimari | 4/10 | İki ayrı uç sırayla çağrılıyor, timeline hatası sessizce yutuluyor, sayfa tamamen istemci tarafında; aynı sayımlar 4 farklı admin ucunda tekrar ediyor. |
| Performans | 6/10 | Sorgular indeksli ve küçük (`take` sınırlı); ama istemcide waterfall, overview'da 3 tur DB gidişi ve cache yok. |
| Erişilebilirlik + Mobil | 5/10 | Grid mobilde düzgün diziliyor, hero `useReducedMotion` destekli; ama önem yalnızca renkle, tekrarlayan "Git" link metni, mobilde iç içe kaydırma alanları, `aria-live` yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim kontrolü (ADMIN rolü + gizli kapı çerezi) | ÇALIŞIYOR | `proxy.ts:50-72`, `proxy.ts:79-87` | `/admin/*` rolü ve gate çerezi proxy'de doğrulanıyor. |
| 2 | API yetki kontrolü | KISMİ | `trust-overview/route.ts:13`, `trust-timeline/route.ts:34`, `proxy.ts:107-118` | `requireAuth(['ADMIN'])` var; ama `/api/*` proxy'de auth middleware'den geçmiyor, gate çerezi API'de hiç kontrol edilmiyor (sistem geneli). |
| 3 | Hero (eyebrow, başlık, açıklama) | ÇALIŞIYOR | `page.tsx:95-99` | Başlık TR/EN karışık: "Trust ve Safety komuta merkezi". |
| 4 | "Yenile" butonu | ÇALIŞIYOR | `page.tsx:101-110` | Yüklenirken disabled + dönen ikon; çift tıklama engelli. |
| 5 | Yükleniyor durumu | KISMİ | `page.tsx:130`, `page.tsx:222-225` | KPI'larda "—" var; listelerde skeleton yok, kartlar boş görünür. |
| 6 | Hata kartı | KISMİ | `page.tsx:82-84`, `page.tsx:114-118` | Hata sonrası KPI'lar `?? 0` ile **0** gösterir (`page.tsx:130,149,169,186`); "0 açık şüpheli" yanıltıcı. |
| 7 | KPI: Denetim (24s) | KISMİ | `page.tsx:121-137`, `trust-overview/route.ts:25` | Müşteri başarım tamamlamaları da AuditLog'a yazılıyor (`lib/achievements.ts:160-165`), sayı güvenlik sinyali değil gürültü. |
| 8 | "Günlüğe git" linki | KISMİ | `page.tsx:131-135` | Gidiyor ama filtre taşımıyor; `/admin/audit` URL parametresi okumuyor (`app/admin/audit/page.tsx:46-51` yalnız state'ten). |
| 9 | KPI: Açık şüpheli aktivite | KISMİ | `page.tsx:139-157`, `trust-overview/route.ts:26` | Sayı doğru sorgulanıyor; ama hiçbir UI kaydı çözmüyor (bkz. Bulgu 3), sayı yalnızca artar; bootstrap demo verisi de sayılır. |
| 10 | "Sahtekarlık önleme" linki | ÇALIŞIYOR | `page.tsx:151-155` | |
| 11 | KPI: İşaretli bayiler | BOZUK | `page.tsx:159-175`, `trust-overview/route.ts:27-32` | `role: 'DEALER'` filtreli; `fraudStatus` yalnız müşterilere yazılıyor → yapısal olarak 0. |
| 12 | "Kullanıcılar" linki | KISMİ | `page.tsx:171-173` | Filtresiz kullanıcı listesine atar; bayraklı hesaplara inmez. |
| 13 | KPI: Telafi onay kuyruğu (global) | ÇALIŞIYOR | `page.tsx:177-191`, `trust-overview/route.ts:33` | Doğru sayım; eskime/SLA bilgisi yok (risk-dashboard'da var). |
| 14 | Telafi kartı açıklaması | KISMİ | `page.tsx:187-189` | Admin'in yapabileceği bir şey yok; link de yok. |
| 15 | "Uyumluluk özeti" kartı | SAHTE | `page.tsx:193-203` | Açıklama "KVKK / 5651 envanter ve oranlar" diyor ama tek bir veri yok; yalnız buton. |
| 16 | "KVKK & 5651 paneline git" | ÇALIŞIYOR | `page.tsx:199-201` | |
| 17 | Güvenlik uyarıları (24s, WARNING+) sayacı | BOZUK | `page.tsx:206-208`, `trust-overview/route.ts:34-39`, `lib/security.ts:99-109` | Tek yazıcı `HIGH`/`CRITICAL` yazıyor; filtre `WARNING/ERROR/CRITICAL` → tüm HIGH uyarılar (brute-force dahil) sayılmıyor. |
| 18 | Operasyonel zaman çizelgesi (7 kaynak, 48s) | KISMİ | `trust-timeline/route.ts:39-140`, `page.tsx:210-254` | Birleştirme çalışıyor; içerik doğruluğu ve linkler sorunlu. |
| 19 | Timeline tür etiketi | KISMİ | `page.tsx:232` | Ham enum (`remedy_queue`, `feedback_rule`, `action_item`) uppercase basılıyor. |
| 20 | Timeline önem rozeti | KISMİ | `page.tsx:233-237` | LOW da CRITICAL da aynı amber; değer ham (`HIGH`). |
| 21 | Timeline göreli zaman | KISMİ | `page.tsx:238`, `lib/utils.ts:33-36` | Locale sabit `tr`; mutlak zaman tooltip'i yok. |
| 22 | Timeline linki: şüpheli → fraud-prevention | ÇALIŞIYOR | `trust-timeline/route.ts:151` | Kayda değil sayfaya gider. |
| 23 | Timeline linki: denetim → audit | KISMİ | `trust-timeline/route.ts:163` | Kayda derin link yok. |
| 24 | Timeline linki: telafi → `/dealer/remedy-queue` | BOZUK | `trust-timeline/route.ts:175`, `proxy.ts:60-71` | ADMIN `/dealer/*`'e girince proxy `/admin`'e yönlendiriyor. |
| 25 | Timeline linki: olay (incident) → `/admin/audit` | BOZUK | `trust-timeline/route.ts:187` | Audit sayfası Incident göstermez; admin tarafında incident görünümü yok. |
| 26 | Timeline linki: güvenlik → `/admin/observability` | BOZUK | `trust-timeline/route.ts:200` | Observability yalnız vercel-status/health/web-vitals çekiyor; "security" kelimesi bile geçmiyor. |
| 27 | Timeline linki: Agent Council → agent-council | ÇALIŞIYOR | `trust-timeline/route.ts:212` | |
| 28 | Timeline linki: geri bildirim → feedbacks | KISMİ | `trust-timeline/route.ts:225` | Kayda derin link yok. |
| 29 | "Düşük puanlı geri bildirim" başlığı | BOZUK | `trust-timeline/route.ts:128`, `:223` | `OR sentiment='negative'` → 4-5 puanlı negatif duygulu yorum "Düşük puanlı (5)" diye etiketleniyor. |
| 30 | Aynı olayın iki kez görünmesi | BOZUK | `lib/security.ts:84-109`, `trust-timeline/route.ts:144-203` | HIGH/CRITICAL şüpheli olay hem `SuspiciousActivity` hem `SecurityAlert` üretiyor; timeline ikisini ayrı satır basıyor. |
| 31 | Çözülmüş / açık ayrımı | EKSİK | `trust-timeline/route.ts:49,153`, `page.tsx:225-251` | `meta.resolved` gönderiliyor ama hiç render edilmiyor; çözülmüş kayıt açık gibi görünür. |
| 32 | `meta` alanları (dealerId, status, priority, userId) | EKSİK | `trust-timeline/route.ts:27`, `page.tsx:28-36` | İstemci tipi `meta`'yı içermiyor; veri boşa taşınıyor. |
| 33 | Timeline sınırı (kaynak başı 40, toplam 120) | KISMİ | `trust-timeline/route.ts:10`, `:236` | Kesme sessiz; "daha fazla" / sayfalama yok; telafi yalnız son 48s'te oluşanlar (KPI ise global). |
| 34 | Timeline boş durumu | KISMİ | `page.tsx:76-81`, `page.tsx:222-223` | Timeline hatası yutulup "Kayıt yok" gösteriliyor; hata ile boşluk ayırt edilemez. |
| 35 | Son şüpheli kayıtlar (8) | KISMİ | `page.tsx:257-277`, `trust-overview/route.ts:42-54` | `severity` ve `dealerId` çekiliyor ama gösterilmiyor; kullanıcı/bayi adı yok; tıklanamaz. |
| 36 | Son denetim olayları (8) | KISMİ | `page.tsx:279-300`, `trust-overview/route.ts:56-68` | Aktör (`userId`) çekiliyor ama gösterilmiyor; "kim yaptı" sorusu cevapsız. |
| 37 | Kaydırılabilir liste alanları | KISMİ | `page.tsx:221`, `:262`, `:284` | Masaüstünde iyi; mobilde sayfa içinde 3 ayrı iç scroll alanı. |
| 38 | Filtre / arama / sıralama | EKSİK | `page.tsx` tamamı | Tür, önem, bayi, zaman aralığı filtresi yok. |
| 39 | Aksiyonlar (çöz, onayla, ata, sustur, hesabı dondur) | EKSİK | `page.tsx` tamamı; `app/api/security/suspicious/route.ts:116-140` | Çözme API'si var ama hiçbir UI çağırmıyor. |
| 40 | Otomatik yenileme / canlı akış | EKSİK | `page.tsx:89-91` | Yalnız mount'ta bir kez + manuel. |
| 41 | "Son güncelleme" zaman damgası | EKSİK | `page.tsx` | Yenile sonrası verinin tazeliği bilinmiyor. |
| 42 | i18n | EKSİK | `page.tsx:96-98,125-...`; `messages/tr.json:2482` | Sidebar etiketi i18n'li, sayfa metinleri tamamen sabit Türkçe. |
| 43 | Sayfa `<title>` | EKSİK | `app/admin/trust-command/` (yalnız `page.tsx`, client) | Sekme başlığı yalnız layout varsayılanı. |
| 44 | Mobil grid düzeni | ÇALIŞIYOR | `page.tsx:120`, `:228`, `:256` | `sm:`/`lg:` kırılımları doğru. |
| 45 | Azaltılmış hareket | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:68,35-43` | Hero nefes animasyonu reduced-motion'da kapanıyor; sayfada başka motion yok. |
| 46 | Veri yükleme akışı | KISMİ | `page.tsx:68-81`, `trust-overview/route.ts:18-68` | İstemcide sıralı iki fetch; sunucuda 3 tur DB gidişi. |

---

## Bulgular

### 1. "İşaretli bayiler" KPI'ı yapısal olarak her zaman 0
- **Önem:** yüksek · **Kategori:** veri doğruluğu
- **Kanıt:** `app/api/admin/trust-overview/route.ts:27-32` (`role: 'DEALER', fraudStatus in [flagged, shadow_ban]`); `fraudStatus` yazan yerler: `lib/fraud/engine.ts:63-68` (müşteri `userId`, ayrıca **hiç çağrılmıyor**; `checkFraudulentActivity` için repo genelinde çağrı yok) ve `app/api/admin/bootstrap/route.ts:289-333` (yalnız `role: 'CUSTOMER'`). Kıyas: `app/admin/fraud-prevention/page.tsx:28-29` tüm rolleri sayıyor.
- **Sorun:** Fraud bayrağı müşteri hesaplarına konuyor, KPI bayileri sayıyor. Kart kırmızı ve büyük puntoyla "0" gösterip operatöre "sorun yok" diyor; fraud-prevention sayfası ise aynı anda örneğin "3 şüpheli" gösteriyor. İki sayfa aynı kavram için çelişkili sayı veriyor.
- **Öneri:** KPI'ı "Bayraklı hesaplar" olarak yeniden tanımla, `role`'e göre kırılım (müşteri / bayi) ver; `flagged` ve `shadow_ban`'ı ayrı alt sayılar olarak göster. Tek bir `lib/trust/metrics.ts` modülü kur, fraud-prevention ve trust-command aynı fonksiyonu kullansın (tek doğruluk kaynağı). Ölü `lib/fraud/engine.ts` için karar ver: tüketim (consumption) akışına bağla ya da sil. Bağlanırsa bu KPI gerçek anlam kazanır.
- **Efor:** S (KPI düzeltmesi) / M (ortak metrik modülü + engine kararı)

### 2. Güvenlik uyarısı sayacı HIGH önemli tüm uyarıları dışlıyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu / güvenlik görünürlüğü
- **Kanıt:** `trust-overview/route.ts:34-39` filtre `['WARNING','ERROR','CRITICAL']`; tek yazıcı `lib/security.ts:99-109` yalnız `HIGH` veya `CRITICAL` yazıyor; brute-force kilitleme `lib/rate-limit.ts:143-156` `severity: 'HIGH'` gönderiyor. Şema yorumu `prisma/schema.prisma` SecurityAlert `// INFO, WARNING, ERROR, CRITICAL`.
- **Sorun:** İki farklı önem sözlüğü (şüpheli: LOW/MEDIUM/HIGH/CRITICAL, uyarı: INFO/WARNING/ERROR/CRITICAL) karışmış. Sonuç: brute-force saldırıları sayaçta hiç görünmüyor, yalnız CRITICAL'lar sayılıyor. Kod yorumu (`rate-limit.ts:143`) "admin trust-command'da görünür" diyor; bu sayaçta görünmüyor. Ayrıca bu değer KPI kartı değil, gri küçük bir paragraf (`page.tsx:206-208`); sayfanın en kritik sinyali en az görünen öğe.
- **Öneri:** Önem değerlerini tek bir TypeScript union/enum'da (`lib/trust/severity.ts`) birleştir ve iki tabloyu ona eşle (ya da Prisma enum'a taşı + veri göçü). Kısa vadede filtreyi `{ not: 'INFO' }` yap. Güvenlik uyarısını ayrı ve öne çıkan bir KPI kartına taşı (son 24s + okunmamış sayısı, CRITICAL varsa kırmızı vurgu).
- **Efor:** S (filtre + kart) / M (enum birleştirme)

### 3. "Komuta merkezi"nde tek bir aksiyon yok; şüpheli kayıtlar sistemde hiçbir yerden çözülemiyor
- **Önem:** yüksek · **Kategori:** işlevsellik / iş akışı
- **Kanıt:** `page.tsx` tamamında yalnız "Yenile" ve linkler var. Çözme ucu `app/api/security/suspicious/route.ts:116-140` (PATCH) var ama repo genelinde `api/security/suspicious` çağıran hiçbir istemci yok. `SecurityAlert.isRead/isResolved` alanları (`prisma/schema.prisma`, SecurityAlert) hiçbir kodda güncellenmiyor. `/admin/fraud-prevention` yalnız seed/clear bootstrap butonları içeriyor (`app/admin/fraud-prevention/page.tsx:32-38,94-100`).
- **Sorun:** "Açık şüpheli aktivite" sayısı monoton artıyor, hiç azalamıyor; bir süre sonra operatör sayıyı görmezden gelmeye başlar (alert fatigue). Güvenlik uyarılarının okundu/çözüldü yaşam döngüsü tamamen kullanılmıyor. Ad "komuta merkezi" ama komut yok.
- **Öneri:** Her timeline satırına ve "Son şüpheli kayıtlar" satırına bir aksiyon menüsü ekle: *Çöz (gerekçe zorunlu)*, *Yanlış alarm*, *Kullanıcıyı işaretle / shadow ban kaldır*, *Bayiye ata*. Bunun için `POST /api/admin/trust/actions` (tek uç, `{kind, id, action, note}`) yaz; her aksiyon `AuditLog`'a yazılsın ve `resolvedBy/resolvedAt` doldurulsun. Güvenlik uyarıları için toplu "okundu" ve "çözüldü" ekle. İyimser güncelleme + geri al (undo) toast'ı kullan (Linear deseni). PATCH ucundaki eski `getServerSession` kontrolünü de `requireAuth(['ADMIN'])`'e çek (token-replay koruması tutarlılığı).
- **Efor:** L

### 4. Timeline linklerinin üçü yanlış ya da erişilemez yere gidiyor
- **Önem:** yüksek · **Kategori:** navigasyon / kırık link
- **Kanıt:**
  - Telafi → `/dealer/remedy-queue` (`trust-timeline/route.ts:175`); ADMIN için `proxy.ts:60-71` rol eşleşmeyince `/admin`'e yönlendiriyor.
  - Olay (incident) → `/admin/audit` (`trust-timeline/route.ts:187`); audit sayfası Incident modelini hiç sorgulamıyor (`app/admin/audit/page.tsx:52` yalnız `/api/admin/audit`).
  - Güvenlik → `/admin/observability` (`trust-timeline/route.ts:200`); observability yalnız `vercel-status`, `health`, `web-vitals-summary` çekiyor (`app/admin/observability/*.tsx:48-50`), güvenlik içeriği yok.
- **Sorun:** Operatör "Git"e basıp ya panelin ana sayfasına atılıyor ya da aradığı kaydın bulunmadığı bir sayfaya düşüyor. Güven sayfasında güven kaybettiren bir deneyim.
- **Öneri:** Her kayıt tipi için sayfa içi bir **detay çekmecesi** (shadcn `Sheet`) kur: tıklayınca kaydın tam içeriği, ilgili kullanıcı/bayi, metadata JSON'u ve aksiyon butonları açılsın. Sayfa dışı geçiş gerekiyorsa derin link kullan (`/admin/audit?entityId=...`; audit sayfası `useSearchParams` ile başlangıç filtresini okumalı). Telafi ve incident için admin tarafında salt-okunur bir görünüm şart (bayinin panelini taklit etmek yerine `GET /api/admin/trust/remedy/:id`).
- **Efor:** M

### 5. Aynı olay iki kez; "düşük puanlı" etiketi yüksek puanları da kapsıyor; çözülmüş kayıtlar açık gibi
- **Önem:** orta · **Kategori:** veri doğruluğu / UX
- **Kanıt:** `lib/security.ts:84-109` HIGH/CRITICAL için hem `suspiciousActivity` hem `securityAlert` oluşturuyor; timeline ikisini ayrı satır basıyor (`trust-timeline/route.ts:144-155`, `:193-203`). Feedback sorgusu `OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }]` (`:128`) ama başlık her zaman `Düşük puanlı geri bildirim (${f.rating})` (`:223`). Şüpheli sorgusu `isResolved` filtrelemiyor (`:48-61`), `meta.resolved` (`:153`) istemcide render edilmiyor (`page.tsx:225-251`).
- **Sorun:** Akış şişiyor, operatör aynı brute-force olayını iki kez okuyor; "Düşük puanlı (5)" çelişkili; çözülmüş bir kayıt açık kayıtla aynı görünüyor.
- **Öneri:** `SecurityAlert` oluştururken `metadata.suspiciousActivityId` ile bağla ve timeline'da birleştir (tek satır, "uyarı üretti" rozetiyle). Feedback başlığını kurala göre üret: "Düşük puan (2/5)" veya "Negatif duygu (puan 4/5)". Çözülmüş kayıtları soluk + "Çözüldü" rozetiyle göster ya da varsayılan filtrede gizle.
- **Efor:** S-M

### 6. "Denetim (24s)" sayısı güvenlik sinyali değil gürültü; denetim listesinde aktör yok
- **Önem:** orta · **Kategori:** bilgi mimarisi / veri anlamı
- **Kanıt:** AuditLog'a 88 farklı noktadan yazılıyor; müşteri tarafı örneği `lib/achievements.ts:160-165` (`COMPLETED_ACHIEVEMENT`), ayrıca `app/api/user/profile/route.ts`, `app/api/user/password/route.ts`. Liste `userId` çekiyor (`trust-overview/route.ts:66`) ama göstermiyor (`page.tsx:288-296`).
- **Sorun:** Trust bağlamında anlamlı olan "kim hangi hassas işlemi yaptı" (rol değişimi, toplu kullanıcı işlemi, API anahtarı, ayar değişimi). Müşteri görev tamamlamaları bu sayıyı şişirip asıl sinyali boğuyor.
- **Öneri:** AuditLog'a bir `category`/`sensitivity` sınıflaması ekle (veya `entity`/`action` beyaz listesi: `User.role`, `ApiKey`, `Settings`, `bulk`, `password`). Trust sayfası yalnız "hassas admin işlemleri"ni saysın; satırda aktörün adı + rolü + IP gösterilsin (`AuditLog.ipAddress` zaten var). Tam günlük için `/admin/audit` derin linki.
- **Efor:** M

### 7. Hata durumunda KPI'lar "0" gösteriyor; timeline hatası sessizce "Kayıt yok"a dönüşüyor
- **Önem:** orta · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:130,149,169,186,207` `payload?.summary.x ?? 0`; overview hata verince `payload` null, `loading` false → 0. `page.tsx:76-81` timeline `catch` → `setTimeline([])`; `tl.success` false da `[]` → `page.tsx:222-223` "Kayıt yok".
- **Sorun:** Güven panosunda "veri yok" ile "sorun yok" ayırt edilemez olmamalı; DB/ağ hatasında operatör "0 açık şüpheli, kayıt yok" görür.
- **Öneri:** Her bölüm için üçlü durum (yükleniyor / hata / boş) kur; hata durumunda "—" + "Yeniden dene" düğmesi; KPI'larda son başarılı değeri "x dakika önce" damgasıyla göster. SWR/React Query ile bölüm başına bağımsız istek ve `keepPreviousData` kullan.
- **Efor:** S

### 8. Uyumluluk kartı içeriksiz; telafi kartı eylemsiz
- **Önem:** orta · **Kategori:** sahte içerik / UX
- **Kanıt:** `page.tsx:193-203` "KVKK / 5651 envanter ve oranlar" açıklamalı kart yalnız bir buton içeriyor; `/api/admin/compliance/overview` mevcut (`app/admin/compliance/page.tsx:98`). `page.tsx:187-189` telafi kartı yalnız bilgi metni.
- **Sorun:** Vaat edilen veri gösterilmiyor; `sm:col-span-2` ile grid'in en geniş kartı en boş kart.
- **Öneri:** Kartı gerçek veriyle doldur: açık gizlilik talebi sayısı, SLA'yı aşan talepler, son 5651 log dönemi. Veri compliance overview ucundan gelsin (aynı metrik modülünden). Telafi kartına risk-dashboard'daki "SLA'yı aşan bekleyen" sayısını (`app/api/admin/innovation/risk-dashboard/route.ts:25-26`) ve en çok bekleten 3 bayiyi ekle; admin'in yapabileceği aksiyon "bayiye hatırlatma gönder" olabilir.
- **Efor:** M

### 9. Dil karışıklığı ve ham enum'lar
- **Önem:** düşük · **Kategori:** i18n / içerik
- **Kanıt:** `page.tsx:97` "Trust ve Safety komuta merkezi"; `:165` "flagged / shadow_ban"; `:207` "WARNING+"; `:232` ham `t.kind`; `:235` ham `t.severity`; `:291` ham `a.action`; `trust-timeline/route.ts:186` "Durum: open"; `:210` "Agent Council → aksiyon". Sidebar etiketi i18n'li (`messages/tr.json:2482` "Trust Komuta", `messages/en.json:2482`) ama sayfa sabit TR; `formatRelativeTime` locale'i hiç verilmiyor (`page.tsx:238`, varsayılan `tr`).
- **Öneri:** `next-intl` anahtarlarına taşı; tür/önem/durum için görüntü sözlüğü (`KIND_LABELS`, `SEVERITY_META` = {etiket, renk, ikon}) kur. Başlık: "Güven ve Güvenlik Merkezi".
- **Efor:** S

### 10. API'ler gizli kapı çerezini kontrol etmiyor (sistem geneli)
- **Önem:** orta · **Kategori:** güvenlik (savunma derinliği)
- **Kanıt:** `proxy.ts:107-118` `/api/*` isteklerini auth middleware'e sokmadan geçiriyor; `lib/api-auth.ts:52-80` `requireAuth` yalnız rol + token-replay kontrol ediyor, `admin_gate` çerezine bakmıyor.
- **Sorun:** Gizli kapı sayfa seviyesinde koruyor, veri seviyesinde değil. Rolü ADMIN olan ama gate cevabını bilmeyen biri `/api/admin/trust-overview` ve `/api/admin/trust-timeline`'dan şüpheli aktivite açıklamalarını okuyabilir (brute-force açıklamasında hedef e-posta da var: `lib/rate-limit.ts:151`). Bu sayfaya özgü değil, admin API'lerinin hepsi için geçerli.
- **Öneri:** `requireAuth`'a `requireAdminGate` seçeneği ekle (ya da `/api/admin/*` için proxy'de gate çerezi doğrulaması); hassas Trust uçlarından başla.
- **Efor:** S-M

### 11. Veri yükleme waterfall'u ve cache yokluğu
- **Önem:** düşük · **Kategori:** performans
- **Kanıt:** `page.tsx:68-77` overview bitmeden timeline başlamıyor; `trust-overview/route.ts:18-68` `Promise.all` sonrası iki ayrı sıralı `findMany`; aynı `auditLog` 24s sayımı `app/api/admin/platform-pulse/route.ts:51` içinde de var.
- **Öneri:** İki isteği paralel başlat (ya da tek `GET /api/admin/trust` ucunda birleştir); overview'daki 7 sorguyu tek `Promise.all`'a al. Sayımlar için 30-60 sn Upstash cache (mevcut cache deseni) ve aksiyon sonrası tag invalidation. Sayfayı Server Component kabuğu + istemci adası yapınca ilk boyama da hızlanır.
- **Efor:** S

### 12. Erişilebilirlik ve mobil detayları
- **Önem:** düşük · **Kategori:** a11y / mobil
- **Kanıt:** Önem yalnız renkle (`page.tsx:234`, hep amber); tekrarlayan "Git" link metni (`page.tsx:245-247`, WCAG 2.4.4); `RefreshCw` ve `ExternalLink` ikonlarında `aria-hidden` yok; yenileme sonrası `aria-live` duyurusu yok; mobilde 3 iç scroll alanı (`page.tsx:221,262,284`).
- **Öneri:** Önem rozetine ikon + metin (Kritik/Yüksek/Orta/Düşük) ve ayrık renkler; linklere `aria-label={`${t.title} kaydına git`}`; KPI bölgesine `aria-live="polite"`; mobilde iç scroll yerine "Daha fazla göster" ile genişleyen liste.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Radar, Linear, Retool iç araçları, PostHog)

1. **Vaka (case) yönetimi:** her şüpheli kayıt/uyarı için durum (açık / inceleniyor / çözüldü / yanlış alarm), atanan kişi, not ve gerekçe; Stripe Radar "Review" kuyruğu gibi.
2. **Kayıt detay çekmecesi + varlık bağlamı:** tıklayınca ilgili kullanıcının/bayinin risk geçmişi, fraudScore, son tüketimler, IP/UA, metadata JSON'u.
3. **Filtre, arama ve kaydedilmiş görünümler:** tür, önem, bayi, zaman aralığı (24s / 7g / 30g), "yalnız açık", "bana atanan"; URL'de saklanan filtre (Linear görünümleri gibi).
4. **Trend ve eşik alarmı:** KPI'ların yanında 7 günlük sparkline ve önceki döneme göre değişim; eşik aşılınca push/e-posta (PostHog alerts gibi).
5. **Canlı akış:** 30-60 sn polling ya da mevcut bildirim akışı (SSE) üzerinden yeni kayıt rozeti; "x yeni olay, göster" bandı.
6. **Toplu işlem ve dışa aktarma:** seçili kayıtları toplu çözme, CSV dışa aktarma (KVKK/denetim raporları için).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında 5 saniyede "şu an ilgilenmem gereken bir şey var mı?" sorusunun cevabını alır, 1 tıkla kaydın detayına iner, 2 tıkla çözer. Sayfa salt bir link dizini değil, Trust & Safety'nin **iş kuyruğu**dur.

**Yerleşim:**
1. **Durum bandı (üst):** tek satır genel sağlık göstergesi ("Kritik: 2 · Yüksek: 5 · Son 24s brute-force: 3"), CRITICAL varsa kırmızı vurgu, "son güncelleme 12 sn önce" + canlı nokta.
2. **KPI şeridi (4-5 kart):** Açık vaka · Güvenlik uyarısı (24s, okunmamış) · Bayraklı hesap (müşteri/bayi kırılımlı) · Telafi kuyruğu (SLA aşan) · Hassas admin işlemi (24s). Her kartta sparkline ve önceki döneme göre değişim; karta tıklamak aşağıdaki kuyruğu o filtreyle açar (sayfa değiştirmez).
3. **Ana gövde, iki sütun (lg):** sol 2/3 **Vaka kuyruğu** (birleşik, tekilleştirilmiş, filtre çubuğu + sekmeler: Açık / Bana atanan / Çözülen / Tümü); sağ 1/3 **Bağlam paneli** (seçili kaydın detayı ve aksiyonları; mobilde alttan açılan `Sheet`).
4. **Alt bölüm sekmeleri:** "Fraud" (mevcut `/admin/fraud-prevention` içeriği buraya taşınır), "Uyumluluk özeti" (compliance overview'dan gerçek sayılar), "Denetim (hassas)".

**Motion / 3D:** 3D bu sayfaya uygun değil (operasyonel araç, okunabilirlik önce gelir). Motion ölçülü olsun: yeni gelen kayıtta tek seferlik 150-200 ms arka plan vurgusu (`m.div` + `layout` ile liste yeniden sıralanırken kayma), çözülen kaydın yumuşak çıkışı (`AnimatePresence`), KPI değişiminde sayı geçişi. Hepsi `useReducedMotion` ile kapanmalı (hero'daki desen zaten var). Sürekli nabız/parlama animasyonu yalnız CRITICAL rozetinde ve reduced-motion'da kapalı olmalı.

**Veri / API değişiklikleri:**
- `lib/trust/metrics.ts`: tüm Trust sayımları için tek kaynak (trust-command, fraud-prevention, platform-pulse, risk-dashboard bunu kullanır), Upstash cache (30-60 sn) + aksiyon sonrası invalidation.
- `lib/trust/severity.ts`: tek önem sözlüğü; SuspiciousActivity ve SecurityAlert eşlemesi (gerekirse Prisma enum'a göç).
- `GET /api/admin/trust?window=24h|7d&kind=&severity=&status=&cursor=`: birleşik, tekilleştirilmiş, cursor sayfalamalı kuyruk (bugünkü `slice(0,120)` yerine).
- `GET /api/admin/trust/item/:kind/:id`: detay + bağlam (kullanıcı/bayi özeti, ilgili diğer kayıtlar).
- `POST /api/admin/trust/actions`: çöz / yanlış alarm / ata / okundu / shadow-ban kaldır; her işlem `AuditLog`'a yazılır, `requireAuth(['ADMIN'])` + gate kontrolü.
- `SecurityAlert.metadata.suspiciousActivityId` bağı (tekilleştirme için); `AuditLog` için hassasiyet sınıflaması.
- `lib/fraud/engine.ts` için ürün kararı: tüketim akışına bağlanması (puan ekonomisi korumasıyla uyumlu) ya da kaldırılması.

---

## Çakışmalar / birleştirme önerisi

| Sayfa | Çakışan içerik | Öneri |
|---|---|---|
| `/admin/fraud-prevention` | Şüpheli aktivite listesi + flagged/shadow_ban sayıları (`app/admin/fraud-prevention/page.tsx:19-29`); trust-command'ın "İşaretli bayiler" ile çelişen sayı | **Birleştir:** Trust Merkezi'nin "Fraud" sekmesi olsun; seed/clear demo butonları üretimden kaldırılıp yalnız geliştirme ortamına alınsın. |
| `/admin/platform-pulse` | Aynı `auditLog` 24s sayımı ve son denetimler (`app/api/admin/platform-pulse/route.ts:51-58`) | Koru, ama sayım ortak metrik modülünden gelsin; pulse genel sağlık, trust ise güvenlik odaklı kalsın. |
| `/admin/innovation` (risk-dashboard) | Telafi onay kuyruğu + SLA aşan bekleyen (`app/api/admin/innovation/risk-dashboard/route.ts:25-26`) | SLA verisi trust'taki telafi kartına da gelsin; tek fonksiyon. |
| `/admin/audit` | Son denetim olayları | Trust yalnız "hassas" alt kümeyi göstersin; tam günlük audit'te kalsın ve URL filtrelerini desteklesin. |
| `/admin/compliance` | "Uyumluluk özeti" kartı | Trust'ta yalnız 2-3 özet sayı + derin link; ayrıntı compliance'ta. |
| `/admin/observability` | Timeline güvenlik linki buraya gidiyor ama içerik yok | Linki kaldır; güvenlik uyarıları Trust Merkezi'nde yaşasın. |

Sonuç: `/admin/trust-command` kaldırılmamalı; aksine Trust & Safety için **tek giriş noktası** olacak şekilde yeniden tasarlanmalı ve `/admin/fraud-prevention`'ı içine almalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia kod baştan okunarak çürütülmeye çalışıldı (route'lar, `lib/security.ts`, `lib/rate-limit.ts`, `lib/fraud/engine.ts`, `app/api/admin/bootstrap/route.ts`, `proxy.ts`, `prisma/schema.prisma`, hedef sayfalar). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Güvenlik uyarısı sayacı HIGH önemli uyarıları saymıyor — **DOĞRULANDI**
- `SecurityAlert`'e yazan tek yer `lib/security.ts:99-109`: yalnız `data.severity === 'HIGH' || 'CRITICAL'` iken ve severity'yi aynen (`'HIGH'`/`'CRITICAL'`) yazıyor. Repo genelinde başka `securityAlert.create`/ham SQL yazıcı yok (grep: yalnız `lib/security.ts:100`).
- Sayaç filtresi `app/api/admin/trust-overview/route.ts:34-39`: `severity in ['WARNING','ERROR','CRITICAL']` → `HIGH` hiçbir zaman eşleşmez.
- Gerçek üretici: `lib/rate-limit.ts:145-156` (`BRUTE_FORCE`, `severity: 'HIGH'`), `lib/auth.ts:160-190` başarısız girişlerde `recordFailedLoginAttemptDb` çağırıyor; eşik `MAX_FAILED_ATTEMPTS = 5` (`lib/rate-limit.ts:216`).
- **Yeniden üretim:** Bir hesaba 5 kez yanlış parola gir → kilit + `SecurityAlert{type:'BRUTE_FORCE', severity:'HIGH'}` oluşur, adminlere bildirim gider. `/admin/trust-command` alt satırı "Güvenlik uyarıları (24s, WARNING+): 0" gösterir (`page.tsx:207`). Kayıt yalnız alttaki zaman çizelgesinde görünür (`trust-timeline/route.ts:99-110` severity filtresi koymuyor), yani tamamen görünmez değil ama sayaç yanıltıcı. Kök neden iki ayrı önem sözlüğü: şema yorumu `INFO/WARNING/ERROR/CRITICAL` (`schema.prisma:1951`), yazıcı `LOW/MEDIUM/HIGH/CRITICAL` (`lib/security.ts:76`).
- Not: Sayaç yalnız 24 saatlik oluşturma sayısı; adı "açık" çağrışımı yapsa da `isResolved` filtrelemiyor (değişken adı `securityOpen` yanıltıcı).

### 2. "İşaretli bayiler" KPI'ı yapısal olarak hep 0 — **DOĞRULANDI** (üretim etkisi sınırlı)
- Sorgu `trust-overview/route.ts:27-32` yalnız `role: 'DEALER'`.
- `fraudStatus` yazan tüm yerler (grep): `app/api/admin/bootstrap/route.ts:289-333` (yalnız `role: 'CUSTOMER'` kullanıcıları `flagged` yapıyor), `lib/fraud/engine.ts:64-68` (müşteri `userId`; `checkFraudulentActivity` için repo genelinde çağıran yok, ölü kod). Admin kullanıcı düzenleme uçlarında `fraudStatus`'u yazabilecek body-spread yok.
- **Yeniden üretim:** `/admin/fraud-prevention` → "Demo şüpheli aktivite üret" → 12 müşteriden `i%4===0` olan 3'ü `flagged` olur; fraud-prevention "Şüpheli (Flagged): 3" (`fraud-prevention/page.tsx:29,74`), trust-command "İşaretli bayiler: 0".
- Kayıt: Bugün üretimde gerçek bir fraud yazıcısı olmadığı için hangi rolle sayılırsa sayılsın değer pratikte 0'dır; hata gerçek ama zararı "yanlış temiz sinyali" ve iki ekran arası çelişki ile sınırlı. KRİTİK değil, YÜKSEK/ORTA arası.

### 3. Şüpheli aktiviteler ve güvenlik uyarıları hiçbir UI'dan çözülemiyor — **DOĞRULANDI**
- `PATCH /api/security/suspicious` (`app/api/security/suspicious/route.ts:116-148`) var ama `security/suspicious` için repo genelinde istemci çağrısı yok (grep yalnız route dosyasını buluyor).
- `suspiciousActivity.update/updateMany` başka yerde yok; tek silme `bootstrap/route.ts:350-359` ve yalnız demo kayıtlarını (`metadata.source='bootstrap'` veya tracker id'leri) siliyor. `cron/db-cleanup` SuspiciousActivity'ye dokunmuyor.
- `SecurityAlert.isRead/isResolved` (`schema.prisma:1955-1956`) hiçbir kodda güncellenmiyor (grep: yalnız `create`).
- `trust-command/page.tsx` yalnız Yenile ve link; `fraud-prevention/page.tsx:41-51,103-113` yalnız seed/clear demo butonları; `compliance/page.tsx` yalnız sayıyor.
- **Yeniden üretim:** Herhangi bir gerçek `BRUTE_FORCE` kaydı oluşsun → "Açık şüpheli aktivite" +1; admin bunu hiçbir ekrandan kapatamaz, sayaç yalnız artar. (Teknik olarak admin oturumuyla elle `PATCH` atılabilir; ürün içi yol yok.)

### 4. Timeline "Git" linklerinden üçü kırık/yanlış hedef — **DOĞRULANDI**
- `remedy_queue` → `/dealer/remedy-queue` (`trust-timeline/route.ts:175`). `proxy.ts:60-71`: `/dealer` öneki `DEALER` ister; ADMIN token'ı `/admin`'e yönlendirilir (matcher `/dealer/:path*` içeriyor, `proxy.ts:124`). Sayfa var (`app/dealer/remedy-queue/page.tsx`) ama admin erişemez; admin tarafında telafi kuyruğu sayfası yok.
- `incident` → `/admin/audit` (`:187`). `/api/admin/audit` yalnız `prisma.auditLog` sorguluyor; incident oluşturan/güncelleyen yollar (`app/api/dealer/incidents/**`, `lib/auto-reply-engine.ts`, `negative-feedback-sla`) AuditLog yazmıyor. Hedefte kayıt bulunmaz; admin için bir incident sayfası da yok.
- `security` → `/admin/observability` (`:200`). Sayfa yalnız `vercel-status`, `health`, `web-vitals-summary` çekiyor (`observability/page.tsx:48-50`); oradaki "incidents" Vercel statü olayları, SecurityAlert değil.
- **Yeniden üretim:** Timeline'da "Telafi onay bekliyor" satırında "Git" → admin panel ana sayfasına düşer; güvenlik satırında "Git" → Vercel/sağlık panosu açılır, uyarı yok.
