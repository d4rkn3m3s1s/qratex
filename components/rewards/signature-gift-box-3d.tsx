'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * İMZA GÜNLÜK SÜRPRİZ KUTUSU — platformun tanınır ödül nesnesi (gerçek 3D).
 *
 * TASARIM İLKELERİ (brief):
 *  • Baskın renk DERİN SAFİR MAVİ; pembe/menekşe YALNIZ yansıma ve açılış ışığında aksan.
 *  • Kurdele YOK — kapağın tam merkezinde kabartma METALİK AMBLEM "mühür" var.
 *  • Ayırt edici siluet: hafif konik gövde + ışıklı dikey kenar dikişleri + altta kaide halkası
 *    + kapakta yükseltilmiş madalyon. Küçük boyutta bile tanınır.
 *  • Sihirli/premium his: sedefli malzeme, içeride yıldız parçacıkları, yumuşak hacimsel ışık.
 *  • Siberpunk/mekanik/agresif neon YOK; ateş/duman/lazer YOK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEDEN BU SÜRÜM (ilk sürüm "düz mavi levha" gibi okunuyordu):
 *
 *  1) GEOMETRİ — RoundedBoxGeometry'nin her köşesinde üst üste binmiş üç köşe
 *     noktası vardır; üzerine yansıma bindirdiğinizde katlanmış kâğıt gibi kırılır.
 *     Yerine SÜPERELİPSOİD kullanıyoruz: bir küreyi |x|ⁿ+|y|ⁿ+|z|ⁿ=1 yüzeyine
 *     itiyoruz. Yüzey her yerde sürekli olduğu için kenarlarda kırılma yok.
 *
 *  2) MALZEME — MeshPhysicalMaterial + prosedürel PMREM, altı yüzü de neredeyse
 *     aynı değerde boyuyordu; kutuda "yüz" kalmıyordu. Yerine kendi lake safir
 *     gölgelendiricimiz var. İki kritik terim:
 *       • KESKİN KENARLI stüdyo panelleri (yumuşak gradyan değil) — gerçek ürün
 *         fotoğrafı bu yüzden net görünür: yansıyan şey sınırı belli bir paneldir.
 *       • KADEMELİ YÜZ AYIRMA — her yüz anahtar ışığa göre tek bir değer tutar ve
 *         kenarda sıçrar. Kenarı "kenar" yapan şey budur.
 *
 *  3) IŞIK — kendi kenarında biten ışık, ışık gibi görünmez. Sahne artık ara
 *     tampona çiziliyor, PARLAK BÖLGELER eşikle ayrılıyor, iki kademeli ayrılabilir
 *     gauss ile bulanıklaştırılıp toplamalı bindiriliyor (bloom). Kutunun gövdesi
 *     eşiğin altında kaldığı için PARLAMAZ; yalnız dikişler, amblem, mücevher ve
 *     parçacıklar taşar. Işık ışık gibi olur.
 *
 *  4) MÜCEVHER — sekizyüzlü + metalik malzeme yerine gerçek KESİM taşı: profil
 *     döndürülerek fasetlenir, üçgen başına tek normal (paylaşılan normal bir
 *     kesme taşı fıçıya benzetir) ve kırılma kanal başına ayrı indisle üç kez
 *     örneklenir — kenarlardaki renk saçılımı ("ateş") buradan gelir.
 *
 *  5) PATLAMA — CPU döngüsüyle sürülen dağınık noktalar yerine, ortak ışınlara
 *     dizilmiş ve yavaşlayarak aynı kabukta biriken noktalar. Konum tamamen
 *     vertex shader'da üretilir: kare başına CPU maliyeti sıfır.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * AMBLEM DEĞİŞTİRİLEBİLİR: `createEmblem()` tek başına duruyor. Gerçek logo geldiğinde
 * yalnız o fonksiyonun içi, logo dokusu uygulanmış bir düzleme çevrilir — kutu tasarımı aynı kalır.
 *
 * AÇILIŞ KORİDORU: kapak arkaya doğru açılır ve kamera merkezi BOŞ bırakır; ödül görseli
 * (kupon/puan/ikon) React katmanında tam o boşlukta belirir.
 */

/** Modal'ın faz makinesiyle birebir aynı isimler (surprise-box-modal.tsx). */
export type BoxPhase = 'idle' | 'shaking' | 'opening' | 'reveal' | 'done';

export interface SignatureGiftBox3DProps {
  phase: BoxPhase;
  /** Sahne KAPSAYICIYI doldurur (ResizeObserver ile). className ile boyutlandır. */
  className?: string;
}

// ── Palet: baskın safir, aksan pembe/menekşe ─────────────────────────
const SAPPHIRE = 0x123a86;      // gövde ana rengi (derin safir)
const ROOM_TOP = 0x1e4794;      // stüdyo tavanı (yansımada üst yarı)
const ROOM_BOTTOM = 0x040a1c;   // stüdyo zemini (yansımada alt yarı)
const SEAM_BLUE = 0x5aa2ff;     // ışıklı kenar dikişi
const INNER_GLOW = 0xbfe0ff;    // iç aydınlık (mavi-beyaz)
const KEY_LIGHT = 0xe6f0ff;     // anahtar panel (soğuk beyaz)
const ACCENT_PINK = 0xff8fd8;   // YALNIZ aksan (yansıma + açılış ışığı)
const EMBLEM_METAL = 0xdfe9ff;  // amblem metali (soğuk platin)

// ── Gövde ölçüleri (kadraj bu sayılara göre ÖLÇÜLDÜ — değiştirme) ────
const BODY_W = 2.0;
const BODY_H = 1.55;
const BODY_D = 2.0;
/** Süperelipsoid üssü: 2 küre, ~48 sert kutu. 28 = belirgin kenarlı mücevher kutusu. */
const BODY_EXP = 28;

/** Fazın "açılma ilerlemesi" (0=kapalı, 1=tam açık). */
function openTarget(phase: BoxPhase): number {
  if (phase === 'idle' || phase === 'shaking') return 0;
  if (phase === 'opening') return 0.55;
  return 1; // reveal | done
}

/** Fazın "amblem şarj" yoğunluğu (0=sakin, 1=tam parlak). */
function chargeTarget(phase: BoxPhase): number {
  if (phase === 'idle') return 0.18;
  if (phase === 'shaking') return 0.75;
  return 1;
}

/** Fazın bloom (ışık taşması) yoğunluğu — açılışta güçlenir. */
function bloomTarget(phase: BoxPhase): number {
  if (phase === 'idle') return 0.55;
  if (phase === 'shaking') return 0.8;
  if (phase === 'opening') return 1.05;
  return 1.25; // reveal | done
}

// ═════════════════════════════════════════════════════════════════════
//  GEOMETRİ ÜRETİCİLERİ
// ═════════════════════════════════════════════════════════════════════

/**
 * Süperelipsoid: kürenin her köşesi |x|ⁿ+|y|ⁿ+|z|ⁿ = 1 yüzeyine itilir.
 *
 * Küre indeksli olduğu için köşeler paylaşılır ve `computeVertexNormals`
 * bunların arasında ortalama alır — yuvarlatılmış kenarı pürüzsüz tutan şey bu.
 * Yüz merkezleri tam 1'e oturur, yani sınırlayıcı kutu tam olarak yarı ölçülerdir
 * (kadraj hesabı bu yüzden bozulmaz).
 *
 * @param taper üste doğru daralma oranı (mücevher kutusu silueti); 0 = prizmatik
 */
function buildSuperellipsoid(
  exponent: number,
  hw: number,
  hh: number,
  hd: number,
  taper: number,
  segW: number,
  segH: number
): THREE.BufferGeometry {
  // Yoğun: üssün sert ucunda bir yüzden diğerine dönüş birkaç derecede biter;
  // segment az olursa kenar gözle görülür şekilde basamaklanır.
  const geometry = new THREE.SphereGeometry(1, segW, segH);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const n = Math.max(2, exponent);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const denom =
      Math.pow(Math.abs(v.x), n) +
      Math.pow(Math.abs(v.y), n) +
      Math.pow(Math.abs(v.z), n);
    const r = Math.pow(denom, -1 / n);
    let x = v.x * r * hw;
    const y = v.y * r * hh;
    let z = v.z * r * hd;
    // Üste doğru daralma → mücevher kutusu silueti.
    if (taper > 0) {
      const k = 1 - taper * ((y + hh) / (2 * hh));
      x *= k;
      z *= k;
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Kesim taşı: profil `sides` faset üzerinde döndürülür.
 *
 * Her üçgen KENDİ üç köşesiyle yazılır ve normaller sonradan hesaplanır, böylece
 * her faset tek bir normal alır. Köşeleri paylaşmak normalleri ortalar ve kesme
 * taş yumuşak bir fıçı gibi gölgelenir.
 */
function buildFacetedGem(sides: number): THREE.BufferGeometry {
  // Taç → kuşak → pavyon → kulet: klasik parlak kesim.
  const profile: Array<[number, number]> = [
    [0.6, 0.62],
    [0.94, 0.34],
    [1.0, 0.12],
    [0.0, -1.05],
  ];
  const verts: number[] = [];
  const ringPoint = (radius: number, y: number, i: number) => {
    // Yarım adım kaydırma: az fasetli taş kameraya kenar değil YÜZ gösterir.
    const a = ((i % sides) + 0.5) * ((Math.PI * 2) / sides);
    return [Math.cos(a) * radius, y, Math.sin(a) * radius] as const;
  };
  const push = (p: readonly number[]) => { verts.push(p[0], p[1], p[2]); };

  for (let k = 0; k < profile.length - 1; k++) {
    const [rTop, yTop] = profile[k];
    const [rBot, yBot] = profile[k + 1];
    for (let i = 0; i < sides; i++) {
      const t0 = ringPoint(rTop, yTop, i);
      const t1 = ringPoint(rTop, yTop, i + 1);
      const b0 = ringPoint(rBot, yBot, i);
      const b1 = ringPoint(rBot, yBot, i + 1);
      if (rTop <= 1e-5) { push([0, yTop, 0]); push(b1); push(b0); }
      else if (rBot <= 1e-5) { push(t0); push(t1); push([0, yBot, 0]); }
      else { push(t0); push(t1); push(b1); push(t0); push(b1); push(b0); }
    }
  }
  // Tabla (üst kapak).
  const cap = profile[0];
  for (let i = 0; i < sides; i++) {
    push([0, cap[1], 0]);
    push(ringPoint(cap[0], cap[1], i));
    push(ringPoint(cap[0], cap[1], i + 1));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals(); // faset başına tek normal
  return g;
}

/**
 * Ortak ışınlara dizilmiş parçacık bulutu.
 *
 * Yönler Fibonacci küresinden gelir (kutuplarda kümelenme yok), sonra YUKARI
 * YANLI hale getirilir: ışık kutunun AĞZINDAN çıkar, her yöne saçılmaz.
 * Aynı ışın üzerindeki noktalar birbirinin biraz gerisinde başlar — bir grubu
 * gürültü değil ÇİZGİ olarak okutan şey o gecikmedir.
 */
function buildSparkCloud(rays: number, perRay: number): THREE.BufferGeometry {
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
    let dx = Math.cos(theta) * ring;
    let dy = Math.abs(y0) * 0.85 + 0.22; // yukarı yanlı
    let dz = Math.sin(theta) * ring;
    // Serpiştir, sonra yeniden normalle: kusursuz simetrik yelpaze imal edilmiş görünür.
    dx += (Math.random() - 0.5) * 0.12;
    dy += (Math.random() - 0.5) * 0.12;
    dz += (Math.random() - 0.5) * 0.12;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;

    const rayLife = 0.62 + Math.random() * 0.38;
    const phase = Math.random();
    for (let p = 0; p < perRay; p++) {
      dir[i * 3] = dx; dir[i * 3 + 1] = dy; dir[i * 3 + 2] = dz;
      offset[i] = phase + (p / perRay) * 0.2;
      seed[i] = rayLife;
      i++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  // `position` adıyla: three sınırlayıcı küreyi kurabilsin. Shader bunu YÖN olarak
  // okur ve gerçek konumu zamandan türetir.
  geometry.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offset, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return geometry;
}

// ═════════════════════════════════════════════════════════════════════
//  GÖLGELENDİRİCİLER
// ═════════════════════════════════════════════════════════════════════

const SURFACE_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vNormalL = normal;                                   // nesne uzayı: hangi YÜZ olduğunu bilmek için
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * Kutunun içinde durduğu stüdyo — gökyüzü değil, ÇEKİM SETİ.
 *
 * Kaynaklar yumuşak sönümlü lekeler değil, KESKİN KENARLI panellerdir. Gerçek bir
 * lake yüzeyin net fotoğraflanmasının bütün sebebi budur: yansıyan şey bir gradyan
 * değil, sınırı belli bir dikdörtgen ışıktır; her yüz ya paneli yakalar ya yakalamaz
 * ve ikisi arasındaki geçiş temiz bir çizgi olarak oturur. Yumuşak pow(dot,n) lobları
 * yüze bir rampa bırakır ve o rampa yumuşak plastik gibi okunur.
 *
 * NOT: bu şablon literalinin içinde ters tırnak KULLANILAMAZ (literali kapatır).
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

    /*
     * ÜST ANAHTAR PANEL — üç eksende de SINIRLI.
     *
     * Yalnız dir.y ile tanımlanan bir kaynak panel değil, üst YARIKÜREdir: yukarı
     * bakan her yüzey onu tam güçle yansıtır ve kapak beyaza patlar (ilk denemede
     * tam olarak bu oldu). x ve z'de de sınırlamak onu gerçek bir dikdörtgen
     * softbox yapar; yüzey panelin altından geçerken parlar, sonra söner.
     */
    float key = smoothstep(0.34 - uEdgeSoft, 0.34 + uEdgeSoft, dir.y)
              * (1.0 - smoothstep(0.66 - uEdgeSoft, 0.66 + uEdgeSoft, abs(dir.x)))
              * (1.0 - smoothstep(0.72 - uEdgeSoft, 0.72 + uEdgeSoft, abs(dir.z)));
    col += uKeyCol * key * 0.62;

    /*
     * SOL ALT PEMBE ŞERİT — brief: pembe YALNIZ aksan.
     *
     * Her iki uçtan da kapatılır (x'te de y'de de), yoksa "dir.x < eşik" bir yarı
     * uzaydır ve kutunun bütün sol yüzünü pembeye boyar. Şerit hâlinde kaldığında
     * yalnız siluetin sol kenarında bir renk bırakır — istenen de bu.
     */
    float strip = smoothstep(-0.42 - uEdgeSoft, -0.42 + uEdgeSoft, dir.y)
                * (1.0 - smoothstep(-0.12 - uEdgeSoft, -0.12 + uEdgeSoft, dir.y))
                * smoothstep(-0.92 - uEdgeSoft * 3.0, -0.92 + uEdgeSoft * 3.0, dir.x)
                * (1.0 - smoothstep(-0.34 - uEdgeSoft * 3.0, -0.34 + uEdgeSoft * 3.0, dir.x));
    col += uAccent * strip * 0.45;

    // Ufuk çizgisi: üzerinden geçen bir yüz kısa bir parlama yakalar.
    col += uKeyCol * exp(-pow(dir.y / 0.045, 2.0)) * 0.16;
    return col;
  }
`;

/** Gövde/kapak: lake derin safir. Opak — cam değil, cilalı mücevher kutusu. */
const BODY_FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uSeam;
  uniform vec3 uInner;
  uniform float uEdge;
  uniform float uGloss;
  uniform float uDispersion;
  uniform float uRimGlow;
  uniform float uOpen;
  uniform float uMouthAt;
  uniform float uSeamGlow;

  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;

  ${STUDIO_GLSL}

  // Lambalar GÖRÜŞ uzayında: kutu dönerken parıltılar yerinde durur. Modele bağlı
  // bir ışık modelle döner ve yüzey boyanmış gibi okunur.
  const vec3 KEY = vec3(0.42, 0.78, 0.46);
  const vec3 FILL = vec3(-0.66, -0.20, 0.72);

  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(vViewV);
    vec3 kdir = normalize(KEY);
    vec3 fdir = normalize(FILL);

    float ndv = max(dot(n, v), 0.0);
    // Schlick; üs 5'te sabit, panel terimi ÖLÇEKLER (üssü oynatmak iki adımda
    // "kenar yok"tan "yalnız kenar"a geçer).
    float fres = pow(1.0 - ndv, 5.0);
    float rim = clamp(fres * uEdge, 0.0, 1.0);

    // Yansıma kanal başına AYRIŞIR ve ayrışma yalnız sıyırma açılarında güçlenir
    // → siluet boyunca sedef kenar. Brief'teki "sedefli" his buradan gelir.
    vec3 rd = reflect(-v, n);
    float sp = uDispersion * fres;
    vec3 refl = vec3(
      studio(normalize(rd + n * sp)).r,
      studio(rd).g,
      studio(normalize(rd - n * sp)).b
    );

    vec3 body = uTint * (0.26 + 0.44 * max(dot(n, kdir), 0.0));

    /*
     * KADEMELİ YÜZ AYIRMA — bu satır olmadan kutu tek parça bir levhadır.
     * Altı yüz de ortamı neredeyse aynı miktarda büktüğü için aynı değerde çıkar.
     * Terim yumuşak değil basamaklıdır: bir yüz bütün genişliği boyunca tek değeri
     * tutar ve kenarda sıçrar — kenarı kenar yapan şey budur.
     */
    float face = smoothstep(-0.35, 0.9, dot(n, kdir));
    body *= 0.66 + face * 0.64;

    // Taban yansıtıcılık düşük tutulur: yüksek bir taban değeri safiri yıkayıp
    // kutuyu gri-mavi bir cisme çevirir. Renk gövdeden gelsin, parlaklık kenardan.
    vec3 col = mix(body, refl, 0.10 + rim * 0.72);

    /*
     * Parlaklık iki lobdan gelir: iğne ucu bir vurgu ve altında geniş bir sedef.
     * Normal yerine YARIM VEKTÖRden alınır, böylece kutu dönerken vurgu yüzey
     * üzerinde kayar; tek noktada dursa boyanmış gibi okunur.
     */
    vec3 hKey = normalize(kdir + v);
    vec3 hFill = normalize(fdir + v);
    float spec =
        pow(max(dot(n, hKey), 0.0), uGloss) * 1.25
      + pow(max(dot(n, hFill), 0.0), uGloss * 0.3) * 0.34
      + pow(max(dot(n, hKey), 0.0), 6.0) * 0.07;
    col += uKeyCol * spec;

    // Siluet boyunca soğuk mavi ince ışık — kutunun imza kenarı.
    col += uSeam * pow(fres, 1.35) * uRimGlow;

    /*
     * DİKEY KÖŞE DİKİŞİ — siluetin imzası.
     *
     * Eskiden bunlar dört kapsül mesh'iydi ve HİÇBİRİ görünmüyordu: yarı genişliği
     * 1.0 olan gövdenin içinde, 0.87'de duruyorlardı. Işığı geometriye değil
     * yüzeye koymak hem daralmayı kusursuz takip eder hem de z-çakışması olmaz.
     * Köşe = her İKİ yatay eksende de uçta olmak, yani min(|x|,|z|) büyük.
     */
    float corner = smoothstep(0.885, 0.975, min(abs(vLocal.x), abs(vLocal.z)));
    col += uSeam * corner * uSeamGlow;

    /*
     * AĞIZ IŞIĞI — kapak kalkınca gövdenin ÜST YÜZÜ içeriden aydınlanır.
     *
     * Gövde kapalı bir katı; içine bir oyuk açmak siluetin tamamını yeniden
     * ölçmeyi gerektirirdi. Bunun yerine ışığı yüzeyin kendisine koyuyoruz.
     * İKİ kapı birden: yalnız yeterince YUKARIDA (vLocal.y) VE yüzeyi YUKARI BAKAN
     * (vNormalL.y) noktalar. Tek başına yükseklik kapısı yan duvarların üst
     * kısmını da yakalıyor ve kutunun çevresine beyaz bir bant çiziyordu.
     * Kapakta vLocal.y en fazla 0.17 olduğu için terim orada daima sıfırdır.
     */
    float upFace = smoothstep(0.70, 0.96, vNormalL.y);
    // Merkezde havuzlanıp kenara doğru söner. Yarıçap sönümü olmadan üst yüzün
    // TAMAMI tek değerde beyaza patlıyor ve kutu beyaza boyanmış gibi duruyordu.
    float radial = 1.0 - smoothstep(0.22, 0.98, max(abs(vLocal.x), abs(vLocal.z)));
    float mouth = upFace * smoothstep(uMouthAt * 0.55, uMouthAt * 0.92, vLocal.y) * radial;
    col += uInner * mouth * uOpen * 0.8;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Işık huzmesi — hacimsel, silindir DEĞİL.
 *
 * Sabit saydamlıkta bir silindir, siluetinin kenarında keskin biter ve ışık değil
 * duran bir cam boru gibi okunur. Işık yoğunluğu ışının kat ettiği HACİMLE orantılı
 * olmalı: bu da yüzey normali bakışa dik olduğunda (kenar) en az, bakışa paralel
 * olduğunda (orta) en çok demektir. Yükseklikle de sönümlenir; kaynak alttadır.
 */
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;

  varying vec3 vNormalV;
  varying vec3 vNormalL;
  varying vec3 vViewV;
  varying vec3 vLocal;

  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(vViewV);
    float thickness = pow(abs(dot(n, v)), 0.85);   // kenarda ince, ortada kalın
    float h = clamp(vLocal.y * 0.72 + 0.5, 0.0, 1.0);
    float a = thickness * (1.0 - h * 0.9) * uIntensity;
    if (a <= 0.001) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/**
 * Amblem metali: aynı stüdyoyu yansıtan soğuk platin.
 *
 * ÖNEMLİ: three'nin PBR metali ORTAM HARİTASI olmadan neredeyse siyahtır —
 * metalin dağınık bileşeni yoktur, gördüğü tek şey yansımadır. Sahnede HDR/PMREM
 * bulunmadığı için metali de aynı prosedürel stüdyoyla gölgelendiriyoruz: hem
 * amblem kararmıyor, hem de kutuyla BİREBİR aynı ışığı yansıtıyor (pembe şerit
 * amblemin kenarında da beliriyor — brief'teki aksan tutarlılığı).
 */
const METAL_FRAGMENT = /* glsl */ `
  uniform vec3 uMetal;
  uniform float uRough;

  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying vec3 vLocal;

  ${STUDIO_GLSL}

  void main() {
    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vViewV);

    // Pürüzlülük: yansıma vektörünü normale doğru çekmek geniş ve yumuşak bir
    // yansıma verir — ayrı bir bulanıklaştırma geçişi olmadan fırçalanmış metal.
    vec3 r = normalize(mix(reflect(-v, n), n, uRough));
    vec3 col = studio(r) * uMetal;

    float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
    col += uKeyCol * fres * 0.32;

    vec3 h = normalize(normalize(vec3(0.42, 0.78, 0.46)) + v);
    col += uKeyCol * pow(max(dot(n, h), 0.0), 90.0) * 0.85;
    col *= 0.60;   // madalyon beyaza patlamasın; mücevher üstünde okunur kalsın

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Kesim taşı: kanal başına ayrı kırılma indisi → kenarlarda renk saçılımı. */
const GEM_FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uFire;
  uniform float uIndex;
  uniform float uDispersion;
  uniform float uSpecular;
  uniform float uCharge;

  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying vec3 vLocal;

  ${STUDIO_GLSL}

  void main() {
    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vViewV);

    float facing = max(dot(n, v), 0.0);
    float fres = pow(1.0 - facing, 5.0);

    // Üç indis, üç ışın, üç örnek. Dağılım budur — tek ortak indisle taş,
    // vurgular ne kadar parlak olursa olsun boyalı plastik gibi görünür.
    vec3 rd = -v;
    vec3 rr = refract(rd, n, 1.0 / max(1.02, uIndex - uDispersion));
    vec3 rg = refract(rd, n, 1.0 / max(1.02, uIndex));
    vec3 rb = refract(rd, n, 1.0 / max(1.02, uIndex + uDispersion));
    vec3 through = vec3(studio(rr).r, studio(rg).g, studio(rb).b);
    vec3 refl = studio(reflect(rd, n));

    // Taşın geçirdiği ışık gövde rengiyle boyanır; yansıttığı ışık boyanmaz —
    // yüzeyden seken ışın taşın içine hiç girmemiştir.
    vec3 col = through * uTint * 1.5;
    col = mix(col, refl, 0.25 + fres * 0.6);

    // "Ateş": tayf en çok sıyırma açısında ayrışır, aynı fresnel terimiyle ölçekle.
    col += uFire * fres * (0.22 + uCharge * 0.55);

    vec3 hKey = normalize(normalize(vec3(-0.35, 0.8, 0.5)) + v);
    float spec = pow(max(dot(n, hKey), 0.0), uSpecular) * 1.8
               + pow(max(dot(n, hKey), 0.0), uSpecular * 4.0) * 1.1;
    col += uKeyCol * spec;
    col *= 0.95 + uCharge * 1.35;

    float a = clamp(0.34 + fres * 0.7 + spec, 0.0, 1.0);
    // Ön çarpımlı + toplamalı harman: uzak fasetler yakınların ARDINDAN görünür,
    // berrak bir taşın yaptığı da tam budur.
    gl_FragColor = vec4(col * a, a);
  }
`;

const SPARK_VERTEX = /* glsl */ `
  attribute float aOffset;
  attribute float aSeed;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uRadius;
  uniform float uSize;
  uniform float uRim;
  uniform float uPixelRatio;

  varying float vLife;
  varying float vBright;

  void main() {
    // Her iz kendi saatini işletir; bulut hiçbir zaman tek ağızdan atmaz.
    float t = fract(aOffset + uTime * uSpeed * (0.65 + aSeed * 0.7));

    /*
     * Işınlar YAVAŞLAR: 1-(1-t)³ mesafenin çoğunu erken alır sonra sürünür,
     * böylece noktalar bitiş yerinde birikir. O birikme kabuğu çizer; uRim ise
     * ışın boylarını birbirine yaklaştırıp hepsini aynı kabukta buluşturur.
     */
    float life = mix(aSeed, 1.0, uRim);
    float r = uRadius * life * (1.0 - pow(1.0 - t, 3.0));

    vec4 mv = modelViewMatrix * vec4(position * r, 1.0);
    gl_Position = projectionMatrix * mv;

    float shrink = 1.0 - t * 0.45;
    gl_PointSize = uSize * shrink * uPixelRatio * (10.0 / max(0.001, -mv.z));

    float birth = smoothstep(0.0, 0.05, t);
    // Kabuğa kadar tutulup kesilir: kenarın solma değil ÇİZGİ olmasını sağlar.
    float death = 1.0 - smoothstep(0.80, 1.0, t);
    float flick = 0.5 + 0.5 * sin(uTime * 9.0 + aSeed * 43.0 + aOffset * 61.0);
    vBright = birth * death * flick;
    vLife = t;
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uGate;

  varying float vLife;
  varying float vBright;

  void main() {
    if (uGate <= 0.002) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float fall = 1.0 - d;

    // Sıkı bir uç + çevresinde gevşek bir hale: uç kıvılcım, gevşek terim komşu
    // noktaları ayrı benekler değil tek bir pus olarak okutan şey.
    float shape = pow(fall, 5.0) + pow(fall, 1.6) * 0.3;

    // Işık çekirdekten beyaz çıkar, yol aldıkça rengini alır.
    vec3 col = mix(uHot, uColor, smoothstep(0.0, 0.55, vLife));
    float a = shape * vBright * uGate;
    gl_FragColor = vec4(col * a, a);
  }
`;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0); // zaten kırpma uzayında
  }
`;

/**
 * PARLAK GEÇİŞ — bloom'a yalnız ışığı sokar.
 *
 * Eşik olmadan kutunun bütün gövdesi de bulanıklaşır ve sahne mavi bir pusa döner.
 * Eşikle: gövde altta kalır, dikişler/amblem/mücevher/parçacıklar taşar.
 */
const PREFILTER_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float lum = max(max(c.r, c.g), c.b);
    // Yumuşak diz: eşiğin hemen altındaki değerler sıfıra düşmez, kademelenir —
    // sert eşik parlayan bir nesnenin kenarında görünür bir basamak bırakır.
    float soft = clamp((lum - uThreshold + uKnee) / max(2.0 * uKnee, 1e-4), 0.0, 1.0);
    float contrib = max(lum - uThreshold, lum * soft * soft * 0.5);
    float w = lum > 1e-5 ? contrib / lum : 0.0;
    gl_FragColor = vec4(c.rgb * w, c.a * w);
  }
`;

/**
 * Ayrılabilir gauss'un tek ekseni: doğrusal örneklenmiş beş dokunuş.
 *
 * İki geçiş on örnek eder; eşdeğer 2B çekirdek seksen bir eder ve sonuç aynıdır.
 */
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

/**
 * Bindirme + ton eşleme + sRGB.
 *
 * Bütün zincir DOĞRUSAL uzayda ve ÖN ÇARPIMLI çalışır (bulanıklaştırma doğrusal
 * uzayda yapılmalıdır, yoksa parlak kenarlar kirlenir). Renk kodlaması yalnız
 * burada, en sonda yapılır — ve ön çarpım geçici olarak çözülür, çünkü ön çarpımlı
 * bir rengi doğrudan gama kodlamak yumuşak kenarları olduğundan parlak gösterir.
 */
const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tBase;
  uniform sampler2D tNear;
  uniform sampler2D tWide;
  uniform float uBloom;
  varying vec2 vUv;

  // Narkowicz'in ACES yaklaşımı — vurguları beyaza kırpmadan sıkıştırır.
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
    // İki yarıçap: yakın olan her kıvılcımın hemen çevresindeki hale, geniş olan
    // bütün sahneye yayılan parıltı. Tek yarıçap ya biri olur ya öteki, ikisi olmaz.
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

// ═════════════════════════════════════════════════════════════════════
//  BİLEŞEN
// ═════════════════════════════════════════════════════════════════════

export default function SignatureGiftBox3D({ phase, className }: SignatureGiftBox3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Faz ref'te tutulur: animasyon döngüsü render'a bağlı kalmadan güncel değeri okur.
  const phaseRef = useRef<BoxPhase>(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    // Erişilebilirlik: hareket azaltma açıksa 3B sahne hiç kurulmaz (React katmanı statik gösterir).
    if (document.documentElement.classList.contains('reduce-animations')) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return; // WebGL yok → sessizce vazgeç
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.margin = '0 auto';
    // Ton eşleme sahnede DEĞİL, bindirme geçişinde yapılır: bloom doğrusal HDR
    // veride toplanmalı, sıkıştırılmış veride değil.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // KADRAJ HESABI: yukseklik acisi ~25deg -> kutunun UST YUZU ve amblem gorunur
    // (11.5deg'de kutu duz dikdortgen gibi okunuyordu). Mesafe 7.3 -> gorunur yukseklik
    // ~4.45 birim; acilan kapak (max y~2.3) ve kaide (y~-1.0) rahatca sigar.
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 3.2, 6.6);
    camera.lookAt(0, 0.15, 0);

    const disposables: Array<{ dispose: () => void }> = [];

    // ── ORTAK STÜDYO UNIFORM'LARI (gövde ve taş aynı odayı görür) ──────
    const studioUniforms = () => ({
      uRoomTop: { value: new THREE.Color(ROOM_TOP) },
      uRoomBottom: { value: new THREE.Color(ROOM_BOTTOM) },
      uKeyCol: { value: new THREE.Color(KEY_LIGHT) },
      uAccent: { value: new THREE.Color(ACCENT_PINK) },
      uEdgeSoft: { value: 0.055 },
    });

    // ── MALZEMELER ─────────────────────────────────────────────────────
    const bodyMat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: BODY_FRAGMENT,
      uniforms: {
        ...studioUniforms(),
        uTint: { value: new THREE.Color(SAPPHIRE) },
        uSeam: { value: new THREE.Color(SEAM_BLUE) },
        uInner: { value: new THREE.Color(INNER_GLOW) },
        uEdge: { value: 1.5 },
        uGloss: { value: 320 },
        uDispersion: { value: 0.06 },
        uRimGlow: { value: 0.35 },
        uSeamGlow: { value: 0.5 },
        uOpen: { value: 0 },
        // Ağız eşiği gövdenin yerel yarı yüksekliği; kapak bu değere hiç ulaşmaz.
        uMouthAt: { value: BODY_H / 2 },
      },
      side: THREE.FrontSide,
    });

    /** Işıklı kenar dikişi + kaide — emissive, bloom eşiğini AŞAR (bilerek). */
    const seamMat = new THREE.MeshBasicMaterial({ color: SEAM_BLUE, toneMapped: false });

    const emblemMat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: METAL_FRAGMENT,
      uniforms: {
        ...studioUniforms(),
        uMetal: { value: new THREE.Color(EMBLEM_METAL) },
        uRough: { value: 0.22 },
      },
      side: THREE.FrontSide,
    });

    const emblemGlowMat = new THREE.MeshBasicMaterial({
      color: INNER_GLOW, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });

    /** Mühür ışınları — ışık yayan küçük çentikler (bloom eşiğini aşar). */
    const rayMat = new THREE.MeshBasicMaterial({ color: INNER_GLOW, toneMapped: false });

    disposables.push(bodyMat, seamMat, emblemMat, emblemGlowMat, rayMat);

    // IŞIK NESNESİ YOK: her yüzey stüdyoyu kendi gölgelendiricisinde örnekliyor.
    // three'nin ışıkları yalnız yerleşik malzemeleri etkiler ve artık hiçbiri yok.

    // ── KÖK GRUP (yüzdürme + hafif salınım burada) ─────────────────────
    const root = new THREE.Group();
    scene.add(root);

    // ── GÖVDE: süperelipsoid, üste doğru hafif daralan ─────────────────
    const bodyGeo = buildSuperellipsoid(
      BODY_EXP, BODY_W / 2, BODY_H / 2, BODY_D / 2, 0.055, 160, 120
    );
    disposables.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.12;
    root.add(body);

    // NOT: burada eskiden bir "iç boşluk" kutusu vardı. Gövde KAPALI ve opak bir
    // katı olduğu için (0.86× ölçekli kutu tamamen içinde kalıyor) o mesh hiçbir
    // karede görünmüyordu — kaldırıldı. İçerideki ışık hissi artık gövde
    // gölgelendiricisindeki "ağız ışığı" terimiyle veriliyor.

    // IŞIKLI DİKEY KENAR DİKİŞLERİ artık MESH DEĞİL: gövde gölgelendiricisindeki
    // "köşe" terimi çiziyor. Buradaki dört kapsül, gövdenin yarı genişliği 1.0
    // iken 0.87'de durdukları için hiçbir karede görünmüyordu.

    // ── KAİDE HALKASI (altta yumuşak ışık) ─────────────────────────────
    const plinthGeo = new THREE.TorusGeometry(BODY_W * 0.56, 0.024, 10, 64);
    disposables.push(plinthGeo);
    const plinth = new THREE.Mesh(plinthGeo, seamMat);
    plinth.rotation.x = Math.PI / 2;
    plinth.position.y = -0.92;
    root.add(plinth);

    // ── KAPAK (ayrı grup: açılırken kaldırılır + arkaya yatırılır) ─────
    const lid = new THREE.Group();
    lid.position.set(0, BODY_H / 2 - 0.12, 0);
    root.add(lid);

    const lidGeo = buildSuperellipsoid(
      BODY_EXP, (BODY_W * 1.02) / 2, 0.17, (BODY_D * 1.02) / 2, 0, 128, 96
    );
    disposables.push(lidGeo);
    const lidMesh = new THREE.Mesh(lidGeo, bodyMat);
    lidMesh.position.y = 0.17;
    lid.add(lidMesh);

    // NOT: kapak kenarındaki ışık şeridi de mesh DEĞİL — kapak aynı gövde
    // malzemesini kullandığı için köşe/kenar terimleri onu da çiziyor. Eskiden
    // buradaki simit, kapak katısının içinde kaldığı için görünmüyordu.

    // ── AMBLEM (MÜHÜR) — kapak merkezinde, kabartma ────────────────────
    /**
     * ⚠️ LOGO DEĞİŞTİRME NOKTASI:
     * Gerçek logo geldiğinde bu fonksiyonun İÇİ değiştirilir — örn. logo PNG'sini
     * `THREE.TextureLoader` ile yükleyip 0.9 yarıçaplı bir düzleme (alphaMap) uygulamak
     * yeterlidir. Dış çerçeve/halka ve ışıma korunursa kutu kimliği aynı kalır.
     */
    function createEmblem(): THREE.Group {
      const g = new THREE.Group();

      // Dış halka (mühür çerçevesi)
      const ringGeo = new THREE.TorusGeometry(0.52, 0.06, 12, 64);
      disposables.push(ringGeo);
      g.add(new THREE.Mesh(ringGeo, emblemMat));

      // Taban madalyon (logo buraya oturur)
      const discGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.06, 48);
      disposables.push(discGeo);
      const disc = new THREE.Mesh(discGeo, emblemMat);
      disc.rotation.x = Math.PI / 2;
      g.add(disc);

      // Merkez MÜCEVHER — gerçek kesim taşı (fasetli + renk saçılımlı)
      const gemGeo = buildFacetedGem(10);
      disposables.push(gemGeo);
      const gemMat = new THREE.ShaderMaterial({
        vertexShader: SURFACE_VERTEX,
        fragmentShader: GEM_FRAGMENT,
        uniforms: {
          ...studioUniforms(),
          uTint: { value: new THREE.Color(0xa8d0ff) },
          uFire: { value: new THREE.Color(ACCENT_PINK) },
          uIndex: { value: 1.42 },
          uDispersion: { value: 0.055 },
          uSpecular: { value: 900 },
          uCharge: { value: 0.2 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      disposables.push(gemMat);
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.scale.setScalar(0.26);
      gem.name = 'gem';
      /*
       * Taş DİK durmalı. Amblem grubu kapağın üstüne yatırıldığı için (rotation.x
       * = -π/2), grubun yerel +Z'si dünyada YUKARI'ya bakar. Taşın uzun ekseni
       * kendi Y'si olduğundan, onu bir eksende düzelten bir pivot'a koyuyoruz;
       * yoksa taş madalyonun üzerine yan yatıyor ve dönerken ince bir çizgiye
       * dönüşüyor (ilk denemede görülen kırmızı çizgi artefaktı buydu).
       * Dönüş artık yalnız taşın KENDİ dikey ekseninde — mühürdeki oturan mücevher.
       */
      const gemPivot = new THREE.Group();
      gemPivot.rotation.x = Math.PI / 2;   // taşın +Y ekseni dünyada YUKARI bakmalı
      gemPivot.position.z = 0.20;          // kulet madalyonun içine gömülü kalsın (havada durmasın)
      gemPivot.add(gem);
      g.add(gemPivot);

      // Çevresel ışınlar (mühür ışıkları) — metal değil IŞIK: metalden yapılınca
      // koyu odayı yansıtıp dağınık çentikler gibi okunuyorlardı.
      const rayGeo = new THREE.BoxGeometry(0.035, 0.13, 0.02);
      disposables.push(rayGeo);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ray = new THREE.Mesh(rayGeo, rayMat);
        ray.position.set(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.03);
        ray.rotation.z = a - Math.PI / 2;
        g.add(ray);
      }

      // Arkadan ışıma halesi — şarj oldukça parlar
      const haloGeo = new THREE.CircleGeometry(0.95, 48);
      disposables.push(haloGeo);
      const halo = new THREE.Mesh(haloGeo, emblemGlowMat);
      halo.position.z = -0.05;
      halo.name = 'halo';
      g.add(halo);

      return g;
    }

    const emblem = createEmblem();
    emblem.rotation.x = -Math.PI / 2;   // kapağın üstüne yatır
    emblem.position.set(0, 0.36, 0);    // yüzeyden hafif kabarık
    emblem.scale.setScalar(0.92);
    lid.add(emblem);
    const emblemGem = emblem.getObjectByName('gem') as THREE.Mesh | undefined;
    const emblemHalo = emblem.getObjectByName('halo') as THREE.Mesh | undefined;

    // ── PARÇACIKLAR ────────────────────────────────────────────────────
    /** (a) Kutunun çevresinde yavaş yükselen yıldız tozu (CPU, 90 nokta — ucuz). */
    const dustCount = 90;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.05 + Math.random() * 0.3;
      dustPos[i * 3] = Math.cos(a) * r;
      dustPos[i * 3 + 1] = -0.85 + Math.random() * 1.7;
      dustPos[i * 3 + 2] = Math.sin(a) * r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xcfe6ff, size: 0.032, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    disposables.push(dustGeo, dustMat);
    root.add(new THREE.Points(dustGeo, dustMat));

    /** (b) Işın kıvılcımları — amblemden sızar, açılışta kabuk hâlinde patlar (GPU). */
    const sparkGeo = buildSparkCloud(220, 5);
    disposables.push(sparkGeo);
    const sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.55 },
        uRadius: { value: 0.45 },
        uSize: { value: 3.2 },
        uRim: { value: 0.75 },
        uPixelRatio: { value: dpr },
        uColor: { value: new THREE.Color(INNER_GLOW) },
        uHot: { value: new THREE.Color(0xffffff) },
        uGate: { value: 0.2 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // Derinlik testi AÇIK: kutunun ARKASINDAKİ kıvılcımlar gizlensin. Kapalıyken
      // gövdenin önüne düşen noktalar ışığın kutudan çıktığı hissini bozuyordu.
      depthTest: true,
    });
    disposables.push(sparkMat);
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    // Shader her şeyi hareket ettirdiği için three'nin kırpma hesabı noktaların
    // gerçekte nerede olduğunu bilemez.
    sparks.frustumCulled = false;
    sparks.position.y = 0.35;
    root.add(sparks);

    /** (c) Işık sütunu — kapak açılınca içeriden yükselen yumuşak hacimsel huzme. */
    // Altta dar, üstte geniş: ışık kutunun ağzından çıkıp yayılır.
    const beamGeo = new THREE.CylinderGeometry(0.86, 0.22, 1.4, 44, 1, true);
    disposables.push(beamGeo);
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Color(INNER_GLOW) },
        uIntensity: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposables.push(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 1.05; // taban ~0.35 (kutunun ağzı), tepe ~1.75
    root.add(beam);

    // ═══════════════════════════════════════════════════════════════════
    //  SONRA-İŞLEME ZİNCİRİ (parlak geçiş → iki kademeli gauss → bindirme)
    // ═══════════════════════════════════════════════════════════════════
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
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.72 },
        uKnee: { value: 0.35 },
      },
      depthTest: false, depthWrite: false,
    });
    const blurMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });
    const compositeMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: {
        tBase: { value: null }, tNear: { value: null }, tWide: { value: null },
        uBloom: { value: 0.55 },
      },
      depthTest: false, depthWrite: false,
      transparent: true,
      // Zincirin tamamı ön çarpımlı, dolayısıyla tuval çizimi ön çarpımlı renk
      // üzerinde düz bir src-over'dır.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    disposables.push(quadGeo, prefilterMat, blurMat, compositeMat);
    const quad = new THREE.Mesh(quadGeo, blurMat);
    quad.frustumCulled = false;
    quadScene.add(quad);

    const disposeTargets = () => {
      for (const rt of [rtBase, rtHalfA, rtHalfB, rtQuarterA, rtQuarterB]) rt?.dispose();
      rtBase = rtHalfA = rtHalfB = rtQuarterA = rtQuarterB = null;
    };

    const makeTargets = (w: number, h: number) => {
      disposeTargets();
      // Yarım kayan nokta: bloom çok sayıda parlak örneği toplar; 8 bitlik tampon
      // onları bulanıklaştırma daha görmeden beyaza kırpar. (three 0.163+ yalnız
      // WebGL2 destekliyor, dolayısıyla HalfFloat her zaman kullanılabilir.)
      const opts = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        stencilBuffer: false,
      };
      const half = (n: number) => Math.max(1, Math.floor(n / 2));
      const quarter = (n: number) => Math.max(1, Math.floor(n / 4));
      // Yalnız taban tamponun derinliğe ihtiyacı var (sahne orada çiziliyor).
      rtBase = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
      // Yarım ve çeyrek çözünürlükte bulanıklaştırmak bunun ucuz olmasının başlıca
      // sebebi ve görünür bir bedeli yok — çıktı zaten geniş bir gauss.
      rtHalfA = new THREE.WebGLRenderTarget(half(w), half(h), { ...opts, depthBuffer: false });
      rtHalfB = new THREE.WebGLRenderTarget(half(w), half(h), { ...opts, depthBuffer: false });
      rtQuarterA = new THREE.WebGLRenderTarget(quarter(w), quarter(h), { ...opts, depthBuffer: false });
      rtQuarterB = new THREE.WebGLRenderTarget(quarter(w), quarter(h), { ...opts, depthBuffer: false });
    };

    const runQuad = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
      quad.material = mat;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(quadScene, quadCamera);
    };

    const blurPass = (
      source: THREE.Texture, target: THREE.WebGLRenderTarget, dx: number, dy: number
    ) => {
      blurMat.uniforms.tDiffuse.value = source;
      blurMat.uniforms.uStep.value.set(dx / target.width, dy / target.height);
      runQuad(blurMat, target);
    };

    const resize = () => {
      const s = Math.max(1, Math.min(mount.clientWidth || 1, mount.clientHeight || 1));
      renderer.setSize(s, s);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      const px = Math.max(1, Math.floor(s * dpr));
      makeTargets(px, px);
    };
    resize();

    // ── ANİMASYON DÖNGÜSÜ ──────────────────────────────────────────────
    let raf = 0;
    let running = true;
    const clock = new THREE.Clock();
    let openAmt = 0;      // yumuşatılmış açılma (0→1)
    let charge = 0.18;    // yumuşatılmış amblem şarjı
    let bloomAmt = 0.55;  // yumuşatılmış bloom yoğunluğu
    let burstT = -1;      // patlama zamanlayıcısı (reveal'de tetiklenir)
    let lastPhase: BoxPhase = phaseRef.current;

    const tick = () => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const ph = phaseRef.current;

      // Faz geçişinde patlamayı bir kez tetikle
      if (ph !== lastPhase) {
        if ((ph === 'reveal' || ph === 'done') && burstT < 0) burstT = 0;
        lastPhase = ph;
      }

      // Hedeflere yumuşak yaklaşma (ani sıçrama yok — "premium" his)
      openAmt += (openTarget(ph) - openAmt) * Math.min(1, dt * 3.2);
      charge += (chargeTarget(ph) - charge) * Math.min(1, dt * 4.5);
      bloomAmt += (bloomTarget(ph) - bloomAmt) * Math.min(1, dt * 3);

      // Kök: yumuşak yüzdürme + çok yavaş dönüş (nesneyi "canlı" tutar)
      root.position.y = Math.sin(t * 0.9) * 0.05;
      root.rotation.y = Math.sin(t * 0.25) * 0.16 + (ph === 'idle' ? t * 0.06 : 0);

      // Titreme: yalnız 'shaking' fazında, ince ve kontrollü
      if (ph === 'shaking') {
        const s = Math.sin(t * 42) * 0.022;
        root.position.x = s;
        root.rotation.z = s * 0.35;
      } else {
        root.position.x += (0 - root.position.x) * Math.min(1, dt * 8);
        root.rotation.z += (0 - root.rotation.z) * Math.min(1, dt * 8);
      }

      // Kapak: yukarı kalk + arkaya yatır → merkez ÖDÜL için boş kalır
      // Kapak KADRAJDA kalmali: 1.5 birim yukselince ust kenardan tasiyordu.
      lid.position.y = (BODY_H / 2 - 0.12) + openAmt * 0.8;
      lid.rotation.x = -openAmt * 0.5;
      lid.position.z = -openAmt * 0.3;

      // Amblem: şarj oldukça parlar + mücevher döner
      if (emblemGem) {
        (emblemGem.material as THREE.ShaderMaterial).uniforms.uCharge.value =
          0.18 + charge * 1.05;
        // Yalnız kendi dikey ekseninde döner (pivot onu dik tutuyor).
        emblemGem.rotation.y = t * 0.9;
      }
      // Mühür ışınları şarjla parlar
      rayMat.color.setHex(INNER_GLOW).multiplyScalar(0.5 + charge * 1.4);
      if (emblemHalo) {
        emblemGlowMat.opacity = 0.1 + charge * 0.42 + Math.sin(t * 2.4) * 0.05 * charge;
        emblemHalo.scale.setScalar(1 + charge * 0.28 + Math.sin(t * 2.2) * 0.03);
      }
      emblem.visible = true; // mühür kapak ustunde kalir (kimlik)

      // Kenar dikişleri + kaide: şarjla nabız. Değer 1'i AŞAR — bloom eşiğinin
      // üstünde kalsınlar ki dikişler ışık gibi taşsın.
      const seamPulse = 1.15 + charge * 1.5 + Math.sin(t * 3.1) * 0.12;
      seamMat.color.setHex(SEAM_BLUE).multiplyScalar(seamPulse);

      // Gövde kenar ışıması + köşe dikişi + ağız ışığı: kapak açılırken güçlenir
      bodyMat.uniforms.uRimGlow.value = 0.10 + charge * 0.16 + openAmt * 0.14;
      bodyMat.uniforms.uSeamGlow.value =
        0.22 + charge * 0.5 + Math.sin(t * 3.1) * 0.05 * charge;
      bodyMat.uniforms.uOpen.value = openAmt;

      // Işık sütunu: yalnız açılışta, yumuşak (artık bloom da taşıyor)
      beamMat.uniforms.uIntensity.value = Math.max(0, openAmt - 0.35) * 0.75;
      beam.scale.setScalar(0.85 + openAmt * 0.25);

      // (a) toz: yavaş yükselip başa sarar
      const dpos = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < dustCount; i++) {
        let y = dpos.getY(i) + dt * (0.06 + charge * 0.12);
        if (y > 0.95) y = -0.9;
        dpos.setY(i, y);
      }
      dpos.needsUpdate = true;
      dustMat.opacity = 0.35 + charge * 0.35;

      // (b) kıvılcımlar: tamamen GPU'da. Patlama hızlı yükselir, yavaş söner.
      if (burstT >= 0) burstT += dt;
      const burst = burstT < 0
        ? 0
        : Math.min(1, burstT / 0.3) * Math.exp(-Math.max(0, burstT - 0.9) * 1.1);
      const su = sparkMat.uniforms;
      su.uTime.value = t;
      su.uRadius.value = 0.45 + burst * 1.35;
      su.uSize.value = 3.0 + burst * 2.6;
      su.uGate.value = Math.min(1.6, 0.18 + charge * 0.3 + burst * 0.9);
      su.uSpeed.value = 0.5 + burst * 0.5;

      // ── ÇİZİM: sahne → tampon → parlak geçiş → gauss ×2 → bindirme ───
      const base = rtBase, hA = rtHalfA, hB = rtHalfB, qA = rtQuarterA, qB = rtQuarterB;
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
      runQuad(prefilterMat, hA);              // eşik + yarıya indir
      blurPass(hA.texture, hB, 1, 0);
      blurPass(hB.texture, hA, 0, 1);         // hA = yakın hale
      blurPass(hA.texture, qA, 1, 0);
      blurPass(qA.texture, qB, 0, 1);         // qB = geniş parıltı

      const c = compositeMat.uniforms;
      c.tBase.value = base.texture;
      c.tNear.value = hA.texture;
      c.tWide.value = qB.texture;
      c.uBloom.value = bloomAmt;
      runQuad(compositeMat, null);
    };
    raf = requestAnimationFrame(tick);

    // Sekme gizliyken döngüyü durdur (boşuna CPU/GPU yakma)
    const onVisibility = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; clock.getDelta(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Kapsayıcı boyutu değişince (responsive/mobil döndürme) sahneyi uyarla.
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── TEMİZLİK ───────────────────────────────────────────────────────
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      disposeTargets();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []); // sahne bir kez kurulur; faz phaseRef, boyut ResizeObserver ile akar

  return <div ref={mountRef} className={className} aria-hidden />;
}
