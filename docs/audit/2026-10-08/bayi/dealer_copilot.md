# /dealer/copilot

**Amaç:** Bayi/işletme sahibine son 7 günün özetini (geri bildirim sayısı, negatif oranı, yanıt oranı, ortalama puan), kritik geri bildirimleri, AI'nın geri bildirimlere iliştirdiği aksiyon önerilerini, "bir sonraki en iyi adım" kısayollarını, günlük trend grafiğini ve kampanya↔geri bildirim UTM sinyalini tek ekranda göstermek. Sayfa kendini "Yapay zeka destekli yönetici asistanınız" olarak tanıtıyor.

**Genel puan:** 5.2 / 10 · **Karar:** **birleştir** (Operasyon Özeti + Haftalık Brifing + dashboard'daki Sabah Brifingi / Next-Best-Actions ile tek bir "Yönetici Brifingi" yüzeyinde toplanmalı; mevcut haliyle salt okunur, kısmen yanıltıcı bir özet panosu)

Denetlenen dosyalar:
- `app/dealer/copilot/page.tsx` (519 satır, client component)
- `app/dealer/copilot/layout.tsx`
- `components/dealer/copilot-daily-trend-chart.tsx`
- `app/api/dealer/copilot-summary/route.ts` (tek veri kaynağı)
- `lib/next-best-action.ts`, `lib/api-auth.ts`, `lib/timezone.ts`, `lib/module-controls.ts`, `components/dashboard/sidebar.tsx`, `proxy.ts`
- `messages/tr.json` / `messages/en.json` (`dealerCopilot.*`, satır 1260 civarı)
- Prisma modelleri: `Feedback`, `ConsumptionReview`, `ActionItem`, `Incident`, `Campaign`, `QRCode`
- Bağlantı hedefleri: `app/dealer/feedbacks/page.tsx`, `app/api/dealer/action-items/route.ts`

> Not: Kod çalıştırılmadı, DB'ye dokunulmadı; tüm bulgular kaynak okunarak doğrulandı. Satır numaraları `page.tsx` dosyasının kendi numaralandırmasıdır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Veri gerçek ve bayi izoleli; ancak kritik sorun sıralaması NULL urgency yüzünden bozuk, "Ekle" butonu aksiyon eklemiyor, "Git" linki ilgili kayda gitmiyor, tüketim yorumları tamamen dışarıda. |
| UX | 5/10 | Bilgi tek ekranda ama her şey "başka sayfaya git" linki; sayfada hiçbir iş bitirilemiyor, dönem seçimi/yenileme/son güncelleme yok, AI vaadi karşılanmıyor. |
| Görsel | 6/10 | shadcn kart dili tutarlı ve temiz; ancak 7 farklı renkli kart bloğu eşit ağırlıkta, hiyerarşi zayıf; yükleniyor ekranında dönen robot + ikinci spinner gösterişli ve tekrarlı. |
| Mimari | 5/10 | 15'e kadar sorgu tek uçta, Redis 60 sn cache doğru izole; fakat `buildNextBestActions` iki ayrı uçta çoğaltılmış, TR metinler sunucuda sabit, hata yanıtı istemcide ayırt edilmiyor. |
| Performans | 6/10 | Paralel `Promise.all`, tek `date_trunc` sorgusu ve grafik code-split iyi; `AnimatedNumber` 4 kart × 40 setInterval render, aynı `baseWhere` için 4 ayrı count gereksiz. |
| Erişilebilirlik + Mobil | 4/10 | "Git" linki `opacity-0 group-hover` ile dokunmatikte ve klavye odağında görünmez; `<Link><Button>` iç içe etkileşimli öğe; grafik için metin alternatifi yok; `AnimatedNumber` azaltılmış hareketi yok sayıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota metadata (başlık/açıklama) | KISMİ | `app/dealer/copilot/layout.tsx:5`, `messages/tr.json:114` | Açıklama "Ön hat ekipleri için yönlendirmeli akışlar" diyor; sayfada akış yok, yönetici özeti var. |
| 2 | Rol koruması (sayfa + API) | ÇALIŞIYOR | `proxy.ts:52-73`, `route.ts:18-19` | DEALER dışı roller yönlendiriliyor; API `requireAuth(['DEALER','ADMIN'])` + token-replay. |
| 3 | Veri yükleme (`fetch /api/dealer/copilot-summary`) | KISMİ | `page.tsx:103-112` | `res.ok` kontrolü yok; 401/403/500/503 yanıtları hata toast'ı üretmeden "özet yüklenemedi" kartına düşüyor; AbortController yok. |
| 4 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:114-133`, `components/ui/inline-loading-status.tsx:38-41` | Sonsuz dönen robot + `Loader2` spinner: iki spinner üst üste. İçerik iskeleti (skeleton) yok. |
| 5 | Hata/boş özet kartı | KISMİ | `page.tsx:171-178` | "Sayfayı yenileyin" diyor ama "Tekrar dene" butonu yok; hata türü (yetki/DB/sunucu) ayrılmıyor. |
| 6 | Hero (eyebrow/başlık/açıklama) | ÇALIŞIYOR | `page.tsx:140-146` | "Yapay zeka destekli" iddiası için bkz. #40. |
| 7 | Hero: Geri bildirimler butonu | ÇALIŞIYOR | `page.tsx:148-153` | |
| 8 | Hero: Aksiyonlar butonu | ÇALIŞIYOR | `page.tsx:154-159` | |
| 9 | Hero: AI Sohbet butonu | KISMİ | `page.tsx:161-166` | Etiket "AI Sohbet" sabit kodlu TR; EN arayüzde çevrilmiyor. `ai_features` modülü kapalıyken de görünüyor. |
| 10 | İstatistik: Geri bildirim (7 gün) | ÇALIŞIYOR | `route.ts:75`, `page.tsx:185-191` | Yalnızca QR `Feedback`; `ConsumptionReview` sayılmıyor (bkz. B3). |
| 11 | İstatistik: Negatif | KISMİ | `route.ts:44-47` | `rating <= 3` tanımı 3 yıldızı (nötr) negatif sayıyor; NPS/CSAT pratiğiyle çelişir. |
| 12 | İstatistik: Yanıt oranı | KISMİ | `route.ts:77,140` | Yalnız QR geri bildirimleri; tüketim yorumu yanıtları hesaba girmiyor. |
| 13 | İstatistik: Ort. puan | BOZUK | `page.tsx:210`, `route.ts:141,243` | Hiç geri bildirim yokken `null ?? 0` → "0.0 / 5" gösteriliyor; işletme 0 puan almış gibi görünür. |
| 14 | `AnimatedNumber` sayaç animasyonu | ÇALIŞIYOR | `page.tsx:77-94` | `setInterval` tabanlı; `MotionConfig reducedMotion="user"` bunu kapsamaz; `display` bağımlılığı eksik (stale closure). |
| 15 | Next Best Actions çipleri | KISMİ | `page.tsx:249-284`, `lib/next-best-action.ts:23-75` | Etiketler sunucuda sabit TR; "telafi gönder" linki `?tab=qr` ile gidiyor ama feedbacks sayfası `tab` parametresini okumuyor (`app/dealer/feedbacks/page.tsx:168,307`) → tüketim sekmesi açılıyor. `lowestRatedQrId` hesaplanıyor ama linke hiç konmuyor. |
| 16 | Günlük trend grafiği | KISMİ | `page.tsx:287-306`, `route.ts:146-184`, `copilot-daily-trend-chart.tsx:31-38` | Gün etiketleri (`Paz/Pzt…`), tooltip ("Toplam", "Negatif", "Gün:") ve legend sabit TR; UTC gün sınırı (TR gece 00-03 arası önceki güne düşer); pencere istatistiklerle uyuşmuyor (bkz. B6). |
| 17 | Grafik code-split + skeleton | ÇALIŞIYOR | `page.tsx:38-42` | `ssr:false` dinamik import, 240px iskelet. |
| 18 | Kampanya ↔ geri bildirim sinyali | KISMİ | `route.ts:186-230`, `page.tsx:308-342` | Gönderimden ÖNCEKİ geri bildirimler de eşleşmeye sayılıyor (bkz. B5); `hint` metinleri sabit TR; başlıktan türetilen 20 karakterlik token gevşek `contains` ile yanlış eşleşebilir. |
| 19 | Kampanya "Detay" linki | ÇALIŞIYOR | `page.tsx:328`, `app/dealer/campaigns/[id]/performance` | Hedef rota mevcut. |
| 20 | Kritik sorunlar listesi | BOZUK | `route.ts:61-74,99-109` | `orderBy urgency desc` Postgres'te NULLS FIRST → AI'nın henüz işlemediği kayıtlar en üste çıkar (bkz. B1). Yanıtlanmış/çözülmüş kayıtlar da listelenmeye devam ediyor. |
| 21 | Puan rozeti | ÇALIŞIYOR | `page.tsx:380-382` | |
| 22 | Sentiment rozeti | KISMİ | `page.tsx:383-387` | Ham DB değeri (`negative`) `capitalize` ile gösteriliyor → TR arayüzde "Negative". |
| 23 | Yüksek aciliyet rozeti | ÇALIŞIYOR | `page.tsx:388-392` | Eşik 0.7 sabit. |
| 24 | Göreli zaman | ÇALIŞIYOR | `page.tsx:393-395`, `lib/utils.ts:33` | |
| 25 | Kritik sorun "Git" linki | BOZUK | `page.tsx:396-402` | Her kayıt için aynı genel `/dealer/feedbacks` adresi; kayıt kimliği yok; varsayılan sekme tüketim yorumu olduğundan ilgili QR kaydı görünmez. `opacity-0 group-hover:opacity-100` → mobilde hiç görünmez, klavyeyle odaklanınca da görünmez. |
| 26 | Kritik boş durumu | ÇALIŞIYOR | `page.tsx:362-368` | |
| 27 | Önerilen aksiyonlar listesi | KISMİ | `route.ts:111-120`, `page.tsx:437-465` | Zaten `ActionItem`'a dönüşmüş öneriler ayıklanmıyor; aynı öneri hem burada hem aksiyon listesinde. Kaynak geri bildirime bağlantı yok. |
| 28 | Öncelik rozeti | KISMİ | `page.tsx:451-455` | Ham `high/medium/low` İngilizce gösteriliyor. |
| 29 | "Ekle" butonu (öneriyi aksiyona ekle) | SAHTE | `page.tsx:457-462` | Etiket "Ekle" ama yalnızca `/dealer/action-items`'a yönlendiriyor; hiçbir kayıt oluşturmuyor. Oysa `POST /api/dealer/action-items` `feedbackId + suggestionText` ile hazır ve tekrar kontrolü yapıyor (`app/api/dealer/action-items/route.ts:115-184`). |
| 30 | Öneri boş durumu + "Aksiyonlara git" | ÇALIŞIYOR | `page.tsx:427-435` | `<Link><Button>` iç içe. |
| 31 | Açık olay şeridi | ÇALIŞIYOR | `route.ts:94-96`, `page.tsx:482-495` | Status enum'u ile tutarlı (`open/assigned/in_progress/resolved`). |
| 32 | Churn riski şeridi | KISMİ | `route.ts:91-93`, `page.tsx:496-509` | Benzersiz müşteri değil geri bildirim adedi sayılıyor; "yüksek churn riski" etiketi yanıltıcı. İkon `TrendingUp` (yükseliş) olumlu çağrışım yapıyor. |
| 33 | Redis cache (60 sn, bayi izoleli) | ÇALIŞIYOR | `route.ts:35-38,254` | Yanıt verince/aksiyon ekleyince invalidation yok; sayfada "son güncelleme" bilgisi yok. |
| 34 | ADMIN davranışı | KISMİ | `route.ts:22-31` | `?dealerId=xxx` ile belirtin diyor ama parametre hiç okunmuyor; ölü/yanıltıcı yol. |
| 35 | Modül kapatma (`copilot`) | KISMİ | `lib/module-controls.ts:40`, `components/dashboard/sidebar.tsx:450-454` | Yalnız menüden gizler; sayfa ve API doğrudan URL ile çalışmaya devam eder (`assertModuleEnabled` çağrısı yok). |
| 36 | Mobil yerleşim | KISMİ | `page.tsx:183,344` | Grid'ler mobilde tek sütuna iniyor; ancak #25 mobilde görünmez, hero'da 3 büyük (`size="lg"`) buton dar ekranda kalabalık. |
| 37 | Yenile / son güncelleme zamanı | EKSİK | — | Cache 60 sn; kullanıcı verinin ne kadar taze olduğunu bilemiyor. |
| 38 | Dönem seçici (7/30/90 gün, karşılaştırma) | EKSİK | `route.ts:41` | Pencere 7 güne sabit; önceki dönemle delta yok. |
| 39 | Tüketim yorumları (ConsumptionReview) kapsamı | EKSİK | `route.ts:43-97` | Yalnız `Feedback` sorgulanıyor; `ConsumptionReview` modelinde `sentiment`, `churnRisk`, `dealerRepliedAt` mevcut (prisma/schema.prisma `model ConsumptionReview`). |
| 40 | "Yapay zeka destekli yönetici asistanı" vaadi | SAHTE | `messages/tr.json` `dealerCopilot.description`, `route.ts` tamamı | Uçta hiçbir AI çağrısı yok; yalnızca geri bildirim kayıtlarına önceden iliştirilmiş `actionSuggestions` alanı listeleniyor. Doğal dilde özet, soru-cevap veya önceliklendirme muhakemesi yok. |

**Durum dağılımı:** ÇALIŞIYOR 16 · KISMİ 16 · BOZUK 3 · SAHTE 2 · EKSİK 3 (toplam 40)

---

## Bulgular

### B1 — Kritik sorunlar listesi AI'nın işlemediği kayıtları en üste koyuyor
- **Önem:** yüksek · **Kategori:** doğruluk/veri
- **Kanıt:** `app/api/dealer/copilot-summary/route.ts:63` → `orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }]`; `Feedback.urgency Float?` (null = analiz edilmedi). Projede `nulls: 'last'` kullanımı hiç yok (grep ile doğrulandı).
- **Sorun:** PostgreSQL'de `ORDER BY ... DESC` varsayılanı NULLS FIRST'tür ve Prisma 5 ek bir `NULLS` ifadesi üretmez. AI kuyruğu gecikirse veya AI kapalıysa `urgency = null` olan tüm negatif kayıtlar, `urgency = 0.95` olan gerçek kriz kaydının önüne geçer. Liste ilk 50 kaydı alıp 6'ya kestiği için gerçek acil kayıt listeden tamamen düşebilir. "Kritik sorunlar" kartının tek işi bu sıralama.
- **Öneri:** `orderBy: [{ urgency: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]`. Daha doğrusu sunucu tarafında bileşik bir "öncelik skoru" hesaplayın: `urgency ?? (rating<=2 ? 0.6 : 0.4)` + yanıtsızlık süresi + churnRisk ağırlığı; böylece analiz edilmemiş 1 yıldızlı kayıt da makul bir sıraya yerleşir. Ayrıca `dealerRepliedAt IS NULL` ve açık telafi/aksiyon olmayan kayıtları filtreleyin (bkz. B4).
- **Efor:** S

### B2 — "Ekle" butonu aksiyon eklemiyor (sahte etkileşim)
- **Önem:** yüksek · **Kategori:** işlevsellik/UX
- **Kanıt:** `page.tsx:457-462` yalnızca `<Link href="/dealer/action-items">`; `app/api/dealer/action-items/route.ts:115-184` `feedbackId + suggestionText + priority` alan, sahiplik kontrolü ve 409 tekrar kontrolü yapan POST zaten mevcut.
- **Sorun:** Kullanıcı "Ekle"ye basar, başka sayfaya atılır, öneri eklenmemiştir ve hangi öneriyi seçtiği kaybolur. Bu, sayfanın tek "eylem" vaadini boşa çıkarır.
- **Öneri:** Butonu gerçek bir mutasyona dönüştürün: `POST /api/dealer/action-items { feedbackId, suggestionText: action.action, priority, sourceModule: 'copilot' }`; iyimser UI ile satırı "Eklendi ✓ · Görüntüle" durumuna geçirin, 409'da "Zaten listede" gösterin. Sunucu tarafında `topActions` üretirken aynı `suggestionText` ile açık `ActionItem` olanları `alreadyTracked: true` olarak işaretleyin ki buton baştan doğru durumda gelsin. Ayrıca "Ata" (ekip üyesine) ve "Son tarih" hızlı seçimi eklenebilir — `assignedToId`, `dueAt` şemada zaten var.
- **Efor:** S–M

### B3 — Tüketim yorumları (ConsumptionReview) Copilot'ta tamamen yok
- **Önem:** yüksek · **Kategori:** veri bütünlüğü/ürün
- **Kanıt:** `route.ts:43-97` yalnız `prisma.feedback`; `ConsumptionReview` modelinde `rating`, `text`, `sentiment`, `churnRisk`, `dealerRepliedAt` alanları mevcut. Geri bildirim sayfası varsayılan olarak tüketim sekmesini açıyor (`app/dealer/feedbacks/page.tsx:168` → `useState('consumption')`), yani ürün bu kanalı birincil kabul ediyor.
- **Sorun:** "Geri bildirim (7 gün)", "Negatif", "Yanıt oranı", "Ort. puan" ve "Kritik sorunlar" yalnızca QR geri bildirimlerini yansıtıyor. Tüketim yorumu ağırlıklı bir işletme için Copilot "her şey yolunda" ya da "hiç veri yok" gösterebilir; yanıt oranı sistematik olarak yanlış olur.
- **Öneri:** Kanal-bağımsız bir "Ses" (VoC) agregasyon katmanı kurun: `lib/voc-aggregate.ts` içinde `Feedback` ve `ConsumptionReview` için aynı şekilli `{id, kind, rating, sentiment, urgency, churnRisk, repliedAt, createdAt, text}` kayıtları döndüren iki sorgu + birleşik istatistik. UI'da her kartta kanal kırılımı (QR / Tüketim) küçük bir alt satır olarak gösterilsin; kritik sorun satırında kanal rozeti olsun.
- **Efor:** M

### B4 — "Git" linki ilgili kayda gitmiyor, mobilde ve klavyede görünmez
- **Önem:** yüksek · **Kategori:** UX/erişilebilirlik
- **Kanıt:** `page.tsx:396-402` (`href="/dealer/feedbacks"`, `opacity-0 group-hover:opacity-100`); `app/dealer/feedbacks/page.tsx:307` yalnız `search` parametresini okuyor, `tab`/`id` okumuyor.
- **Sorun:** (1) Kullanıcı hangi kritik kayda tıklarsa tıklasın aynı genel sayfaya ve yanlış sekmeye (tüketim) iner; kaydı yeniden araması gerekir. (2) Dokunmatik cihazda hover olmadığı için link hiç görünmez; klavye ile Tab'la odaklanınca görünmez bir öğeye odak düşer (WCAG 2.4.7). (3) Kritik bir kayıt için en doğal eylemler (yanıtla, telafi gönder, olay aç) burada yok.
- **Öneri:** Satırın tamamını tıklanabilir yapın ve sağda bir yan panel (Sheet) açın: geri bildirim tam metni + AI yanıt önerileri (`/api/dealer/feedbacks/[id]` + mevcut AI öneri ucu) + "Yanıtla", "Telafi gönder" (`/api/dealer/feedbacks/[id]/remedy`), "Aksiyona çevir". Yan panel istemiyorsanız en azından `/dealer/feedbacks?tab=qr&focus=<id>` derin linki tanımlayıp feedbacks sayfasında `tab` ve `focus` parametrelerini okuyun. Linki her zaman görünür yapın (`opacity` gizlemesi yerine ikincil renk), `focus-visible` halkası ekleyin.
- **Efor:** M

### B5 — Kampanya sinyali gönderimden önceki geri bildirimleri de kampanyaya yazıyor
- **Önem:** orta · **Kategori:** doğruluk/veri
- **Kanıt:** `route.ts:211-218` → `createdAt: { gte: thirtyDaysAgo }`; kampanyanın `sentAt` değeri seçiliyor (`route.ts:191`) ama filtrede kullanılmıyor. Eşleşme `utmCampaign contains token` (başlığın ilk 20 alfanümerik karakteri).
- **Sorun:** 25 gün önce gönderilmiş "yaz" başlıklı bir kampanyaya, gönderimden 5 gün önce gelmiş `utm_campaign=yaz_menu` geri bildirimleri de atfedilir. Ayrıca kısa/genel token'lar ("indirim", "kampanya") birbirinin geri bildirimlerini çalar. Kart "ROI" çağrışımı yaptığı için yanlış karar doğurur.
- **Öneri:** Filtreyi `createdAt >= c.sentAt` ve makul bir atıf penceresiyle (örn. `sentAt + 14 gün`) sınırlayın. Uzun vadede başlıktan token türetmek yerine kampanya oluşturulurken deterministik bir `utmCampaign` slug'ı üretip `Campaign` modeline yazın ve eşitlikle eşleştirin. "hint" metinlerini i18n anahtarına çevirip yalnız sayısal veriyi döndürün. Bu kartın asıl yeri `/dealer/campaigns/[id]/performance`; Copilot'ta yalnız "en iyi/en kötü giden kampanya" tek satır özetine indirilebilir.
- **Efor:** S (filtre) / M (slug alanı)

### B6 — Grafik ile istatistik kartları farklı zaman pencereleri kullanıyor
- **Önem:** orta · **Kategori:** doğruluk/tutarlılık
- **Kanıt:** İstatistikler `since = now - 7×24 saat` (`route.ts:41,43`); grafik bugünün kısmi günü + önceki 6 tam UTC günü (`route.ts:147-155`); gruplama UTC (`route.ts:160`), etiketler `getUTCDay` (`route.ts:179`).
- **Sorun:** Grafikteki çubukların toplamı "Geri bildirim (7 gün)" kartıyla tutmaz (grafik ~6.x gün, kart tam 168 saat). Türkiye (UTC+3) için 00:00–03:00 arası gelen geri bildirimler önceki güne yazılır; "Cumartesi gecesi yoğunluğu" yanlış güne kayar.
- **Öneri:** Tüm sayfa için tek bir dönem tanımı kullanın: bayinin saat dilimine göre (Settings'te yoksa `Europe/Istanbul`) "son 7 takvim günü" ve hem istatistikleri hem grafiği bu sınırdan hesaplayın; SQL'de `date_trunc('day', f."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})`. Gün etiketlerini sunucuda değil istemcide `Intl.DateTimeFormat(locale, { weekday: 'short' })` ile üretin (bkz. B7).
- **Efor:** S–M

### B7 — TR/EN dil karışıklığı (sunucu metinleri, ham enum'lar, grafik)
- **Önem:** orta · **Kategori:** i18n
- **Kanıt:** `page.tsx:164` "AI Sohbet"; `lib/next-best-action.ts:26,34,41,51,60,69` TR etiketler; `route.ts:146` `['Paz','Pzt',…]`; `route.ts:208,226-227` hint metinleri; `copilot-daily-trend-chart.tsx:33-36` "Toplam/Negatif/Gün:"; `page.tsx:383-387` ham `sentiment`; `page.tsx:451-455` ham `priority`; API hata mesajı `route.ts:261` TR.
- **Sorun:** EN dili seçmiş bir bayi, sayfanın yarısını Türkçe görür; TR bayi ise "Negative", "high" gibi İngilizce ham değerler görür. Uluslararası kullanım ve profesyonel algı zarar görür.
- **Öneri:** API yalnızca anahtar + parametre döndürsün (`{ key: 'nba.remedyLowestQr', params: { count } }`), istemci `t()` ile çevirsin. `sentiment`/`priority` için `dealerCopilot.sentiment.*` / `common.priority.*` sözlükleri; grafik bileşeni `t` ve `locale` prop'u alsın. Bu desen `buildNextBestActions`'ı kullanan dashboard ucunu (`/api/dealer/next-best-actions`) da düzeltir.
- **Efor:** S–M

### B8 — "Yapay zeka destekli Copilot" vaadi karşılanmıyor
- **Önem:** orta · **Kategori:** ürün/dürüstlük
- **Kanıt:** `messages/tr.json` `dealerCopilot.description` ("Yapay zeka destekli yönetici asistanınız"), `dealerCopilot.title` "Manager Copilot"; `route.ts` içinde hiçbir AI istemcisi çağrısı yok; öneriler yalnızca `Feedback.actionSuggestions` alanından ilk 2'şer adet kopyalanıyor (`route.ts:111-120`).
- **Sorun:** Medallia/Qualtrics'in "copilot"ları dönemi doğal dilde özetler, kök neden temalarını kümeler, "bu hafta neye odaklanmalıyım" sorusuna gerekçeli cevap verir. Burada ise aynı öneri metinleri tekrarlanır, sıralama yoktur, tema kümelemesi yoktur. İsim ile içerik arasındaki fark güveni zedeler; AI modülü (`ai_features`) kapalıyken bile sayfa "AI destekli" der (`sidebar.tsx:263` featureKey yok).
- **Öneri:** İki seçenek: (a) Dürüst yeniden adlandırma: "Haftalık Durum" / "Yönetici Özeti". (b) Gerçek copilot: haftalık cron (`DealerWeeklyBrief` zaten üretiliyor, `app/api/dealer/weekly-brief/route.ts:8-11`) veya istek anında cache'li tek bir LLM çağrısıyla 3–5 maddelik "Bu hafta" anlatısı + tema kümeleri (`Feedback.themes` alanı zaten var) + her maddeye kanıt kayıtları. Öneriler tekrarlardan arındırılıp (`suggestionText` normalize + benzerlik) etki × sıklık ile sıralanmalı. `ai_features` kapalıysa bölüm kural tabanlı özete düşmeli.
- **Efor:** M (a: S)

### B9 — Hata yönetimi yanıt durumunu ayırt etmiyor, yeniden deneme yok
- **Önem:** orta · **Kategori:** dayanıklılık
- **Kanıt:** `page.tsx:103-112` → `.then((res) => res.json())` `res.ok` kontrolü yok; `.catch` yalnız ağ hatasında toast; `page.tsx:171-178` statik hata kartı.
- **Sorun:** 500/503 (DB erişilemez, `responseIfDatabaseUnavailable`) veya 403 (token-replay) yanıtlarında kullanıcıya toast gelmez, hata kartı "yenileyin" der ama buton sunmaz; 403 durumunda yenilemek işe yaramaz, yeniden giriş gerekir.
- **Öneri:** Projedeki ortak fetch/SWR desenine geçin (`useSWR` + `revalidateOnFocus` + `dedupingInterval: 60_000`, Redis TTL ile hizalı). `!res.ok` için `json.error`'ı gösterin; hata kartına "Tekrar dene" (mutate) ve 401/403'te "Yeniden giriş yap" butonu ekleyin. Kısmi başarısızlıkta (ör. kampanya sorgusu) tüm sayfanın düşmemesi için API bölümleri `Promise.allSettled` ile bağımsız döndürsün.
- **Efor:** S

### B10 — Ortalama puan veri yokken "0.0 / 5" gösteriyor
- **Önem:** orta · **Kategori:** doğruluk/UX
- **Kanıt:** `page.tsx:210` `value: stats.avgRating ?? 0`.
- **Sorun:** Yeni açılmış ya da sakin bir haftası olan işletme 0 puan almış gibi görünür; ekran görüntüsü paylaşıldığında itibar riski.
- **Öneri:** `null` için "—" ve alt satırda "Bu dönemde değerlendirme yok" gösterin; ayrıca önceki döneme göre delta (▲0.2) ekleyin. Stat kartlarını tek bir `StatTile` bileşenine taşıyıp `value: number | null`, `delta`, `href` desteği verin; her kart ilgili filtrelenmiş listeye link olsun (Negatif → `/dealer/feedbacks?sentiment=negative`).
- **Efor:** S

### B11 — "Negatif" tanımı 3 yıldızı da kapsıyor; churn sayacı müşteri değil kayıt sayıyor
- **Önem:** orta · **Kategori:** metrik tanımı
- **Kanıt:** `route.ts:44-47` (`rating: { lte: 3 }`), `route.ts:91-93` (`feedback.count` + `churnRisk >= 0.7`), etiket `dealerCopilot.churnRisk` "{count} yüksek churn riski".
- **Sorun:** 3 yıldız sektörde (CSAT) nötr kabul edilir; negatif oranı şişer ve "kritik sorunlar" nötr kayıtlarla dolar. Aynı müşterinin 3 geri bildirimi "3 yüksek churn riski" olarak görünür.
- **Öneri:** Metrik tanımlarını tek bir `lib/metrics-definitions.ts` dosyasına alın (negatif = `rating <= 2 OR sentiment = 'negative'`, nötr = 3) ve tüm bayi sayfalarında (operations-brief, analytics, dashboard) aynı tanımı kullanın. Churn için `groupBy userId` ile benzersiz müşteri sayın; etiketi "{count} müşteri kayıp riski altında" yapın; ikonu `UserMinus`/`TrendingDown` olarak düzeltin (`page.tsx:499`).
- **Efor:** S

### B12 — İç içe etkileşimli öğeler ve erişilebilirlik eksikleri
- **Önem:** orta · **Kategori:** erişilebilirlik
- **Kanıt:** `<Link><Button>` kalıbı `page.tsx:272-277`, `432-434`, `457-462`; grafik `copilot-daily-trend-chart.tsx` ekran okuyucu için özet içermiyor; `AnimatedNumber` `page.tsx:77-94` `prefers-reduced-motion` kontrol etmiyor; ikonlarda `aria-hidden` yalnız hero'da (`page.tsx:144`).
- **Sorun:** `<a><button>` geçersiz HTML'dir, ekran okuyucu iki odak durağı duyurur ve klavye ile iki kez Tab gerekir. Sayaç animasyonu ekran okuyucuya ara değerler okutabilir.
- **Öneri:** Proje genelinde kullanılan `Button asChild` + `Link` desenine geçin (hero'da zaten öyle, `page.tsx:148`). Grafiğe `role="img"` + `aria-label` ile metin özeti ("7 günde 42 geri bildirim, en yoğun gün Cumartesi") ve görünmez veri tablosu ekleyin. `AnimatedNumber`'ı framer-motion `useMotionValue` + `animate` ile yazın (global `MotionConfig reducedMotion="user"` o zaman otomatik devreye girer) ya da `useReducedMotion()` ile anında değer gösterin; sayıya `aria-live="off"` ve son değeri içeren `aria-label` verin.
- **Efor:** S

### B13 — Next-Best-Action mantığı iki uçta çoğaltılmış ve derin linkler işlevsiz
- **Önem:** düşük · **Kategori:** mimari
- **Kanıt:** `route.ts:131-138` ve `app/api/dealer/next-best-actions/route.ts:5,23+` aynı `buildNextBestActions`'ı ayrı sorgularla besliyor; `lib/next-best-action.ts:35,42` `?tab=qr` (okunmuyor), `lowestRatedQrId` hesaplanıyor (`route.ts:122-129`) ama `href`'e eklenmiyor. Ayrıca `next-best-actions` ucu ADMIN için `findFirst({ role: 'DEALER' })` ile rastgele bir bayinin verisini döndürüyor (copilot ucunda bu yok, not olarak).
- **Sorun:** Aynı öneri iki farklı ekranda farklı sayılarla görünebilir; "en düşük puanlı QR" önerisi kullanıcıyı o QR'a götürmüyor.
- **Öneri:** Tek bir `getDealerSignals(dealerId)` servis fonksiyonu (Redis'te `dealer-signals:{id}` anahtarıyla) oluşturup hem dashboard hem Copilot bunu kullansın. NBA `href`'leri gerçek filtrelere işaret etsin (`/dealer/feedbacks?tab=qr&qrCodeId=…`) ve feedbacks sayfası bu parametreleri okusun.
- **Efor:** M

### B14 — ADMIN yolu ölü/yanıltıcı; modül kapatma sunucuda uygulanmıyor
- **Önem:** düşük · **Kategori:** mimari/güvenlik hijyeni
- **Kanıt:** `route.ts:22-31` (`?dealerId=xxx` mesajı, parametre okunmuyor; fonksiyon imzası `GET()` request almıyor); `lib/module-controls.ts:40` `copilot` modülü; `route.ts` içinde `assertModuleEnabled` yok.
- **Sorun:** Admin desteği için tasarlanmış görünen yol hiç çalışmıyor; admin "Copilot" modülünü kapatsa bile sayfa ve API URL ile erişilebilir. (IDOR yok: bayi kimliği daima oturumdan geliyor, doğrulandı.)
- **Öneri:** Ya ADMIN'i rol listesinden çıkarın ya da `request.nextUrl.searchParams.get('dealerId')` + bayi varlık kontrolü ile gerçekten destekleyin (admin destek görünümü için faydalı). `assertModuleEnabled('copilot')` çağrısını ekleyin ve sayfa tarafında modül kapalıysa bilgi kartı gösterin.
- **Efor:** S

### B15 — Yükleniyor ekranı gösterişli ve iskeletsiz; ölü kod
- **Önem:** düşük · **Kategori:** görsel/kod hijyeni
- **Kanıt:** `page.tsx:122-128` sonsuz dönen `Bot` + `InlineLoadingStatus` içindeki `Loader2` (`components/ui/inline-loading-status.tsx:38`); kullanılmayan importlar `Target`, `Users`, `Progress` (`page.tsx:16,21,30`); arayüzde kullanılmayan `period`, `positiveCount`, `repliedCount`, `actionItemsPending` alanları (`page.tsx:45,59,62,63`).
- **Sorun:** Robot kafanın 360° dönmesi "analiz ediyor" izlenimi verse de gerçekte AI çalışmıyor (bkz. B8); iki spinner görsel gürültü. Yükleme bitince sayfa düzeni sıçrar (CLS).
- **Öneri:** Gerçek yerleşimi taklit eden skeleton (4 stat kutusu + 2 sütun liste) kullanın; robot animasyonunu kaldırın. `actionItemsPending` ve `repliedCount` verisini UI'da anlamlı biçimde kullanın ("12 bekleyen aksiyon", "8/20 yanıtlandı") ya da yanıttan çıkarın.
- **Efor:** S

### B16 — Sorgu verimliliği (küçük)
- **Önem:** düşük · **Kategori:** performans
- **Kanıt:** `route.ts:75-78` aynı `baseWhere` için `count` + `aggregate(_count)` ayrı ayrı; `route.ts:194-218` kampanya başına ayrı `count` (en fazla 4, paralel); `page.tsx:77-94` 4 kart × 40 tick = ~160 state güncellemesi.
- **Sorun:** Önbellek ıskalarında ~15 sorgu; kritik değil ama tek bir `COUNT(*) FILTER (...)` SQL'iyle 5 sayım tek sorguya iner.
- **Öneri:** Toplam/negatif/yanıtlı/churn/ortalama sayımlarını trend sorgusunun yanına tek bir `$queryRaw` (FILTER) ile alın; kampanya eşleşmesini `GROUP BY utmCampaign` tek sorgusuyla yapın. `AnimatedNumber` için framer-motion `animate()` (RAF tabanlı, tek render döngüsü) kullanın.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Doğal dilde dönem özeti + tema kümeleri** (Medallia "Athena", Qualtrics XM Discover, Yelp "Review Insights"): "Bu hafta servis hızı şikâyetleri %40 arttı; 6 kayıt akşam vardiyasında" gibi gerekçeli, kanıt kayıtlarına linkli anlatı. `Feedback.themes` verisi mevcut, kullanılmıyor.
2. **Sayfada iş bitirme (inline triage)**: Google Business Profile ve Yelp for Business yorumu listeden doğrudan yanıtlatır; burada yanıt, telafi, aksiyon atama, olay açma hiçbir şey yapılamıyor.
3. **Dönem seçici ve önceki döneme göre delta**: Square Dashboard / Toast her KPI'da "geçen haftaya göre ±%" gösterir; burada pencere 7 güne sabit, kıyas yok.
4. **Lokasyon / QR / personel kırılımı**: Çok şubeli işletmede hangi QR veya şubenin kötüleştiğini gösteren sıralı liste (Medallia "hotspot"); `worstQrRow` hesaplanıyor ama gösterilmiyor.
5. **Yanıt SLA'sı ve yaşlanma göstergesi**: "24 saatten eski yanıtsız 5 negatif yorum" — Qualtrics "case management" ve Birdeye'ın temel kartı; burada yanıt oranı var, yanıt süresi yok.
6. **Proaktif uyarı aboneliği**: Kritik kayıt düştüğünde push/e-posta eşiği ayarı (Medallia alerts); projede push merkezi var, Copilot'a bağlı değil.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sahibi sabah panele girdiğinde 30 saniyede "dün/bu hafta ne oldu, ne yapmam gerekiyor" sorusunun cevabını alsın ve en kritik 3 işi bu ekrandan çıkmadan bitirebilsin. Copilot bir "pano" değil, **iş kuyruğu + anlatı** olmalı.

**Yerleşim (masaüstü, üstten alta):**
1. **Brifing şeridi** — tek kartta 2–3 cümlelik AI anlatısı (veya AI kapalıysa kural tabanlı cümleler), sağda dönem seçici (Bugün / 7 gün / 30 gün) ve "Son güncelleme 2 dk önce · Yenile". Anlatı içindeki her iddia tıklanabilir çip (ör. "6 servis şikâyeti" → filtrelenmiş liste).
2. **KPI şeridi** — 4–5 `StatTile`: Geri bildirim, Negatif oranı, Yanıt oranı + medyan yanıt süresi, Ort. puan, Kayıp riski altındaki müşteri. Her birinde delta ve mini sparkline; kanal kırılımı alt satırda (QR / Tüketim).
3. **"Şimdi yap" kuyruğu (ana sütun, ~2/3 genişlik)** — öncelik skoruna göre sıralı, yanıtsız kritik kayıtlar + birleştirilmiş/dedupe edilmiş AI önerileri tek listede. Satır eylemleri: Yanıtla (AI taslağıyla, yan panelde), Telafi gönder, Aksiyona çevir/Ata, Yoksay. İşlenen satır listeden yumuşakça çıkar ve sayaç azalır — tamamlama hissi.
4. **Sağ sütun (~1/3)** — Temalar (bu dönemin ilk 5 teması, yön oklarıyla), En kötüleşen QR/şube, Açık olaylar ve bekleyen aksiyonlar sayaçları, kampanya etkisi tek satır.
5. **Trend** — katlanabilir bölüm; toplam + negatif oranı çizgisi, bayi saat diliminde gün etiketleri.

**Mobil:** Brifing kartı + KPI yatay kaydırmalı çip şeridi + "Şimdi yap" kuyruğu kart yığını; satır eylemleri kaydırma (swipe) yerine her zaman görünen 2 birincil butonla; yan panel yerine tam ekran Sheet.

**Motion / 3D:** 3D gereksiz; bu bir verimlilik ekranı. Ölçülü framer-motion: kuyruktan çıkan satır için `layout` + `AnimatePresence` (150–200 ms), KPI değeri değiştiğinde yalnızca delta çipinde kısa vurgu; giriş stagger'ı tek seferlik ve 300 ms altında. Dönen robot ve sayaç animasyonu kaldırılmalı veya `useReducedMotion` ile anında değere düşmeli. Global `MotionConfig reducedMotion="user"` korunmalı.

**Veri/API değişiklikleri:**
- `GET /api/dealer/copilot?period=7d|30d|today` → bölümlere ayrılmış yanıt: `{ narrative, kpis{…, delta}, queue[], themes[], hotspots[], counters{}, generatedAt }`; her bölüm `Promise.allSettled` ile bağımsız, hata durumunda bölüm bazlı `error`.
- Ortak servis `lib/dealer-signals.ts` (Feedback + ConsumptionReview birleşik, tek metrik tanımı, bayi saat dilimi) — dashboard NBA, operations-brief ve Copilot bunu tüketsin; Redis anahtarı `dealer-signals:{dealerId}:{period}`; yanıt/telafi/aksiyon mutasyonlarında bu anahtar silinsin.
- Kuyruk eylemleri mevcut uçları kullanır: `POST /api/dealer/action-items`, `/api/dealer/feedbacks/[id]/remedy`, yanıt ucu; yeni uç gerekmez.
- Anlatı: `DealerWeeklyBrief` cron çıktısı haftalık için yeniden kullanılsın; günlük/7 günlük görünüm için cache'li (1 saat) tek LLM çağrısı, `ai_features` kapalıysa kural tabanlı şablon.
- Tüm metinler i18n anahtarı olarak dönsün; `sentiment`/`priority`/gün adları istemcide çevrilsin.

---

## Çakışmalar / birleştirme önerisi

Copilot'un sunduğu bilgilerin büyük kısmı başka bayi sayfalarında da üretiliyor:

| Sayfa / uç | Çakışan içerik | Kanıt |
|---|---|---|
| `/dealer` (dashboard) | Next-best-actions (aynı `buildNextBestActions`), sabah brifingi (24 saat özeti) | `app/dealer/dealer-dashboard-client.tsx` → `/api/dealer/next-best-actions`, `/api/dealer/morning-briefing` |
| `/dealer/operations-brief` | 7 günlük geri bildirim sayımları, aksiyon sayımları, günlük seri, Redis cache'li aynı desen | `app/api/dealer/operations-brief/route.ts:10-60` |
| `/dealer/weekly-brief` | Haftalık AI özeti (Copilot'un vaat ettiği "AI yönetici asistanı" içeriği) | `app/api/dealer/weekly-brief/route.ts:8-11` |
| `/dealer/action-items` | AI aksiyon önerileri (aynı `actionSuggestions` kaynağı, `createFromFeedbackSuggestions`) | `lib/action-items-ai.ts:30-70` |
| `/dealer/churn-risk`, `/dealer/incidents` | Churn ve olay sayaçları | `page.tsx:482-514` |
| `/dealer/campaigns/[id]/performance` | Kampanya↔geri bildirim eşleşmesi | `page.tsx:308-342` |

**Öneri:** `/dealer/copilot`, `/dealer/operations-brief` ve `/dealer/weekly-brief` tek bir **"Yönetici Brifingi"** sayfasında birleştirilmeli (sekme değil, dönem seçici: Bugün = sabah brifingi, 7 gün = operasyon özeti, Haftalık arşiv = weekly-brief kayıtları). Copilot adı korunacaksa yalnızca gerçek AI anlatısı ve iş kuyruğu bulunduğu sürece kullanılmalı. Dashboard'daki NBA bloğu bu sayfanın "Şimdi yap" kuyruğunun ilk 3 maddesini gösteren bir önizlemeye dönüşmeli. Kampanya sinyali kartı Copilot'tan çıkarılıp kampanya performans sayfasına taşınmalı. Birleştirme sonrası `operations-brief` ve `weekly-brief` rotaları yeni sayfaya yönlendirilmeli (`redirect` + sidebar girişlerinin kaldırılması, `lib/module-controls.ts` ve `lib/visibility-controls.ts` kayıtlarının tek anahtarda toplanması).

---

## Doğrulama (şüpheci inceleme)

Her iddia, ilgili kod yeniden okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Kritik sorun sıralaması NULLS FIRST nedeniyle bozuk: **DOĞRULANDI** (önem: orta-yüksek)

- `app/api/dealer/copilot-summary/route.ts:61-64`: `orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }]`, `take: 50`. `nulls: 'last'` verilmemiş. Prisma `package.json:37` sürümünde `^5.7.1` ve bu sürüm NULLS ifadesi eklemez. Postgres'te `DESC` için varsayılan `NULLS FIRST`.
- `prisma/schema.prisma:786`: `urgency Float?`. Null değerin kaynağı yalnızca "henüz analiz edilmedi" değil:
  - `app/api/feedbacks/route.ts:466-475`: LLM yoksa (`local-fallback`) urgency hiç yazılmaz, kalıcı olarak null kalır.
  - `app/api/feedbacks/route.ts:441`: `autoAnalyze` kapalıysa analiz hiç çalışmaz.
  - `app/api/feedbacks/route.ts:484` ve `lib/inngest/feedback-analyze-pipeline.ts:72`: `analysis.urgency || null` ifadesi `0` değerini de null'a çeviriyor. Bu yüzden "aciliyeti sıfır" diye analiz edilmiş kayıtlar da en üste çıkıyor.
- `route.ts:99-101`: önce metni 10 karakterden uzun olanlar süzülüyor, sonra `.slice(0, 6)` ile kesiliyor. İstemci yeniden sıralamıyor (`app/dealer/copilot/page.tsx:370`).
- **Yeniden üretim:** Bayinin son 7 günde aciliyeti `0.92` olan 1 yıldızlı bir şikâyeti var. Aynı dönemde AI kuyruğunda bekleyen ya da fallback ile işlenmiş, metni 10 karakterden uzun ve puanı 3 veya altında en az 6 geri bildirim daha var. Bu 6 kayıt null urgency ile listenin başına geçiyor. Gerçek kriz kaydı "Kritik sorunlar" kartında görünmüyor, "Yüksek aciliyet" rozeti de hiç çıkmıyor (`page.tsx:388`).
- **Düzeltme yaklaşımı:** `orderBy: [{ urgency: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]` kullanılmalı. Yazma tarafında `|| null` yerine `?? null` olmalı. Ürün açısından analizi bekleyen kayıtlar ayrı bir "AI bekliyor" alt grubunda gösterilmeli. Böylece kaybolmazlar ama analiz edilmiş acil kayıtların önüne de geçmezler.

### 2. Kampanya atıf metriği gönderim öncesi geri bildirimleri sayıyor: **DOĞRULANDI** (önem: orta)

- `route.ts:191`: `sentAt` seçiliyor. `route.ts:211-218` filtresi ise `createdAt: { gte: thirtyDaysAgo }`, yani `c.sentAt` hiç kullanılmıyor. 20 gün önce gönderilen bir kampanyaya, gönderimden 10 gün önce gelmiş UTM eşleşmeli geri bildirimler de atfediliyor.
- `route.ts:196-201,216`: başlıktan türetilen token `contains` + `insensitive` ile eşleniyor ve 20 karakterle sınırlı. Örnek: "Yaz" başlıklı kampanyanın token'ı `yaz` olur ve "Yaz Kampanyası 2" kampanyasının `utm_campaign=yazkampanyasi2` değerini de sayar. Aynı geri bildirim birden fazla kampanyada sayılabilir.
- **Hafifletici etken:** Arayüz bunu açıkça "gevşek UTM eşlemesi" olarak etiketliyor (`messages/tr.json:1279`). Performans ucu da aynı uyarıyı veriyor (`app/api/dealer/campaigns/[id]/performance/route.ts:85`). Kampanya gönderiminin UTM'li link ürettiğine dair kod da bulunamadı. `utm_campaign` yalnızca QR public ucunda okunuyor (`app/api/qr-codes/public/[code]/route.ts:40`). Bu nedenle sinyal zaten seyrek. Yine de "Eşleşen geri bildirim: N" sayısı sistematik olarak şişkin ve iddia gerçek.
- **Düzeltme yaklaşımı:** Filtre `createdAt: { gte: c.sentAt ?? thirtyDaysAgo }` olmalı. Uzun vadede `Campaign` için deterministik bir `utmKey` alanı (slug + kısa id) tutulmalı, gönderilen linklere otomatik eklenmeli ve eşleşme `equals` ile yapılmalı.

### 3. Copilot KPI'ları tüketim yorumlarını dışarıda bırakıyor: **DOĞRULANDI** (önem: orta; güvenlik değil, veri kapsamı hatası)

- `route.ts:43-97`: bütün KPI'lar (toplam, negatif, yanıt oranı, ortalama puan, churn, kritik sorunlar) ve `route.ts:157-171` günlük trend yalnızca `Feedback` + `QRCode.dealerId` üzerinden hesaplanıyor.
- `prisma/schema.prisma:1602-1619`: `ConsumptionReview` modelinde `rating`, `text`, `sentiment`, `churnRisk` ve `dealerRepliedAt` var. Bayiye bağlantısı `Consumption.dealerId` üzerinden kuruluyor (`schema.prisma:1578`).
- `app/dealer/feedbacks/page.tsx:168`: bayi geri bildirim sayfası varsayılan olarak `consumption` sekmesiyle açılıyor. Yani ürün tüketim yorumlarını birincil geri bildirim kanalı olarak sunuyor. Copilot ise "Toplam {count} negatif geri bildirim" diyerek (`messages/tr.json:1283`) bu kanalı dışarıda bırakıyor.
- **Yeniden üretim:** Bayi yalnızca kart/tüketim akışını kullanıyor, QR geri bildirimi yok. Son 7 günde üç adet 1 yıldızlı ve olumsuz tüketim yorumu alıyor. Copilot ekranında toplam 0, negatif 0, yanıt oranı %0 görünüyor ve "Kritik sorunlar" kartı "sorun yok" boş durumunu gösteriyor (`page.tsx:362-367`). Bayi yanlış bir güven duygusuna kapılıyor.
- **Düzeltme yaklaşımı:** Bu raporda zaten önerilen `lib/dealer-signals.ts` birleşik servisi kurulmalı. Feedback ve ConsumptionReview tek bir metrik tanımıyla birleştirilmeli, her kayıt `source: 'qr' | 'consumption'` etiketi taşımalı. Arayüzde KPI'lar kanal kırılımıyla gösterilmeli. Kritik listede tüketim yorumlarının aciliyet alanı olmadığı için şu sıralama kullanılabilir: önce `churnRisk`, sonra `rating asc`.


---

## Uygulama (Dalga 2)

**Karar uygulandı: birleştir.** `/dealer/copilot` artık `/dealer` (Bugün) adresine 308 ile yönlendiren bir emekli koçanı; sorgu korunuyor (`lib/dealer-today/legacy-redirect.ts`). Copilot'un işlevi Bugün'de şu bölümlere dağıldı: **sıradaki adımlar** (deterministik next-best-action), **yanıt bekleyenler** (kritik kayıtlar), **yapılacaklar** (AI önerileri gerçekten ekleniyor), **operasyon özeti** ve **haftalık rapor**. AI anlatısı haftalık raporda, istekle üretiliyor. Silinenler: `app/api/dealer/copilot-summary`, `lib/next-best-action.ts`, `components/dealer/copilot-daily-trend-chart.tsx`, `app/dealer/copilot/layout.tsx`.

### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | ÇALIŞIYOR | Bugün metadata'sı; yanıltıcı "ön hat akışları" açıklaması gitti. |
| 2 | ÇALIŞIYOR | `defineRoute` + kiracı kapsamı. |
| 3 | ÇALIŞIYOR | `readEnvelope` önce `res.ok`'u denetliyor; kodlu hata `QueryState`'e gidiyor. |
| 4 | ÇALIŞIYOR | Gerçek yerleşimi taklit eden statik iskelet. Dönen robot ve çift spinner yok. |
| 5 | ÇALIŞIYOR | `QueryState`: "Tekrar dene" var; 401/403 için yetkisiz görünümü, ağ yokken çevrimdışı görünümü. |
| 6 | ÇALIŞIYOR | Hero'da "AI destekli" iddiası yok. |
| 7 | ÇALIŞIYOR | Gelen kutusu bağlantıları (metrik kutusu, yanıt bekleyenler). |
| 8 | ÇALIŞIYOR | "Tüm işler". |
| 9 | KALDIRILDI | Sabit TR "AI Sohbet" butonu kaldırıldı. Asistan kabuğun ⌘J kısayolunda (navigasyon sahibi). |
| 10 | ÇALIŞIYOR | QR + tüketim yorumu birlikte. |
| 11 | ÇALIŞIYOR | Olumsuz = ≤2★; nötr ayrı gösteriliyor. |
| 12 | ÇALIŞIYOR | Yanıt oranı iki kanalı birlikte sayıyor. |
| 13 | ÇALIŞIYOR | Veri yoksa "—" ve "Veri yok" (0,0 / 5 yok). |
| 14 | ÇALIŞIYOR | `useNumberTicker` hareket politikasına uyar. |
| 15 | ÇALIŞIYOR | Kodlu öneriler, gerçek hedefler; zayıf QR artık kullanılıyor. |
| 16 | ÇALIŞIYOR | Günlük akış İstanbul gününe göre, `Intl` etiketli, sr tablosu var. |
| 17 | ÇALIŞIYOR | Grafik kütüphanesi yok (CSS çubuk); ilk boyamada hazır. |
| 18 | KALDIRILDI | Kampanya↔geri bildirim sinyali kampanya performans sayfasının işi (B5'teki atıf hatası da onunla birlikte burada yok). |
| 19 | KALDIRILDI | #18 ile birlikte. |
| 20 | ÇALIŞIYOR | "Yanıt bekleyenler" deterministik sıralanıyor: olumsuz önce, en eski üstte. `urgency NULLS FIRST` sorunu yapısal olarak yok; yanıtlananlar listeden düşüyor. |
| 21 | ÇALIŞIYOR | Yıldızlar `aria-label` ile. |
| 22 | KALDIRILDI | Ham İngilizce sentiment rozeti kaldırıldı. |
| 23 | KALDIRILDI | Aciliyet rozeti kaldırıldı. Yerine deterministik "24 saati geçti" SLA rozeti geldi. |
| 24 | ÇALIŞIYOR | Göreli zaman. |
| 25 | ÇALIŞIYOR | Her zaman görünen "Yanıtla" (≥44px dokunma hedefi). Kaydın Gelen Kutusu çekmecesine gider (`/dealer/inbox?id=qr-…`). |
| 26 | ÇALIŞIYOR | Boş durum. |
| 27 | ÇALIŞIYOR | Yinelenen ve takipteki (açık / bitmiş / yoksayılmış) öneriler ayıklanıyor. |
| 28 | ÇALIŞIYOR | Öncelik Yüksek/Orta/Düşük olarak yerelleştirildi. |
| 29 | ÇALIŞIYOR | "Listeye ekle" gerçek `ActionItem` açıyor; 409 → "zaten listende". "Yoksay" iptal kaydı bırakıyor. |
| 30 | ÇALIŞIYOR | `<a><button>` iç içeliği yok. |
| 31 | ÇALIŞIYOR | Operasyon özeti sayacı + "açık vaka" önerisi (en yüksek önemle). |
| 32 | KALDIRILDI | Churn sayacı müşteri değil kayıt sayıyordu. Müşteriler → Risk yüzeyinin işi. |
| 33 | ÇALIŞIYOR | 30 sn Redis. "Son güncelleme" ve "Yenile" (önbelleği atlar) var; yazma sonrası taze veri. |
| 34 | ÇALIŞIYOR | ADMIN `?dealerId=` ile salt okunur (`resolveDealerScope`); testli. |
| 35 | KALDIRILDI | Rota emekli. `copilot` modül anahtarı artık tüketicisiz (katalog sahibine bildirildi). |
| 36 | ÇALIŞIYOR | Mobil tek sütun; eylemler her zaman görünür. |
| 37 | ÇALIŞIYOR | Yenile + son güncelleme. |
| 38 | ÇALIŞIYOR (kapsamlı) | Önceki 7 güne göre delta var. Serbest dönem seçici Analitik'te. |
| 39 | ÇALIŞIYOR | Tüketim yorumu kapsamda. |
| 40 | ÇALIŞIYOR | Dürüst: "Copilot / AI asistan" iddiası yok. AI yalnız haftalık raporda, "yalnız bu sayıları yorumlar" etiketiyle ve istek üzerine çalışıyor. |

### Kapanan bulgular (16/16)
- **B1:** Sıralama urgency'ye dayanmıyor.
- **B2:** Ekle gerçek kayıt açıyor.
- **B3:** İki kanal birlikte.
- **B4:** Bağlantı her zaman görünür ve kaydın Gelen Kutusu çekmecesini açar; yanıt / telafi / vaka orada.
- **B5:** Kampanya sinyali kaldırıldı.
- **B6:** Tek pencere, İstanbul saati.
- **B7:** Metinler istemcide TR/EN.
- **B8:** Dürüst adlandırma ve gerçek AI anlatısı.
- **B9:** `QueryState`.
- **B10:** "—".
- **B11:** ≤2★ tanımı; churn kaldırıldı.
- **B12:** Erişilebilirlik.
- **B13:** Tek kaynak, `buildNextActions` testli.
- **B14:** Kapsam / ADMIN.
- **B15:** İskelet.
- **B16:** `FILTER`'lı tek sorgular.

### Kalanlar
- Satır içi yanıt / telafi / atama çekmecesi Gelen Kutusu yüzeyinde.
- Atama ve son tarih hızlı seçimi aksiyon sayfasında.
- Proaktif uyarı aboneliği Otomasyon'da.
