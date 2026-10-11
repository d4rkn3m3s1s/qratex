# /admin/agent-council

**Amaç:** Platform operatörünün serbest metinli bir stratejik soruyu dört LLM personasına (Harper · Veri, Benjamin · Mantık, Lucas · Denge, Grok · Kaptan) tur tur tartıştırması, bir "ana cevap" ve aksiyon paketi alması, aksiyonları da seçilen bir bayinin `ActionItem` kuyruğuna yazabilmesi.

**Genel puan: 4.8 / 10** · **Karar: yeniden tasarla** (alt sayfalar `history` + `agents` ile birlikte tek bir "Konsey" çalışma alanına birleştirilerek)

Kısa hüküm: Etkileşim iskeleti (tur tur / SSE, persona kartları, transkript) çalışıyor ve görsel olarak özenli. Ancak sayfa ürün olarak kopuk: (1) üretilen konseyler hiçbir yere kaydedilmiyor, bu yüzden "geçmiş" sayfası bu sayfanın çıktısını hiç göstermiyor; (2) "Canlı LLM" etiketi gerçek çıktıya değil yalnızca anahtarın varlığına bakıyor; (3) "kazanan uzman" konu metninde regex eşleşmesiyle seçiliyor, tartışmanın içeriğiyle ilgisi yok; (4) "Veri" uzmanı hiçbir platform verisine erişmiyor; (5) bayi kuyruğuna yazma işlemi idempotent değil, denetim kaydı yok ve yönetici iç notunu bayiye sızdırıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Konuşma üretimi ve bayiye aktarma çalışıyor; ancak kalıcılık yok, kazanan seçimi sahte, canlı/demo ayrımı güvenilmez, veri bağlamı yok. |
| UX | 5/10 | İki teknik başlatma modu ("tur tur" ve "Canlı akış (SSE)") kafa karıştırıyor, iptal yok, otomatik kaydırma tüm sayfayı çekiyor, ana cevap iki kez gösteriliyor. |
| Görsel | 6/10 | Persona kartları ve transkript hiyerarşisi okunaklı; fakat 6 ayrı vurgulu kart (amber/primary/amber) üst üste binince hiyerarşi düzleşiyor, alt sayfalarla (brütalist `border-4 border-black`) tutarsız. |
| Mimari | 4/10 | Aynı ürünün iki paralel motoru var (`computeCouncil` + DB kalıcılığı kullanılmıyor, `agent-dialogue` kullanılıyor ama kalıcı değil); `prisma as any` ölü fallback'ler; ağırlık ayarı hiçbir yerde okunmuyor. |
| Performans | 5/10 | 4 × 121 = 484 adet sonsuz animasyonlu, `drop-shadow` filtreli `span`; SSE akışı 14 sıralı LLM çağrısını 60 sn'lik `maxDuration` içine sıkıştırıyor; bayi listesi için ağır kullanıcı uç noktası çağrılıyor. |
| Erişilebilirlik + Mobil | 6/10 | `aria-live` altyazı, odaklanabilir transkript bölgesi, `aria-busy` iyi; ama `label` bağlı değil, Enter ile gönderim yok, framer animasyonları azaltılmış hareket tercihini dinlemiyor, mobilde transkripte ulaşmak için 4 persona kartını geçmek gerekiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı yetki (yalnızca ADMIN) | ÇALIŞIYOR | `app/api/admin/agents/conversation/route.ts:26`, `conversation/stream/route.ts:12`, `council-to-actions/route.ts:29`, `run/[id]/route.ts:15` | Tüm uçlarda `requireAuth(['ADMIN'])` var; IDOR yok (yönetici tüm kayıtları görebilir, bu beklenen). |
| 2 | Segment metadata (noindex) | ÇALIŞIYOR | `app/admin/agent-council/layout.tsx:4-6` | i18n anahtarlı başlık. |
| 3 | Hero (eyebrow/başlık/açıklama) | KISMİ | `page.tsx:337-347` | "xAI çoklu ajan düzenine paralel" ve "Grok 4.20" iddiaları; gerçek model varsayılanı `llama-3.1-8b-instant` (`lib/ai-engine.ts:69`). Yanıltıcı marka iddiası. |
| 4 | Hero durum rozeti (HAZIR / CANLI / GEÇMİŞ) | KISMİ | `page.tsx:344` | `'TARTISMA / CANLI'` Türkçe karakter eksik; tur tur modunda da "CANLI" yazıyor. |
| 5 | Demo modu uyarı bandı | KISMİ | `page.tsx:349-362`, `conversation/route.ts:40` | Mod, anahtarın *varlığına* göre belirleniyor; çağrı başarısız olup şablona düşerse bant görünmez. |
| 6 | "Canlı LLM ile üretildi" rozeti | SAHTE | `page.tsx:364-368`, `lib/agent-dialogue.ts:216-218`, `lib/ai-engine.ts:110-113,149-153` | LLM hatası / prompt-injection tespiti / boş yanıt durumunda içerik sessizce şablona düşer ama rozet yine "canlı" der. Sunucunun döndürdüğü `state.live`, `decision.live` ve SSE `live` alanı istemcide hiç okunmuyor. |
| 7 | Geçmiş kayıt bandı + "Yeni oturum" | ÇALIŞIYOR | `page.tsx:88-96, 370-379` | URL `window.history.replaceState` ile temizleniyor (Next router dışı). |
| 8 | Canlı altyazı ("X düşünüyor — sıradaki konuşmacı") | KISMİ | `page.tsx:115-125` | Mesajlar tur başına 4'lü paket halinde geldiği için `inRound.length < 4` dalı pratikte hiç tetiklenmez; tur 1 boyunca "Uzmanlar yerlerini alıyor…", sonraki her turda "Tur kapanıyor…" görünür. Sentez beklenirken (maxR=3) "Grok ana cevabı yazıyor…" yerine "Tur kapanıyor…" yazar. İlk tur-tur koşusunda (`run` null) hiç altyazı yok. |
| 9 | Görev / soru girişi | KISMİ | `page.tsx:408-414`, `conversation/route.ts:12` | Tek satırlık `Input`; sunucu min 5 / max 500 istiyor ama istemcide sınır, sayaç, uyarı yok. 1–4 karakterlik konu "Ajanlar konusmasi baslatilamadi" hatasıyla döner. Enter ile gönderim yok (form yok). |
| 10 | Varsayılan örnek hedef | ÇALIŞIYOR | `page.tsx:74, 95` | Tek sabit örnek; örnek galerisi yok. |
| 11 | "Konseyi başlat (tur tur)" | ÇALIŞIYOR | `page.tsx:209-235, 416-424` | Her tur için ayrı POST, 4 sıralı LLM çağrısı. |
| 12 | "Canlı akış (SSE)" | KISMİ | `page.tsx:237-292`, `conversation/stream/route.ts:9,52-62` | 3 tur × 4 + 2 = 14 sıralı LLM çağrısı, her biri 15 sn timeout (`lib/ai-engine.ts:50,58`) ve 429 retry (3/6/9 sn); `maxDuration = 60`. Yavaş sağlayıcıda akış yarıda kesilir (çalışma zamanında doğrulanmadı). Sunucunun `event: error` mesajı istemcide okunmaz, yalnızca "Canlı akış kesildi" görünür. |
| 13 | "Sonraki tur" | ÇALIŞIYOR | `page.tsx:429-437` | Dördüncü tıklamada sentez üretir ama etiket bunu söylemez ("Sentezi al" olmalı). |
| 14 | Akışı durdur / iptal et | EKSİK | `page.tsx:80, 240-243` | `streamRef` var ama kullanıcıya iptal düğmesi yok; 14 çağrılık koşu durdurulamaz. |
| 15 | Unmount'ta EventSource kapatma | ÇALIŞIYOR | `page.tsx:294-298` | |
| 16 | Uzmanlar (persona) kartları | ÇALIŞIYOR | `page.tsx:444-500` | Kod adı, rol, durum etiketi. |
| 17 | Persona ses görselleştiricisi | KISMİ | `components/agents-ui/agent-audio-visualizer-grid.tsx:62-104` | Satır içi `transform/opacity` keyframe tarafından eziliyor (halka ağırlığı kayboluyor). `@keyframes agentPulse` styled-jsx içinde dinamik: kapsamlanırsa satır içi `animation: agentPulse` referansı kırılır, kapsamlanmazsa 4 örnek aynı adı paylaşır ve duruma göre yoğunluk farkı kaybolur (hangisi olduğu tarayıcıda doğrulanmadı). |
| 18 | Persona durumu (Konuşuyor/Düşünüyor/Dinliyor) | KISMİ | `page.tsx:309-333` | "Düşünüyor" yalnızca ilk mesaj gelmeden önce (tüm ajanlar için aynı anda) görünür; tur içi sıra gerçek zamanlı değil. Ekran okuyucuya `● ○ ◉` glifleri okunur. |
| 19 | Transkript (tur + ajan sırasına göre) | ÇALIŞIYOR | `page.tsx:98-108, 519-549` | |
| 20 | Transkript rozetleri (Tur, duruş) | ÇALIŞIYOR | `page.tsx:537-544, 65-71` | |
| 21 | Otomatik kaydırma | BOZUK | `page.tsx:127-129` | `scrollIntoView` iç kutuyu değil tüm sayfayı (window) kaydırır; her yeni turda ve geçmiş kaydı açılınca kullanıcı persona kartlarından/aksiyon kartından transkripte zorla çekilir. |
| 22 | Klavyeyle odaklanabilir transkript bölgesi | ÇALIŞIYOR | `page.tsx:513-518` | `role="region"`, `tabIndex=0`, focus ring. |
| 23 | Ana cevap kartı (Grok · Kaptan) | KISMİ | `page.tsx:110-113, 555-567` | Aynı içerik transkriptin son bloğunda da birebir var (çift gösterim). Şablon modunda içerik zaten "── Ana cevap (Grok · Kaptan) ──" başlığıyla başlıyor (`lib/agent-dialogue.ts:358`), kart başlığıyla çakışıyor. |
| 24 | "Öne çıkan uzman" + karar özeti | SAHTE | `page.tsx:569-581`, `lib/agent-dialogue.ts:128, 405-415` | Kazanan, konu metninde anahtar kelime regex'iyle seçiliyor; eşleşme yoksa 3. turdaki son uzman (her zaman **Lucas**). Varsayılan hedef metni hiçbir regex'e uymadığı için varsayılan senaryoda kazanan daima Lucas. Canlı modda bile LLM'e karar sorulmuyor. |
| 25 | Aksiyon paketi listesi | KISMİ | `page.tsx:583-599` | Öncelik ham İngilizce (`high/medium/low`) gösteriliyor; sahip bir persona adı ("Harper"). Anahtar `owner-title` çakışabilir. |
| 26 | Bayi seçici | KISMİ | `page.tsx:152-169, 612-627`, `app/api/admin/users/route.ts:113-185` | En yeni 50 bayi ile sınırlı (`createdAt desc`), arama yok; daha eski bayiler seçilemez. Hata `.catch(() => {})` ile yutuluyor; boş listede bilgi yok. Ağır uç nokta (adres, koordinat, 3 `_count` alt sorgusu + `count`) yalnızca etiket için çağrılıyor. `<label>` ilişkili değil. |
| 27 | "Aksiyonları yaz" (bayi kuyruğuna aktarım) | KISMİ | `page.tsx:171-207`, `council-to-actions/route.ts:28-74` | Çalışıyor ama idempotent değil (her tıklama yeni kopya), denetim kaydı yok, bayiye bildirim yok, `impactScore` sabit (88/66/42), `dueAt` sabit +3 gün, önizleme/onay yok. |
| 28 | Geçmiş kaydı açma (`?runId=`) | KISMİ | `page.tsx:131-150`, `run/[id]/route.ts` | 404/500 durumunda `data.success` false olur ve **sessizce** hiçbir şey olmaz (toast yalnızca ağ hatasında). Kaydın canlı/demo olduğu gösterilmez. |
| 29 | Konsey oturumlarının kalıcılığı | EKSİK | `conversation/route.ts`, `conversation/stream/route.ts` (DB yazımı yok); `agents/run/route.ts:101` (tek yazıcı, UI'dan çağrılmıyor) | Sayfa yenilenince 14 LLM çağrılık sonuç kaybolur; geçmiş sayfası bu sayfanın ürettiklerini hiç listelemez. |
| 30 | Geçmiş / Ajan profilleri alt sayfalarına gezinme | EKSİK | `page.tsx` (Link yok), `components/dashboard/sidebar.tsx:188` | `history` ve `agents` alt sayfalarına ne sayfadan ne menüden bağlantı var; yalnızca URL ile erişiliyor. |
| 31 | Ajan ağırlıklarının etkisi | SAHTE | `app/admin/agent-council/agents/page.tsx:30-53`; `agent_council_profiles` başka hiçbir yerde okunmuyor | Kaydedilen ağırlıklar konseyi hiç etkilemiyor. |
| 32 | Platform verisiyle beslenme ("Veri" uzmanı) | EKSİK | `lib/agent-dialogue.ts:94-109, 205-214` | Promptlarda yalnızca konu ve önceki konuşma var; geri bildirim/churn/şüpheli kayıt metrikleri yok. Oysa kullanılmayan `lib/agent-council.ts:44-61` gerçek metrik topluyor. Sonuç: "veri uzmanı" veri uydurmaya itiliyor. |
| 33 | Toast bildirimleri | KISMİ | `lib/admin-toast.ts:12-19` | Önek "Basarili: " / "Dikkat: " Türkçe karaktersiz; "Basarili: Konsey tamamlandı" gibi karışık metin. |
| 34 | Sunucu hata yanıtları | KISMİ | `conversation/route.ts:44-46` | Zod hatası ve LLM hatası aynı 400 + ASCII "Ajanlar konusmasi baslatilamadi" ile dönüyor; kullanıcı nedenini (ör. "en az 5 karakter") göremez. |
| 35 | Yükleniyor durumu | KISMİ | `page.tsx:381-395, 423` | Tur tur modunda ilk koşuda sadece düğme metni değişir; iskelet/ilerleme yok. |
| 36 | Boş durum (henüz konsey yok) | KISMİ | `page.tsx:442` | Yalnızca form; örnek sorular, son oturumlar, nasıl çalışır özeti yok. |
| 37 | i18n (tr/en) | EKSİK | `page.tsx` tüm metinler sabit; `messages/en.json:167-168` mevcut | Uygulama iki dilli olduğu halde sayfa yalnız Türkçe. |
| 38 | Azaltılmış hareket desteği | KISMİ | `app/globals.css:801-809` (CSS animasyonları kısılır); `page.tsx:456-463, 524-529, 128` | framer `layout`/`scale` animasyonları ve `scrollIntoView({behavior:'smooth'})` tercihi dinlemiyor (`useReducedMotion` yok). |
| 39 | Mobil yerleşim | KISMİ | `page.tsx:415, 452, 612` | Düğmeler ve grid sarılıyor; ancak transkripte ulaşmak için 4 tam genişlik persona kartı geçilmeli. |
| 40 | Sonucu kopyala / dışa aktar / paylaş | EKSİK | — | Markdown/PDF/bağlantı yok. |
| 41 | Hız sınırı / maliyet koruması | EKSİK | `conversation/*` (rate-limit yok), `lib/ai-engine.ts:115-117` (`dealerId` yoksa maliyet bekçisi çalışmaz) | Her koşu 14 LLM çağrısı; maliyet ölçülmüyor ve sınırlanmıyor. |
| 42 | Model / gecikme / maliyet görünürlüğü | EKSİK | `lib/ai-engine.ts:136` (`modelUsed` döner ama istemciye taşınmaz) | Operatör hangi modelin cevap verdiğini göremez. |

**Durum dağılımı:** ÇALIŞIYOR 11 · KISMİ 19 · BOZUK 1 · SAHTE 3 · EKSİK 8 (toplam 42)

---

## Bulgular

### 1. Konsey oturumları kaydedilmiyor; "Geçmiş" bu sayfanın çıktısını hiç göstermiyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / mimari · **Efor:** M
- **Kanıt:** `app/api/admin/agents/conversation/route.ts:25-47` ve `conversation/stream/route.ts:49-62` hiçbir DB yazımı yapmıyor. `AgentRun` tablosuna yazan tek kod `app/api/admin/agents/run/route.ts:101`, ve bu uca UI'dan hiçbir çağrı yok (`grep "/api/admin/agents/"` yalnızca `page.tsx:135,178,215,249` ve `history/page.tsx:27`). `history/page.tsx:41` açıklaması "bir kayda tıklayınca ana konsey sayfasında tam transkript açılır" diyor.
- **Sorun:** 14 ücretli LLM çağrısının sonucu sekme kapanınca kayboluyor; geçmiş sayfası yalnızca eski/terk edilmiş `computeCouncil` motorunun (varsa) kayıtlarını listeliyor. Kullanıcı "kaydedildi" sanıyor ama kaydedilmiyor. Ayrıca iki motor arasında tur yapısı farklı (eski: 3 tur, yeni: 4 tur) ve `council-run-mapper` bunu yamalıyor.
- **Öneri:** Tek bir "konsey oturumu" yaşam döngüsü kurun: başlatıldığında `AgentRun(status='running', createdById, mode, model)` oluşturulsun, her tur bitince `AgentMessage` satırları (`live` bayrağıyla) eklensin, sentezde `AgentDecision` yazılsın ve `status='completed'|'failed'`. SSE akışı `runId`'yi `meta` olayında döndürsün, istemci URL'yi `?runId=` ile güncellesin (yenilemede kaldığı yerden okunur). Tur-tur POST da `runId` alsın; istemcinin tüm mesaj geçmişini geri göndermesine gerek kalmasın (sunucu DB'den okur). `computeCouncil` + `/api/admin/agents/run` ya bu akışa "veri bağlamı" adımı olarak katılsın ya da silinsin. `prisma as any` fallback'leri (`run/route.ts:33`, `runs/route.ts:19`, `run/[id]/route.ts:19`) şema zaten modeli içerdiği için (`prisma/schema.prisma:2268`) kaldırılsın.

### 2. "Canlı LLM ile üretildi" etiketi gerçek çıktıyı değil yapılandırmayı yansıtıyor
- **Önem:** yüksek · **Kategori:** doğruluk / güven · **Efor:** S
- **Kanıt:** `conversation/route.ts:40` ve `stream/route.ts:28` → `mode = councilLLMAvailable()`; `lib/agent-dialogue.ts:216-218` LLM `null` dönerse şablon metni koyar; `lib/ai-engine.ts:110-113` prompt-injection şüphesinde, `:149-153` her hatada `null` döner. Sunucu `state.live`, `decision.live` (`agent-dialogue.ts:191`) ve SSE'de `live` (`stream/route.ts:56`) gönderiyor; `page.tsx` bunları hiç okumuyor (`page.tsx:226, 254, 364`).
- **Sorun:** Groq kotası dolduğunda ya da tek bir çağrı zaman aşımına uğradığında operatör şablon metinleri "canlı yapay zekâ kararı" diye görür ve bayiye aksiyon olarak iter. Bu, platformun kendi "sahte sunmuyoruz" ilkesine (`agent-dialogue.ts:123`) aykırı.
- **Öneri:** Mod mesaj başına tutulmalı: her mesaj kartında küçük "şablon" rozeti, karar kartında `decision.live === false` ise "Aksiyonlar şablondan üretildi" uyarısı ve bayiye aktarma düğmesinde ek onay. Üst bantta "12/14 çağrı canlı, 2 şablon" gibi özet. Prompt-injection nedeniyle düşülen çağrılar sessizce şablona değil, açık bir hata durumuna gitmeli.

### 3. Bayi kuyruğuna aktarma idempotent değil, denetimsiz ve iç bilgiyi bayiye sızdırıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / güvenlik-gizlilik · **Efor:** M
- **Kanıt:** `page.tsx:171-207` başarıdan sonra düğme yeniden aktif (`:628`); `council-to-actions/route.ts:52-67` her çağrıda yeni `ActionItem` oluşturuyor, tekillik anahtarı yok; dosyada audit kaydı yok. `suggestionText` = `[Agent Council] ${topic}\n\n${title}\nSorumlu (öneri): ${owner}` (`:58`) ve bayi panelinde olduğu gibi gösteriliyor (`app/dealer/action-items/page.tsx:223`).
- **Sorun:** (a) Çift tık veya tekrar gönderim bayinin kuyruğunu kopyalarla doldurur. (b) Yöneticinin platform genelindeki iç sorusu (ör. "Bu hafta churn sinyallerini azalt…", rakip bayi adları içerebilir) bayiye görünür. (c) "Sorumlu: Harper" gibi persona adları bayi için anlamsız. (d) `impactScore` sabit 88/66/42, bayiye ölçülmüş bir etki puanı gibi sunuluyor. (e) Bayi bildirim almıyor, admin tarafında kim neyi itti izlenemiyor.
- **Öneri:** Aktarımı bir "Yayınla" diyaloğuna dönüştürün: aksiyonlar düzenlenebilir başlık + bayiye yönelik açıklama + gerçek sorumlu (bayi ekibi / admin ekibi) + vade seçimiyle önizlensin; konu metni varsayılan olarak bayiye gitmesin. Sunucuda `(runId, dealerId, hash(title))` üzerinden tekillik (ya da `ActionItem.sourceRef` alanı + unique index), admin audit log kaydı (`getAuditRequestMeta` deseni) ve bayiye bildirim. `impactScore` ya hesaplansın ya `null` kalsın. Çoklu bayi / segment seçimi (bkz. Eksik özellikler).

### 4. "Öne çıkan uzman" kararı regex ile veriliyor
- **Önem:** yüksek · **Kategori:** sahte işlev · **Efor:** S
- **Kanıt:** `lib/agent-dialogue.ts:128` canlı modda bile `pickWinner()`; `:405-415` konu metninde `veri|metrik|…`, `mantık|…` vb. arar, eşleşme yoksa 3. turun son uzmanı → sıra `['Harper','Benjamin','Lucas','Grok']` (`:31`) ve Grok hariç tutulduğu için daima **Lucas**. Varsayılan hedef (`page.tsx:74`) hiçbir kalıba uymuyor. Kart bunu "Öne çıkan uzman" diye gösteriyor (`page.tsx:573`), sonra bu değer LLM'e "Kazanan perspektif" diye dayatılıyor (`agent-dialogue.ts:148`).
- **Sorun:** Operatör, tartışmanın içeriğine göre bir değerlendirme yapıldığını sanıyor; aslında konu cümlesinin kelimeleri belirliyor. Sentez de bu keyfi seçime göre yönlendiriliyor.
- **Öneri:** Sentez çağrısını tek bir yapılandırılmış JSON çıktısına birleştirin: `{answer, winner, winnerRationale, confidence, actions[], dissent[]}`. Kazanan ve güven LLM'den gelsin, `confidence` ve "karşı görüş" kartı UI'da gösterilsin. Şablon modunda kazanan kartı "şablon" olarak işaretlensin veya gizlensin.

### 5. SSE akışı 60 sn sınırına 14 sıralı LLM çağrısı sığdırıyor; hata mesajı kayboluyor; iptal yok
- **Önem:** yüksek · **Kategori:** güvenilirlik · **Efor:** M
- **Kanıt:** `stream/route.ts:9` `maxDuration = 60`; `:52-62` 3 tur × 4 sıralı çağrı + sentezde 2 çağrı (`agent-dialogue.ts:134-152`); her çağrı 15 sn timeout ve 429'da 3/6/9 sn bekleme (`lib/ai-engine.ts:50,58,155-176`). Sunucu `send('error', …)` (`:64`) gönderiyor; istemci yalnızca `es.onerror` ile genel "Canlı akış kesildi" basıyor (`page.tsx:286-291`). İptal düğmesi yok.
- **Sorun:** OpenAI varsayılanında (`gpt-4-turbo-preview`, `ai-engine.ts:70`) 14 çağrı rahatlıkla 60 sn'yi aşar; fonksiyon öldürülür, kullanıcı yarım transkript ve belirsiz hata görür (çalışma zamanında doğrulanmadı, hesap üzerinden çıkarım). Ayrıca aynı turdaki 3 uzman birbirini beklemek zorunda değil; sıralı yürütme gereksiz gecikme.
- **Öneri:** Konsey üretimini istekten ayırın: `after()`/kuyruk (Vercel Queues veya Workflow) ile arka planda adım adım çalışan, her adımı DB'ye yazan bir iş; istemci SSE ya da kısa aralıklı sorgu ile `runId` üzerinden ilerlemeyi okusun (sayfa yenilense de devam eder). Tur içinde Harper/Benjamin/Lucas paralel, Grok onları gördükten sonra; bu, toplam süreyi ~%50 kısaltır. Token akışı (stream: true) ile mesajlar yazılırken görünsün. `event: error` için `addEventListener('error')` ile sunucu mesajı gösterilsin, "Durdur" düğmesi `AbortController` ile sunucuya iletilsin.

### 6. "Veri" uzmanı hiçbir platform verisi görmüyor
- **Önem:** orta · **Kategori:** ürün değeri · **Efor:** M
- **Kanıt:** `lib/agent-dialogue.ts:94-109` sistem promptu yalnızca persona; `:205-214` kullanıcı mesajı yalnızca konu + önceki konuşma. Harper'ın tanımı "metrikler, geri bildirim hacmi, şüpheli kayıtlar, trend" (`lib/agent-personas.ts:31`). Kullanılmayan `lib/agent-council.ts:44-61` bu metrikleri gerçekten topluyor.
- **Sorun:** Model, "veriye dayan" talimatıyla ama veri olmadan konuşuyor; halüsinasyon (uydurma oran/trend) üretmeye teşvik ediliyor. Konsey genel bir sohbet botundan farksız.
- **Öneri:** Oturum başında bir "bağlam paketi" adımı: kapsam seçimi (tüm platform / segment / tek bayi) → son 30 gün geri bildirim hacmi, negatif oran, churn sinyali (`dealer segment merkezi` verisi), açık şüpheli aktivite, ilgili kampanyalar. Paket Redis'te kısa süre önbelleklensin, transkriptin üstünde "Konseyin gördüğü veri" çekmecesi olarak gösterilsin ve her uzmanın promptuna eklensin. Harper mesajlarında atıf ("kaynak: feedback_30g") zorunlu olsun.

### 7. Otomatik kaydırma tüm sayfayı çekiyor
- **Önem:** orta · **Kategori:** UX hatası · **Efor:** S
- **Kanıt:** `page.tsx:127-129` `transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })`; hedef `max-h` + `overflow-y-auto` kutunun içinde (`:513-551`). `scrollIntoView` tüm kaydırılabilir ataları, pencere dahil, kaydırır.
- **Sorun:** Kullanıcı aksiyon kartını okurken ya da bayi seçerken yeni tur gelince sayfa transkripte zıplıyor; geçmiş kaydı açıldığında da sayfa en alta inmiyor, transkript ortasına iniyor.
- **Öneri:** Yalnızca kapsayıcının `scrollTop`'unu ayarlayın ve "kullanıcı en alttaysa yapışkan kaydır" desenini uygulayın (alttan > 48px yukarıdaysa kaydırmayın, yerine "Yeni mesajlar ↓" hapı gösterin). Azaltılmış harekette `behavior: 'auto'`.

### 8. Canlı altyazı ve persona durumları gerçek ilerlemeyi yansıtmıyor
- **Önem:** orta · **Kategori:** UX / doğruluk · **Efor:** S (mevcut) / M (token akışıyla)
- **Kanıt:** `page.tsx:115-125, 309-333`; mesajlar tur başına toplu geliyor (`stream/route.ts:55-56`, `conversation/route.ts:33`).
- **Sorun:** "Sıradaki konuşmacı" dalı ve tekil "Düşünüyor" durumu fiilen ölü kod; sentez beklenirken "Tur kapanıyor…" yazıyor. Görselleştirme, gerçekte olmayan bir sıra-sıra konuşma izlenimi veriyor.
- **Öneri:** Sunucu, her ajan çağrısının başında `speaker` olayı (`{round, agentName, phase:'thinking'}`) ve bitiminde `message` olayı göndersin; istemci durumları bu olaylardan türetsin. Böylece altyazı, persona halkası ve transkript tek bir olay akışından beslenir.

### 9. Ajan profilleri sayfası sahte; alt sayfalar yetim
- **Önem:** orta · **Kategori:** bilgi mimarisi / sahte ayar · **Efor:** S
- **Kanıt:** `app/admin/agent-council/agents/page.tsx:30-53` `agent_council_profiles` yazıyor; depo genelinde başka okuyucu yok. Ana sayfada `Link` yok; menüde yalnızca `/admin/agent-council` (`components/dashboard/sidebar.tsx:188`).
- **Sorun:** Operatör ağırlık değiştirip etki beklediğinde hiçbir şey değişmez; geçmiş sayfası keşfedilemez.
- **Öneri:** Tek sayfada sekmeler: **Oturum · Geçmiş · Ayarlar**. Ayarlar sekmesi gerçekten tüketilen parametreler içersin: tur sayısı, model seçimi, persona prompt ek talimatları, ajan açık/kapalı, maliyet tavanı. Ağırlıklar ancak sentez promptuna ("Harper'ın görüşüne 1.5× ağırlık ver") gerçekten eklenirse kalsın.

### 10. Bayi seçici 50 kayıtla sınırlı, aramasız ve ağır uç nokta kullanıyor
- **Önem:** orta · **Kategori:** işlevsellik / performans · **Efor:** S
- **Kanıt:** `page.tsx:154` `pageSize=50`; `app/api/admin/users/route.ts:163-197` `createdAt desc`, koordinat/adres/plan + 3 `_count` + toplam `count` döndürüyor; hata `page.tsx:165` yutuluyor.
- **Sorun:** 50'den eski bayiler hiç seçilemez; sayfa her açılışta (konsey hiç kullanılmasa bile) gereksiz ağır sorgu çalıştırır.
- **Öneri:** Aksiyon kartı açıldığında tembel yüklenen, `search` parametresiyle sunucu tarafı arama yapan bir `Combobox` (shadcn `Command`) ve hafif bir `GET /api/admin/dealers/options?q=` (yalnızca `id, businessName, name`) ucu. Hata/boş durum metni.

### 11. Girdi doğrulaması ve hata iletileri yetersiz
- **Önem:** orta · **Kategori:** UX / hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:210-211, 238-239` yalnızca boşluk kontrolü; sunucu `min(5).max(500)` (`conversation/route.ts:12`), SSE yalnızca `< 5` (`stream/route.ts:17`); hata metni ASCII ve genel (`conversation/route.ts:46`); SSE 400 → istemcide "Canlı akış kesildi".
- **Öneri:** `Textarea` + 500 karakter sayacı + "en az 5 karakter" satır içi doğrulama, ⌘/Ctrl+Enter ile gönderim; sunucu Zod hatasını `{code:'VALIDATION', fieldErrors}` olarak, LLM hatasını `{code:'AI_UNAVAILABLE'}` olarak ayırsın; konu SSE'de query string yerine POST ile başlatılan `runId` üzerinden taşınsın (konu URL/erişim loglarına düşmesin).

### 12. Ana cevap çift gösteriliyor, kart hiyerarşisi düz
- **Önem:** düşük · **Kategori:** görsel / bilgi mimarisi · **Efor:** S
- **Kanıt:** `page.tsx:519-549` (transkriptte `consensus` bloğu) ve `:555-567` (ayrı kart); şablon içeriği zaten başlıkla başlıyor (`agent-dialogue.ts:358`). Sayfada 6 kart art arda, üçü vurgulu çerçeveli (`:502`, `:556`, `:584`).
- **Öneri:** Sonuç bölümünü tek bir "Karar" paneli yapın (ana cevap + kazanan/güven + karşı görüş + aksiyonlar + yayınla), transkripti ise ikincil, daraltılabilir bir "Tartışma" sütununa alın; transkriptte sentez bloğu "Karar paneline git" bağlantısıyla kısaltılsın.

### 13. Yanıltıcı marka/model iddiası
- **Önem:** düşük · **Kategori:** içerik / hukuki risk · **Efor:** S
- **Kanıt:** `page.tsx:339-340, 448` ("Grok tarzı", "xAI Grok 4.20 çoklu ajan yapısına göre"); `lib/ai-engine.ts:69-70` gerçek model Groq üzerinde `llama-3.1-8b-instant` veya OpenAI.
- **Sorun:** Operatör xAI modeliyle çalıştığını sanabilir; üçüncü taraf marka adı ürün adında kullanılıyor. 8B'lik küçük bir model stratejik sentez için zayıf, bu da görünür değil.
- **Öneri:** Ürün adını nötrleştirin ("Karar Konseyi"), kaptan personasının adını marka dışı yapın, kullanılan sağlayıcı/modeli sayfada rozetle gösterin. Not: `e2e/smoke.spec.ts:40` başlık metnine bağlı, birlikte güncellenmeli.

### 14. Persona görselleştiricisi pahalı ve kısmen etkisiz
- **Önem:** düşük · **Kategori:** performans / görsel · **Efor:** S
- **Kanıt:** `agent-audio-visualizer-grid.tsx:62-84` 121 `span` × 4 kart, her biri `filter: drop-shadow` + sonsuz keyframe; satır içi `transform/opacity` keyframe tarafından eziliyor; dinamik styled-jsx `@keyframes agentPulse` kapsam sorunu (bkz. envanter #17, doğrulanmadı).
- **Öneri:** Tek bir `<canvas>` veya 11×11 SVG + tek CSS değişkeni (`--intensity`) ile; halka ağırlığını `--w` değişkeniyle keyframe içinde çarpın; görünür değilken (`IntersectionObserver`) ve `idle` durumunda animasyonu durdurun.

### 15. Hız sınırı ve maliyet görünürlüğü yok
- **Önem:** düşük · **Kategori:** operasyon · **Efor:** S
- **Kanıt:** `conversation/*` rotalarında rate-limit yok; `runChatCompletion` maliyet bekçisi yalnızca `dealerId` ile çalışıyor (`lib/ai-engine.ts:115-117, 139-147`).
- **Öneri:** Admin kullanıcı başına dakikalık konsey sınırı (Upstash), her oturum için token/maliyet toplamı `AgentRun.context`'e yazılsın ve oturum başlığında gösterilsin.

### 16. Küçük kod kalitesi sorunları
- **Önem:** düşük · **Kategori:** temizlik · **Efor:** S
- **Kanıt:** `AGENT_STYLES[*].label` kullanılmıyor (`page.tsx:58-63`); `personaState(name)` iki kez hesaplanıyor (`:454, :482`); `stanceFor` içinde iki dalı aynı üçlü (`agent-dialogue.ts:241`); `history` kaydı `?runId` ile açıkken yeni oturum başlatılırsa URL temizlenmiyor (`page.tsx:212, 246`), yenilemede eski kayıt geri gelir; `?runId` `window.location` ile okunuyor, `useSearchParams` değil (`:132`); transkript ikonlarında `aria-hidden` yok (`:534`); bayi `<label>` bağlı değil (`:614`).

---

## Eksik özellikler (kıyas: Linear, Retool iç araçları, PostHog AI, Stripe Dashboard)

1. **Kalıcı, paylaşılabilir oturumlar** — her konseyin kalıcı URL'si, başlığı, sahibi, durumu (çalışıyor/tamamlandı/başarısız) ve yenilemede kaldığı yerden devamı (PostHog Max / Linear issue bağlantısı gibi).
2. **Veri bağlamı ve kapsam seçimi** — tüm platform / segment / tek bayi seçimi, konseyin gördüğü metriklerin görünür ve atıflı olması (PostHog'un "insight'a dayalı yanıt" yaklaşımı).
3. **Durdur, yeniden üret, tek mesajı yeniden üret, takip sorusu** — sohbet ürünlerinin temel kontrolleri; "Grok'a sor: bunu bayi X için uyarla".
4. **Yapılandırılmış karar çıktısı** — güven puanı, karşı görüş/riskler, varsayımlar, başarı metriği; karar kartı Linear "project update" formatında.
5. **Aksiyonların iş akışına bağlanması** — çoklu bayi / segment hedefleme, önizleme + düzenleme, tekillik, admin audit log, bayiye bildirim ve **geri izleme** (aktarılan aksiyonların tamamlanma oranı konsey oturumunda görünsün; `AgentDecision.outcomes` modeli zaten var, `app/api/admin/agents/outcomes/route.ts`). İç ekip modülüne (`/admin/ekip`) görev olarak da aktarım.
6. **Dışa aktarım ve maliyet görünürlüğü** — Markdown/PDF kopya, model + token + süre rozeti, oturum başına maliyet.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör bir soru yazar, kapsamı seçer (platform / segment / bayi), "Konseyi topla"ya basar. Ekran üç bölgeye ayrılır ve konsey gerçek zamanlı çalışır; operatör sayfadan ayrılsa bile iş arka planda sürer, geri döndüğünde kaldığı yerden izler. Sonunda tek bir **Karar paneli** çıkar; aksiyonlar bir önizleme diyaloğuyla bayi/ekip kuyruğuna yayınlanır ve oturum, aksiyonların ilerlemesini takip eden yaşayan bir kayıt olur.

**Yerleşim (masaüstü):**
- **Üst şerit (yapışkan):** oturum başlığı, kapsam çipi, durum (Çalışıyor 2/4 tur · 38 sn · ~0,7 ¢), model rozeti, Durdur / Yeniden çalıştır / Paylaş / Dışa aktar.
- **Sol sütun (dar, ~280px):** Geçmiş oturumlar listesi (arama + filtre: kapsam, durum, canlı/şablon), "Yeni oturum". Mevcut `/history` sayfası buraya erir.
- **Orta sütun:** Tartışma akışı — tur ayraçları, her mesajda ajan çipi, "şablon" rozeti, kaynak atıfları; yazılırken token akışı; yapışkan-alt kaydırma.
- **Sağ sütun (~360px):** Konsey masası (4 persona, kompakt; sıradaki konuşmacı gerçek olaydan) + **Karar paneli** (ana cevap, kazanan + güven + gerekçe, karşı görüş, aksiyonlar, "Yayınla…").
- **Mobil:** Sekmeli (Tartışma · Karar · Geçmiş); persona masası tek satırlık yatay avatar şeridine iner.
- **Ayarlar:** ayrı sekme/çekmece; yalnızca gerçekten tüketilen parametreler.

**Motion / 3D (ölçülü):**
- Konuşan personanın halkası tek bir yumuşak "nefes" (scale 1→1.03, opacity) — 484 parçacıklı grid yerine tek SVG/canvas halka; konuşma sırası değişince 200 ms renk geçişi.
- Yeni mesaj girişinde 150–200 ms opacity + 6px y; `layout` animasyonu yalnızca karar paneli açılırken.
- Karar panelinin ilk belirişinde tek seferlik vurgu (kenar ışıması 600 ms); 3D gereksiz — bu bir karar aracı, gösteri değil.
- Tümü `useReducedMotion()` ile koşullu; azaltılmış harekette yalnızca opacity.

**Veri / API değişiklikleri:**
- `POST /api/admin/council/sessions` → `{scope, topic, settings}` alır, `AgentRun(status:'running')` oluşturur, arka plan işini (`after()` / Vercel Queues veya Workflow) başlatır, `{runId}` döner.
- `GET /api/admin/council/sessions/:id/stream` → SSE: `speaker`, `token`, `message`, `decision`, `error`, `done` olayları; DB'den yeniden oynatılabilir (yeniden bağlanmada kaçırılanlar gönderilir).
- `POST /api/admin/council/sessions/:id/cancel`, `POST …/:id/follow-up`.
- `POST /api/admin/council/sessions/:id/publish-actions` → `{targets:[{dealerId}|{segmentId}|{teamId}], actions:[…edited]}`; tekillik (`ActionItem.sourceRef = runId:actionIndex`, unique index), audit log, bildirim.
- `AgentMessage`'a `live Boolean`, `model String?`, `tokens Int?`; `AgentRun`'a `scope Json`, `mode`, `costUsd`. (Şema değişikliği canlı Neon'a migration gerektirir; ayrı planlanmalı.)
- Bağlam paketi: `lib/council-context.ts` — `computeCouncil`'ın metrik toplama kısmı buraya taşınır, Redis'te 5 dk önbellek.
- Sentez: tek JSON çağrısı (`answer, winner, confidence, dissent, actions`), `pickWinner` regex'i kaldırılır.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/agent-council/history`** — bu sayfanın çıktısını göstermiyor (Bulgu 1) ve keşfedilemez (Bulgu 9). **Birleştir:** ana sayfanın sol sütunu/“Geçmiş” sekmesi olsun; ayrı rota yalnızca yönlendirme olarak kalabilir.
- **`/admin/agent-council/agents`** — kaydettiği ağırlıklar hiçbir yerde okunmuyor. **Birleştir veya kaldır:** "Ayarlar" sekmesine gerçekten tüketilen parametrelerle taşınsın; aksi halde kaldırılsın.
- **`POST /api/admin/agents/run` + `lib/agent-council.ts` (`computeCouncil`)** — UI'dan çağrılmayan ikinci bir konsey motoru. Metrik toplama mantığı bağlam paketine alınıp geri kalanı silinmeli; `lib/agent-run-store.ts` bellek fallback'i de gereksiz.
- **`/admin/trust-timeline`** konsey aksiyonlarını `href: '/admin/agent-council'` ile listeliyor (`app/api/admin/trust-timeline/route.ts:212`); kalıcı oturumlar gelince bağlantı `?runId=` ile ilgili oturuma gitmeli.
- **AI sayfaları kümesi** (`/admin/ai-dashboard`, `/admin/ai-detailed`, `/admin/ai-learning`, `/admin/ai-quality`, `/admin/ai-settings`) ile işlev çakışması yok, ancak menüde 6 ayrı AI girişi var; konsey, "AI" grubunun altında "Karar Konseyi" olarak, model/sağlayıcı ayarını `/admin/ai-settings`'ten okuyacak şekilde konumlanmalı (kendi model seçimi orada tek kaynak olmalı).

---

## Doğrulama (şüpheci inceleme)

Yöntem: her iddia çağıran ve çağrılan taraflarıyla birlikte baştan okundu (`page.tsx`, `conversation/route.ts`, `conversation/stream/route.ts`, `run/route.ts`, `runs` ve `run/[id]` GET'leri, `lib/agent-dialogue.ts`, `lib/ai-engine.ts`, `lib/groq.ts`, `council-to-actions/route.ts`, `prisma/schema.prisma` `ActionItem`, `app/dealer/action-items/page.tsx`, `trust-timeline`). Kod değiştirilmedi, DB'ye dokunulmadı, hiçbir şey çalıştırılmadı.

### 1. Konsey oturumları kalıcı değil; geçmiş bu sayfanın ürettiklerini içermiyor — **DOĞRULANDI**
- `conversation/route.ts:25-48` ve `conversation/stream/route.ts:49-130` içinde tek bir `prisma` çağrısı yok; dosyalar `prisma`'yı import bile etmiyor.
- Depoda `agentRun.create` yalnızca `app/api/admin/agents/run/route.ts:101`'de var (grep: `app`, `lib`, `components`, `scripts`). Bu POST'u çağıran hiçbir istemci yok; `page.tsx:135` yalnızca `GET /api/admin/agents/run/${runId}` (okuma) yapıyor.
- `history/page.tsx:27` `GET /api/admin/agents/runs` ile yalnızca `AgentRun` tablosunu listeliyor; açıklama metni (`history/page.tsx:41`) "Kayıtlı çoklu ajan koşuları … tam transkript ve karar açılır" diyor.
- **Yeniden üretim:** Canlı akışla bir konsey tamamla → sayfayı yenile → transkript ve karar yok; `/admin/agent-council/history`'ye git → bu oturum listede yok (yalnızca eski `computeCouncil` kayıtları, varsa).

### 2. Canlı/demo etiketi yapılandırmaya bakıyor; şablon fallback'i canlı çıktı gibi sunuluyor — **DOĞRULANDI**
- `mode` her iki yolda da `councilLLMAvailable()` → `isAIConfigured()` (yalnızca anahtar var mı) üzerinden belirleniyor: `conversation/route.ts:40`, `stream/route.ts:28` (dosya içi satır 28, `const mode = …`).
- `runChatCompletion` zaman aşımı/hata (`lib/ai-engine.ts:149-153`) ve prompt-injection tespitinde (`:110-113`) `null` döndürüyor; `lib/agent-dialogue.ts:216-218` bu durumda `buildTurn` şablonuna düşüp mesajı `live:false` işaretliyor; final turda `:155` + `:175` aynı şekilde şablon aksiyon/sentez kullanıyor.
- Sunucu `state.live`'ı gönderiyor (`stream/route.ts` `send('round', {..., live: state.live})`) ama istemci `round` dinleyicisinde (`page.tsx:258-270`) bu alanı okumuyor; `page.tsx:364-368` rozeti yalnızca `councilMode === 'live'` ile gösteriyor.
- **Yeniden üretim:** Groq ücretsiz katmanında (`lib/groq.ts:30-31`: `llama-3.1-8b-instant` 6K TPM) ikinci/üçüncü turda 429 alınırsa veya sağlayıcı 15 sn içinde yanıt vermezse mesajlar sessizce şablon metne döner; ekranda "Canlı LLM ile üretildi" rozeti görünür ve şablon `buildDecision` aksiyonları "Aksiyonları yaz" ile bayi kuyruğuna gönderilebilir.

### 3. council-to-actions idempotent değil, denetim kaydı yok; admin sorusu bayiye görünüyor — **DOĞRULANDI (alt iddialardan biri zayıf)**
- Tekrar: `page.tsx:628` düğme yalnızca `pushingCouncil || !councilDealerId` ile pasif; başarıdan sonra (`:201-206`) tekrar aktif. Route (`council-to-actions/route.ts:52-67`) her çağrıda `actionItem.create` ile yeni satır açıyor; `ActionItem` şemasında (`prisma/schema.prisma`, `model ActionItem`) tekillik anahtarı/unique index yok (yalnızca `feedbackId`, `dealerId`, `status` index'leri).
- Denetim: route'ta audit yazımı yok; `ActionItem`'da `createdById` alanı yok → kimin ittiği izlenemiyor.
- Sızıntı: `suggestionText` = `[Agent Council] ${topic}\n\n${title}\nSorumlu (öneri): ${owner}` (`:58`) ve bayi sayfası bunu olduğu gibi gösteriyor (`app/dealer/action-items/page.tsx:223`). Varsayılan konu (`page.tsx:74`) platform geneli bir iç hedef; persona adları ("Harper", "Grok") bayiye anlamsız sorumlu olarak görünür.
- **Zayıf alt iddia:** `impactScore` bayi sayfasında gösterilmiyor (`app/dealer/action-items/page.tsx` içinde `impactScore` geçmiyor); "ölçülmüş etki gibi görünür" yalnızca admin tarafı/raporlarda geçerli olabilir, bayi açısından doğrulanmadı.
- **Yeniden üretim:** Konseyi bitir → bayi seç → "Aksiyonları yaz"a iki kez bas → bayinin `/dealer/action-items` listesinde 4+4 aynı madde; `trust-timeline` (`app/api/admin/trust-timeline/route.ts:112`) da kopyaları ayrı olay olarak sayar.

### 4. SSE akışı 60 sn sınırına sığmayabilir — **DOĞRULANDI (koşullu; çalışma zamanında ölçülmedi)**
- `stream/route.ts:9` `maxDuration = 60`; turlar sıralı (`for round 1..4`, her turda 4 sıralı çağrı + final turda 2 çağrı = 14 çağrı, `lib/agent-dialogue.ts:200-230`, `:134-152`).
- Her çağrı: SDK `timeout: 15_000`, `maxRetries: 1` (`lib/ai-engine.ts:50-51`) → asılı sağlayıcıda çağrı başına ~30 sn'ye kadar; 429'da ek olarak `withRetry` 3+6+9 sn uyur (`:157-176`). Yani 2-3 başarısız çağrı 60 sn'yi tek başına doldurur.
- Ortamda `GROQ_API_KEY` dolu (`.env`'de yalnızca anahtar adının dolu olduğu kontrol edildi, değer okunmadı) → model `llama-3.1-8b-instant`, ücretsiz katman 6K TPM (`lib/groq.ts:31`). Türkçe 2-4 cümlelik yanıtlar ve her turda büyüyen transkript ile 14 çağrının toplam token'ı tek dakikada 6K'yı aşmaya çok yakın/üstünde; aynı anahtarı feedback analizi de paylaşıyor. Normal, kotası boş ve sağlıklı Groq'ta (çağrı başına ~1 sn) akış muhtemelen 60 sn'ye sığar; bu yüzden etki koşullu.
- İstemci: sunucunun `event: error` mesajı EventSource'ta `onerror`'u tetikler, ancak `page.tsx:286-291` `data`'yı okumadan genel "Canlı akış kesildi" gösterir. Ayrıca `runChatCompletion` hataları yuttuğu için sunucu `catch`'i (`stream/route.ts`) pratikte nadiren çalışır; asıl sonuç "hata" değil iddia 2'deki sessiz şablon fallback'idir.
- **Yeniden üretim:** Groq'un yavaş/429 döndüğü bir anda canlı akışı başlat → 60. saniyede fonksiyon kesilir → istemci yarım transkript + "Canlı akış kesildi" görür; kalıcılık olmadığı için (iddia 1) yarım sonuç da kaybolur.

**Özet:** 4 iddianın 4'ü de doğrulandı; 3. iddiadaki `impactScore` alt maddesi bayi tarafı için doğrulanmadı, 4. iddianın etkisi sağlayıcı kotası/gecikmesine bağlı.

---

## Uygulama (Dalga 2)

Üç sayfa tek çalışma alanında birleşti: `/admin/agent-council` → **Oturum · Geçmiş · Ayarlar** (sekme `?tab=`, açık oturum `?oturum=`; eski `?runId=` kalıcı yönlenir). Sunucu bileşeni ayarları, açık oturumu, son oturumları ve geçmişin ilk sayfasını önden okur; istemci adası `components/admin/a-ajan-konseyi/**`. Yeni BFF: `app/api/admin/council/**` (hepsi `defineRoute`, yalnız ADMIN, zod, rate limit). Çekirdek: `lib/council/{contract,engine.server,sessions.server,config.server,context.server}.ts`. Eski motorlar ve uçlar silindi: `lib/agent-dialogue.ts`, `lib/agent-council.ts` (`computeCouncil`), `lib/agent-personas.ts`, `lib/agent-run-store.ts`, `lib/council-run-mapper.ts`, `components/agents-ui/**`, `app/api/admin/agents/**` (conversation, stream, council-to-actions, run, runs, run/[id], outcomes). Test: `__tests__/lib/council.test.ts` (15 test).

**Yeni akış:** `POST /sessions` oturumu oluşturur (LLM yok; ayar anlık görüntüsü + veri paketi `AgentRun.context`'e yazılır) → istemci `POST /sessions/:id/step` ile adım adım ilerletir. Sıradaki adımı sunucu DB'den belirler. Bir turda uzmanlar paralel konuşur, ardından Kaptan turu toparlar; adım başına en fazla iki ardışık çağrı süresi geçer, bu yüzden 60 sn sınırı aşılmaz. Her adım hep-ya-hiç kaydedilir; iyimser kilit (`updatedAt` + `stepLockUntil`) çift adımı engeller. LLM yanıt vermezse **şablon üretilmez**: açık hata döner, `lastError` görünür kalır, "Yeniden dene" sunulur. Sentez tek yapılandırılmış JSON çağrısıdır (`answer, winner, winnerRationale, confidence, dissent, actions`), zod ile doğrulanır ve kapalı bir uzman kazanan seçilemez.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sunucu tarafı yetki | ÇALIŞIYOR | Tüm yeni uçlar `defineRoute({roles:['ADMIN']})`; sayfa `requireAuth` + proxy kapısı. |
| 2 | Segment metadata (noindex) | ÇALIŞIYOR | Sayfada `robots: noindex`, başlık "Ajan Konseyi". |
| 3 | Hero | ÇALIŞIYOR | QDL `PageHeader`; "xAI / Grok 4.20" marka iddiası kaldırıldı. Model rozeti gerçek `modelUsed` değerinden geliyor. |
| 4 | Hero durum rozeti | ÇALIŞIYOR | Oturumun gerçek durumu: `SessionStatusBadge` (Sürüyor/Tamamlandı/Başarısız/Sonlandırıldı/Arşivde). |
| 5 | Demo modu bandı | KALDIRILDI | Demo/şablon modu yok. AI yapılandırılmamışsa başlatma kapalı ve dürüst uyarı gösteriliyor (503 `AI_UNAVAILABLE`). |
| 6 | "Canlı LLM" rozeti (SAHTE) | KALDIRILDI → yerine ÇALIŞIYOR | Her mesajda yanıt veren model ve süre (`metadata.model/latencyMs`) gösteriliyor. Şablona düşüş olmadığı için kaydedilen her mesaj gerçek LLM çıktısı. |
| 7 | Geçmiş kayıt bandı + "Yeni oturum" | ÇALIŞIYOR | Oturum şeridinde "Yeni oturum", URL Next router ile (`useUrlState`). |
| 8 | Canlı altyazı | ÇALIŞIYOR | Gerçek adım etiketi ("Tur 2/3: Harper, Benjamin, Lucas paralel düşünüyor; ardından Kaptan…" / "Kaptan kararı yazıyor") ve adım izi (`StepTrack`, `aria-current="step"`). |
| 9 | Soru girişi | ÇALIŞIYOR | Textarea, 10–500 karakter sayacı, satır içi doğrulama, Ctrl/⌘+Enter, `<label>` bağlı. |
| 10 | Örnek hedef | ÇALIŞIYOR | Boş girişte 3 örnek soru çipi. |
| 11 | "Konseyi başlat (tur tur)" | ÇALIŞIYOR | "Konseyi topla": oturum oluşur ve bu sekmede kendiliğinden adım adım ilerler. |
| 12 | "Canlı akış (SSE)" | KALDIRILDI | İkinci motor gereksizdi ve 60 sn sınırını aşıyordu. Kalıcı adım modeli yenileme ve kapatmaya dayanıklı. |
| 13 | "Sonraki tur" | ÇALIŞIYOR | "Devam et"; adım izi tur ve "Karar" adımını açıkça gösteriyor. |
| 14 | Durdur / iptal | ÇALIŞIYOR | "Duraklat" (AbortController; sunucuda biten adım yine kaydedilir, bu da açıkça yazıyor), "Sonlandır" (`ConfirmAction`; sonlandırılan oturuma geç gelen sonuç yazılmaz). |
| 15 | Unmount'ta kapatma | ÇALIŞIYOR | Bekleyen istek unmount'ta iptal edilir. |
| 16 | Persona kartları | ÇALIŞIYOR | Kompakt "Konsey masası" (mobilde yatay şerit), yalnız ayarlarda açık olan üyeler. |
| 17 | Ses görselleştiricisi | KALDIRILDI | 484 sonsuz animasyonlu span vardı. Yerine durum halkası (statik `ring`) ve azaltılmış harekete uyan spinner geldi. |
| 18 | Persona durumu | ÇALIŞIYOR | Durum gerçek adımdan türetiliyor; glif yerine metin ("Düşünüyor…", "Uzmanları bekliyor"). |
| 19 | Transkript | ÇALIŞIYOR | Tur başlıkları yapışkan, mesaj türleri (tur / tur özeti / nihai karar). |
| 20 | Transkript rozetleri | ÇALIŞIYOR | |
| 21 | Otomatik kaydırma (BOZUK) | ÇALIŞIYOR | Yalnız iç kutu kaydırılıyor. Kullanıcı yukarıdaysa zorla çekilmiyor, "Yeni mesajlar" hapı çıkıyor; azaltılmış harekette anlık kaydırma. |
| 22 | Odaklanabilir transkript | ÇALIŞIYOR | `role="log"`, `tabIndex=0`, odak halkası. |
| 23 | Ana cevap kartı (çift gösterim) | ÇALIŞIYOR | Tek "Karar" paneli. Transkriptte sentez yalnız kısa alıntı olarak kalıyor ve "Karar paneline yazıldı" diyor. |
| 24 | "Öne çıkan uzman" (SAHTE regex) | ÇALIŞIYOR | Kazanan, gerekçe ve güven sentez JSON'undan geliyor (`parseSynthesis`). `pickWinner` silindi. |
| 25 | Aksiyon paketi | ÇALIŞIYOR | Türkçe öncelik etiketleri, ayrıntı metni, kararlı `key` (`a0…`). |
| 26 | Bayi seçici | ÇALIŞIYOR | Hafif `GET /api/admin/council/dealers?q=` (yalnız id ve ad, 20 sonuç, sunucu araması). Yalnız gerektiğinde yükleniyor; hata ve boş durum görünür. |
| 27 | Bayi kuyruğuna aktarım | ÇALIŞIYOR | "Yayınla" diyaloğu: düzenlenebilir başlık, açıklama ve öncelik, vade seçimi. (oturum, bayi, aksiyon) başına tek kez; denetim kaydı (`agent_council.actions.publish`); bayiye bildirim. Yönetici sorusu ve persona adı bayiye gitmiyor, `impactScore=null`. |
| 28 | `?runId=` açma | ÇALIŞIYOR | `?oturum=`; 404'te `QueryState` hata ekranı ve "Yeni oturuma dön" çıkıyor; eski `?runId=` kalıcı yönleniyor. |
| 29 | Kalıcılık | ÇALIŞIYOR | `AgentRun/AgentMessage/AgentDecision` yazılıyor; yenilemede "Devam et" ile kaldığı yerden sürüyor. |
| 30 | Alt sayfalara gezinme | ÇALIŞIYOR | Sekmeler; eski rotalar sekmelere `permanentRedirect` ediyor. |
| 31 | Ajan ağırlıkları (SAHTE) | KALDIRILDI | Yerine motorun gerçekten okuduğu ayarlar geldi (tur sayısı, açık uzmanlar, veri paketi, kurum talimatı). |
| 32 | Platform verisi ("Veri" uzmanı) | ÇALIŞIYOR | Kapsama göre (platform / tek bayi) 30 günlük veri paketi: geri bildirim, ortalama puan, negatif oran, yüksek kayıp riski, açık aksiyon, şüpheli kayıt. Panelde "Konseyin gördüğü veri" bölümünde görünüyor. İstem paket dışı sayıyı yasaklıyor ve anahtar atfı istiyor. |
| 33 | Toast önekleri | ÇALIŞIYOR | Bu yüzey `sonner`'ı doğrudan Türkçe metinle kullanıyor (`lib/admin-toast` kullanılmıyor). |
| 34 | Sunucu hata yanıtları | ÇALIŞIYOR | Zarf v2: `VALIDATION` (alan mesajları), `AI_FAILED` 502, `AI_UNAVAILABLE` 503, `RATE_LIMITED` 429, `STEP_IN_PROGRESS` 409, `CONFLICT` 409. |
| 35 | Yükleniyor durumu | ÇALIŞIYOR | `QueryState` iskeletleri ve adım satırı. |
| 36 | Boş durum | ÇALIŞIYOR | Örnek sorular, son oturumlar listesi ve aktif ayar özeti (tur, uzmanlar, çağrı tahmini, model). |
| 37 | i18n (tr/en) | KISMİ (kalan) | Metinler tam Türkçe karakterli. `messages/*.json` paylaşılan dosya olduğu için EN çevirisi eklenmedi; admin panelinin geri kalanı da TR-öncelikli. |
| 38 | Azaltılmış hareket | ÇALIŞIYOR | `useMotionPolicy` (mesaj girişi ve karar paneli), kaydırma `auto`, spinner `motion-reduce:animate-none`. |
| 39 | Mobil yerleşim | ÇALIŞIYOR | Mobilde karar ve masa önce, transkript sonra; dokunma hedefleri ≥44px. |
| 40 | Kopyala / dışa aktar | ÇALIŞIYOR | Markdown kopyala ve `.md` indir (`sessionToMarkdown`, yalnız kayıtlı veri). |
| 41 | Hız sınırı / maliyet koruması | ÇALIŞIYOR | Oturum oluşturma 6/10 dk, adım `ai` politikası (10/dk). LLM `runChatCompletion` geçidinden `actorKey` ile geçiyor; bekçi hatası 429'a eşleniyor. Ayarlarda ve formda "en fazla N LLM çağrısı" görünüyor. |
| 42 | Model / gecikme görünürlüğü | ÇALIŞIYOR | Mesaj başına model ve süre, oturum başına model listesi ve çağrı sayısı. Token ve ücret gösterilmiyor: geçit token sayısını döndürmüyor, uydurulmadı. |

**Kapanan bulgular (16/16):** B1 kalıcılık · B2 sahte "canlı" rozeti (şablon tamamen kalktı) · B3 tek-kez yayın, denetim, sızıntı, uydurma etki, bildirim · B4 regex kazanan · B5 60 sn / hata mesajı / iptal (adım modeli, paralel uzmanlar, görünür hata, duraklat/sonlandır) · B6 veri paketi · B7 kaydırma · B8 altyazı ve persona durumu · B9 sahte ağırlık ve yetim alt sayfalar · B10 bayi seçici · B11 girdi doğrulaması ve hata kodları · B12 çift gösterim ve hiyerarşi · B13 marka iddiası (ürün adı "Ajan Konseyi", kaptanın görünen adı "Kaptan"; DB anahtarı eski kayıtlarla uyum için `Grok` olarak kaldı) · B14 görselleştirici · B15 hız sınırı ve maliyet görünürlüğü · B16 küçük temizlikler (dosyalar silindi ya da yeniden yazıldı).

**Uygulanan eksik özellikler:** kalıcı ve paylaşılabilir oturum URL'si · veri bağlamı ve kapsam seçimi · durdur, devam ettir, aynı soruyla yeniden çalıştır · yapılandırılmış karar (güven, karşı görüş) · aksiyon yayını, tekillik, denetim, bildirim ve geri izleme ("Yayınlanan aksiyonlar": bayideki ActionItem durumu canlı okunuyor) · Markdown dışa aktarım ve model görünürlüğü.

**Kalanlar:** (1) Token akışı (yazılırken görünme) yok: adım tamamlanınca gösteriliyor, çünkü `runChatCompletion` akış desteklemiyor ve AI yalnız mevcut geçitten çağrılıyor. (2) Tek mesajı yeniden üretme ve takip sorusu yok. (3) Segment veya çoklu bayiye yayın yok: tek bayi destekleniyor; iç ekip (`/admin/ekip`) görevine aktarım yok. (4) `ActionItem` şemasında tekillik indeksi yok. Tekillik `AgentRun.context.published` ile iyimser kilit altında sağlanıyor. Kesin DB garantisi için **ŞEMA İSTEĞİ:** `ActionItem.sourceRef String?` + `@@unique([sourceRef])`. (5) Ücret görünürlüğü için token sayısı gerekiyor; **ŞEMA/GEÇİT İSTEĞİ:** `runChatCompletion` dönüşüne `usage` eklenmesi (ai-engine sahibi). (6) EN çevirisi (madde 37). (7) `lib/data/admin-api-catalog.json` eski `/api/admin/agents/*` satırlarını içeriyor; `npm run catalog:admin-api` ile yeniden üretilmeli (script çalıştırmak bu dalgada yasak).
