# /dealer/incidents

**Amaç:** İşletmenin (bayi) "kriz radarı": puan düşüşü, şikayet artışı, yüksek aciliyetli/toksik geri bildirim, SLA aşımı ve otomatik kural ihlali gibi eşik aşımlarının **olay (incident)** olarak kaydedildiği, önem derecesinin görüldüğü, sorumluya atandığı ve çözülene kadar takip edildiği ekran. Kıyas ürünlerdeki karşılığı: Medallia "Alerts & Case Management", Qualtrics "Tickets / Closed-loop", Square/Toast tarafında operasyonel uyarı merkezi.

**Genel puan: 3.5/10** · **Karar: yeniden tasarla** (Prisma modeli ve `[id]` PATCH ucu korunabilir; GET'e gömülü tespit, sahte "demo olay", eksik yaşam döngüsü ve okunamaz liste yeniden ele alınmalı)

> Kapsam: `app/dealer/incidents/page.tsx` (355 satır), `app/dealer/incidents/layout.tsx`, `app/dealer/layout.tsx`, `app/api/dealer/incidents/route.ts`, `app/api/dealer/incidents/[id]/route.ts`, `lib/incident-detection.ts`, `lib/api-auth.ts`, `lib/api-http.ts`, `lib/admin-toast.ts`, `lib/module-gate.ts`, `lib/module-controls.ts`, `components/ui/inline-loading-status.tsx`, `components/providers.tsx`, `prisma/schema.prisma` (`Incident`, `Feedback`, `DealerStaff`, `ActionItem`), `messages/tr.json` + `messages/en.json` (`dealerIncidents.*`), ve `Incident` tablosunu besleyen/tüketen diğer yerler: `app/api/internal/inngest/negative-feedback-sla/route.ts`, `lib/auto-reply-engine.ts`, `app/api/dealer/copilot-summary/route.ts`, `app/api/dealer/morning-briefing/route.ts`, `app/api/admin/dealers-health/route.ts`, `lib/team-autotask.ts`, `lib/action-items-ai.ts`, `lib/webhook-dispatch.ts`, `components/dashboard/sidebar.tsx`. Kod çalıştırılmadı, veritabanına dokunulmadı; tüm tespitler okunarak yapıldı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Listeleme, durum filtresi ve manuel olay oluşturma çalışıyor; ancak olayı çözme/atama/son tarih verme UI'da hiç yok (PATCH ucu ölü), açıklama/zaman/kaynak gösterilmiyor, her yeni bayiye kalıcı sahte bir "demo olay" yazılıyor. |
| UX | 3/10 | Salt-okunur, tıklanamayan, zaman damgası olmayan düz bir liste; otomatik olayların açıklayıcı metni görünmüyor, sistem tiplerinin bir kısmı ham kod (`negative_spike`) olarak çıkıyor, filtreli boş durum "ilk olayı oluştur" diyor. |
| Görsel | 5/10 | Panelin kart diliyle tutarlı ve sade; fakat önem derecesi tek küçük rozetle ifade ediliyor, kritik olay görsel olarak düşük olaydan ayrışmıyor, önem renkleri koyu temada ayarlanmamış. |
| Mimari | 3/10 | Eşik tespiti ve demo kaydı `GET` isteğinin yan etkisi; check-then-create yarışına açık; `assignedToId` doğrulanmıyor; modül kapısı API'de uygulanmıyor; `type` serbest string ve dört farklı üretici dört farklı adlandırma kullanıyor. |
| Performans | 4/10 | Her liste/filtre/sayfa isteğinde son 14 günün TÜM geri bildirimleri belleğe çekilip JS'te ortalaması alınıyor, ardından 3-4 ek `count`; önbellek yok. Küçük bayilerde hissedilmez, yoğun bayide gereksiz yük. |
| Erişilebilirlik + mobil | 5/10 | Mobilde hero ve liste düzgün yığılıyor, `MotionConfig reducedMotion="user"` global olarak var; ancak form `Label`'ları input'lara bağlı değil, filtre `Select`'inin erişilebilir adı yok, önem yalnızca renkle kodlanıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero kartı: başlık + açıklama | ÇALIŞIYOR | page.tsx:169-178; tr.json `dealerIncidents.title/description` | "Olaylar / Kriz Radarı". `/dealer/radar` sayfası ise geri kazanım (win-back) ekranı; "Radar" adı iki farklı kavrama işaret ediyor. |
| 2 | Sayfa metadata'sı | ÇALIŞIYOR | incidents/layout.tsx:4-6; tr.json `layoutMetadata.dealerIncidents` = "Olaylar" | Sekme "Olaylar", sayfa başlığı "Olaylar / Kriz Radarı" — küçük tutarsızlık. |
| 3 | "Yeni Olay" butonu (hero) | ÇALIŞIYOR | page.tsx:179-182 | Mobilde tam genişlik, `touch-manipulation` var. |
| 4 | Liste kartı başlığı | ÇALIŞIYOR | page.tsx:188 | — |
| 5 | Durum filtresi (Select) | KISMİ | page.tsx:189-201, 78, 99 | Filtre değişince `page` 1'e sıfırlanmıyor (Bulgu 6). "Atandı"/"İşlemde" durumlarını hiçbir akış üretmiyor → pratikte hep boş. |
| 6 | Liste yükleme + istek iptali (AbortController) | ÇALIŞIYOR | page.tsx:71-106 | İstemci tarafı yarış koruması doğru; ancak sunucudaki yan etkili tespit iptal edilmiyor (Bulgu 3). |
| 7 | Yükleniyor durumu | ÇALIŞIYOR | page.tsx:205-206; inline-loading-status.tsx | `role="status"` var. Her yeniden yüklemede liste tamamen spinner'a dönüyor (titreşim). |
| 8 | Boş durum + "İlk olayı oluştur" CTA | KISMİ | page.tsx:207-214 | Filtreden bağımsız aynı metin: "Çözüldü" filtresinde boş liste "Henüz olay kaydı yok / İlk olayı oluştur" diyor. Filtresiz görünümde demo olay yüzünden bayi buraya pratikte hiç düşmüyor. |
| 9 | Hata durumu | BOZUK | page.tsx:81-92 | `res.ok` kontrolü yok; 401/403/503 JSON yanıtında `data.items` olmadığı için sessizce önceki liste (ilk yüklemede boş durum) gösteriliyor, toast çıkmıyor. Yeniden dene yok. |
| 10 | Olay başlığı | ÇALIŞIYOR | page.tsx:225 | `truncate` ile tek satır; tam başlığa erişim yolu yok. |
| 11 | Tip rozeti | KISMİ | page.tsx:160-165, 228; incident-detection.ts:146; negative-feedback-sla/route.ts:43; auto-reply-engine.ts:110 | Sistem `negative_spike`, `negative_feedback_sla_breach`, `FEEDBACK` tiplerini de üretiyor; etiket haritasında yok → kullanıcıya ham kod gösteriliyor. |
| 12 | Önem rozeti | KISMİ | page.tsx:142-147, 230-232 | Renk sınıfları yalnızca açık tema için (`text-red-600` koyu zeminde düşük kontrast); önem sadece renk + kelime, sıralamaya/vurguya yansımıyor. |
| 13 | Durum rozeti | ÇALIŞIYOR | page.tsx:148-153, 233 | — |
| 14 | Atanan kişi gösterimi | KISMİ | page.tsx:234-239; route.ts:66-68 | Gösteriliyor ama UI'dan atama yapılamıyor; API tarafında `assignedToId` doğrulanmadığı için başka kiracının ad/e-postası gösterilebilir (Bulgu 2). |
| 15 | Son tarih (dueAt) gösterimi | KISMİ | page.tsx:240-245 | Hiçbir üretici (UI, tespit, SLA, kural) `dueAt` set etmiyor → alan pratikte hep boş. |
| 16 | "Çözüldü" rozeti | KISMİ | page.tsx:248-253; [id]/route.ts:98-100 | Yalnızca `resolvedAt` doluysa görünür; UI'dan çözme yolu yok, PATCH `status: resolved` gönderilse bile `resolvedAt` otomatik dolmuyor. |
| 17 | Oluşturulma zamanı | EKSİK | page.tsx:217-254 (createdAt hiç render edilmiyor) | Bir olay listesinde "ne zaman?" bilgisinin olmaması en temel eksik. |
| 18 | Açıklama / detay görünümü | EKSİK | page.tsx:224-247; incident-detection.ts:110,130,149 | Otomatik olayların açıklayıcı metni ("Son 7 gün ort. 3.2, önceki 4.1…") veritabanında var ama hiçbir yerde gösterilmiyor; satır tıklanamıyor. |
| 19 | Eşik değeri (thresholdValue) gösterimi | EKSİK | route.ts:61-69 (alan dönüyor), page.tsx (kullanılmıyor) | — |
| 20 | Kaynak geri bildirime bağlantı | EKSİK | negative-feedback-sla/route.ts:48; auto-reply-engine.ts:111 (`metadata.feedbackId`) | `metadata` istemciye gidiyor ama arayüz tip tanımında bile yok (page.tsx:40-52); SLA olayına tıklayıp ilgili yorumu yanıtlamak mümkün değil. |
| 21 | Satır giriş animasyonu | ÇALIŞIYOR | page.tsx:218-222; providers.tsx:232 | Hafif (4px + opacity), global `reducedMotion="user"`. Her refetch'te liste yeniden mount olduğundan animasyon her filtrede tekrar oynuyor. |
| 22 | Sayfalama (20'li) | KISMİ | page.tsx:258-283; route.ts:39-41 | Çalışıyor; filtre değişince sayfa sıfırlanmadığı için "olmayan sayfa"da takılabiliyor (Bulgu 6). |
| 23 | Oluşturma diyaloğu: Başlık | ÇALIŞIYOR | page.tsx:294-301, 109-112 | İstemci `trim` kontrolü var; sunucuda üst uzunluk sınırı yok. |
| 24 | Oluşturma diyaloğu: Açıklama | ÇALIŞIYOR | page.tsx:302-310 | Kaydediliyor ama listede hiç görünmüyor (#18). |
| 25 | Oluşturma diyaloğu: Tip | ÇALIŞIYOR | page.tsx:312-325 | Sunucu `type`'ı serbest string kabul ediyor (route.ts:23). "NPS düşüşü" için hiçbir otomatik tespit yok. |
| 26 | Oluşturma diyaloğu: Önem | ÇALIŞIYOR | page.tsx:326-339 | — |
| 27 | "Oluştur" gönderimi | KISMİ | page.tsx:108-140, 346-349 | Çift tıklamaya karşı `disabled` var. `<form>` olmadığı için Enter ile gönderilmiyor; başarıdan sonra tip/önem sıfırlanmıyor; gönderim sırasında diyalog kapatılabiliyor. Sorumlu/son tarih alanı yok. |
| 28 | "İptal" | ÇALIŞIYOR | page.tsx:343-345 | Taslak korunuyor (bilinçli değilse kafa karıştırıcı). |
| 29 | Toast bildirimleri | KISMİ | page.tsx:92,110,127,133,136; admin-toast.ts:14-19 | `admin-toast` her mesaja ASCII Türkçe "Basarili: " / "Dikkat: " ön eki ekliyor → EN arayüzde "Basarili: Incident created". Sunucu hata metinleri de Türkçe sabit ([id]/route.ts:36,42,81). |
| 30 | Durum değiştirme / çözme | EKSİK | [id]/route.ts:58-164 (PATCH var); repo genelinde `/api/dealer/incidents/` PATCH çağıran istemci yok | Olayın yaşam döngüsü kapatılamıyor (Bulgu 4). |
| 31 | Sorumlu atama | EKSİK | aynı | `DealerStaff` modeli (schema.prisma:2432) mevcut, ama seçici yok. |
| 32 | Son tarih / SLA belirleme | EKSİK | aynı | — |
| 33 | Otomatik eşik tespiti (puan düşüşü, şikayet artışı, aciliyet/toksik) | KISMİ | route.ts:49-58; incident-detection.ts:81-156 | Yalnızca bayi bu sayfayı açtığında çalışıyor; yarışa açık; açık olay 7 günü geçince kopya üretiyor; başlıklar Türkçe sabit (Bulgu 3, 9). |
| 34 | "Demo olay" (sayfa boş kalmasın diye) | SAHTE | route.ts:53-54; incident-detection.ts:158-173 | Gerçek `Incident` satırı olarak kalıcı yazılıyor ve tüm "açık olay" sayaçlarını kirletiyor (Bulgu 1). |
| 35 | Yeni olay bildirimi (in-app / push / e-posta) | EKSİK | incident-detection.ts:40-50 (bildirim yok); yalnızca negative-feedback-sla/route.ts:51-58 bildirim yazıyor | "Kriz radarı" kriz anında haber vermiyor. |
| 36 | `incident.created` webhook'u | EKSİK | webhook-dispatch.ts:19 (tip tanımlı); hiçbir yerde `dispatchWebhookEvent('incident.created', …)` çağrısı yok | Partner entegrasyonu için ilan edilmiş ama tetiklenmeyen olay. |
| 37 | Modül kapısı (`incidents` modülü) | KISMİ | module-controls.ts:44; sidebar.tsx:444-454; route.ts (assertModuleEnabled yok) | Admin modülü kapatınca menü gizleniyor ama sayfa ve API doğrudan URL ile çalışmaya devam ediyor. |
| 38 | Kiracı izolasyonu (liste + PATCH) | ÇALIŞIYOR | route.ts:43-47; [id]/route.ts:40-45, 78-83, 131-134 | Liste `dealerId` ile filtreleniyor; PATCH `updateMany({id, dealerId})` ile korunuyor. İstisna: `assignedToId` (Bulgu 2). |
| 39 | Arama / tip-önem filtresi / sıralama | EKSİK | page.tsx:189-201 (yalnız durum); route.ts:65 (sabit `createdAt desc`) | Önem önceliğine göre sıralama yok — kritik olay eski düşük olayların altında kalabilir. |
| 40 | Mobil yerleşim | ÇALIŞIYOR | page.tsx:169, 179, 222 | `flex-wrap` ve `sm:` kırılımları doğru; satır içi tüm rozetler mobilde sarılıyor. |
| 41 | Form erişilebilirliği | KISMİ | page.tsx:295-337 (`Label` `htmlFor` yok, input `id` yok); 190 (filtre Select'inde `aria-label` yok) | Ekran okuyucu alan adını okuyamaz. |
| 42 | Tekil olay GET ucu (`/api/dealer/incidents/[id]`) | KISMİ | [id]/route.ts:17-56 | Doğru yetkilendirilmiş ama hiçbir istemci tüketmiyor — ölü uç. |

**Durum özeti:** ÇALIŞIYOR 16 · KISMİ 14 · BOZUK 1 · SAHTE 1 · EKSİK 10 (toplam 42)

---

## Bulgular

### 1. Sahte "demo olay" gerçek veri olarak yazılıyor ve tüm açık-olay sayaçlarını kirletiyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü / sahte içerik
- **Kanıt:** `app/api/dealer/incidents/route.ts:53-54`; `lib/incident-detection.ts:161-172`; tüketiciler: `app/api/dealer/copilot-summary/route.ts:94-96` (`status: { not: 'resolved' }`), `app/api/dealer/morning-briefing/route.ts:49-54, 94-95` ("N açık olay"), `app/api/admin/dealers-health/route.ts:47-51, 91` (`score -= incidents * 6`), `lib/action-items-ai.ts:97, 120-127` (LLM bağlamı).
- **Sorun:** Bayi sayfayı ilk açtığında hiç olayı yoksa `type: 'other', severity: 'low', status: 'open'` olan "Olaylar / Kriz Radarı" başlıklı bir kayıt **kalıcı olarak** veritabanına yazılıyor. Arayüzde çözme yolu olmadığı için (Bulgu 4) bu kayıt sonsuza dek "açık" kalıyor. Sonuçları: Copilot "1 açık olay" kartı gösterir ve bayiyi bu sayfaya yönlendirir; sabah brifingi "1 açık olay" der; admin sağlık skoru o bayiden 6 puan düşer; AI aksiyon üretimi bu sahte olayı gerçek kriz sanarak bağlama alır. Kullanıcı açısından da yanıltıcı: "boş durum" UI'ı (page.tsx:207-214) zaten var, demo kayda ihtiyaç yok.
- **Profesyonel öneri:** `ensureDemoIncidentIfEmpty` tamamen kaldırılmalı; boş durum, ürünün asıl değerini anlatan bir **eğitici boş durum** olmalı ("Radar 3 eşiği izliyor: 7 günlük puan düşüşü ≥0.5, 24 saatte ≥3 olumsuz yorum, aciliyet ≥0.8 / toksik içerik — şu an hepsi normal" + eşikleri gösteren mini durum göstergeleri). Mevcut demo kayıtları için tek seferlik bir veri temizleme betiği (title = 'Olaylar / Kriz Radarı' AND type = 'other' AND description LIKE 'Eşik aşımında%') planlanmalı — canlı Neon'a dikkatle, yedekli.
- **Efor:** S

### 2. `assignedToId` doğrulanmıyor → başka kiracıdaki kullanıcının ad ve e-postası sızabilir
- **Önem:** yüksek · **Kategori:** güvenlik (IDOR / PII sızıntısı)
- **Kanıt:** `app/api/dealer/incidents/route.ts:28, 114` (POST), `app/api/dealer/incidents/[id]/route.ts:12, 96` (PATCH); okuma tarafı `route.ts:66-68` ve `[id]/route.ts:30, 106, 124, 144` (`assignedTo: { select: { id, name, email } }`).
- **Sorun:** Bayi, kendi olayına `assignedToId` olarak **herhangi bir** `User.id` yazabiliyor (başka bayi, müşteri, admin). Sonraki listeleme o kullanıcının adını ve e-postasını döndürür. cuid tahmin edilemez olsa da kullanıcı kimlikleri platformun başka yüzeylerinde (paylaşılan linkler, istemci yanıtları) görünebildiğinden bu bir kiracılar-arası PII okuma kapısıdır. Ayrıca geçersiz bir id POST'ta yakalanmamış Prisma FK hatası (`P2003`) → çıplak 500 üretir (POST'ta try/catch yok: route.ts:85-120).
- **Profesyonel öneri:** Atanabilir kişiler kümesini sunucuda tanımlayın: bayinin kendisi + `DealerStaff` kayıtlarındaki aktif `userId`'ler (`prisma.dealerStaff.findFirst({ where: { dealerId, userId: assignedToId, isActive: true } })`). Doğrulama hem POST hem PATCH'te ortak bir `assertAssignableForDealer()` yardımcısında yapılmalı; e-posta yerine yalnızca ad + rol döndürülmeli. POST'a `try/catch` + `responseIfDatabaseUnavailable` eklenmeli (PATCH'teki desenle aynı).
- **Efor:** S

### 3. Eşik tespiti bir GET isteğinin yan etkisi: yalnızca bakınca çalışıyor, yarışa açık, kopya üretiyor
- **Önem:** yüksek · **Kategori:** mimari / veri bütünlüğü
- **Kanıt:** `app/api/dealer/incidents/route.ts:49-58`; `lib/incident-detection.ts:18-30` (kontrol), `:40-50` (oluşturma), `:102, 121, 142`.
- **Sorun:**
  1. **Alarm ancak bakıldığında çalar:** Tespit sadece bayi `/dealer/incidents` listesini açtığında koşuyor. Bayi bir hafta girmezse "kriz radarı" o hafta hiçbir krizi kaydetmez; Copilot/brifing sayaçları da buna bağlı olarak eksik kalır.
  2. **Yarış koşulu:** `hasOpenIncidentOfType` → `create` arasında kilit/tekillik yok. Kullanıcı filtreyi hızlıca değiştirdiğinde istemci önceki isteği iptal eder (page.tsx:72) ama sunucu tarafı işlem devam eder; eşzamanlı iki GET aynı tipte iki olay yaratabilir.
  3. **Haftalık kopya:** Kontrol yalnızca son 7 gündeki çözülmemiş olaylara bakıyor (`createdAt: { gte: since }`); çözülmemiş bir "Puan düşüşü" olayı 8. güne girince koşul hâlâ sürüyorsa aynı olay yeniden yaratılır.
  4. **Çözünce anında geri gelir:** `status: { not: 'resolved' }` filtresi nedeniyle olay çözüldükten sonraki ilk GET'te, 14 günlük pencere henüz kaymadığı için aynı olay yeniden açılır.
  5. Hata `catch (_)` ile tamamen yutuluyor (route.ts:55-57) — gözlemlenebilirlik yok.
- **Profesyonel öneri:** Tespiti okuma yolundan çıkarın. (a) Olay-güdümlü: geri bildirim analizi tamamlandığında (`feedback-analyze` Inngest fonksiyonu) ilgili bayi için `runIncidentDetection` tetiklensin; (b) güvenlik ağı olarak günlük cron. Tekillik için `Incident`'a `dedupeKey` (örn. `rating_drop:<dealerId>:<ISO hafta>`) + `@@unique([dealerId, dedupeKey])` ekleyip `upsert`/`createMany({ skipDuplicates })` kullanın. "Çözüldü" sonrası yeniden açılmayı önlemek için olaya `cooldownUntil` veya "aynı koşul, çözümden sonra en az X saat ve yeni veriyle yeniden tetiklenir" kuralı. Hatalar `console.error` + Sentry/PostHog olayıyla raporlanmalı.
- **Efor:** M

### 4. Olay yaşam döngüsü arayüzde kapatılamıyor; PATCH ucu ölü
- **Önem:** yüksek · **Kategori:** işlevsellik
- **Kanıt:** `app/api/dealer/incidents/[id]/route.ts:58-164` (PATCH: status/assignedToId/dueAt/resolvedAt); repo genelinde bu uca çağrı yapan istemci yok (yalnızca page.tsx:81 GET ve :115 POST); page.tsx:217-254 satırlarında hiçbir aksiyon yok.
- **Sorun:** Açıklamada "atama takibi" vaat ediliyor (tr.json `dealerIncidents.description`) ama bayi bir olayı ne üstlenebiliyor, ne atayabiliyor, ne de çözebiliyor. Sonuç: her otomatik olay (ve demo olay) sonsuza dek "Açık" kalıyor; Copilot/brifing/admin sağlık skoru sürekli şişiyor; `team-autotask` yüksek/kritik açık olayları her çalıştırmada aday olarak görüyor. Ayrıca PATCH `status: 'resolved'` geldiğinde `resolvedAt` otomatik set edilmiyor ([id]/route.ts:95-100) — iki alan birbirinden kopabilir.
- **Profesyonel öneri:** Satıra hızlı aksiyonlar (Üstlen / Ata / Çöz) ve tam ekran bir **detay çekmecesi (Sheet)** ekleyin: başlık, açıklama, eşik değeri, kaynak yorum(lar), zaman çizelgesi, sorumlu seçici (`DealerStaff` listesi), son tarih, çözüm notu (zorunlu kısa "kök neden / ne yapıldı" alanı). Sunucuda durum makinesi: `open → assigned → in_progress → resolved` (+ `reopened`), `resolved`'a geçişte `resolvedAt = now()` ve `resolvedById`, geri açılışta temizlenmesi; her geçiş için `IncidentEvent` (audit) satırı. İyimser güncelleme + hata durumunda geri alma.
- **Efor:** M

### 5. Liste okunamıyor: zaman, açıklama, eşik ve kaynak bağlantısı yok; sistem tipleri ham kod
- **Önem:** yüksek · **Kategori:** UX / bilgi mimarisi
- **Kanıt:** page.tsx:40-52 (tip tanımında `metadata` yok), 217-254 (createdAt/description/thresholdValue render edilmiyor), 160-165 (yalnızca 4 tip etiketi); üreticiler: incident-detection.ts:107-111, 127-131, 146-150; negative-feedback-sla/route.ts:43-47; auto-reply-engine.ts:106-111.
- **Sorun:** Bir olay satırında yalnızca kırpılmış başlık + üç rozet var. "Yüksek aciliyet veya toksik içerik tespit edildi" gibi bir başlığın **hangi yorum, ne zaman, kaç tane** sorusu yanıtsız. SLA olayında ilgili geri bildirimin kimliği yalnızca açıklama metninde ("Geri bildirim ID: …") ve o da gösterilmiyor. `negative_spike`, `negative_feedback_sla_breach`, `FEEDBACK` tipleri kullanıcıya olduğu gibi yazılıyor.
- **Profesyonel öneri:** Satırı "olay kartı"na dönüştürün: sol kenarda önem şeridi + ikon, başlık, tek satır açıklama özeti, göreli zaman ("3 saat önce") + mutlak zaman tooltip'i, eşik metriği (ör. "Ort. puan 4.1 → 3.2"), etkilenen yorum sayısı, sorumlu avatarı, SLA geri sayımı. `type` alanını bir **kayıtlı katalog** (`lib/incident-types.ts`: kod → i18n anahtarı, ikon, varsayılan önem, varsayılan SLA saati) üzerinden yönetin ve tüm üreticileri (tespit, SLA, otomatik kural, manuel) bu katalogdaki kodlara taşıyın (`FEEDBACK` → `rule_triggered`). `metadata.feedbackIds[]` standart hâle gelsin, kartta "İlgili yorumlar (3)" bağlantısı `/dealer/feedbacks?ids=…`'a gitsin.
- **Efor:** M

### 6. Filtre değişince sayfa sıfırlanmıyor → boş ve çıkışsız görünüm
- **Önem:** orta · **Kategori:** hata (UI durumu)
- **Kanıt:** page.tsx:189 (`onValueChange={setStatusFilter}`, `setPage(1)` yok), 99 (deps `[page, statusFilter]`), 258 (`totalPages > 1` koşulu).
- **Sorun:** "Tümü"nde 3. sayfadayken "Çözüldü" (tek sayfa) seçilirse istek `page=3` ile gider, liste boş gelir, `totalPages = 1` olduğu için sayfalama gizlenir ve kullanıcıya "Henüz olay kaydı yok / İlk olayı oluştur" gösterilir. Önceki sayfaya dönecek kontrol yoktur.
- **Profesyonel öneri:** Filtre değişiminde `setPage(1)`; ayrıca `page > totalPages` ise otomatik geri çekilme. Filtre + sayfa durumunu URL arama parametrelerine (`?status=&page=`) taşıyın — paylaşılabilir, geri tuşu uyumlu ve Copilot gibi yerlerden derin bağlantı (`/dealer/incidents?status=open&severity=high`) mümkün olur.
- **Efor:** S

### 7. Hata yönetimi: `res.ok` kontrol edilmiyor, POST istisnaları yakalanmıyor
- **Önem:** orta · **Kategori:** hata yönetimi
- **Kanıt:** page.tsx:81-88 (yalnızca `data.items` varlığına bakılıyor); route.ts:32-83 (GET'te try/catch yok), 85-120 (POST'ta `request.json()` ve `prisma.incident.create` korumasız).
- **Sorun:** Oturum düşmesi (401), token-replay (403) veya veritabanı kesintisi (503) durumunda kullanıcı ya bayat listeyi ya da yanıltıcı "Henüz olay yok" ekranını görür; toast çıkmaz. Bozuk JSON gövdesi veya FK hatası POST'ta çıplak 500 döner.
- **Profesyonel öneri:** İstemcide `if (!res.ok)` dalında hata durumunu ayrı bir state'e alın ve kart içinde "Yüklenemedi — Yeniden dene" bileşeni gösterin (diğer bayi sayfalarıyla ortak bir `ErrorState` bileşeni). Sunucuda GET/POST'u `[id]` ucundaki gibi `try/catch` + `responseIfDatabaseUnavailable` ile sarın; `request.json()` hatasında 400 dönün.
- **Efor:** S

### 8. Girdi doğrulaması gevşek; bayi içeriği admin iç ekip panosuna taşınıyor
- **Önem:** orta · **Kategori:** güvenlik / veri bütünlüğü
- **Kanıt:** route.ts:22-30 (`type: z.string().min(1)`, `title`/`description` üst sınırsız, rate limit yok), 106 (ADMIN için `body.dealerId` doğrulanmadan kullanılıyor); `lib/team-autotask.ts:43-61` (tüm bayilerin açık `high/critical` olayları `🚨 ${inc.title}` başlığıyla `CompanyTask` olarak admin ekip panosuna yazılıyor).
- **Sorun:** Bayi sınırsız sayıda, sınırsız uzunlukta "kritik" olay açabilir; admin "otomatik görev üret" dediğinde bu başlık ve açıklamalar iç ekip panosuna olduğu gibi kopyalanır (çapraz kiracı içerik taşıması, spam vektörü). `type` serbest olduğundan rastgele kodlar da yazılabilir.
- **Profesyonel öneri:** `type` → `z.enum(INCIDENT_TYPES)`; `title` ≤ 140, `description` ≤ 4000 karakter; POST'a bayi başına rate limit (projede Upstash Redis zaten var). `team-autotask` yalnızca `source: 'system'` olayları (manuel olmayanlar) almalı veya manuel olaylarda admin onayı istenmeli; bunun için `Incident`'a `source` (`system|sla|rule|manual`) alanı eklenmeli. ADMIN `dealerId`'si mevcut ve rolü DEALER olan bir kullanıcı olarak doğrulanmalı.
- **Efor:** S

### 9. Dil karışıklığı: sistem olayları ve toast ön ekleri dil bağımsız Türkçe
- **Önem:** orta · **Kategori:** i18n
- **Kanıt:** incident-detection.ts:109-110, 129-130, 148-149, 168-169; negative-feedback-sla/route.ts:46-47; auto-reply-engine.ts:107-108; admin-toast.ts:14-19 ("Basarili: ", "Dikkat: " — Türkçe karaktersiz); [id]/route.ts:36, 42, 81, 161.
- **Sorun:** EN arayüz kullanan bayi "Puan düşüşü tespit edildi" başlıklarını ve "Basarili: Incident created" toast'larını görür. Ayrıca `admin-toast` ön ekleri TR'de bile "Başarılı" yerine "Basarili" yazıyor.
- **Profesyonel öneri:** Olay başlığı/açıklaması veritabanına serbest metin olarak değil, `titleKey` + `params` (JSON) olarak yazılsın; render anında i18n ile çözülsün (eski kayıtlar için `title` geri dönüş olarak kalır). Bayi panelinde `admin-toast` yerine ön eksiz `sonner` ya da locale-farkında bir `appToast` kullanılsın.
- **Efor:** M

### 10. Bildirim yok, webhook ilan edilmiş ama tetiklenmiyor
- **Önem:** orta · **Kategori:** işlevsellik
- **Kanıt:** incident-detection.ts:40-50 (yalnızca `incident.create`); webhook-dispatch.ts:19 (`'incident.created'` tipi) — repo genelinde bu olayla `dispatchWebhookEvent` çağrısı yok; karşılaştırma: negative-feedback-sla/route.ts:51-58 (SLA olayı bildirim yazıyor).
- **Sorun:** Bir "kriz radarı"nın temel değeri kriz anında haber vermesidir. Burada eşik aşımı (zaten yalnızca sayfa açılınca tespit ediliyor) ne uygulama içi bildirim, ne push, ne e-posta üretiyor. Partner webhook kataloğunda `incident.created` varmış gibi görünüyor ama hiç gönderilmiyor.
- **Profesyonel öneri:** Tek bir `createIncident()` servis fonksiyonu (tüm üreticilerin geçtiği) olay oluşturunca: `Notification` satırı + `RealtimeNotifications` akışı (panelde zaten var, app/dealer/layout.tsx:48) + önem ≥ high ise web push + `dispatchWebhookEvent('incident.created')`. Bayi ayarlarında önem eşiğine göre kanal tercihi.
- **Efor:** M

### 11. Tespit sorgusu her istekte 14 günlük tüm geri bildirimi belleğe çekiyor
- **Önem:** düşük · **Kategori:** performans
- **Kanıt:** incident-detection.ts:56-75 (`findMany` limitsiz), 91-100 (JS'te filtre + ortalama); route.ts:52-54, 60-71 (istek başına ~6-8 sorgu, önbellek yok).
- **Sorun:** Yoğun bir bayide (günde yüzlerce yorum) her liste, filtre ve sayfa geçişi binlerce satır taşır. Bulgu 3'teki gibi tespit okuma yolundan çıkarılınca bu sorun büyük ölçüde kendiliğinden çözülür.
- **Profesyonel öneri:** Tespiti `groupBy`/`aggregate` ile SQL'e indirin (`_avg: { rating }`, `_count` pencereleri; `@@index([qrCodeId, deletedAt, createdAt])` zaten mevcut). Liste GET'i salt okuma olsun; sayaçlar Upstash Redis'te kısa TTL ile önbelleğe alınabilir.
- **Efor:** S

### 12. Modül kapısı API'de uygulanmıyor
- **Önem:** düşük · **Kategori:** mimari / yetki
- **Kanıt:** module-controls.ts:44 (`incidents` modülü, `severity: 'optional'`); sidebar.tsx:444-454 (yalnızca menü gizleme); route.ts ve [id]/route.ts'de `assertModuleEnabled` yok (karşılaştırma: app/api/dealer/campaigns/route.ts:28).
- **Sorun:** Admin "Olaylar" modülünü kapatsa bile sayfa doğrudan URL ile açılır, API çalışır ve — en önemlisi — GET'teki tespit/demo yazımı sürer.
- **Profesyonel öneri:** GET/POST/PATCH'in başına `assertModuleEnabled('incidents')`; sayfa düzeyinde kapalı modül için açıklayıcı "Bu modül işletmeniz için etkin değil" ekranı.
- **Efor:** S

### 13. Erişilebilirlik ve görsel hiyerarşi
- **Önem:** düşük · **Kategori:** erişilebilirlik / görsel
- **Kanıt:** page.tsx:295, 303, 313, 327 (`Label` `htmlFor`'suz, input'lar `id`'siz); 190 (filtre `SelectTrigger`'ında erişilebilir ad yok, yalnızca ikon + değer); 142-147 (önem renkleri yalnızca açık tema tonları); 225 (`truncate`, tam başlığa erişim yok).
- **Sorun:** Ekran okuyucu form alanlarını adlandıramaz; filtre "Tümü, açılır kutu" diye okunur. Kritik olay, düşük olayla aynı kart ağırlığında; koyu temada `text-red-600` / `bg-red-500/20` zeminde kontrast WCAG AA sınırının altında kalma riski taşır (doğrulanmadı — ölçüm yapılmadı).
- **Profesyonel öneri:** `Label htmlFor` + `id` eşleştirmesi; `SelectTrigger aria-label={t('…filterByStatus')}`; önem için renk + ikon + metin üçlüsü ve `dark:` varyantları; kritik/yüksek olaylarda sol kenar şeridi ve listede üstte sabitleme.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

| Eksik | Kıyas | Neden önemli |
|---|---|---|
| **Vaka (case) detayı + zaman çizelgesi** — her durum geçişi, atama, not, ilgili yorumlar | Medallia Case Management, Qualtrics Tickets | Kapalı döngü (close-the-loop) ancak olayın ne zaman kim tarafından nasıl kapatıldığı izlenebilirse ölçülebilir. |
| **Sorumlu atama + SLA geri sayımı + eskalasyon** (süre aşılınca sahibine/işletme sahibine bildirim) | Qualtrics ticket SLA, Zendesk-tarzı politikalar | Mevcut modelde `assignedToId`/`dueAt` var ama kullanılmıyor; `DealerStaff` ile doğal eşleşme mümkün. |
| **Gerçek zamanlı uyarı kanalları** (in-app, push, e-posta, webhook) + kanal/önem tercihleri | Medallia Alerts, Google Business Profile yeni yorum bildirimi, Yelp for Business | "Kriz radarı" adının vaadi. |
| **Yapılandırılabilir eşikler** (bayi kendi puan düşüş eşiğini, şikayet sayısını, izlenecek QR/şubeyi seçer) + "şu an izlenen kurallar" görünümü | Medallia alert rules, Qualtrics XM Actions | Sabit kodlu eşikler (incident-detection.ts:10-14) küçük kafe ile zincir restoranı aynı ölçüye vuruyor. |
| **Kök neden etiketi + çözüm notu + "benzer olaylar"** | Medallia Root Cause, Qualtrics Text iQ | Tekrarlayan krizleri (her cuma akşamı servis yavaşlığı) görünür kılar. |
| **Özet metrik şeridi**: açık / kritik / SLA aşan / ortalama çözüm süresi (MTTR) / son 30 gün trendi | Square Dashboard, Toast operasyon uyarıları | Sayfaya girildiğinde "durum ne?" sorusunu tek bakışta yanıtlar. |
| **Arama, tip/önem/sorumlu/şube filtreleri, önem önceliğine göre sıralama, toplu işlem** (toplu çöz/ata) | Tüm CX ticket araçları | 20'lik sayfada yalnız durum filtresi ölçeklenmez. |
| **Olaydan aksiyon / telafi üretme**: "Bu olay için aksiyon oluştur" (ActionItem `sourceModule: 'incident'` şemada tanımlı ama üreten yok, schema.prisma:1312) ve etkilenen müşterilere telafi teklifi | Medallia Action Planning | Qratex'in diğer modülleriyle (action-items, remedy-queue) döngüyü kapatır. |
| **Dışa aktarma (CSV) ve haftalık olay raporu** | Qualtrics, Medallia | Zincir işletmelerde yönetim raporlaması. |

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sabah paneli açtığında "kriz var mı?" sorusunun cevabını 2 saniyede almalı; kriz varsa tek tıkla nedenini (hangi yorumlar, hangi metrik nasıl değişti) görüp birine atamalı, gerekirse telafi başlatmalı ve çözüm notuyla kapatmalı. Kriz yoksa ekran "her şey yolunda, şunları izliyoruz" güvencesi vermeli — sahte kayıtla değil.

**Yerleşim:**
1. **Durum başlığı (hero yerine):** Sol tarafta canlı "radar durumu" — Normal / Dikkat / Kriz — ve altında izlenen 3-4 kuralın mini göstergeleri (7 günlük puan ortalaması vs önceki 7 gün, 24 saatlik olumsuz yorum sayacı, aciliyet bayrağı, SLA bekleyen yorum sayısı), her biri eşiğe uzaklığını gösteren ince bir çubukla. Sağda "Yeni olay" ve "Kuralları düzenle".
2. **Metrik şeridi:** Açık · Kritik · SLA aşan · Ortalama çözüm süresi · 30 gün trend sparkline.
3. **Olay gelen kutusu:** Sol kenarda önem şeridi olan kartlar; varsayılan sıralama "önem → SLA yakınlığı → zaman". Üstte sekmeler (Açık / Bende / Çözülen) + arama + tip/önem/şube/sorumlu filtreleri (URL'ye bağlı). Masaüstünde iki sütun (liste + seçili olay detayı), mobilde liste → tam ekran `Sheet`.
4. **Olay detayı:** Başlık, önem, metrik kanıtı (önce/sonra mini grafik), ilgili yorumlar (doğrudan yanıtla/telafi butonlarıyla), zaman çizelgesi (oluşturuldu → atandı → çözüldü, kim/ne zaman), sorumlu seçici (`DealerStaff`), son tarih, kök neden etiketi, çözüm notu; "Aksiyon öğesi oluştur" ve "Telafi teklifi gönder" kısayolları.

**Motion / 3D:** 3D gereksiz — bu bir operasyon ekranı. Ölçülü motion: (a) radar durumu "Kriz"e geçtiğinde başlık ikonunun etrafında tek seferlik, 600 ms'lik yumuşak bir halka (pulse) — sürekli dönen radar animasyonu dikkat dağıtır; (b) yeni gelen olay kartı için `layout` animasyonuyla listeye kayarak girme; (c) çözülen kartın `AnimatePresence` ile daralıp "Çözülenler" sekmesine akması; (d) sayaçlarda sayı geçişi. Hepsi global `reducedMotion="user"` ile otomatik söner; liste yeniden yüklenirken tam spinner yerine iskelet + `opacity` geçişi.

**Veri / API değişiklikleri:**
- `Incident` modeline: `source` (`system|sla|rule|manual`), `dedupeKey` + `@@unique([dealerId, dedupeKey])`, `titleKey` + `titleParams Json?`, `resolvedById`, `resolutionNote`, `rootCause`, `locationId?`, `feedbackIds String[]` (ya da `metadata` için tipli şema); yeni `IncidentEvent` (audit/timeline) modeli. İndeks: `@@index([dealerId, status, severity, createdAt])`.
- `lib/incident-types.ts` kataloğu (kod, i18n anahtarı, ikon, varsayılan önem, varsayılan SLA).
- `lib/incidents/service.ts`: `createIncident()` (dedupe + bildirim + webhook + audit), `transitionIncident()` (durum makinesi, `resolvedAt` tutarlılığı), `assertAssignableForDealer()`.
- Tespit: `feedback-analyze` Inngest fonksiyonunun sonunda olay-güdümlü + günlük cron güvenlik ağı; SQL aggregate tabanlı; bayi bazlı eşik ayarları `Settings` veya yeni `IncidentRule` tablosunda.
- API: `GET /api/dealer/incidents` salt okuma + `severity`, `type`, `q`, `assignee`, `sort` parametreleri ve `summary` (sayaçlar) bloğu; `PATCH /api/dealer/incidents/[id]` durum makinesi üzerinden; `POST /api/dealer/incidents/[id]/notes`; `GET /api/dealer/incidents/rules` + `PUT`. Hepsinde `assertModuleEnabled('incidents')`.
- Tek seferlik veri temizliği: demo olaylar + tip normalizasyonu (`FEEDBACK` → `rule_triggered`).

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/action-items`** — Aynı yaşam döngüsü (`pending/assigned/in_progress/done`) ve aynı "sahip ata, kapat" vaadi; şemada `ActionItem.sourceModule = 'incident'` (schema.prisma:1312) bağlantısı öngörülmüş ama hiç kurulmamış. **Öneri:** Birleştirmeyin, ilişkilendirin: olay = "ne oldu" (tespit + kanıt), aksiyon = "ne yapacağız" (görev). Olay detayından aksiyon üretilsin, olay çözülünce bağlı açık aksiyonlar hatırlatılsın.
- **`/dealer/remedy-queue` ve `/dealer/feedbacks`** — SLA olayı (`negative_feedback_sla_breach`) aslında "yanıtlanmamış olumsuz yorum" kuyruğunun bir kopyası. **Öneri:** SLA olayları tek tek yorum başına değil, bayi başına toplu ("5 yorum SLA'yı aştı") tek olay olsun ve detayından feedbacks/remedy-queue'ya derin bağlantı verilsin; yorum yanıtlanınca olay otomatik çözülsün.
- **`/dealer/settings/auto-replies`** — `action: 'incident'` kuralı olay üretiyor (auto-reply-engine.ts:103-115) ama olay ekranında kuralı bilmek/düzenlemek mümkün değil. **Öneri:** "Kuralları düzenle" paneli incidents altında tek yerde toplansın (eşik kuralları + otomatik yanıt kuralının olay aksiyonu).
- **`/dealer/copilot`, `/dealer` (sabah brifingi), `/dealer/operations-brief`** — Açık olay sayısını gösteriyor; demo olay düzeltilmeden bu sayaçlar yanıltıcı. Bu sayfalar yalnızca özet + derin bağlantı (`/dealer/incidents?status=open&severity=high`) göstermeye devam etmeli.
- **`/dealer/radar`** — Adı "Radar" ama geri kazanım (win-back) ekranı; bu sayfanın başlığı "Kriz Radarı". **Öneri:** Bu sayfa menüde "Olaylar" olarak kalsın, başlıktan "Radar" kelimesi çıkarılsın ya da `/dealer/radar` "Geri Kazanım" olarak yeniden adlandırılsın.
- **Admin tarafı (`/admin/ekip` otomatik görev, `/admin/dealers-health`)** — Bayi olaylarını tüketiyor; `source` alanı eklenince yalnızca sistem kaynaklı olaylar admin metriklerine/görevlerine girmeli.

**Sonuç:** Sayfa kaldırılmamalı — Qratex'in kapalı-döngü CX vaadinin kritik parçası — ama mevcut hâliyle bir "salt okunur kayıt listesi"; yukarıdaki servis katmanı + detay çekmecesi + olay-güdümlü tespit ile **yeniden tasarlanmalı**.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod değiştirilmedi, veritabanına/sunucuya dokunulmadı. Her iddia çağıran ve çağrılan taraflar baştan okunarak çürütülmeye çalışıldı.

### 1. Demo olay gerçek `Incident` satırı olarak kalıcı yazılıyor — **DOĞRULANDI**
- `app/api/dealer/incidents/route.ts:50-54`: DEALER rolüyle her GET'te tespit çalışıyor; bayinin hiç olayı yoksa `ensureDemoIncidentIfEmpty` çağrılıyor.
- `lib/incident-detection.ts:161-172` → `createIncident` (`:40-50`) `status: 'open'`, `type: 'other'`, `severity: 'low'` ile gerçek satır yazıyor. Satırı ayırt eden bir işaret yok (`source`/`metadata` boş; şema `prisma/schema.prisma:1249-1273`).
- Çözme yolu yok (bkz. iddia 4), dolayısıyla satır kalıcı olarak "açık".
- Tüketiciler gerçekten sayıyor: `app/api/dealer/copilot-summary/route.ts:94-96` (`status != resolved`), `app/api/dealer/morning-briefing/route.ts:49-54` (`open|assigned|in_progress`), `app/api/admin/dealers-health/route.ts:47-50,91` (`score -= incidents * 6`), `lib/action-items-ai.ts:97-100,127` (AI bağlamına "Olaylar / Kriz Radarı" başlıklı açık olay olarak giriyor). `lib/team-autotask.ts:43-45` yalnızca high/critical aldığı için demo olay (low) oraya girmiyor — iddiada zaten ileri sürülmemiş.
- **Yeniden üretim:** Hiç olayı olmayan yeni bir bayi `/dealer/incidents` sayfasını bir kez açar → 1 adet `open` olay oluşur → `/dealer/copilot` "1 açık olay" gösterir, admin sağlık panelinde bayinin skoru 6 puan düşer; bu durum hiçbir arayüz eylemiyle geri alınamaz.

### 2. `assignedToId` doğrulanmadan kabul ediliyor (kiracılar arası PII okuma) — **DOĞRULANDI**
- `app/api/dealer/incidents/route.ts:28` yalnızca `z.string()`; `:114` değeri doğrudan yazıyor. Kullanıcının bayiye ait personel/müşteri olup olmadığı kontrol edilmiyor. PATCH tarafında da aynı (`[id]/route.ts:12,96`) — sahiplik kontrolü yalnızca olayın kendisi için (`:78`), atanan kişi için değil.
- Okuma: `route.ts:66-68` her satıra `assignedTo { id, name, email }` ekliyor; sayfa da bunu gösteriyor (`page.tsx:234-238`).
- Kimlik kaynağı teorik değil: `app/api/leaderboard/route.ts:23-30,133-138` oturum ŞARTI OLMADAN (`:78` session opsiyonel, yalnızca `rewards` modül kapısı) tüm CUSTOMER kullanıcıların tam `id` + `name` değerlerini döndürüyor (e-posta YOK). Ayrıca `app/api/dealer/churn-risk/route.ts:69` gibi uçlar da `user.id` veriyor.
- **Yeniden üretim:** Bayi `GET /api/leaderboard` ile başka işletmelerin müşterilerinin dahil olduğu kullanıcı id'lerini alır → her biri için `POST /api/dealer/incidents { type:'other', severity:'low', title:'x', assignedToId:'<id>' }` → `GET /api/dealer/incidents` yanıtında o kullanıcının `email` alanı görünür. Leaderboard'un kasıtlı olarak gizlediği e-posta bu yolla toplu sızdırılabilir (platform genelinde müşteri e-posta listesi). Aynı şekilde admin kullanıcıların id'si bilinirse admin e-postası da okunur.
- İkincil bulgu da gerçek: POST gövdesi `try/catch` içinde değil (`route.ts:85-120`); var olmayan bir id FK ihlali (Prisma P2003) fırlatır ve yakalanmamış 500 döner. Bozuk JSON gövdesi de (`:97`) aynı şekilde 500 üretir.

### 3. Tespit GET yan etkisi: yarış koşulu ve kopya olaylar — **DOĞRULANDI** (yarış kısmı zamanlamaya bağlı, 7 gün kısmı deterministik)
- `lib/incident-detection.ts:18-30` kontrolü `createdAt >= now-7gün` ile sınırlı; `:102,121,142` kontrol-sonra-oluştur kalıbı, kilit/transaction/benzersiz anahtar yok (şemada `@@unique` yok, `schema.prisma:1268-1272`).
- **Deterministik kopya:** 8 gün önce açılmış, çözülmemiş bir `complaint_spike` olayı varken koşul yeniden oluşursa `hasOpenIncidentOfType` 0 döner ve ikinci bir açık olay yaratılır. Çözüm yolu olmadığı (iddia 4) için bu, koşul sürdükçe her 7 günde bir yeni açık olay demek; sayaçlar ve sağlık skoru birikimli bozulur.
- **Yarış:** Sayfa ilk yüklemede GET gönderir; kullanıcı yüklenme sürerken durum filtresini değiştirirse (`page.tsx:72,99`) istemci önceki isteği iptal eder ama sunucu tarafındaki tespit devam eder; iki tab açıksa da aynı durum. İki istek aynı anda `count=0` görürse aynı tipte iki olay (ve hiç olayı olmayan bayide iki demo olay, `route.ts:53-54` + `incident-detection.ts:162-163`) oluşur. Pencere küçük (bir `findMany` + `count` kadar) ama gerçek.
- "Tespit yalnızca bayi sayfayı açınca çalışır" — doğru: `runIncidentDetection` başka hiçbir yerden çağrılmıyor (tek import `route.ts:13`). Ayrıca ADMIN rolüyle GET'te tespit hiç çalışmıyor (`route.ts:43,50`).
- Çözülen olayın koşul sürdükçe yeniden açılması kodda doğru (`status: { not: 'resolved' }`), ancak bu tasarım gereği kabul edilebilir bir davranış; asıl sorun dedupe anahtarı yokluğu.

### 4. Olay çözme/atama yolu yok; PATCH ucu ölü, `resolvedAt` tutarsız — **DOĞRULANDI**
- Depoda `/api/dealer/incidents/${id}` veya eşdeğer bir istemci çağrısı yok; `/api/dealer/incidents` yalnızca `app/dealer/incidents/page.tsx:81,115` (GET ve POST) tarafından kullanılıyor. Liste öğesi (`page.tsx:217-254`) tıklanamaz, durum/atama kontrolü içermiyor. Admin tarafında da olayları güncelleyen bir ekran/uç bulunamadı (`trust-timeline`, `dealers-health`, `team-autotask` yalnızca okuyor).
- `app/api/dealer/incidents/[id]/route.ts:94-100`: `status: 'resolved'` gelince `resolvedAt` otomatik doldurulmuyor; tersine `resolved` dışına çekilince temizlenmiyor. Sayfa "Çözüldü" rozetini `resolvedAt`'e (`page.tsx:248`), filtreyi ise `status`'a bağlıyor → API doğrudan çağrılırsa iki gösterge çelişir.
- Etki gerçek: tüm otomatik kaynaklar (`incident-detection.ts`, `negative-feedback-sla/route.ts:40-50` her olumsuz yorum için ayrı olay, `auto-reply-engine.ts:104-113`) yalnızca `open` yazıyor ve hiçbiri otomatik kapanmıyor → `copilot-summary`, `morning-briefing`, `dealers-health` sayaçları monoton artıyor; high/critical olanlar `lib/team-autotask.ts:43-66` üzerinden admin ekip görevine de dönüşüyor (orada `alreadyGenerated` ile tekilleştirme var, ancak kaynak olay hiç kapanmadığından görev ile olay arasında durum senkronu yok).
- **Yeniden üretim:** Bir bayiye `negative-feedback-sla` cron'u olay açar → bayi yorumu yanıtlasa bile olay `open` kalır; panelden kapatılamaz; açık olay sayısı ve admin sağlık skoru kalıcı olarak bozulur.

**Özet:** 4 iddianın 4'ü de doğrulandı. En yüksek önem: iddia 2 (kimliği doğrulanmış her bayi, herkese açık leaderboard'dan aldığı id'lerle platform genelindeki müşteri e-postalarını okuyabilir). Düzeltme önceliği: (1) `assertAssignableForDealer()` — atanan kişi yalnızca bu bayinin `DealerStaff` kaydı veya bayinin kendisi olabilir, aksi 400; POST'u `try/catch` + `responseIfDatabaseUnavailable` ile sarmala; (2) demo satırı yazmayı kaldır, boş durumu UI'da göster ve mevcut demo satırları tek seferlik betikle temizle (`type='other' AND title='Olaylar / Kriz Radarı'`); (3) `dedupeKey` + `@@unique([dealerId, dedupeKey])` ile `upsert`/`createMany skipDuplicates`, 7 gün penceresini kaldırıp "açık olan varsa oluşturma" kuralına geç; tespiti GET'ten çıkarıp olay-güdümlü/cron'a taşı; (4) PATCH'i durum makinesine bağla (`resolved` ⇔ `resolvedAt`), sayfaya detay çekmecesi + durum/sorumlu kontrolleri ekle.
