/**
 * Global LazyMotion'ın özellik paketi — AYRI parça olarak tembel yüklenir (components/providers.tsx).
 * framer-motion'ın önerdiği desen: `features={() => import(...).then((m) => m.default)}`.
 * Eskiden `features={domAnimation}` eşzamanlıydı → animasyon motoru (~20 KB gzip) her sayfanın
 * ilk JS'ine giriyordu (perf-bundle kapısı). `m.` bileşenleri özellikler gelene kadar başlangıç
 * durumunda çizilir, gelince animasyon başlar.
 */
export { domAnimation as default } from 'framer-motion';
