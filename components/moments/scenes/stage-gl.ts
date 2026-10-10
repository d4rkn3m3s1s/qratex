/**
 * An Motoru 3B sahnesinin GL yapı taşları — YALNIZ `moment-stage-3d.tsx` içe aktarır
 * (three.js ile birlikte aynı lazy chunk'ta kalır; ana pakete girmez).
 *
 * Teknikler imza sürpriz kutusundan (`components/rewards/signature-gift-box-3d.tsx`)
 * alındı ve renkleri parametreli hâle getirildi:
 *   • Fasetli kesim taşı — üçgen başına tek normal + kanal başına ayrı kırılma indisi
 *     (kenarlardaki renk saçılımı / "ateş").
 *   • Keskin kenarlı prosedürel stüdyo — PMREM/HDR yok; her yüzey aynı odayı örnekler.
 *   • Işın parçacıkları — ortak ışınlara dizilmiş, yavaşlayarak aynı kabukta biriken
 *     noktalar; konum tamamen vertex shader'da (kare başına CPU maliyeti sıfır).
 *   • Eşikli bloom — yalnız parlak bölgeler (eşik + yumuşak diz) iki kademeli
 *     ayrılabilir gauss ile bulanıklaştırılıp ön çarpımlı olarak bindirilir; ACES + sRGB
 *     yalnız en sonda.
 *
 * NOT: GLSL şablon literallerinin içinde ters tırnak KULLANILMAZ (literali kapatır).
 */
import * as THREE from 'three';

// ═════════════════════════════════════════════════════════════════════
//  GEOMETRİ
// ═════════════════════════════════════════════════════════════════════

/** Klasik parlak kesim profili: taç → kuşak → pavyon → kulet. y aralığı [-1.05, 0.62]. */
const GEM_PROFILE: Array<[number, number]> = [
  [0.6, 0.62],
  [0.94, 0.34],
  [1.0, 0.12],
  [0.0, -1.05],
];

/** Taşın dikey merkezi (profilin orta noktası) — kadraj hesabı için. */
export const GEM_CENTER_Y = (0.62 + -1.05) / 2;
/** Taşın yarı yüksekliği (birim ölçekte). */
export const GEM_HALF_HEIGHT = (0.62 + 1.05) / 2;

/**
 * Kesim taşı: profil `sides` faset üzerinde döndürülür. Her üçgen KENDİ köşeleriyle
 * yazılır → her faset tek normal alır (köşe paylaşımı taşı fıçı gibi gölgeler).
 */
export function buildFacetedGem(sides: number): THREE.BufferGeometry {
  const verts: number[] = [];
  const ringPoint = (radius: number, y: number, i: number) => {
    // Yarım adım kaydırma: az fasetli taş kameraya kenar değil YÜZ gösterir.
    const a = ((i % sides) + 0.5) * ((Math.PI * 2) / sides);
    return [Math.cos(a) * radius, y, Math.sin(a) * radius] as const;
  };
  const push = (p: readonly number[]) => {
    verts.push(p[0], p[1], p[2]);
  };
  for (let k = 0; k < GEM_PROFILE.length - 1; k++) {
    const [rTop, yTop] = GEM_PROFILE[k];
    const [rBot, yBot] = GEM_PROFILE[k + 1];
    for (let i = 0; i < sides; i++) {
      const t0 = ringPoint(rTop, yTop, i);
      const t1 = ringPoint(rTop, yTop, i + 1);
      const b0 = ringPoint(rBot, yBot, i);
      const b1 = ringPoint(rBot, yBot, i + 1);
      if (rTop <= 1e-5) {
        push([0, yTop, 0]);
        push(b1);
        push(b0);
      } else if (rBot <= 1e-5) {
        push(t0);
        push(t1);
        push([0, yBot, 0]);
      } else {
        push(t0);
        push(t1);
        push(b1);
        push(t0);
        push(b1);
        push(b0);
      }
    }
  }
  const cap = GEM_PROFILE[0];
  for (let i = 0; i < sides; i++) {
    push([0, cap[1], 0]);
    push(ringPoint(cap[0], cap[1], i));
    push(ringPoint(cap[0], cap[1], i + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Bir üçgen ağının YÜZEYİNDEN eşit dağılımlı noktalar (alan ağırlıklı) + dışa doğru yön.
 * Eski lig amblemi bu noktalara "dağılır".
 */
export function buildSurfaceScatter(source: THREE.BufferGeometry, count: number): THREE.BufferGeometry {
  const pos = source.getAttribute('position') as THREE.BufferAttribute;
  const triCount = Math.floor(pos.count / 3);
  const areas = new Float32Array(triCount);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    total += area;
    areas[t] = total;
  }
  const out = new Float32Array(count * 3);
  const dir = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const r = Math.random() * total;
    let lo = 0;
    let hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (areas[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    a.fromBufferAttribute(pos, lo * 3);
    b.fromBufferAttribute(pos, lo * 3 + 1);
    c.fromBufferAttribute(pos, lo * 3 + 2);
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    p.copy(a)
      .addScaledVector(ab.subVectors(b, a), u)
      .addScaledVector(ac.subVectors(c, a), v);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
    // Dışa (merkezden) + hafif yukarı + serpiştirme.
    let dx = p.x + (Math.random() - 0.5) * 0.6;
    let dy = p.y - GEM_CENTER_Y + 0.25 + (Math.random() - 0.5) * 0.6;
    let dz = p.z + (Math.random() - 0.5) * 0.6;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    dir[i * 3] = dx;
    dir[i * 3 + 1] = dy;
    dir[i * 3 + 2] = dz;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

/**
 * Halka montajı: `position` = halkadaki HEDEF nokta, `aStart` = dağınık başlangıç.
 * Başlangıçlar halkayı çevreleyen geniş bir kabuktan gelir; shader girdap çizerek toplar.
 */
export function buildRingAssembly(count: number, radius: number, tube: number): THREE.BufferGeometry {
  const target = new Float32Array(count * 3);
  const start = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2 + Math.random() * 0.02;
    // Tüp kesitinde dağılım: çoğu halkanın üstünde, bir kısmı hafif dışında (yumuşak kenar).
    const ph = Math.random() * Math.PI * 2;
    const rr = tube * Math.sqrt(Math.random()) * 1.6;
    const R = radius + Math.cos(ph) * rr;
    target[i * 3] = Math.cos(th) * R;
    target[i * 3 + 1] = Math.sin(th) * R;
    target[i * 3 + 2] = Math.sin(ph) * rr;

    const sr = radius * (1.9 + Math.random() * 1.6);
    const sth = th + (Math.random() - 0.5) * 1.4;
    start[i * 3] = Math.cos(sth) * sr;
    start[i * 3 + 1] = Math.sin(sth) * sr;
    start[i * 3 + 2] = (Math.random() - 0.5) * radius * 2.4;
    delay[i] = Math.random();
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(target, 3));
  g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

/**
 * Ortak ışınlara dizilmiş patlama bulutu (Fibonacci küresi → kutuplarda kümelenme yok).
 * `flatten` z bileşenini bastırır (halka/madalyon düzleminde yelpaze).
 * Aynı ışındaki noktalar birbirinin biraz gerisinde başlar → grup ÇİZGİ olarak okunur.
 */
export function buildRayBurst(rays: number, perRay: number, flatten = 0): THREE.BufferGeometry {
  const count = rays * perRay;
  const dir = new Float32Array(count * 3);
  const offset = new Float32Array(count);
  const seed = new Float32Array(count);
  const golden = Math.PI * (3 - Math.sqrt(5));
  let i = 0;
  for (let r = 0; r < rays; r++) {
    const y0 = 1 - (r / Math.max(1, rays - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const theta = golden * r;
    let dx = Math.cos(theta) * ring + (Math.random() - 0.5) * 0.12;
    let dy = y0 + (Math.random() - 0.5) * 0.12;
    let dz = (Math.sin(theta) * ring + (Math.random() - 0.5) * 0.12) * (1 - flatten);
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const life = 0.55 + Math.random() * 0.45;
    const lag = Math.random() * 0.12;
    for (let p = 0; p < perRay; p++) {
      dir[i * 3] = dx;
      dir[i * 3 + 1] = dy;
      dir[i * 3 + 2] = dz;
      offset[i] = lag + (p / perRay) * 0.16;
      seed[i] = life;
      i++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aOffset', new THREE.BufferAttribute(offset, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

/** Arka planda yavaşça yükselen toz (shader ile; CPU döngüsü yok). */
export function buildDust(count: number, spread: number): THREE.BufferGeometry {
  const p = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (Math.random() - 0.5) * spread * 2;
    p[i * 3 + 1] = (Math.random() - 0.5) * spread * 2;
    p[i * 3 + 2] = -1.5 - Math.random() * 2.5;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

// ═════════════════════════════════════════════════════════════════════
//  GÖLGELENDİRİCİLER
// ═════════════════════════════════════════════════════════════════════

export const SURFACE_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vNormalL = normal;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * Keskin kenarlı stüdyo (gökyüzü değil ÇEKİM SETİ): üç eksende sınırlı üst anahtar
 * panel + iki ucundan kapalı aksan şeridi + ufuk çizgisi. Renkler sahne rengine göre
 * uniform ile verilir; teknik sürpriz kutusununkiyle aynıdır.
 */
const STUDIO_GLSL = /* glsl */ `
  uniform vec3 uRoomTop;
  uniform vec3 uRoomBottom;
  uniform vec3 uKeyCol;
  uniform vec3 uAccent;
  uniform float uEdgeSoft;

  vec3 studio(vec3 dir) {
    float up = dir.y * 0.5 + 0.5;
    vec3 col = mix(uRoomBottom, uRoomTop, pow(up, 1.55));
    float key = smoothstep(0.34 - uEdgeSoft, 0.34 + uEdgeSoft, dir.y)
              * (1.0 - smoothstep(0.66 - uEdgeSoft, 0.66 + uEdgeSoft, abs(dir.x)))
              * (1.0 - smoothstep(0.72 - uEdgeSoft, 0.72 + uEdgeSoft, abs(dir.z)));
    col += uKeyCol * key * 0.62;
    float strip = smoothstep(-0.42 - uEdgeSoft, -0.42 + uEdgeSoft, dir.y)
                * (1.0 - smoothstep(-0.12 - uEdgeSoft, -0.12 + uEdgeSoft, dir.y))
                * smoothstep(-0.92 - uEdgeSoft * 3.0, -0.92 + uEdgeSoft * 3.0, dir.x)
                * (1.0 - smoothstep(-0.34 - uEdgeSoft * 3.0, -0.34 + uEdgeSoft * 3.0, dir.x));
    col += uAccent * strip * 0.55;
    col += uKeyCol * exp(-pow(dir.y / 0.045, 2.0)) * 0.16;
    return col;
  }
`;

/** Kesim taşı: kanal başına ayrı kırılma indisi → kenarlarda renk saçılımı. */
export const GEM_FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uFire;
  uniform float uIndex;
  uniform float uDispersion;
  uniform float uSpecular;
  uniform float uCharge;
  uniform float uOpacity;

  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;

  ${STUDIO_GLSL}

  void main() {
    if (uOpacity <= 0.002) discard;
    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vViewV);
    float facing = max(dot(n, v), 0.0);
    float fres = pow(1.0 - facing, 5.0);

    vec3 rd = -v;
    vec3 rr = refract(rd, n, 1.0 / max(1.02, uIndex - uDispersion));
    vec3 rg = refract(rd, n, 1.0 / max(1.02, uIndex));
    vec3 rb = refract(rd, n, 1.0 / max(1.02, uIndex + uDispersion));
    vec3 through = vec3(studio(rr).r, studio(rg).g, studio(rb).b);
    vec3 refl = studio(reflect(rd, n));

    vec3 col = through * uTint * 1.5;
    col = mix(col, refl, 0.25 + fres * 0.6);
    col += uFire * fres * (0.22 + uCharge * 0.55);

    /*
     * FASET AYIRMA — büyük ölçekte (tam ekran) taş tek tonlu bir koni gibi okunuyordu
     * (sürpriz kutusunda taş küçük olduğu için görünmüyordu). Faset başına tek normal
     * olduğundan bu terim her yüzü AYRI bir değerde tutar; taş döndükçe yüzler sırayla
     * parlar (pırıltı). İkinci terim yüz başına keskin yansıma ışıltısı.
     */
    vec3 kdir = normalize(vec3(-0.35, 0.8, 0.5));
    col *= 0.6 + 0.65 * smoothstep(-0.7, 0.95, dot(n, kdir));
    float glint = pow(max(dot(reflect(rd, n), normalize(vec3(0.25, 0.55, 0.8))), 0.0), 24.0);
    col += uKeyCol * glint * 0.9;

    vec3 hKey = normalize(normalize(vec3(-0.35, 0.8, 0.5)) + v);
    float spec = pow(max(dot(n, hKey), 0.0), uSpecular) * 1.8
               + pow(max(dot(n, hKey), 0.0), uSpecular * 4.0) * 1.1;
    col += uKeyCol * spec;
    col *= 0.95 + uCharge * 1.35;

    float a = clamp(0.34 + fres * 0.7 + spec, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * Madalyon (silindir; ekseni yerel Y). Yüzde: dış metal bant + parlak oluk +
 * koyu emaye iç disk (DOM rozet ikonu bunun üstünde okunur). Yan kenar: rozet
 * renginde ışıyan şerit (bloom eşiğini aşar). Metal, PMREM olmadığı için aynı
 * prosedürel stüdyoyla gölgelenir (aksi hâlde three PBR metali siyaha yakın çıkar).
 */
export const MEDALLION_FRAGMENT = /* glsl */ `
  uniform vec3 uMetal;
  uniform vec3 uEdgeCol;
  uniform vec3 uEnamel;
  uniform float uEdgeGlow;
  uniform float uRough;
  uniform float uRadius;

  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;

  ${STUDIO_GLSL}

  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(vViewV);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 r = normalize(mix(reflect(-v, n), n, uRough));
    vec3 env = studio(r);
    vec3 hKey = normalize(normalize(vec3(0.42, 0.78, 0.46)) + v);
    float spec = pow(max(dot(n, hKey), 0.0), 90.0) * 0.9;

    float isFace = step(0.6, abs(vNormalL.y));
    float rad = length(vLocal.xz) / uRadius;

    vec3 metal = env * uMetal * 1.15 + uKeyCol * (fres * 0.3 + spec);

    // Yüz: dış bant metal, oluk ışıklı, iç disk koyu emaye (hafif radyal parıltı).
    float groove = smoothstep(0.035, 0.0, abs(rad - 0.8));
    float inner = 1.0 - smoothstep(0.76, 0.78, rad);
    vec3 enamel = uEnamel * (0.55 + 0.45 * (1.0 - rad)) + env * 0.08 + uKeyCol * spec * 0.35;
    vec3 face = mix(metal, enamel, inner);
    face += uEdgeCol * groove * uEdgeGlow;
    // Dış çember: incecik ışık çizgisi.
    face += uEdgeCol * smoothstep(0.965, 1.0, rad) * uEdgeGlow * 0.6;

    // Yan kenar: tırtıklı (sinüs) parlak şerit.
    float knurl = 0.75 + 0.25 * sin(atan(vLocal.z, vLocal.x) * 90.0);
    vec3 side = metal * 0.55 + uEdgeCol * uEdgeGlow * 0.9 * knurl;

    vec3 col = mix(side, face, isFace);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Parlak halka (torus): açı boyunca iki renk arasında akar; `uGlow` > 1 → bloom.
 * Toplamalı harman; `uOpacity` ile belirir.
 */
export const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uTime;

  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;

  void main() {
    if (uOpacity <= 0.002) discard;
    float ang = atan(vLocal.y, vLocal.x);
    float k = 0.5 + 0.5 * sin(ang * 2.0 + uTime * 1.6);
    vec3 col = mix(uColorA, uColorB, k);
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(vViewV);
    float core = pow(max(dot(n, v), 0.0), 1.5);
    // Renk tonu korunur (ACES beyaza kırpmasın); yalnız ince çekirdek beyaza yaklaşır.
    vec3 c = col * uGlow * (0.55 + core * 0.6) + vec3(1.0) * pow(core, 8.0) * 0.22 * uGlow;
    float a = uOpacity * (0.35 + core * 0.65);
    gl_FragColor = vec4(c * a, a);
  }
`;

/** Halka montajı: dağınık başlangıçtan girdap çizerek halkaya toplanan noktalar. */
export const ASSEMBLY_VERTEX = /* glsl */ `
  attribute vec3 aStart;
  attribute float aDelay;
  attribute float aSeed;

  uniform float uT;
  uniform float uEnd;
  uniform float uSpin;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uPointScale;

  varying float vBright;
  varying float vMix;

  vec3 rotZ(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
  }

  void main() {
    float d = aDelay * uEnd * 0.42;
    float k = clamp((uT - d) / max(0.001, uEnd - d), 0.0, 1.0);
    float e = 1.0 - pow(1.0 - k, 3.0);
    vec3 from = rotZ(aStart, (1.0 - e) * (1.8 + aSeed * 1.4));
    vec3 to = rotZ(position, uSpin);
    vec3 p = mix(from, to, e);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.65 + 0.35 * sin(uT * 7.0 + aSeed * 40.0);
    gl_PointSize = uSize * (0.6 + aSeed * 0.8) * uPixelRatio * uPointScale * (10.0 / max(0.001, -mv.z));
    vBright = smoothstep(0.0, 0.15, k) * twinkle;
    vMix = 0.5 + 0.5 * sin(atan(position.y, position.x) * 2.0);
  }
`;

export const ASSEMBLY_FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uGate;
  varying float vBright;
  varying float vMix;
  void main() {
    if (uGate <= 0.002) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float fall = 1.0 - d;
    float shape = pow(fall, 4.0) + pow(fall, 1.5) * 0.25;
    vec3 col = mix(uColorA, uColorB, vMix) * 1.6 + vec3(0.25);
    float a = shape * vBright * uGate;
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * Tek seferlik ışın patlaması: `uBurst` (patlamadan bu yana sn) < 0 iken görünmez.
 * Işınlar YAVAŞLAR (1-(1-t)³) ve aynı kabukta birikir; `uRim` ışın boylarını eşitler.
 */
export const BURST_VERTEX = /* glsl */ `
  attribute float aOffset;
  attribute float aSeed;

  uniform float uBurst;
  uniform float uSpeed;
  uniform float uRadius;
  uniform float uSize;
  uniform float uRim;
  uniform float uPixelRatio;
  uniform float uPointScale;

  varying float vLife;
  varying float vBright;

  void main() {
    float t = clamp((uBurst - aOffset) * uSpeed * (0.7 + aSeed * 0.6), 0.0, 1.0);
    float life = mix(aSeed, 1.0, uRim);
    float r = uRadius * life * (1.0 - pow(1.0 - t, 3.0));
    vec4 mv = modelViewMatrix * vec4(position * r, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 - t * 0.5) * uPixelRatio * uPointScale * (10.0 / max(0.001, -mv.z));
    float birth = smoothstep(0.0, 0.04, t) * step(0.0, uBurst - aOffset);
    float death = 1.0 - smoothstep(0.55, 1.0, t);
    float flick = 0.6 + 0.4 * sin(uBurst * 22.0 + aSeed * 43.0 + aOffset * 61.0);
    vBright = birth * death * flick;
    vLife = t;
  }
`;

export const BURST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uGate;
  varying float vLife;
  varying float vBright;
  void main() {
    if (uGate <= 0.002 || vBright <= 0.002) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float fall = 1.0 - d;
    float shape = pow(fall, 5.0) + pow(fall, 1.6) * 0.3;
    vec3 col = mix(uHot, uColor, smoothstep(0.0, 0.5, vLife));
    float a = shape * vBright * uGate;
    gl_FragColor = vec4(col * a * 2.0, a);
  }
`;

/** Eski amblemin dağılan parçacıkları: yüzeyden dışa sürüklenip söner. */
export const SCATTER_VERTEX = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSeed;
  uniform float uK;
  uniform float uDist;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uPointScale;
  varying float vBright;
  void main() {
    float k = clamp(uK * (0.75 + aSeed * 0.5), 0.0, 1.0);
    float e = 1.0 - pow(1.0 - k, 2.4);
    vec3 p = position + aDir * uDist * e * (0.6 + aSeed * 0.8);
    p.y -= e * e * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 - e * 0.6) * uPixelRatio * uPointScale * (10.0 / max(0.001, -mv.z));
    vBright = (1.0 - smoothstep(0.55, 1.0, k)) * step(0.0005, uK);
  }
`;

export const SCATTER_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vBright;
  void main() {
    if (vBright <= 0.002) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float fall = 1.0 - d;
    float a = (pow(fall, 3.0) + pow(fall, 1.4) * 0.2) * vBright;
    gl_FragColor = vec4(uColor * a * 1.5, a);
  }
`;

/** Arka plan tozu: yavaşça yükselir, kenarlarda söner. */
export const DUST_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uSpread;
  uniform float uPixelRatio;
  uniform float uPointScale;
  varying float vA;
  void main() {
    vec3 p = position;
    float h = uSpread * 2.0;
    p.y = mod(p.y + uSpread + uTime * (0.08 + aSeed * 0.12), h) - uSpread;
    p.x += sin(uTime * 0.4 + aSeed * 30.0) * 0.05;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aSeed * 1.8) * uPixelRatio * uPointScale * (10.0 / max(0.001, -mv.z));
    vA = (1.0 - smoothstep(0.7, 1.0, abs(p.y) / uSpread)) * (0.3 + 0.7 * aSeed);
  }
`;

export const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 2.0) * vA * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** Genişleyen şok halkası (düz halka diski). */
export const SHOCK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;
  void main() {
    if (uOpacity <= 0.002) discard;
    float r = length(vLocal.xy);
    float band = smoothstep(0.92, 0.975, r) * (1.0 - smoothstep(0.975, 1.0, r));
    float a = band * uOpacity;
    gl_FragColor = vec4(uColor * a * 1.8, a);
  }
`;

// ── Sonra-işleme (bloom) ─────────────────────────────────────────────

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PREFILTER_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float lum = max(max(c.r, c.g), c.b);
    float soft = clamp((lum - uThreshold + uKnee) / max(2.0 * uKnee, 1e-4), 0.0, 1.0);
    float contrib = max(lum - uThreshold, lum * soft * soft * 0.5);
    float w = lum > 1e-5 ? contrib / lum : 0.0;
    gl_FragColor = vec4(c.rgb * w, c.a * w);
  }
`;

const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    sum += texture2D(tDiffuse, vUv + uStep * 1.3846) * 0.3162162;
    sum += texture2D(tDiffuse, vUv - uStep * 1.3846) * 0.3162162;
    sum += texture2D(tDiffuse, vUv + uStep * 3.2307) * 0.0702702;
    sum += texture2D(tDiffuse, vUv - uStep * 3.2307) * 0.0702702;
    gl_FragColor = sum;
  }
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tBase;
  uniform sampler2D tNear;
  uniform sampler2D tWide;
  uniform float uBloom;
  varying vec2 vUv;
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
               step(vec3(0.0031308), c));
  }
  void main() {
    vec4 base = texture2D(tBase, vUv);
    vec4 near = texture2D(tNear, vUv);
    vec4 wide = texture2D(tWide, vUv);
    vec3 glow = near.rgb * 0.85 + wide.rgb * 1.15;
    float glowA = near.a * 0.85 + wide.a * 1.15;
    vec3 lin = base.rgb + glow * uBloom;
    float a = clamp(base.a + glowA * uBloom * 0.55, 0.0, 1.0);
    if (a <= 0.0008) discard;
    vec3 straight = lin / max(a, 1e-4);
    vec3 outCol = toSRGB(aces(straight));
    gl_FragColor = vec4(outCol * a, a);
  }
`;

export interface BloomPipeline {
  resize(w: number, h: number): void;
  /** Sahneyi ara tampona çizer, eşikli bloom uygular ve tuvale bindirir. */
  render(scene: THREE.Scene, camera: THREE.Camera, strength: number): void;
  dispose(): void;
}

/**
 * Eşikli bloom: sahne → yarım kayan noktalı tampon → parlak geçiş (eşik 0.72, diz 0.35)
 * → yarım ve çeyrek çözünürlükte iki ayrılabilir gauss → ön çarpımlı bindirme.
 */
export function createBloomPipeline(renderer: THREE.WebGLRenderer): BloomPipeline {
  let rtBase: THREE.WebGLRenderTarget | null = null;
  let rtHalfA: THREE.WebGLRenderTarget | null = null;
  let rtHalfB: THREE.WebGLRenderTarget | null = null;
  let rtQuarterA: THREE.WebGLRenderTarget | null = null;
  let rtQuarterB: THREE.WebGLRenderTarget | null = null;

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.Camera();
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const prefilterMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: PREFILTER_FRAGMENT,
    uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.72 }, uKnee: { value: 0.35 } },
    depthTest: false,
    depthWrite: false,
  });
  const blurMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
    uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
  });
  const compositeMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: { tBase: { value: null }, tNear: { value: null }, tWide: { value: null }, uBloom: { value: 0.8 } },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const quad = new THREE.Mesh(quadGeo, blurMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const disposeTargets = () => {
    for (const rt of [rtBase, rtHalfA, rtHalfB, rtQuarterA, rtQuarterB]) rt?.dispose();
    rtBase = rtHalfA = rtHalfB = rtQuarterA = rtQuarterB = null;
  };

  const runQuad = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(quadScene, quadCamera);
  };

  const blurPass = (source: THREE.Texture, target: THREE.WebGLRenderTarget, dx: number, dy: number) => {
    blurMat.uniforms.tDiffuse.value = source;
    (blurMat.uniforms.uStep.value as THREE.Vector2).set(dx / target.width, dy / target.height);
    runQuad(blurMat, target);
  };

  return {
    resize(w, h) {
      disposeTargets();
      const opts = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        stencilBuffer: false,
      };
      const half = (n: number) => Math.max(1, Math.floor(n / 2));
      const quarter = (n: number) => Math.max(1, Math.floor(n / 4));
      rtBase = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
      rtHalfA = new THREE.WebGLRenderTarget(half(w), half(h), { ...opts, depthBuffer: false });
      rtHalfB = new THREE.WebGLRenderTarget(half(w), half(h), { ...opts, depthBuffer: false });
      rtQuarterA = new THREE.WebGLRenderTarget(quarter(w), quarter(h), { ...opts, depthBuffer: false });
      rtQuarterB = new THREE.WebGLRenderTarget(quarter(w), quarter(h), { ...opts, depthBuffer: false });
    },
    render(scene, camera, strength) {
      const base = rtBase;
      const hA = rtHalfA;
      const hB = rtHalfB;
      const qA = rtQuarterA;
      const qB = rtQuarterB;
      if (!base || !hA || !hB || !qA || !qB) {
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(base);
      renderer.clear();
      renderer.render(scene, camera);

      prefilterMat.uniforms.tDiffuse.value = base.texture;
      runQuad(prefilterMat, hA);
      blurPass(hA.texture, hB, 1, 0);
      blurPass(hB.texture, hA, 0, 1);
      blurPass(hA.texture, qA, 1, 0);
      blurPass(qA.texture, qB, 0, 1);

      const c = compositeMat.uniforms;
      c.tBase.value = base.texture;
      c.tNear.value = hA.texture;
      c.tWide.value = qB.texture;
      c.uBloom.value = strength;
      runQuad(compositeMat, null);
    },
    dispose() {
      disposeTargets();
      quadGeo.dispose();
      prefilterMat.dispose();
      blurMat.dispose();
      compositeMat.dispose();
    },
  };
}

/** Stüdyo uniform'ları — sahne rengine göre oda (koyu taban, renkli tavan, aksan şerit). */
export function studioUniforms(top: THREE.Color, bottom: THREE.Color, accent: THREE.Color) {
  return {
    uRoomTop: { value: top },
    uRoomBottom: { value: bottom },
    uKeyCol: { value: new THREE.Color(0xf2f5ff) },
    uAccent: { value: accent },
    uEdgeSoft: { value: 0.055 },
  };
}
