/**
 * Personel → Kasa. Bayi kasasıyla aynı sunucu sayfası (STAFF yetkisi ve kiracı kapsamı sayfanın
 * kendi `requireAuth` + `resolveDealerScope` denetiminde); personel paneli düzeninde açılır.
 * `/dealer/*` personel için proxy'de kapalı olduğundan personel kasaya eskiden hiç ulaşamıyordu.
 */
export { default, generateMetadata } from '@/app/dealer/scan/page';
export const dynamic = 'force-dynamic';
