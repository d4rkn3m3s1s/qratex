/**
 * `domMax` (layout/paylaşılan öğe animasyonları) yalnız Kartım yüzeyinde, tembel yüklenir
 * (yol haritası §4.2-6). Global LazyMotion `domAnimation` taşır; bu yüzeyde iç içe
 * `LazyMotion features={loadDomMax}` özellikleri genişletir.
 */
export const loadDomMax = () => import('framer-motion').then((mod) => mod.domMax);
