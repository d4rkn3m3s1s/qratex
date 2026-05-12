# QRATEX – İyileştirme ve Yapılacaklar Özeti

Bu dosya, projede **yapılabilecek eklemeler**, **düzeltmeler** ve **optimizasyonlar** için kısa bir rehberdir.

---

## ✅ Yapılan Düzeltmeler (Bu Oturumda)

- **Kayıt sayfası linkleri:** `/terms` ve `/privacy` yerine çalışan sayfalar kullanıldı: `/kullanim-sartlari`, `/gizlilik-politikasi`. Ayrıca **Kullanım Şartları** sayfası eklendi (`app/(public)/kullanim-sartlari/page.tsx`).
- **Footer:** Yasal linklere "Kullanım Şartları" eklendi.
- **Dealer AI İçgörüler:** Toplu analiz sırasında profil güncelleme hatası boş `catch {}` ile yutuluyordu; `console.warn` ile loglandı.

---

## 🔧 Düzeltilmesi Gereken / Eksik Olanlar

### 1. Apple Wallet (`lib/wallet.ts`)
- `APPLE_TEAM_IDENTIFIER` yoksa `'XXXXXXXXXX'` placeholder kullanılıyor.
- İmza üretimi için "Return placeholder - in production this would be actual signature" notu var; canlıda gerçek Apple imzası gerekir.
- **Durum:** `lib/wallet.ts` dosyası başında canlı env ve sertifika gereksinimleri dokümante edildi.

### 2. Müşteri QR Tarama – Kamera ✅
- **Tamamlandı:** customer/scan sayfasında html5-qrcode ile kamera tarama çalışıyor; QR okununca feedback sayfasına yönlendirme. Public API data.qrCode uyumlu.

### 3. 404 Sayfası ✅
- **Tamamlandı:** app/not-found.tsx mevcut; marka ile uyumlu, Ana Sayfa ve Giriş Yap linkleri var.

### 4. Hata Sayfası (Error Boundary) ✅
- **Tamamlandı:** `app/error.tsx` mevcut; Tekrar Dene ve Ana Sayfa butonları ile kullanıcıya anlamlı mesaj sunuluyor.

---

## ➕ Eklenebilecek Özellikler

- **Arama / filtre optimizasyonu:** Uzun listelerde (admin kullanıcılar, rozetler, geri bildirimler) sunucu taraflı arama veya sayfalama ile performans iyileştirilebilir.
- **PWA / offline:** `next-pwa` var; manifest ve service worker’ın gerçek offline davranışı test edilip dokümante edilebilir.
- **E-posta doğrulama:** Kayıt sonrası doğrulama linki **Resend** ile e-postaya gönderiliyor. Yapılandırma: `RESEND_API_KEY` (Resend API anahtarı), isteğe bağlı `EMAIL_FROM` (örn. `QRATEX <noreply@yourdomain.com>`). Key yoksa link yalnızca kayıt yanıtında döner; kullanıcı sayfadaki butonla doğrulayabilir.
- **Rate limiting:** Kritik API’lerde (login, kayıt, feedback gönderme) rate limit ile kötüye kullanım azaltılabilir.
- **Skeleton / yükleme durumları:** Bazı sayfalarda veri gelirken skeleton UI ile UX iyileştirilebilir.
- **Erişilebilirlik:** Form hatalarında `aria-describedby`, butonlarda `aria-busy` gibi alanlar gözden geçirilebilir.

---

## ⚡ Optimizasyon Fırsatları

- **Görseller:** `next/image` kullanımı ve `sizes`/placeholder ayarları büyük listelerde kontrol edilebilir.
- **Bundle:** Çok büyük sayfalar (ör. `dealer/ai-insights`, `admin/users`) dinamik import veya lazy component ile bölünebilir.
- **API yanıtları:** Sık kullanılan GET’lerde uygun `Cache-Control` veya kısa süreli cache (örn. discovery config) düşünülebilir.
- **React Query:** Bazı sayfalarda `@tanstack/react-query` kullanılıyor; tüm liste/veri çekmelerinde tutarlı kullanım ve cache stratejisi faydalı olur.

---

## 🧪 Test ve Kalite

- **E2E:** `playwright` ve smoke script’leri var; kritik akışlar (kayıt, giriş, kart aktivasyonu, feedback) düzenli çalıştırılabilir.
- **Birim testleri:** `jest` ile özellikle `lib/` (auth, points, validations) genişletilebilir.
- **Lint:** `next lint` ve TypeScript strict modu ile tutarlı kullanım korunabilir.

---

## 🏪 Dealer (Bayi) Alanı – Düzeltme, Optimizasyon ve Yenilikler

### Düzeltmeler
- **Sidebar badge:** "Geri Bildirimler" yanındaki sabit `badge: 5` kaldırıldı; gerçek okunmamış/cevapsız sayı istenirse API ile beslenebilir.
- **Dashboard loading:** Şu an sadece spinner var; dashboard için skeleton layout (kart iskeletleri) eklenebilir.
- **Dashboard hata durumu:** `data` null/error olduğunda kullanıcıya "Yenile" butonu ve net mesaj gösterilebilir.

### Optimizasyonlar
- **Stats API:** `/api/dealer/stats` ağır; consumption + QR + feedback bir arada. İsteğe bağlı kısa cache (örn. 30 sn) veya hafif bir "özet" endpoint düşünülebilir.
- **Dashboard polling:** 30 sn'de bir tüm stats çekiliyor; arka planda sadece sayılar güncellenebilir veya polling süresi uzatılabilir.
- **QR kodlar listesi:** Çok QR varsa sayfalama; arayüzde sayfa numarası veya "Daha fazla" eklenebilir.
- **Geri bildirimler / Ürünler:** Uzun listelerde sunucu taraflı arama, filtre veya sayfalama.

### Yenilikler (Özellik Fikirleri)
- **Bildirimler:** Yeni geri bildirim, acil/olumsuz veya toksik uyarı için dealer'a bildirim (sayfa içi badge, isteğe bağlı e-posta/push).
- **Dashboard kısayolları:** Son taranan kart, "Şimdi tara" butonu, en düşük puanlı QR'a hızlı link.
- **Geri bildirim cevapları:** Cevap yazıldığında müşteriye e-posta (Resend) ile "İşletme yanıtladı" bilgisi.
- **QR toplu işlem:** Birden fazla QR'ı aynı anda aktif/pasif, indir (zip), sil.
- **Offline senkronizasyon:** `/api/dealer/offline-sync` mevcut; arayüzde "Bekleyen işlemler" paneli veya tarama sonrası offline kuyruk gösterimi.
- **Kampanyalar:** Happy Hour dışında "Özel gün", "Puan çarpanı" gibi kısa kampanya şablonları.
- **Ayarlar:** İşletme çalışma saatleri, varsayılan yanıt şablonu, dil tercihi.
- **Mobil:** Sidebar mobilde sheet/drawer; Kart Tara sayfasında tam ekran kamera deneyimi.

### Özet (Dealer)

| Konu              | Öneri |
|-------------------|--------|
| Sidebar badge     | Sabit 5 kaldırıldı; istenirse dinamik sayı |
| Dashboard         | Skeleton + hata UI eklenebilir |
| Stats/Liste       | Cache, sayfalama, hafif endpoint |
| Bildirimler       | Yeni/olumsuz feedback bildirimi |
| Cevaplar          | Müşteriye e-posta ile "yanıtlandı" |
| Offline           | Kuyruk UI ile kullanıma açılabilir |

---

## ✅ Dealer Alanı – Tamamlanan Adımlar

Aşağıdaki maddeler uygulandı.

### Düzeltmeler
- **Dashboard:** Yüklemede skeleton (kart iskeletleri); hata durumunda "Veriler yüklenemedi" + **Yenile** butonu.
- **Hooks hatası:** `useMemo` (lowestRatedQr) koşullu return'lerden önce taşındı (Rendered more hooks hatası giderildi).

### Optimizasyonlar
- **Stats API:** `Cache-Control: private, s-maxage=30, stale-while-revalidate=60`; polling 60 sn, arka planda sessiz yenileme.
- **QR Kodlar:** Sayfalama (12’şer, Önceki/Sonraki, toplam).
- **Geri bildirimler:** Sayfalama (20’şer, QR sekmesinde).
- **Happy Hour:** Dealer listesi için `GET /api/happy-hour?list=1`.

### Yenilikler
- **Bildirimler:** `GET /api/dealer/notification-badges`; sidebar’da "Geri Bildirimler" için dinamik badge (yanıtsız + toksik).
- **Dashboard kısayolları:** "Şimdi tara" butonu, "En düşük puanlı QR" linki.
- **QR toplu işlem:** Çoklu seçim, Aktif/Pasif yap, ZIP indir, toplu sil; `POST /api/qr-codes/bulk`.
- **Offline kuyruk:** Dashboard’da "Bekleyen işlemler" + "Şimdi senkronize et" butonu.
- **Kampanyalar:** Tür seçimi (Happy Hour / Özel gün), özel gün tarihi, puan çarpanı 1.5x/2x/3x butonları.
- **Ayarlar:** Çalışma saatleri, varsayılan yanıt şablonu, tercih edilen dil (TR/EN). Schema: `User.businessHours`, `User.defaultReplyTemplate`, `User.preferredLanguage`. API: `PATCH/GET /api/user/profile` bu alanları kabul ediyor.
- **Mobil:** Kart Tara’da kamera açıkken tam ekran deneyimi; sidebar mobilde zaten sheet.

### Veritabanı
- **Prisma schema:** `User` modeline `businessHours`, `defaultReplyTemplate`, `preferredLanguage` eklendi. Deploy/sonrası: `npx prisma generate` ve `npx prisma db push` (veya migrate) çalıştırılmalı.

---

## 🔧 Prisma generate EPERM hatası (Windows)

`npx prisma generate` sırasında **EPERM: operation not permitted, rename ... query_engine-windows.dll.node** alıyorsanız:

1. **Dev server’ı durdurun:** `npm run dev` çalışan terminalde Ctrl+C.
2. **Cursor’ü kapatıp dışarıdan deneyin:** Cursor’ü kapatın, Windows Terminal/CMD ile proje klasöründe `npx prisma generate` çalıştırın.
3. **OneDrive’ı duraklatın:** Proje OneDrive içindeyse 1–2 saat sync’i duraklatıp tekrar deneyin.
4. **Eski client’ı silin:** Tüm Node süreçlerini kapattıktan sonra `node_modules/.prisma` klasörünü silin, ardından `npx prisma generate`.
5. **Yönetici olarak:** Terminali "Yönetici olarak çalıştır" ile açıp aynı komutu çalıştırın.

---

## 📌 Özet

| Kategori        | Durum |
|-----------------|--------|
| Kırık linkler   | ✅ Düzeltildi (terms/privacy → kullanim-sartlari, gizlilik-politikasi) |
| Boş catch       | ✅ Düzeltildi (dealer ai-insights) |
| Eksik sayfalar  | ✅ Kullanım Şartları sayfası eklendi |
| Dealer sidebar  | ✅ Sabit badge kaldırıldı; dinamik badge eklendi |
| Dealer iyileştirmeleri | ✅ Skeleton, hata UI, sayfalama, bildirimler, QR toplu işlem, offline panel, kampanyalar, ayarlar, mobil kamera (bak: Tamamlanan Adımlar) |
| Apple Wallet    | ⚠️ Placeholder; lib/wallet.ts başında dokümante; canlıda imza gerekir |
| Kamera QR       | ✅ customer/scan'de html5-qrcode ile kamera tarama çalışıyor |
| 404 / Error UI  | ✅ not-found.tsx ve error.tsx mevcut |
| Prisma EPERM    | 🔧 Çözüm adımları bu dosyada (Prisma generate EPERM hatası) |

Bu liste zamanla güncellenebilir; yeni maddeler commit mesajları veya issue’larla takip edilebilir.

---

## 🗺️ Yeni Özellik Yol Haritası (Önceliklendirilmiş)

### Faz 1 — Hızlı Kazanım (1-2 hafta)

| Özellik | Etki | Efor | Not |
|---|---|---|---|
| AI aksiyon önerilerinden tek tık görev oluşturma | Yüksek | Düşük-Orta | Öneri kartından "Göreve çevir", sorumlu ve son tarih seçimi |
| VoC Wall TV/Kiosk tam ekran modu | Orta-Yüksek | Düşük | Otomatik yenileme, periodik döngü, etkileşim gizleme |
| Bayi sağlık skoru kırılım kartı | Yüksek | Düşük | Skora katkı yapan metriklerin yüzde etkisi |
| Aksiyon listelerinde kapalı döngü durumu | Yüksek | Düşük-Orta | üretildi -> atandı -> tamamlandı -> etki ölçüldü |
| Haftalık yönetici özeti (3 risk / 3 fırsat / 3 öneri) | Yüksek | Orta | Admin ana panelde kısa briefing kutusu |

### Faz 2 — Orta Vade (2-4 hafta)

| Özellik | Etki | Efor | Not |
|---|---|---|---|
| Root-cause (neden yükseldi/düştü) paneli | Yüksek | Orta | Topic + lokasyon + zaman sürücüleri |
| Öncelik skoru (Priority Score) | Yüksek | Orta | sentiment, urgency, churn, etkileşim birleşik skor |
| Playbook + A/B test birleşik akış | Yüksek | Orta-Yüksek | playbook seç -> varyant üret -> otomatik kazanan |
| Sürpriz kutu kişiselleştirme | Orta-Yüksek | Orta | segment ve davranış bazlı içerik seçimi |
| Gürültü azaltmalı akıllı uyarı eşikleri | Orta-Yüksek | Orta | adaptive threshold + quiet hours |

### Faz 3 — Stratejik (1-2 ay)

| Özellik | Etki | Efor | Not |
|---|---|---|---|
| NOC tarzı canlı operasyon merkezi | Çok Yüksek | Yüksek | Trust + VoC + AI + Sistem sağlığı birleşik ekran |
| Öneri etki ölçümleme motoru | Çok Yüksek | Yüksek | aksiyon sonrası KPI değişimi attribution |
| Otomatik playbook orkestrasyonu | Yüksek | Yüksek | sinyal tetiklenince kampanya/görev taslağı |
| Çok tenant benchmark karşılaştırmaları | Yüksek | Orta-Yüksek | aynı dikeyde anomali ve fırsat analizi |

### Uygulama Sırası Önerisi

1. **Faz 1** maddeleri tamamlanır, süreç görünürlüğü ve ekip hızı artırılır.  
2. **Faz 2** ile karar kalitesi yükseltilir (neden-sonuç + deney).  
3. **Faz 3** ile platform proaktif ve yarı-otonom operasyon seviyesine çıkarılır.

### Başarı Ölçütleri (Örnek KPI)

- Aksiyon önerisinden göreve dönüşüm oranı  
- Kritik geri bildirim çözüm süresi (TTR)  
- Bayi sağlık skoru ortalama artışı  
- Churn risk segmentinde düşüş (%)  
- Playbook/A-B deneylerinde kazanım oranı  

---

## 📌 Uygulanabilir Backlog (P0 / P1 / P2)

> Not: Owner alanları başlangıç önerisidir; ekip yapısına göre güncellenebilir.

### P0 (Hemen Başlanacak)

| ID | Öncelik | İş | Owner | Tahmin | Kabul Kriteri |
|---|---|---|---|---|---|
| QRTX-001 | P0 | AI öneri kartından tek tık görev oluşturma | Backend + Frontend | 2-3 gün | Öneriden görev açılır, sorumlu/termin seçilir, durum kaydı oluşur |
| QRTX-002 | P0 | VoC Wall TV/Kiosk tam ekran modu | Frontend | 1-2 gün | Tek tuşla kiosk açılır, auto-refresh çalışır, UI sabit akışta kalır |
| QRTX-003 | P0 | Bayi sağlık skoru kırılımı (katkı barları) | Frontend + Data | 2 gün | Skorun alt metrik katkıları yüzde olarak görünür |
| QRTX-004 | P0 | Aksiyon closed-loop durum rozetleri | Backend + Frontend | 2-3 gün | üretildi/atandı/tamamlandı/ölçüldü adımları izlenir |
| QRTX-005 | P0 | Haftalık yönetici özeti kartı | Backend + Frontend | 2 gün | 3 risk/3 fırsat/3 öneri panelde otomatik oluşur |

### P1 (Sonraki Sprint)

| ID | Öncelik | İş | Owner | Tahmin | Kabul Kriteri |
|---|---|---|---|---|---|
| QRTX-006 | P1 | Root-cause analiz paneli | Data + Frontend | 4-5 gün | Trend düşüş/yükseliş için ilk 3 sürücü listelenir |
| QRTX-007 | P1 | Priority Score hesaplama ve sıralama | Data + Backend | 3-4 gün | Her feedback için skor üretilir, listeler skora göre sıralanır |
| QRTX-008 | P1 | Playbook + A/B test birleşik akış | Backend + Frontend | 5-7 gün | Playbook’tan varyant üretilir, deney başlatılır, kazanan işaretlenir |
| QRTX-009 | P1 | Sürpriz kutu kişiselleştirme | Backend + Frontend | 4-5 gün | Segmente göre kutu içeriği değişir, neden bu ödül gösterilir |
| QRTX-010 | P1 | Adaptif alert eşikleri + sessiz zaman | Backend | 3-4 gün | Gürültülü uyarılar azalır, quiet hours kuralları uygulanır |

### P2 (Stratejik / Büyük İşler)

| ID | Öncelik | İş | Owner | Tahmin | Kabul Kriteri |
|---|---|---|---|---|---|
| QRTX-011 | P2 | NOC tarzı birleşik operasyon merkezi | Frontend + Backend + Data | 2-3 hafta | Trust/VoC/AI/Sistem sağlığı tek ekranda canlı akar |
| QRTX-012 | P2 | Aksiyon etki ölçümleme motoru | Data + Backend | 2 hafta | Aksiyon sonrası KPI etkisi ilişkilendirilmiş olarak raporlanır |
| QRTX-013 | P2 | Otomatik playbook orkestrasyonu | Backend + Data | 2-3 hafta | Belirli sinyallerde otomatik taslak kampanya/görev oluşur |
| QRTX-014 | P2 | Çok-tenant benchmark analizi | Data | 1-2 hafta | Dikey bazlı karşılaştırma ve anomali raporu üretilir |

### Sprint Planı Önerisi

- Sprint 1: `QRTX-001` `QRTX-002` `QRTX-003`  
- Sprint 2: `QRTX-004` `QRTX-005` `QRTX-006`  
- Sprint 3: `QRTX-007` `QRTX-008` `QRTX-009`  
- Sprint 4: `QRTX-010` + P2 hazırlık teknik tasarım

---

## 🎯 Seçilen Özellik Paketi (Müşteri + Admin)

Bu bölüm, ürün sahibinin son seçtiği özellikleri tek pakette toplar.

### Müşteri Tarafı (Seçilen)

| ID | Özellik | Öncelik | Kapsam | Teknik Yaklaşım |
|---|---|---|---|---|
| CUS-REM-01 | Akıllı hatırlatma akışı | P0 | Uzun süredir feedback yok / puan var yorum yok için nazik nudges | `Notification` + zamanlayıcı kuralı (gün bazlı), kullanıcı başına soğuma süresi |
| CUS-RWD-02 | Kişisel ödül stratejisi | P0 | Surprise box/reward ekranında "hedefe ulaşma önerisi" | Son 30 gün davranışına göre öneri motoru (kural tabanlı başlangıç) |
| CUS-BRN-03 | Şube bazlı deneyim karşılaştırması | P1 | Şubeler arası memnuniyet/bekleme farkı | `consumption + feedback` verisi ile lokasyon bazlı kıyas kartı |
| CUS-AI-04 | Geri bildirim kalitesi yardımcısı | P0 | Yazarken AI kalitesini artıran kısa öneri | Yazım anında metin denetimi (kısa, saygılı, net beklenti) + canlı öneri kutusu |

### Admin Tarafı (Seçilen)

| ID | Özellik | Öncelik | Kapsam | Teknik Yaklaşım |
|---|---|---|---|---|
| ADM-RCA-01 | Kök neden motoru (Root Cause Graph) | P1 | Düşüşleri nedensel akışla açıklama | Konu -> şube -> zaman -> etki zinciri çıkarımı, yönlü grafik görünümü |
| ADM-BEN-02 | Tenant benchmark + anomali | P1 | Segment içi kıyas + sapma tespiti | Segment median/percentile bazlı eşik ve beklenmeyen sapma işaretleme |

### Teslimat Sırası (Önerilen)

1. `CUS-AI-04` (geri bildirim kalitesi yardımcısı)  
2. `CUS-REM-01` (akıllı hatırlatma)  
3. `CUS-RWD-02` (kişisel ödül stratejisi)  
4. `CUS-BRN-03` (şube karşılaştırma)  
5. `ADM-BEN-02` (benchmark + anomali)  
6. `ADM-RCA-01` (root cause graph)

### Bağımlılıklar

- Push/e-posta kanalı: nudges için bildirim altyapısı netleşmeli.
- Event geçmişi: "son geri bildirim tarihi" ve "yorum yok/var" olayları tutarlı olmalı.
- Segment tanımı: tenant benchmark için segment kuralları sabitlenmeli.
- Grafik altyapısı: root cause görselleştirmesi için mevcut chart setine yönlü graph bileşeni eklenmeli.
