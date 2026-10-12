/**
 * Personel → İşlem defteri. Bayi defteriyle aynı sunucu sayfası; personel kapsamı (bugün /
 * bugün + kendi geçmişi / tümü — bayinin Ekip ekranındaki seçimi) sayfada ve API'de zorlanır.
 * `/dealer/*` personel için proxy'de kapalı olduğundan bu ayarın görüneceği yüzey yoktu.
 */
export { default, generateMetadata } from '@/app/dealer/consumptions/page';
export const dynamic = 'force-dynamic';
