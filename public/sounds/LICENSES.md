# Arayüz sesleri: lisanslar

**Bu klasörde ses dosyası yok.** Qratex'in arayüz sesleri `lib/sound/recipes.ts` içinde
Web Audio API ile **prosedürel** olarak sentezleniyor: osilatör, filtreli gürültü ve zarf.
Sesler kodumuzun bir parçası, projenin kendi lisansıyla geliyor. Üçüncü taraf hakkı yok,
atıf zorunluluğu yok, indirme boyutu 0 KB.

İleride dosya tabanlı bir ses eklenirse buraya şu satır yazılmalı:
`dosya | kaynak URL | lisans | yazar | indirme tarihi`

| Kaynak | Lisans | Durum |
|---|---|---|
| Kenney UI Audio / Interface Sounds (kenney.nl, opengameart.org/content/interface-sounds) | CC0 1.0, atıf isteğe bağlı | Uygun, yedek seçenek olarak duruyor (kullanılmadı) |
| freesound.org | Her ses için ayrı (CC0 / CC-BY / CC-BY-NC) | Yalnız CC0 filtresiyle kullanılabilir; NC asla |
| ZapSplat | Ücretsiz katmanda atıf zorunlu, tekil dosya yeniden dağıtılamaz | Uygun değil: PWA, dosyayı istemciye dağıtır |
| Material Design sound resources | İkonlar Apache-2.0; seslerin lisansı doğrulanamadı | Kullanılmadı |
| ElevenLabs Sound Effects API | Ücretli plan çıktısı ticari kullanıma uygun | `.env` içinde `ELEVENLABS_API_KEY` yok, ileriye bırakıldı |
