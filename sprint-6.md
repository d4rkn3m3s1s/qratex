# Sprint 6: Gamification, AI Kampanyaları, Yeni Ayarlar ve Eksik Sayfaların Tamamlanması

## Hedefler
Müşteri sadakatini artıracak oyunlaştırma özellikleri, işletmeciler için akıllı kampanya ve AI araçları, ayrıca gelişmiş ayarların sisteme entegrasyonu. Ek olarak, daha önce yazılmış ancak arayüzü çizilmemiş (veya yarım kalmış) API'lerin sayfalarının oluşturulması.

## Faz 1: Müşteri Deneyimi ve Oyunlaştırma (Customer)
- [ ] **S6-T1:** `journey-timeline` API'si için Müşteri "Zaman Çizelgesi" (Timehop) sayfasının oluşturulması (`app/customer/journey-timeline/page.tsx`).
- [ ] **S6-T2:** Günlük Çarkıfelek / Sürpriz Kutu özelliğinin devreye alınması (API ve `app/customer/surprise-boxes/page.tsx` entegrasyonu).
- [ ] **S6-T3:** Davet Et Kazan (Referral) Altyapısı ve Sayfasının Tamamlanması (`app/api/customer/referral` ve `app/customer/referral/page.tsx`).
- [ ] **S6-T4:** Müşteri `favorites` API'si için Favoriler sekmesinin arayüzünün yapılması.

## Faz 2: İşletme Kampanya ve Zeka Araçları (Dealer)
- [ ] **S6-T5:** Segment Bazlı Push Kampanyaları için `app/dealer/campaigns/page.tsx` sayfasının tam fonksiyonel hale getirilmesi (Mevcut API'lerin UI'a bağlanması).
- [ ] **S6-T6:** `roi` ve `churn-risk` API'leri için eksik olan Dashboard/Analitik arayüz geliştirmelerinin yapılması.
- [ ] **S6-T7:** Personel Değerlendirme Sistemi (`api/dealer/staff`) için QR Feedback Formu'na Garson/Personel seçme özelliğinin eklenmesi.

## Faz 3: Ayarlar ve Erişilebilirlik (Settings & Preferences)
- [ ] **S6-T8:** Hem Müşteri hem İşletmeci Ayarlar Sayfasına "Gelişmiş Erişilebilirlik" (Yüksek kontrast, animasyon azaltma vb.) özelliklerinin eklenmesi.
- [ ] **S6-T9:** İşletmeciler (Dealer) için "Tatil / Mesai Dışı Modu" ayarının Otomatik Yanıtlar arayüzüne eklenmesi.

## Faz 4: AI Copilot & Smart Replies
- [ ] **S6-T10:** Gelen yorumlara yanıt verilirken AI destekli "Akıllı Yanıt Önerileri" (Özür Dile, Esprili, Kısa) özelliğinin Dealer Feedbacks sayfasına (`app/dealer/feedbacks/page.tsx`) entegrasyonu.
- [ ] **S6-T11:** Genel sistemin hata taraması (Checklist / UX Audit), tüm yeni yeteneklerin test edilmesi.
