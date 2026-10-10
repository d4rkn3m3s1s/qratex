# /dealer/action-items

**Amaç:** İşletmenin (bayi) geri bildirimlerden ve AI analizinden türeyen "yapılacak iş" önerilerini tek listede görmesi, sahiplendirmesi ve tamamlaması — Qratex'in "AI Action Engine" (öneri → sahip atama → takip) döngüsünün kapanış ekranı.

**Genel puan: 4/10** · **Karar: yeniden tasarla** (veri modeli ve API korunabilir; liste-yan-etkili AI üretimi, eksik iş akışı ve dağınık "aksiyon" kavramı yeniden ele alınmalı)

> Kapsam: `app/dealer/action-items/page.tsx` (289 satır), `app/dealer/action-items/layout.tsx`, `app/dealer/layout.tsx`, `app/api/dealer/action-items/route.ts`, `app/api/dealer/action-items/[id]/route.ts`, `lib/action-items-ai.ts`, `lib/ai-cost-guard.ts`, `lib/api-auth.ts`, `lib/api-http.ts`, `lib/app-locale.tsx`, `prisma/schema.prisma` (ActionItem, Feedback.actionSuggestions), `messages/tr.json` + `messages/en.json` (`dealerActionItems.*`), ve bu tabloyu besleyen/tüketen diğer yerler (`app/dealer/ai-insights/ai-insights-client.tsx`, `app/api/admin/agents/council-to-actions/route.ts`, `lib/team-autotask.ts`, `components/dashboard/sidebar.tsx`, `lib/module-gate.ts`). Kod çalıştırılmadı; tüm tespitler okunarak yapıldı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme, arama, durum filtresi ve "Tamamla" çalışıyor; ancak API'nin desteklediği atama/son tarih/durum değişikliği/manuel oluşturma UI'da yok ve liste GET'i her çağrıda yeni AI görevi üretip "Tamamla"yı anlamsızlaştırıyor. |
| UX | 3/10 | Tek eylemli düz bir liste: sıralama, öncelik/kaynak filtresi, gecikme vurgusu, özet sayaç, detay görünümü, geri alma yok; hata durumu "henüz aksiyon yok" gibi görünüyor ve kullanıcıya "sidebar verileri" gibi iç jargon gösteriliyor. |
| Görsel | 5/10 | Panelin genel kart diliyle tutarlı ve temiz; fakat görsel hiyerarşi zayıf (tüm kartlar eşit ağırlıkta, öncelik yalnızca küçük bir rozet), öncelik renkleri koyu temada kontrast için ayarlanmamış. |
| Mimari | 3/10 | GET isteği yan etkili (DB yazma + LLM çağrısı), yarış koşuluna açık, index tabanlı kırılgan tekilleştirme, modül kapısı yok, `assignedToId` doğrulanmıyor. |
| Performans | 3/10 | Her liste isteği; bayinin tüm zamanlardaki önerili geri bildirimlerini çekip her biri için ayrı `count` sorgusu (N+1) atıyor, açık iş < 3 ise zaman aşımsız LLM çağrısı bekliyor. |
| Erişilebilirlik + mobil | 5/10 | Mobilde dikey yığılma düzgün; ancak ikon-only sayfalama butonlarında `aria-label` yok, arama alanı yalnızca placeholder ile etiketli, giriş animasyonu `prefers-reduced-motion`'a bakmıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Başlık + açıklama kartı (hero) | ÇALIŞIYOR | page.tsx:156-164 | i18n anahtarları `dealerActionItems.title/description` iki dilde mevcut. |
| 2 | Sayfa metadata'sı (sekme başlığı) | KISMİ | action-items/layout.tsx:4-6; messages/tr.json `layoutMetadata.dealerActionItems` = "Aksiyonlar" | Sekme "Aksiyonlar", sayfa başlığı "Aksiyon Öğeleri" — adlandırma tutarsız. |
| 3 | Liste kartı başlığı | ÇALIŞIYOR | page.tsx:169 | — |
| 4 | Metin araması (300 ms debounce) | KISMİ | page.tsx:60-63, 171-179; route.ts:49-56, 61-68 | Çalışıyor; ancak placeholder "Öneri metninde ara" derken API geri bildirim metninde de arıyor; görünür/aria etiketi yok. |
| 5 | `?q=` derin bağlantı senkronu | KISMİ | page.tsx:103-112; ai-insights-client.tsx:1835 | İlk render `q`'suz bir istek atıp sonra iptal ediyor (sunucuda yan etkili GET iki kez koşar); arama URL'ye geri yazılmıyor, paylaşılabilir/geri tuşu uyumlu değil. |
| 6 | Durum filtresi (Select) | KISMİ | page.tsx:180-199 | "Atandı" ve "İşlemde" seçenekleri hiçbir UI akışında üretilmiyor (bkz. Bulgu 7) → pratikte hep boş. |
| 7 | Sunucu tarafı sayfalama (20'li) | KISMİ | page.tsx:269-284; route.ts:40-42, 100 | Son sayfadaki son öğe tamamlanınca sayfa aralık dışına düşüyor ("Sayfa 3 / 2" + boş durum), otomatik geri çekilme yok. |
| 8 | Yükleniyor durumu | ÇALIŞIYOR | page.tsx:204-205 | Her yeniden yüklemede tüm liste spinner'a dönüyor (Tamamla sonrası dahil) — titreşimli. |
| 9 | Boş durum | KISMİ | page.tsx:206-211; tr.json `emptyHint` | CTA yok; metin "AI sidebar verilerini analiz eder" gibi iç jargon içeriyor; hata durumunu da bu ekran gösteriyor. |
| 10 | Hata durumu | BOZUK | page.tsx:76-83 | `res.ok` kontrol edilmiyor; 401/403/500/503 yanıtında `data.items` yok → sessizce boş durum gösterilir, toast yalnızca ağ istisnasında. Ayrı hata/yeniden dene UI'ı yok. |
| 11 | Aksiyon metni | KISMİ | page.tsx:223; council-to-actions/route.ts:57 | Agent Council kayıtları `\n\n` içeriyor; `whitespace-pre-line` olmadığı için satırlar birleşiyor ve "[Agent Council]" ön eki ham görünüyor. |
| 12 | Bağlı geri bildirim özeti | KISMİ | page.tsx:224-230; route.ts:87 | Tek satır kırpılmış, geri bildirime bağlantı yok; soft-delete edilmiş geri bildirim (`deletedAt`) filtrelenmeden gösterilir. |
| 13 | Kaynak etiketi | KISMİ | page.tsx:231-233; schema.prisma:1312 | Yalnızca `ai_aggregate` etiketleniyor; `agent_council` ve `incident` kaynakları etiketsiz; metin "Sistem önerisi (sidebar verilerinden AI analizi)" kullanıcıya iç terim sızdırıyor. |
| 14 | Öncelik rozeti | ÇALIŞIYOR | page.tsx:148-152, 235-237 | Koyu tema için `dark:` varyantı yok; `text-red-600` / `bg-red-500/20` koyu zeminde düşük kontrast (ölçülmedi). |
| 15 | Durum rozeti | ÇALIŞIYOR | page.tsx:238 | — |
| 16 | Atanan kişi gösterimi | KISMİ | page.tsx:239-244 | Yalnızca gösterim; bu sayfadan atama yapılamıyor; atanan STAFF kullanıcısı bunu hiçbir yerde göremiyor (Bulgu 6). |
| 17 | Son tarih gösterimi | KISMİ | page.tsx:245-250 | Gecikme (overdue) / yaklaşan vurgusu yok; tamamlanma tarihi (`completedAt`) hiç gösterilmiyor. |
| 18 | "Tamamla" butonu | KISMİ | page.tsx:114-134, 253-263; [id]/route.ts:10-15 | Çalışıyor; ama yükleniyor/disabled durumu yok (çift tık = 2 PATCH + 2 yan etkili GET), geri alma yok, `completedAt` istemci saatinden geliyor, tamamlamak yeni AI görevi tetikleyebiliyor (Bulgu 1). |
| 19 | Liste giriş animasyonu (`Motion.li`) | KISMİ | page.tsx:215-219 | Her yeniden yüklemede tüm öğeler yeniden animasyonlanıyor; azaltılmış hareket desteği yok; stagger/layout yok. |
| 20 | Toast bildirimleri | ÇALIŞIYOR | page.tsx:87, 125, 129, 132 | Sunucu hata metni (TR sabit) EN arayüzde Türkçe görünür (route.ts:32-35, 91). |
| 21 | GET'te otomatik AI öneri üretimi | BOZUK | route.ts:71-78; action-items-ai.ts:212-218, 78-207 | Açık iş < 3 ise her liste isteğinde LLM çağrısı + 2-5 yeni kayıt; "bitmeyen iş" döngüsü, yarış, maliyet (Bulgu 1-3). |
| 22 | Geri bildirim önerilerinden otomatik oluşturma | KISMİ | action-items-ai.ts:34-73 | Çalışıyor ama sınırsız sorgu + N+1, tekilleştirme yok, index tabanlı eşleme kırılgan (Bulgu 2, 8). |
| 23 | Sahiplik (DEALER yalnız kendi kayıtları) | ÇALIŞIYOR | route.ts:58-59; [id]/route.ts:34-36, 74-77 | GET `dealerId` ile filtreli; PATCH hem ön kontrol hem `updateMany where dealerId` ile korunuyor. |
| 24 | `assignedToId` doğrulaması | BOZUK | [id]/route.ts:12, 51; route.ts:27, 184; schema.prisma:1319 | Herhangi bir User id'si atanabiliyor, GET o kullanıcının adı + e-postasını döndürüyor (Bulgu 4). |
| 25 | Modül / menü görünürlük kapısı | EKSİK | lib/module-controls.ts:43; lib/visibility-controls.ts:60; route.ts (assert yok) | Admin `action_items` modülünü kapatsa da API ve sayfa çalışmaya devam eder. |
| 26 | Navigasyonda erişilebilirlik | KISMİ | components/dashboard/sidebar.tsx:230-232 | Menüden bilinçli çıkarılmış; yalnız copilot/roi/benchmark/operations-brief/discover/ai-insights bağlantılarıyla ulaşılıyor — yarı-yetim sayfa. |
| 27 | Durum değiştirme (İşlemde / İptal / Yeniden aç) | EKSİK | [id]/route.ts:11 destekliyor; page.tsx yalnız `'done'` gönderiyor (258) | API hazır, UI yok. |
| 28 | Atama ve son tarih düzenleme | EKSİK | [id]/route.ts:12-13; ai-insights-client.tsx:2505-2540 (atama formu orada var) | Atama yalnız ai-insights'ta oluşturma anında; burada düzenlenemiyor. |
| 29 | Manuel aksiyon oluşturma | EKSİK | route.ts:115-198 (DEALER için feedbackId'siz POST destekli) | Sayfada "Yeni aksiyon" yok. |
| 30 | Sıralama (öncelik / son tarih / etki) | EKSİK | route.ts:85 (`createdAt desc` sabit) | En acil iş en üstte değil. |
| 31 | Öncelik / kaynak / atanan / tarih filtreleri | EKSİK | page.tsx:180-199 (yalnız durum) | — |
| 32 | Özet sayaçlar (açık, geciken, bu hafta tamamlanan, tamamlama oranı) | EKSİK | page.tsx:154-287 | Veri `lib/kpis/action-completion.ts`'te zaten hesaplanıyor, burada kullanılmıyor. |
| 33 | Detay paneli (açıklama, geçmiş, yorum, kanıt geri bildirimler) | EKSİK | — | — |
| 34 | Toplu işlem (çoklu seçim → tamamla/iptal/ata) | EKSİK | — | — |
| 35 | Etki skoru (`impactScore`) gösterimi | EKSİK | schema.prisma:1313; council-to-actions/route.ts:63 | Veri var (Agent Council dolduruyor), UI göstermiyor. |
| 36 | Klavye/ekran okuyucu etiketleri | KISMİ | page.tsx:171-179, 187-189, 271-282 | Sayfalama ikon butonları ve arama alanı etiketsiz; Select'te `aria-label` yok. |
| 37 | Mobil yerleşim | ÇALIŞIYOR | page.tsx:168-170, 221 | `flex-col sm:flex-row`, `flex-wrap` ile düzgün yığılıyor. |
| 38 | Personel (STAFF) için "bana atananlar" görünümü | EKSİK | api-auth.ts:15; route.ts:32 (`['DEALER','ADMIN']`); app/staff altında actionItem kullanımı yok | Atama döngüsü kapanmıyor. |
| 39 | İstemci tarafı yarış koruması (AbortController) | ÇALIŞIYOR | page.tsx:58, 65-101 | Eski istek iptal ediliyor, eski yanıt state'i ezmiyor. Ama sunucu tarafındaki yan etkiyi iptal etmez. |

**Sayım:** ÇALIŞIYOR 9 · KISMİ 16 · BOZUK 3 · SAHTE 0 · EKSİK 11 (toplam 39)

---

## Bulgular

### 1. [KRİTİK · Ürün mantığı / Mimari] Liste GET'i yan etkili: "Tamamla" yeni AI görevi doğuruyor — bitmeyen iş döngüsü
- **Kanıt:** `app/api/dealer/action-items/route.ts:71-78` her DEALER GET'inde `runActionItemsAutoTrigger` çağırıyor; `lib/action-items-ai.ts:214-217` açık (`pending/assigned/in_progress`) iş sayısı 3'ün altındaysa `generateFromDealerContext` çalıştırıyor; `lib/action-items-ai.ts:183` toplam iş ≥ 2 ise 2, değilse 5 yeni kayıt yaratıyor. `page.tsx:126` tamamlamadan sonra `loadItems()` → yeniden GET.
- **Sorun:** Bayi açık işlerini 2'ye indirdiği an, sayfayı her açışında/sayfa değiştirişinde/arama yazışında LLM yeni 2 genel öneri ("QR kodları müşterilere tanıt" vb.) üretip listeye ekliyor. Kullanıcı listeyi hiçbir zaman temizleyemiyor; tamamlamak cezalandırılıyor. Ayrıca bu öneriler metin tekilleştirmesinden geçmiyor (POST'taki 409 kontrolü `route.ts:162-175` yalnız manuel POST'ta var), aynı öneri tekrar tekrar eklenebilir. Bu, ROI/benchmark/stats ekranlarındaki "aksiyon tamamlama oranı" KPI'ını da (`app/api/dealer/roi/route.ts:62-68`, `lib/kpis/action-completion.ts`) sistematik olarak bozar: payda yapay biçimde şişer.
- **Profesyonel öneri:** Öneri üretimini okuma yolundan tamamen ayırın. (a) Üretimi olay-güdümlü yapın: geri bildirim analizi bittiğinde (`lib/inngest/feedback-analyze-pipeline.ts`) ve günlük/haftalık bir cron'da bayi başına en fazla N öneri. (b) AI kaynaklı öğeleri doğrudan "iş" olarak değil, ayrı bir **"Öneriler" (inbox) durumu** olarak tutun (`status: 'suggested'`); kullanıcı "Kabul et / Reddet / Ertele" ile işe dönüştürsün — reddedilen öneri `dismissedReason` ile saklanıp prompt'a negatif örnek olarak geri beslensin. (c) Benzer metinler için normalize edilmiş hash (`suggestionKey`) + `@@unique([dealerId, suggestionKey, openFlag])` benzeri kısıt veya en azından upsert. (d) KPI'lar yalnız kabul edilmiş işler üzerinden hesaplansın.
- **Efor:** L

### 2. [YÜKSEK · Performans] Her liste isteğinde sınırsız sorgu + N+1 + zaman aşımsız LLM çağrısı
- **Kanıt:** `lib/action-items-ai.ts:35-45` bayinin tüm zamanlardaki `actionSuggestions` dolu geri bildirimlerini (limit yok) çekiyor; `:48-56` her geri bildirim için ayrı `prisma.actionItem.count` (N+1); `:60` her öneri için ayrı `create` (sıralı). `:87-113` 7 paralel sorgu (30 günlük tüm geri bildirimler `text` dahil — `text` hiç kullanılmıyor, `:95`) **maliyet kontrolünden önce** çalışıyor (`:139`). `:146-166` OpenAI SDK çağrısında `timeout`/`maxRetries` yok (SDK varsayılanı uzun bekleme + yeniden deneme). Model geri dönüşü `gpt-4-turbo-preview` (`:28`).
- **Sorun:** 2.000 analizli geri bildirimi olan bir bayide her sayfa/filtre/arama değişikliği ~2.000 ek sorgu demek; Neon pooler bağlantı havuzunu (memory: `connection_limit=5`) tüketir. Açık iş < 3 olduğunda listenin görünmesi LLM gecikmesine kilitlenir. Ayrıca bu yol, bayinin günlük paylaşılan AI token bütçesini (`lib/ai-cost-guard.ts:8-11`, varsayılan 100k) tüketip daha değerli AI özelliklerini (analiz, sohbet) aç bırakabilir.
- **Profesyonel öneri:** Bulgu 1'deki ayrıştırmayla bu yol GET'ten çıkar. Kalan senkronizasyon gerekirse: `ActionItem`'a `suggestionIndex` ekleyip `@@unique([feedbackId, suggestionIndex])` ile `createMany({ skipDuplicates: true })` tek sorguda yapılsın; işlenmiş geri bildirimler `Feedback.actionsSyncedAt` ile işaretlensin, yalnız `actionsSyncedAt IS NULL` olanlar sayfalanarak (`take: 200`) işlensin. LLM çağrısına `AbortSignal.timeout(8000)` + `maxRetries: 0`; maliyet kontrolü bağlam toplamadan önce; kullanılmayan `text` seçimi kaldırılsın.
- **Efor:** M

### 3. [YÜKSEK · Veri bütünlüğü] Eşzamanlı GET'lerde yarış → mükerrer aksiyon ve mükerrer LLM çağrısı
- **Kanıt:** `app/dealer/ai-insights/ai-insights-client.tsx:418-424` aynı anda **3 paralel** GET atıyor (`status=pending|assigned|in_progress`), her biri `runActionItemsAutoTrigger`'ı koşuyor. `lib/action-items-ai.ts:52-60` "say, sonra oluştur" atomik değil; `:214-217` açık iş sayımı da atomik değil. `page.tsx:103-112` `?q=` ile gelişte ilk render'da bir GET, sonra ikinci GET (istemci iptali sunucu tarafındaki yazımı durdurmaz). `page.tsx:254-258` "Tamamla" butonu kilitlenmiyor.
- **Sorun:** Aynı geri bildirim önerisi 2-3 kez satıra dönüşebilir; açık iş < 3 durumunda 3 eşzamanlı LLM çağrısı ve 6-15 yeni kayıt oluşabilir. Şemada bunu engelleyecek benzersizlik kısıtı yok (`prisma/schema.prisma:1321-1323` yalnız düz index).
- **Profesyonel öneri:** Bulgu 1-2 çözümü (yan etkiyi GET'ten çıkarma + benzersiz kısıt + `skipDuplicates`). Geçiş döneminde bayi başına Redis kilidi (`SET action-autotrigger:{dealerId} NX EX 60`, projede Upstash zaten var) ile tek uçuş garantisi. ai-insights'taki 3 istek tek isteğe indirilsin (`status=open` gibi çoklu durum parametresi ya da yalnız `suggestionText` döndüren hafif bir `/api/dealer/action-items/keys` ucu).
- **Efor:** M

### 4. [YÜKSEK · Güvenlik / IDOR] `assignedToId` doğrulanmıyor → herhangi bir kullanıcının ad + e-postası okunabilir
- **Kanıt:** `app/api/dealer/action-items/[id]/route.ts:12` `assignedToId: z.string().optional().nullable()`, `:51` doğrudan yazılıyor; POST'ta aynısı `route.ts:27, 184`. `prisma/schema.prisma:1319` `assignedTo` → `User` (tüm roller). `route.ts:88` GET yanıtı `assignedTo: { id, name, email }` içeriyor.
- **Sorun:** Bayi kendi aksiyonuna başka bir bayinin, müşterinin veya admin'in User id'sini atayıp listeyi çektiğinde o kişinin e-postasını görür (kişisel veri ifşası, KVKK açısından da sorun). Ayrıca var olmayan id FK hatasıyla genel 500 döndürür. İstismar için hedef cuid'in bilinmesi gerekiyor; id'lerin hangi herkese açık yüzeylerde sızdığı **doğrulanmadı**, ama yetki modeli id'nin gizliliğine dayanmamalı.
- **Profesyonel öneri:** POST ve PATCH'te `assignedToId` verilmişse `prisma.dealerStaff.findFirst({ where: { dealerId, userId: assignedToId, isActive: true } })` (veya bayinin kendisi) kontrolü; değilse 400/403. Atama değişikliği `ActionItemEvent` (bkz. Bulgu 10) ile denetim kaydına yazılsın. `assignedTo` seçiminden `email` yalnız gerekli olduğunda döndürülsün.
- **Efor:** S

### 5. [YÜKSEK · İşlevsellik] Hata yanıtları sessizce "boş liste" olarak gösteriliyor
- **Kanıt:** `page.tsx:76-83` — `res.ok` kontrolü yok; `data.items` yoksa hiçbir şey yapılmıyor, `toast` yalnız `catch`'te (`:84-87`). İlk yüklemede `items=[]` → `:206-211` "Henüz aksiyon öğesi yok" + "Sayfa her açıldığında AI … öneri üretir" metni.
- **Sorun:** Oturum süresi dolması (401), token-replay (403, `lib/api-auth.ts:67-75`), DB kesintisi (503) veya 500'de kullanıcı yanlış bilgi alır: işleri yok sanır. Sonraki yüklemelerde ise eski liste kalır ve güncel olmadığını bilmez.
- **Profesyonel öneri:** Veri katmanını `useSWR`/React Query'ye taşıyın (`{ data, error, isLoading, mutate }`); `!res.ok` → typed error; ayrı hata kartı ("Aksiyonlar yüklenemedi · Yeniden dene") ve 401'de oturum yenileme yönlendirmesi. Boş durum yalnız `!error && total === 0` iken.
- **Efor:** S

### 6. [YÜKSEK · Ürün akışı] Atama döngüsü kapanmıyor: atanan personel işini göremiyor
- **Kanıt:** Atama yalnız `ai-insights-client.tsx:2505-2540`'ta personel listesinden (`/api/dealer/staff`) yapılıyor; API yalnız `['DEALER','ADMIN']` kabul ediyor (`route.ts:32`, `[id]/route.ts:22`); `app/staff/**` ve `app/api/staff/**` altında `actionItem` kullanımı yok (grep). Bayi panelinde de atama değiştirilemiyor (`page.tsx` yalnız `status:'done'` gönderiyor).
- **Sorun:** "Öneri → sahip atama → takip" vaadinin ortası boş: personel bildirim almıyor, kendi listesini görmüyor, tamamlayamıyor. Atama yalnızca bir etiket.
- **Profesyonel öneri:** (a) Bayi sayfasında satır içi "Sahip" seçici (personel combobox) ve "Son tarih" tarih seçici; (b) `/staff` panelinde "Bana atananlar" kartı + `GET /api/staff/action-items` (STAFF rolü, `assignedToId = session.user.id` ve `dealerStaff.isActive`), personel durum değiştirebilsin (in_progress/done) ama silemesin; (c) atamada push/e-posta bildirimi (mevcut push merkezi ve `RealtimeNotifications` altyapısı ile).
- **Efor:** L

### 7. [ORTA · İşlevsellik] Durum makinesi UI'da yok; "Atandı/İşlemde" filtreleri hep boş
- **Kanıt:** Şema 5 durum tanımlıyor (`schema.prisma:1308`), PATCH hepsini kabul ediyor (`[id]/route.ts:11`); UI yalnız `done` gönderiyor (`page.tsx:258`). POST `assignedToId` verilse bile `status`'u `assigned` yapmıyor (`route.ts:177-186`, varsayılan `pending`). `in_progress`/`cancelled` hiçbir istemci tarafından set edilmiyor (tek PATCH çağıranı bu sayfa — grep: `page.tsx:116`).
- **Sorun:** Filtre seçenekleri (`page.tsx:194-197`) var olmayan veriye işaret ediyor; tamamlanan iş geri açılamıyor (yanlış tık telafisiz); alakasız AI önerisi "İptal" edilemiyor → Bulgu 1 ile birleşince liste çöple doluyor. `completedAt` istemci saatinden geliyor (`page.tsx:121`) ve yeniden açmada temizlenmiyor.
- **Profesyonel öneri:** Durum geçişlerini sunucuda tanımlayın (`pending → in_progress → done`, her durumdan `cancelled`, `done/cancelled → pending` yeniden açma); `completedAt`'i sunucu set etsin/temizlesin, istemciden kabul etmeyin; `assignedToId` dolu ise durum otomatik `assigned`. UI'da satır başına durum menüsü (DropdownMenu: Başlat / Tamamla / İptal et (sebep) / Yeniden aç) + "Geri al" aksiyonlu toast (5 sn).
- **Efor:** M

### 8. [ORTA · Ürün / sinyal-gürültü] Her analiz edilen geri bildirim 1-N ayrı aksiyon üretiyor; tema bazlı birleştirme yok
- **Kanıt:** `lib/action-items-ai.ts:34-73` her geri bildirimin her önerisini ayrı satır yapıyor; öneriler her AI analizinde yazılıyor (`lib/inngest/feedback-analyze-pipeline.ts:80`, `app/api/ai/analyze/route.ts:166, 248`). Eşleme index tabanlı (`:52-57`): aynı geri bildirime manuel POST ile aksiyon eklenirse (`route.ts:133-151`) sıradaki öneri atlanır.
- **Sorun:** 40 müşteri "bekleme uzun" dediğinde 40 neredeyse aynı "Bekleme süresini azaltın" işi oluşur; olumlu geri bildirimler bile iş üretir. Medallia/Qualtrics'te bu "kök neden / tema" altında tek iş + kanıt sayısı olarak gösterilir.
- **Profesyonel öneri:** Aksiyonları **tema/kök neden** düzeyinde kümeleyin: `ActionItem` ↔ `Feedback` ilişkisini çoka-çok (`ActionItemEvidence`) yapın; yeni öneri, mevcut açık işle benzerse (normalize metin + konu etiketi `topic`/`intent`, gerekirse embedding) yeni satır yerine kanıt olarak eklensin ve "12 geri bildirim" rozeti büyüsün. Olumlu ve düşük aciliyetli geri bildirimler varsayılan olarak iş üretmesin.
- **Efor:** L

### 9. [ORTA · Mimari / Yetki] Modül ve menü görünürlük kapısı uygulanmıyor
- **Kanıt:** `lib/module-controls.ts:43` ve `lib/visibility-controls.ts:60` `action_items` anahtarını tanımlıyor; `route.ts` ve `[id]/route.ts` `assertModuleEnabled`/`assertMenuItemVisible` çağırmıyor (müşteri uçlarında örnek kullanım: `app/api/customer/discovery/route.ts:7`). Sayfa da kontrol etmiyor.
- **Sorun:** Admin modülü kapattığında sayfa doğrudan URL ve diğer sayfalardaki bağlantılarla erişilebilir kalır; arka planda AI üretimi devam eder.
- **Profesyonel öneri:** Her iki uca `assertModuleEnabled('action_items')`; sayfa bir server component sarmalayıcı ile kapalı modülde bilgilendirici boş durum göstersin; bağlantı veren sayfalar (`copilot`, `roi`, `benchmark`, `operations-brief`, `discover`, `ai-insights`) aynı bayrağa göre bağlantıyı gizlesin.
- **Efor:** S

### 10. [ORTA · UX / Bilgi mimarisi] Önceliklendirme yok: sıralama, gecikme, özet ve detay eksik
- **Kanıt:** `route.ts:85` sabit `createdAt desc`; `page.tsx:245-250` tarih vurgusuz; `impactScore` hiç seçilip gösterilmiyor (`page.tsx:33-44` tipte yok); özet sayaç yok; satıra tıklanınca hiçbir şey olmuyor.
- **Sorun:** Bayi sahibi "bugün neyi yapmalıyım?" sorusuna cevap alamıyor; yüksek öncelikli ve gecikmiş iş, dün eklenmiş düşük öncelikli genel önerinin altında kalabiliyor.
- **Profesyonel öneri:** Varsayılan sıralama "akıllı": gecikmiş → yüksek öncelik → etki skoru → son tarih; kullanıcı seçebilsin (Yeni / Son tarih / Öncelik / Etki). Gecikmiş iş için kırmızı sol kenar + "2 gün gecikti" metni. Sağdan açılan **detay paneli** (shadcn `Sheet`): tam metin, kanıt geri bildirimler (link ile `/dealer/feedbacks`), kaynak, durum geçmişi (`ActionItemEvent` tablosu: kim, ne zaman, hangi alan), yorumlar, ilgili telafi teklifi/kampanya kısayolu.
- **Efor:** L

### 11. [ORTA · İşlevsellik] Sayfalama aralık dışına düşüyor
- **Kanıt:** `page.tsx:124-126` tamamlamadan sonra aynı `page` ile yeniden yükleme; `:82` `totalPages` güncelleniyor ama `page` düzeltilmiyor; `:269-283`.
- **Sorun:** "Bekliyor" filtresinde son sayfadaki tek öğe tamamlanınca "Sayfa 3 / 2" ve boş durum görünür; kullanıcı işi bittiğini sanabilir.
- **Profesyonel öneri:** Yanıtta `page > totalPages && totalPages > 0` ise `setPage(totalPages)`; tercihen iyimser güncelleme ile öğeyi listeden kaldırıp arka planda yeniden doğrulama (SWR `mutate`). Uzun vadede imleç tabanlı "Daha fazla yükle".
- **Efor:** S

### 12. [ORTA · İçerik / i18n] İç jargon ve dil karışıklığı
- **Kanıt:** `messages/tr.json` `dealerActionItems.sourceAiAggregate` = "Sistem önerisi (sidebar verilerinden AI analizi)", `emptyHint` = "Sayfa her açıldığında AI sidebar verilerini analiz edip…"; API hata metinleri sabit Türkçe (`[id]/route.ts:32-35, 91`; `route.ts:109, 172`) ve `page.tsx:129` bunları doğrudan toast'luyor → EN arayüzde Türkçe hata. Agent Council metni "[Agent Council] … Sorumlu (öneri): …" ham olarak kullanıcıya gidiyor (`council-to-actions/route.ts:57`). Sayfa başlığı "Aksiyon Öğeleri", sekme "Aksiyonlar", modül adı "Aksiyon kalemleri" — üç farklı ad.
- **Profesyonel öneri:** Kaynakları kullanıcı diliyle etiketleyin ("Geri bildirimden", "İşletme analizinden", "Danışman önerisi", "Olaydan"); API hata kodları (`code: 'NOT_FOUND'`) döndürüp istemcide çevirin; Agent Council başlık/gövde/önerilen sahip ayrı alanlarda saklansın (`title`, `body`, `suggestedOwner`). Tek ürün adı seçin ("Aksiyonlar").
- **Efor:** S

### 13. [DÜŞÜK · Erişilebilirlik] Etiketsiz kontroller ve hareket tercihi
- **Kanıt:** `page.tsx:271-282` ikon-only sayfalama butonlarında `aria-label` yok; `:171-179` arama `Input`'unda `aria-label`/`<label>` yok; `:187-189` Select tetikleyicisinde erişilebilir ad yok; `:215-219` `Motion.li` `useReducedMotion` kontrolü olmadan her yüklemede animasyon (global `MotionConfig reducedMotion` kullanımı bulunamadı — grep yalnız `components/admin/admin-premium-hero.tsx`); `:208` dekoratif ikonda `aria-hidden` yok; durum değişikliği sonrası `aria-live` duyurusu yok (yalnız toast).
- **Profesyonel öneri:** `aria-label="Önceki sayfa/Sonraki sayfa"`, görünür veya `sr-only` etiketler, `<ul aria-busy>`; global `<MotionConfig reducedMotion="user">` (tüm panele fayda); animasyonu yalnız ilk yüklemede ve yeni gelen öğelerde çalıştırın (`AnimatePresence` + `layout` ile çıkan öğe yumuşakça kapansın).
- **Efor:** S

### 14. [DÜŞÜK · Kod kalitesi] Ölü kod ve küçük tutarsızlıklar
- **Kanıt:** `page.tsx:10-11` `MessageSquare`, `Star` içe aktarılıp kullanılmıyor; `:228, 275-278` `t()` değişken desteği varken (`lib/app-locale.tsx:59`) elle `.replace`; `route.ts:44-69` ADMIN ve DEALER `where` dalları neredeyse kopya; PATCH'te iki kez `findUnique` (`[id]/route.ts:27, 81`); sorgu için bileşik index yok (`schema.prisma:1321-1323`; `where dealerId,status order by createdAt` için `@@index([dealerId, status, createdAt])` uygun); `page.tsx:148-152` öncelik renklerinde `dark:` varyantı yok.
- **Profesyonel öneri:** Temizlik + `where` oluşturucuyu tek fonksiyona indirgeme + bileşik index migration'ı (canlı Neon'a dikkat: önce şema değişikliği planı).
- **Efor:** S

### 15. [DÜŞÜK · Sistem bütünlüğü — sayfa dışı ama bu veriyi etkiliyor] Bayi aksiyonları Qratex iç ekibine görev olarak kopyalanıyor
- **Kanıt:** `lib/team-autotask.ts:68-89` tüm bayilerin `high` öncelikli `pending/assigned` aksiyonlarını Qratex iç ekip görevine (`department: DEP_DEV`) dönüştürüyor.
- **Sorun:** "Personele telafi teklifi gönderin" gibi bir işletme önerisi Qratex geliştirme ekibinin kanbanına düşer; Bulgu 1'deki AI taşkını iç ekip panosuna da taşar. Bu sayfanın kapsamı dışı ama aynı tablonun anlamını bulandırıyor.
- **Profesyonel öneri:** Otomatik görevi yalnız `sourceModule = 'agent_council'` (admin kaynaklı) veya açıkça "Qratex desteği istendi" işaretli kayıtlarla sınırlayın.
- **Efor:** S

---

## Eksik özellikler (kıyas: Medallia Actions, Qualtrics XM Tickets/Actions, Google Business Profile, Yelp for Business, Toast, Square Dashboard)

1. **Kapalı döngü vaka yönetimi (Medallia "Close the loop", Qualtrics Tickets):** Her aksiyonun sahibi, SLA'sı, eskalasyonu (süre aşımında yöneticiye bildirim), müşteriye geri dönüş adımı ("Müşteriye dönüş yapıldı" + telafi teklifi bağlantısı) ve kapanış nedeni.
2. **"Bana atananlar" + bildirimler:** Personel görünümü, atama/son tarih yaklaştı/gecikti push ve e-posta bildirimleri; günlük özet (Toast/Square'deki vardiya görev listesi mantığı).
3. **Tema/kök neden kümeleme ve etki tahmini:** Tek iş + N kanıt geri bildirim, "Bu tema son 30 günde ortalama puanı 0,4 düşürdü" gibi etki metriği; tamamlandıktan sonra "öncesi/sonrası" puan karşılaştırması (Medallia Action Planning'in etki ölçümü).
4. **Kanban / gruplu görünüm ve toplu işlem:** Durum sütunları (Öneriler · Yapılacak · Sürüyor · Tamam), çoklu seçimle ata/tamamla/iptal; kaydedilmiş görünümler ("Bu hafta gecikenler").
5. **Öneri yaşam döngüsü:** AI önerisini kabul/ret/ertele, ret nedeniyle modeli besleme; tekrarlayan işler (haftalık temizlik denetimi) ve şablon kütüphanesi (projede ekip modülünde şablon galerisi deseni zaten var).
6. **Raporlama ve dışa aktarma:** Tamamlama oranı, ortalama kapanış süresi, kişi bazlı performans; CSV dışa aktarma; yorum/etkinlik akışı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sahibi sabah sayfayı açtığında üç saniyede "bugün neyi, kim yapacak, ne kadar acil" sorusunun cevabını görür; AI önerileri işin kendisi değil, onaylanmayı bekleyen **öneriler** olarak ayrı durur; tamamladığı iş listeden çıkar ve geri gelmez; personel kendi işini kendi panelinden kapatır; her işin hangi müşteri sesinden doğduğu tek tıkla görülür.

**Yerleşim:**
1. **Üst şerit (özet):** 4 kompakt metrik — Açık · Geciken (kırmızı) · Bu hafta tamamlanan · Ortalama kapanış süresi; tıklanınca filtre olarak uygulanır. Veri: mevcut `lib/kpis/action-completion.ts` genişletilerek `GET /api/dealer/action-items/summary`.
2. **Öneriler bandı (katlanabilir):** "AI 3 yeni öneri getirdi" — her biri kanıt sayısı ve etki tahminiyle; Kabul et (sahip + tarih ile) / Ertele / Reddet (neden). Sayfa açılışında üretim yok; üretim cron/olay tetiklemeli.
3. **Ana liste:** Sekmeler (Yapılacak · Sürüyor · Tamamlanan · İptal) + filtre çubuğu (öncelik, kaynak, sahip, tarih aralığı, arama) + sıralama; URL query'si ile senkron (paylaşılabilir görünüm). Masaüstünde liste/kanban geçişi; mobilde liste, satırda sola kaydırma = tamamla, sağa = ertele (Pointer olaylarıyla, buton alternatifiyle).
4. **Satır:** Sol kenarda öncelik çubuğu, başlık (2 satır), kanıt rozeti ("12 geri bildirim"), sahip avatarı (satır içi değiştirilebilir combobox), son tarih çipi (gecikmişse kırmızı), durum menüsü.
5. **Detay paneli (Sheet):** Açıklama, kanıt geri bildirimler (puan + alıntı + link), etkinlik zaman çizelgesi, yorumlar, "Telafi gönder" / "Kampanya başlat" kısayolları.

**Motion (ölçülü):** Liste için `layout` + `AnimatePresence` — tamamlanan satır 150-200 ms'de daralarak çıkar, yerine diğerleri kayar; tamamlamada onay ikonunda kısa bir yay (spring) — konfeti/3B yok, burası iş ekranı. Özet sayaçlarında değişimde sayı geçişi. Hepsi `MotionConfig reducedMotion="user"` altında. three.js bu sayfaya uygun değil.

**Veri/API değişiklikleri:**
- Şema: `ActionItem` → `title`, `body`, `suggestedOwner`, `suggestionKey` (normalize hash), `status` enum'una `suggested`, `dismissedAt/dismissedReason`, `snoozedUntil`; `ActionItemEvidence(actionItemId, feedbackId)` çoka-çok; `ActionItemEvent` (denetim/etkinlik); `ActionItemComment`; `@@index([dealerId, status, createdAt])`, `@@unique([dealerId, suggestionKey])` (açık durumlar için kısmi benzersiz index raw SQL ile). Canlı Neon olduğu için migration planı ayrı onaylanmalı.
- API: `GET /api/dealer/action-items` saf okuma (yan etkisiz), çoklu `status`, `priority`, `source`, `assignee`, `sort`, `overdue` parametreleri; `GET …/summary`; `PATCH …/[id]` sunucu tarafı durum makinesi + `assignedToId` personel doğrulaması + `completedAt` sunucuda; `POST …/[id]/accept|dismiss|snooze`; `POST …/bulk`; `GET /api/staff/action-items`; hepsinde `assertModuleEnabled('action_items')`.
- Üretim: `lib/action-items-ai.ts` bir Inngest fonksiyonuna/cron'a taşınır (bayi başına günlük üst sınır, Redis kilidi, LLM timeout, maliyet kontrolü önce).
- İstemci: SWR/React Query, iyimser güncelleme + geri al, hata/boş/yükleniyor durumlarının ayrılması.

---

## Çakışmalar / birleştirme önerisi

"Aksiyon/yapılacak iş" kavramı bayi panelinde en az yedi yere dağılmış durumda:

| Sayfa / uç | Ne yapıyor | İlişki |
|---|---|---|
| `/dealer/ai-insights` (`ai-insights-client.tsx:415-480, 1835, 2505-2540`) | AI önerilerini gösterip aksiyona dönüştürüyor, atama/son tarih formu orada | Bu sayfanın "öneri kabul" adımının asıl sahibi; atama UI'ı yanlış yerde. |
| `/dealer/copilot`, `/dealer/operations-brief`, `/dealer/roi`, `/dealer/benchmark` | Aksiyon sayıları + bu sayfaya bağlantı | Tüketici; tutarlı KPI için Bulgu 1 çözülmeli. |
| `lib/next-best-action.ts` (`/api/dealer/next-best-actions`) | Kural tabanlı "sıradaki en iyi aksiyon" kartları | Ayrı bir öneri motoru — aynı "Öneriler" bandına beslenmeli. |
| `/dealer/remedy-queue`, `/dealer/incidents`, `/dealer/segment-actions` | Telafi, olay, segment eylemleri | Kendi iş akışları var; aksiyon detayından kısayol olarak bağlanmalı, birleştirilmemeli. |
| `lib/team-autotask.ts` | Bayi aksiyonlarını Qratex iç görevine kopyalıyor | Kapsam karışıklığı (Bulgu 15). |

**Öneri:** Sayfa kaldırılmamalı — `ActionItem` tablosunun tek yönetim ekranı ve birçok sayfa ona bağlanıyor. Bunun yerine **"Aksiyon Merkezi"** olarak yeniden tasarlanıp sidebar'a geri alınmalı (şu an `components/dashboard/sidebar.tsx:230-232` ile menüden çıkarılmış, yarı-yetim): ai-insights'taki "aksiyona ekle + atama" formu buradaki öneri kabul akışına taşınmalı, next-best-action kartları ve AI önerileri tek "Öneriler" bandında toplanmalı; copilot/operations-brief/roi bu merkezin özet ucunu tüketmeli. Telafi/olay/segment sayfaları ayrı kalmalı, aksiyon detayından derin bağlantıyla erişilmeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod, DB, build, test çalıştırılmadı. Okunan dosyalar: `app/dealer/action-items/page.tsx`, `app/api/dealer/action-items/route.ts`, `app/api/dealer/action-items/[id]/route.ts`, `lib/action-items-ai.ts`, `lib/ai-cost-guard.ts`, `lib/api-http.ts`, `app/dealer/ai-insights/ai-insights-client.tsx`, `app/api/dealer/churn-risk/route.ts`, `app/api/dealer/customers/route.ts`, `prisma/schema.prisma` (ActionItem modeli).

### İddia 1: GET yan etkisi (açık iş < 3 iken her liste isteği LLM çağırıp yeni aksiyon yaratıyor), karar: **DOĞRULANDI**

- `route.ts:71-78`: DEALER rolündeki her GET, listeyi döndürmeden önce `runActionItemsAutoTrigger(dealerId)` çalıştırıyor (sayfa, filtre, arama ve sayfalama değişikliklerinin hepsi).
- `action-items-ai.ts:214-217`: açık (pending/assigned/in_progress) iş sayısı < 3 ise `generateFromDealerContext` çağrılıyor; `:183` toplam kayıt < 2 ise 5'e kadar, değilse 2 yeni `ai_aggregate` kaydı yazıyor. Otomatik yolda metin tekilleştirmesi yok (POST'taki `existingOpenItem` kontrolü, `route.ts:162-175`, burada uygulanmıyor).
- `page.tsx:126`: "Tamamla" sonrası `loadItems()` yeni bir GET atıyor; açık iş 3'ün altına indiyse LLM çağrılıyor ve 2 yeni kayıt ekleniyor.
- Tek fren `checkAiCostGuard` (`ai-cost-guard.ts:8-11`, varsayılan 100.000 token/gün/bayi). Bu bütçe bayinin diğer AI özellikleriyle paylaşımlı; tükendiğinde onlar da gün sonuna kadar 429 alır.
- Ek bulgu (iddiayı ağırlaştırır): `action-items-ai.ts:169, 177, 180` LLM yanıtı boş, JSON dışı veya boş dizi olduğunda `recordAiCostUsage` (`:201`) ÇAĞRILMADAN `return 0` yapıyor. Model (varsayılan `llama-3.1-8b-instant`) JSON dışı metin döndürdüğü sürece token harcanıyor ama bütçeye yazılmıyor; bu durumda maliyet koruması hiç tetiklenmiyor ve her GET sınırsızca LLM çağırıyor.

**Yeniden üretim:** Bayi 3 açık aksiyonla sayfayı açar ve birini "Tamamla"r. Yenileme GET'i açık=2 görür, LLM çağrılır, 2 yeni genel öneri eklenir. Tekrar tamamlanınca döngü sürer; liste hiçbir zaman 3'ün altına inmez, `done` oranı ve toplam aksiyon sayısı (ROI/benchmark/copilot KPI'ları) yapay olarak şişer.

**Öneri:** Üretimi okuma yolundan tamamen çıkarın. `runActionItemsAutoTrigger` yalnızca olay güdümlü çalışmalı: feedback analiz pipeline'ı (`lib/inngest/feedback-analyze-pipeline.ts`) bitince o geri bildirimin önerileri aksiyona çevrilsin; AI aggregate ise günlük cron/Inngest işi olarak bayi başına günde en fazla bir kez, `dealerId + normalize(suggestionText)` tekilleştirmesiyle ve "son N gün içinde aynı/benzer öneri reddedildi veya tamamlandıysa üretme" kuralıyla çalışsın. Kullanıcı tarafında "Öneriler" bandı ayrı tutulmalı (öneri ≠ görev): öneriler kabul edilene kadar `ActionItem` olmamalı ki KPI'lar gerçek işi ölçsün. Maliyet kaydı parse başarısından bağımsız olarak (`finally` içinde) yapılmalı.

### İddia 2: Eşzamanlı GET yarışı mükerrer kayıt ve mükerrer LLM çağrısı üretiyor, karar: **DOĞRULANDI**

- `ai-insights-client.tsx:415-441`: sayfa açılışında 3 GET `Promise.all` ile paralel atılıyor; her biri `route.ts:74` üzerinden tetikleyiciyi koşturuyor.
- `action-items-ai.ts:52-60`: "say, sonra eksik indeksten itibaren oluştur" mantığı atomik değil, transaction/kilit yok; `schema.prisma:1321-1323` yalnızca index içeriyor, `(feedbackId, suggestionText)` benzeri bir unique kısıt yok. Üç istek aynı anda `existing = 0` okursa aynı öneriler 3 kez yazılır. Sonrasında `existing >= suggestions.length` koşulu sağlandığından mükerrerler kalıcıdır, kendini onarmaz.
- `action-items-ai.ts:214-217` ve `ai-cost-guard.ts:47-53`: açık iş sayısı ve bütçe kontrolü de oku-sonra-yaz; üç istek de < 3 görüp 3 ayrı LLM çağrısı yapar (2-5'er kayıt, toplam 6-15 kayıt).
- Aksiyon sayfasının kendisinde de istemci `AbortController` (`page.tsx:66-68`) sunucu işini iptal etmez; hızlı filtre/sayfa değişimleri sunucuda çakışan tetikleyiciler üretebilir.

**Yeniden üretim:** Analizli ama henüz aksiyona çevrilmemiş geri bildirimi olan bayi `/dealer/ai-insights`'ı açar; 3 paralel GET aynı `suggestionText` + `feedbackId` ile 2-3 eş kayıt oluşturur. Açık iş < 3 ise ayrıca 3 LLM çağrısı yapılır.

**Öneri:** İddia 1'deki gibi üretimi GET'ten çıkarmak yarışın büyük kısmını ortadan kaldırır. Ek olarak `ActionItem`'a `suggestionIndex Int?` alanı ve `@@unique([feedbackId, suggestionIndex])` eklenip `createMany({ skipDuplicates: true })` kullanılmalı; aggregate yolu için bayi başına Redis `SET NX EX` kilidi (Upstash zaten mevcut) veya Postgres advisory lock ile tek uçuş garanti edilmeli. ai-insights tarafında 3 ayrı GET yerine açık aksiyon anahtarlarını tek seferde dönen hafif bir uç kullanılmalı.

### İddia 3: assignedToId doğrulanmadan yazılıyor, GET atanan kişinin e-postasını döndürüyor, karar: **DOĞRULANDI**

- `[id]/route.ts:12, 51`: `assignedToId` yalnızca `z.string()`; kullanıcının bu bayinin personeli olup olmadığı kontrol edilmiyor. POST'ta da aynı (`route.ts:27, 184`).
- `route.ts:88`: liste `assignedTo: { id, name, email }` döndürüyor; `page.tsx:242` bunu ekranda gösteriyor.
- Hedef id'nin elde edilebilirliği somut olarak doğrulandı: `app/api/dealer/churn-risk/route.ts:69` geri bildirim yazan müşterilerin HAM `user.id`'sini bayiye döndürüyor (e-posta olmadan). Buna karşılık `app/api/dealer/customers/route.ts:72-74` ham müşteri id'sini "gizlilik" gerekçesiyle bilinçli olarak gizliyor ve e-postayı yalnızca tüketim ilişkisi olan müşteriler için veriyor. `remedy-queue` ucu da ham id (id, name) döndürüyor.
- Geçersiz id: FK ihlali (P2003) `responseIfDatabaseUnavailable` (`lib/api-http.ts:18-19`) tarafından yakalanmaz, 500 "Güncelleme başarısız" döner.

**Yeniden üretim:** Bayi `/api/dealer/churn-risk` yanıtından, yalnızca QR geri bildirimi bırakmış (tüketim kaydı olmayan) bir müşterinin `user.id`'sini alır; `PATCH /api/dealer/action-items/<kendi aksiyonu>` gövdesi `{"assignedToId":"<o id>"}` gönderir; ardından `GET /api/dealer/action-items` yanıtında `assignedTo.email` alanında müşterinin e-postasını görür. Aynı yöntem id'si bilinen herhangi bir kullanıcı (başka bayi, admin) için çalışır. Etki: geri bildirimde anonimliğe güvenen müşterinin kişisel verisinin (KVKK kapsamında) ifşası.

**Öneri:** Atama bayinin personel kümesiyle sınırlandırılmalı: `assignedToId` verildiğinde `dealerStaff` üzerinden (`dealerId` + `userId` + aktiflik) doğrulanmalı, değilse 422 dönülmeli; tercihen API ham userId yerine `dealerStaffId` almalı. Liste yanıtında e-posta yerine yalnızca ad/avatar döndürülmeli; istemcide atama, personel listesinden seçilen bir combobox ile yapılmalı. Aynı `assignedTo.email` deseni `app/api/dealer/incidents` uçlarında da görülüyor (yalnızca grep ile görüldü, doğrulanmadı); birlikte ele alınmalı. Ham müşteri id'si döndüren churn-risk/remedy-queue uçları da customers ucundaki opak `ref` desenine geçirilmeli.

### İddia 4: Her liste isteğinde sınırsız findMany + geri bildirim başına count (N+1) + zaman aşımsız LLM, karar: **DOĞRULANDI** (havuz tükenmesi kısmı abartılı)

- `action-items-ai.ts:35-45`: `take` olmadan, bayinin `actionSuggestions` dolu TÜM geri bildirimleri JSON alanıyla çekiliyor. `actionSuggestions` her analizde dolduruluyor (`lib/inngest/feedback-analyze-pipeline.ts:80`, `app/api/feedbacks/route.ts:490`), yani küme geri bildirim sayısıyla doğrusal büyüyor.
- `:48-55`: her geri bildirim için ayrı `actionItem.count`, `await` ile sıralı; zaten işlenmiş olanlar dahil, her GET'te. 1.000 geri bildirimli bayide liste isteği başına yaklaşık 1.000 sıralı round-trip. Sorgular sıralı olduğundan tek istek Neon havuzunu "tüketmez"; asıl etki doğrusal artan gecikme ve DB yükü, eşzamanlı birkaç istekte (İddia 2'deki 3 paralel GET gibi) bağlantı baskısı.
- `:87-113`: aggregate yolunda `qrCode.findMany`, `feedback.findMany` (30 gün, `text` dahil) ve `incident.findMany` da sınırsız.
- `:146-166`: `chat.completions.create` çağrısında `timeout`/`signal`/`maxRetries` yok; OpenAI SDK varsayılanları (uzun timeout, 2 yeniden deneme) geçerli. `route.ts:74` bunu `await` ettiği için liste yanıtı LLM gecikmesine kilitleniyor; hata yutulup liste dönse de ancak bekleme bittikten sonra.

**Yeniden üretim:** Yüzlerce/binlerce analizli geri bildirimi olan bayi aksiyon sayfasında arama kutusuna yazar; her debounce'lu istek N+1 sorgu turu çalıştırır. Açık iş < 3 ise her istek ayrıca LLM yanıtını bekler ve yükleme göstergesi saniyelerce takılı kalır.

**Öneri:** Okuma ucu yalnızca okumalı (bkz. İddia 1). Feedback'ten aksiyona dönüşüm, analiz tamamlandığı anda tek geri bildirim için çalıştırılmalı; geçmiş kayıtlar için bir kerelik backfill işi yeterli. Geçici çözüm gerekirse: tek `groupBy({ by: ['feedbackId'], _count })` ile sayılar toplu alınmalı, yalnızca aksiyonu henüz üretilmemiş geri bildirimler (ör. `Feedback.actionItemsMaterializedAt IS NULL`) seçilip `take` ile sınırlandırılmalı. LLM çağrısı `AbortSignal.timeout(~8s)` ve `maxRetries: 0/1` ile sınırlanmalı, istek yolundan `after()`/Inngest arka plan işine alınmalı.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/dealer/inbox/assigned` (Gelen Kutusu → Bana atananlar): görev + vaka birleşik kuyruğu. `/dealer/action-items` sorgu parametrelerini koruyarak kalıcı yönlenir; eski `layout.tsx` kaldırıldı. Sunucu: `lib/dealer-queues/{work-core,work-server,assignees}.ts`; istemci: `components/dealer/b-gelen-kuyruklar/assigned/**` (`assigned-screen`, `work-row`, `task-detail`, `suggestions-panel`); BFF: `/api/dealer/queues/work` (liste + özet; STAFF yalnız kendine atananları görür), `/work/suggestions` (öneriler; GET'te LLM yok; gizle), `/tasks` (oluştur), `/tasks/[id]` (detay / PATCH). Eski `/api/dealer/action-items` GET'i salt okumaya çevrildi. Test: `__tests__/dealer/b-gelen-kuyruklar/work.test.ts` (9 test).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1–3 | Başlık / metadata / liste başlığı | ÇALIŞIYOR — "Bana atananlar · Gelen Kutusu" |
| 4 | Arama | ÇALIŞIYOR — görev metni + vaka başlık/açıklaması; etiket doğru |
| 5 | `?q=` derin bağlantı | ÇALIŞIYOR — sunucu ilk sayfayı `q` ile çeker; arama URL'ye yazılır |
| 6 | Durum filtresi | KALDIRILDI — yerine kapsam sekmeleri (Bana / Ekibe / Atanmamış / Kapanan) + tür filtresi; ölü "Atandı/İşlemde" seçenekleri yok |
| 7 | Sayfalama | ÇALIŞIYOR — "Daha fazla" (ofset); aralık dışına düşme yok |
| 8 | Yükleniyor | ÇALIŞIYOR — önceki veri korunur |
| 9 | Boş durum | ÇALIŞIYOR — kapsama özel, iç jargon yok |
| 10 | Hata | ÇALIŞIYOR — QueryState + tekrar dene |
| 11 | Aksiyon metni | ÇALIŞIYOR — başlık/ayrıntı ayrılır, `whitespace-pre-line` |
| 12 | Bağlı geri bildirim | ÇALIŞIYOR — silinmişler filtrelenir; Gelen Kutusu bağlantısı |
| 13 | Kaynak etiketi | ÇALIŞIYOR — tüm kaynaklar etiketli |
| 14 | Öncelik rozeti | ÇALIŞIYOR — DS token'ları (koyu tema uyumlu) |
| 15 | Durum rozeti | ÇALIŞIYOR |
| 16 | Atanan kişi | ÇALIŞIYOR — detayda seçici |
| 17 | Son tarih | ÇALIŞIYOR — gecikme vurgusu; kapanma zamanı gösterilir |
| 18 | Tamamla | ÇALIŞIYOR — meşgulken kilitli; detayda yeniden aç |
| 19 | Animasyon | ÇALIŞIYOR — layout/exit, azaltılmış hareket |
| 20 | Toast | ÇALIŞIYOR |
| 21 | GET'te AI üretimi | KALDIRILDI — GET salt okuma; öneriler "Önerilen işler" panelinde, bayi kabul edince göreve döner |
| 22 | Öneriden otomatik oluşturma | KALDIRILDI (otomatik) → elle kabul; öneriler metin anahtarıyla birleştirilir, kanıt sayılı |
| 23 | Sahiplik | ÇALIŞIYOR |
| 24 | `assignedToId` doğrulaması | ÇALIŞIYOR — `validateAssignee` (oluştur + PATCH + eski uçlar); e-posta dönmez |
| 25 | Modül kapısı | ÇALIŞIYOR — `action_items`; vaka modülü kapalıysa vakalar listelenmez ve not gösterilir |
| 26 | Navigasyon | ÇALIŞIYOR — Gelen Kutusu sekmesi (kayıt navigasyon ajanının) |
| 27 | Durum değiştirme | ÇALIŞIYOR — başlat / tamamla / iptal / yeniden aç (durum makinesi sunucuda) |
| 28 | Atama + son tarih düzenleme | ÇALIŞIYOR |
| 29 | Manuel oluşturma | ÇALIŞIYOR — "Yeni görev" (aynı açık görev varsa 409) |
| 30 | Sıralama | ÇALIŞIYOR — geciken → öncelik → son tarih |
| 31 | Filtreler | ÇALIŞIYOR — kapsam + tür + arama |
| 32 | Özet sayaçlar | ÇALIŞIYOR — bana açık / geciken / atanmamış / bu hafta kapanan (Europe/Istanbul haftası) |
| 33 | Detay paneli | ÇALIŞIYOR — durum, öncelik, kaynak yorum, not, zaman çizelgesi |
| 34 | Toplu işlem | KALDIRILDI (bu dalga) — birleşik kuyrukta görev/vaka karışık; satırda tekil hızlı eylemler var |
| 35 | Etki skoru | ÇALIŞIYOR |
| 36 | Etiketler | ÇALIŞIYOR |
| 37 | Mobil | ÇALIŞIYOR — ≥44px |
| 38 | Personel görünümü | KISMİ — API STAFF'a yalnız kendi işini döndürür; personel panelindeki sayfa personel yüzeyinin işi |
| 39 | Yarış koruması | ÇALIŞIYOR — oluşturmada advisory kilit; GET yan etkisiz |

### Kapanan bulgular (14/15)
1 (GET yan etkisi), 2 (sınırsız sorgu / N+1 / LLM), 3 (yarış), 4 (IDOR — A3), 5 (hata görünür), 6 (atanan kişiye bildirim + Bana atananlar), 7 (durum makinesi UI), 8 (önerilerin birleştirilmesi), 9 (modül kapısı), 10 (önceliklendirme / özet / detay), 11 (sayfalama), 12 (jargon / i18n), 13 (a11y + hareket), 14 (ölü kod: eski sayfa yönlendirmeye indirildi).

### Kalanlar
- Bulgu 15 (bayi aksiyonlarının admin iç ekip panosuna kopyalanması, `lib/team-autotask.ts`): admin ekip modülünün sahipliği.
- Personel paneline "Bana atananlar" sayfası: `/api/dealer/queues/work` hazır; personel yüzeyi bağlamalı.
