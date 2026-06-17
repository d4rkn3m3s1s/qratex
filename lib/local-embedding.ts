/**
 * Anahtarsız, deterministik yerel embedding.
 *
 * Groq embedding sağlamıyor ve OpenAI anahtarı yoksa, AIEmbedding tablosunu
 * SAHTE/rastgele vektörle değil; metnin GERÇEK içeriğinden türetilen tutarlı bir
 * vektörle doldururuz. Aynı metin → aynı vektör; benzer metinler → yüksek cosine
 * benzerliği. Kalite OpenAI kadar yüksek değildir ama gerçek bir özellik sunar
 * (deterministik bag-of-hashed-bigrams + L2 normalize).
 */

export const LOCAL_EMBEDDING_MODEL = 'local-hash-embed-v1';
export const LOCAL_EMBEDDING_DIM = 256;

/** Türkçe diakritikleri sadeleştirip küçük harfe indirger, kelimelere böler. */
function tokenize(text: string): string[] {
  const normalized = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ');
  return normalized.split(/\s+/).filter((w) => w.length >= 2);
}

/** FNV-1a 32-bit hash (deterministik, hızlı). */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Metni LOCAL_EMBEDDING_DIM boyutlu, L2-normalize edilmiş bir vektöre çevirir.
 * Özellikler: tekil kelimeler + ardışık kelime bigramları (sıralama bilgisi için),
 * signed hashing ile boyuta projeksiyon, sublinear term-frequency ağırlığı.
 */
export function localEmbed(text: string): number[] {
  const vec = new Array<number>(LOCAL_EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  const features: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    features.push(tokens[i]);
    if (i + 1 < tokens.length) features.push(`${tokens[i]}_${tokens[i + 1]}`);
  }

  // Term frequency
  const tf = new Map<string, number>();
  for (const f of features) tf.set(f, (tf.get(f) ?? 0) + 1);

  for (const [feature, count] of tf) {
    const h = fnv1a(feature);
    const idx = h % LOCAL_EMBEDDING_DIM;
    // İşaret bilgisini hash'in bir bitinden al → çakışmaları kısmen dengeler.
    const sign = (h & 0x80000000) !== 0 ? -1 : 1;
    const weight = 1 + Math.log(count); // sublinear TF
    vec[idx] += sign * weight;
  }

  // L2 normalize → cosine benzerliği için.
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

/** İki L2-normalize vektör için cosine benzerliği (= dot product). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
