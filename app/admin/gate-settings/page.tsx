import type { Metadata } from 'next';
import { GateSettings } from '@/components/admin/a-ayarlar-kapi/gate-settings';

/**
 * Admin → Gizli Kapı (/admin/gate-settings). Ayarlar kayıt defterinin "Güvenlik ve kapı"
 * bölümünün ayrıntı ekranı: soru, yalnız-yazılır cevap (mevcut cevap ister), toplu oturum
 * sonlandırma, kilit kaldırma ve kapı olayları. Cevap hiçbir uçtan dönmez.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gizli Kapı · Yönetici erişimi',
  description: 'Admin paneli gizli kapısı: soru, cevap değişimi, kapı oturumları, kilitli hesaplar ve kapı olayları.',
};

export default function GateSettingsPage() {
  return <GateSettings />;
}
