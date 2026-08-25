'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
const SAPPHIRE_DEEP = 0x081f4d;  // gölge/alt tonlar
const SEAM_BLUE = 0x5aa2ff;      // ışıklı kenar dikişi
const INNER_GLOW = 0xbfe0ff;     // iç aydınlık (mavi-beyaz)
const ACCENT_PINK = 0xff8fd8;    // YALNIZ aksan (yansıma + açılış ışığı)
const EMBLEM_METAL = 0xdfe9ff;   // amblem metali (soğuk platin)

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Sahne kapsayıcıyı doldurur; boyut ResizeObserver ile canlı güncellenir.
    const initial = Math.max(1, Math.min(mount.clientWidth || 320, mount.clientHeight || 320));
    renderer.setSize(initial, initial);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.margin = '0 auto';
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.55, 6.4);
    camera.lookAt(0, 0.25, 0);

    // ── ORTAM YANSIMASI (dosyasız): prosedürel gradyan sahneden PMREM ──
    // Gerçek yansıma olmadan "premium render" hissi oluşmuyor; HDR dosyası
    // eklemeden, renkli düzlemlerden oluşan mini sahneyi env map'e çeviriyoruz.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const mkPanel = (color: number, x: number, y: number, z: number, s: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      envScene.add(m);
      return m;
    };
    envScene.background = new THREE.Color(0x02040f);
    const envPanels = [
      mkPanel(0x9fc6ff, 0, 6, 0, 14),       // üstten soğuk anahtar ışık
      mkPanel(ACCENT_PINK, -6, 1.2, -3, 7), // sol arka PEMBE aksan (yansımada görünür)
      mkPanel(0x2f6fd0, 6, 1.6, -2, 8),     // sağ mavi dolgu
      mkPanel(0x0a1836, 0, -5, 0, 14),      // alt koyu
    ];
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;

    // ── IŞIKLAR (sinematik, yumuşak) ───────────────────────────────────
    scene.add(new THREE.HemisphereLight(0x9dc4ff, 0x050b1c, 0.55));
    const keyLight = new THREE.DirectionalLight(0xdfeaff, 1.5);
    keyLight.position.set(3.2, 5.5, 4.2);
    scene.add(keyLight);
    const rimPink = new THREE.DirectionalLight(ACCENT_PINK, 0.85); // pembe YALNIZ kenar vurgusu
    rimPink.position.set(-4.5, 1.6, -3.5);
    scene.add(rimPink);
    /** İç ışık: kapak açıldıkça güçlenen mavi-beyaz kaynak (kutunun içinden). */
    const innerLight = new THREE.PointLight(INNER_GLOW, 0, 9, 2);
    innerLight.position.set(0, 0.35, 0);
    scene.add(innerLight);

    // ── KÖK GRUP (yüzdürme + hafif salınım burada) ─────────────────────
    const root = new THREE.Group();
    scene.add(root);

    // ── MALZEMELER ─────────────────────────────────────────────────────
    /** Gövde: derin safir, sedefli (iridescence) + berrak vernik (clearcoat). */
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: SAPPHIRE,
      metalness: 0.35,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.55,          // sedef parıltısı — pembe/menekşe yansımayı buradan alır
      iridescenceIOR: 1.4,
      iridescenceThicknessRange: [120, 420],
      envMapIntensity: 1.25,
      sheen: 0.4,
      sheenColor: new THREE.Color(0x7fb0ff),
    });
    const bodyDeepMat = bodyMat.clone();
    bodyDeepMat.color = new THREE.Color(SAPPHIRE_DEEP);

    /** Işıklı dikey kenar dikişi — siluetin imzası. */
    const seamMat = new THREE.MeshStandardMaterial({
      color: SEAM_BLUE, emissive: SEAM_BLUE, emissiveIntensity: 1.1,
      metalness: 0.2, roughness: 0.35, toneMapped: false,
    });

    /** İç yüzey: dışarıdan daha AYDINLIK (brief) — ödül buradan çıkacak. */
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xeaf4ff, emissive: INNER_GLOW, emissiveIntensity: 0.9,
      metalness: 0, roughness: 1, side: THREE.BackSide,
    });

    /** Amblem metali. */
    const emblemMat = new THREE.MeshPhysicalMaterial({
      color: EMBLEM_METAL, metalness: 1, roughness: 0.22,
      clearcoat: 0.8, envMapIntensity: 1.6,
    });
    /** Amblemin ışıyan kenarı — şarj oldukça parlar. */
    const emblemGlowMat = new THREE.MeshBasicMaterial({
      color: INNER_GLOW, transparent: true, opacity: 0.35, toneMapped: false,
    });

    const disposables: Array<{ dispose: () => void }> = [
      bodyMat, bodyDeepMat, seamMat, innerMat, emblemMat, emblemGlowMat,
    ];

    // ── GÖVDE: hafif konik yuvarlatılmış kutu ──────────────────────────
    const BODY_W = 2.5, BODY_H = 1.5, BODY_D = 2.5;
    const bodyGeo = new RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 6, 0.18);
    disposables.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.12;
    body.scale.set(1, 1, 1);
    root.add(body);

    // Gövdenin üstü hafif daralsın → mücevher kutusu silueti (konik his).
    const bodyPos = bodyGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bodyPos.count; i++) {
      const y = bodyPos.getY(i);
      const k = 1 - 0.055 * ((y + BODY_H / 2) / BODY_H); // üste doğru %5.5 daralma
      bodyPos.setX(i, bodyPos.getX(i) * k);
      bodyPos.setZ(i, bodyPos.getZ(i) * k);
    }
    bodyPos.needsUpdate = true;
    bodyGeo.computeVertexNormals();

    // İç boşluk (üstten bakınca aydınlık iç yüzey görünsün)
    const cavityGeo = new THREE.BoxGeometry(BODY_W * 0.86, BODY_H * 0.9, BODY_D * 0.86);
    disposables.push(cavityGeo);
    const cavity = new THREE.Mesh(cavityGeo, innerMat);
    cavity.position.y = -0.06;
    root.add(cavity);

    // ── IŞIKLI DİKEY KENAR DİKİŞLERİ (4 köşe) — imza detayı ────────────
    const seamGeo = new THREE.CapsuleGeometry(0.028, BODY_H * 0.82, 4, 8);
    disposables.push(seamGeo);
    const seams: THREE.Mesh[] = [];
    const sx = BODY_W / 2 - 0.12, sz = BODY_D / 2 - 0.12;
    for (const [x, z] of [[sx, sz], [-sx, sz], [sx, -sz], [-sx, -sz]] as const) {
      const seam = new THREE.Mesh(seamGeo, seamMat);
      seam.position.set(x, -0.12, z);
      root.add(seam);
      seams.push(seam);
    }

    // ── KAİDE HALKASI (altta yumuşak ışık) ─────────────────────────────
    const plinthGeo = new THREE.TorusGeometry(1.42, 0.045, 10, 64);
    disposables.push(plinthGeo);
    const plinth = new THREE.Mesh(plinthGeo, seamMat);
    plinth.rotation.x = Math.PI / 2;
    plinth.position.y = -0.92;
    root.add(plinth);

    // ── KAPAK (ayrı grup: açılırken kaldırılır + arkaya yatırılır) ─────
    const lid = new THREE.Group();
    lid.position.set(0, BODY_H / 2 - 0.12, 0);
    root.add(lid);

    const lidGeo = new RoundedBoxGeometry(BODY_W * 1.02, 0.34, BODY_D * 1.02, 6, 0.14);
    disposables.push(lidGeo);
    const lidMesh = new THREE.Mesh(lidGeo, bodyMat);
    lidMesh.position.y = 0.17;
    lid.add(lidMesh);

    // Kapak kenarına ince ışık şeridi (kapalıyken "mühürlü" hissi)
    const lidSeamGeo = new THREE.TorusGeometry(1.3, 0.022, 8, 80);
    disposables.push(lidSeamGeo);
    const lidSeam = new THREE.Mesh(lidSeamGeo, seamMat);
    lidSeam.rotation.x = Math.PI / 2;
    lidSeam.position.y = 0.02;
    lid.add(lidSeam);

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

      // Merkez mücevher — sekizgen faset (sihirli mühür hissi)
      const gemGeo = new THREE.OctahedronGeometry(0.2, 0);
      disposables.push(gemGeo);
      const gem = new THREE.Mesh(gemGeo, emblemMat.clone());
      (gem.material as THREE.MeshPhysicalMaterial).emissive = new THREE.Color(INNER_GLOW);
      (gem.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.4;
      disposables.push(gem.material as THREE.Material);
      gem.position.z = 0.1;
      gem.name = 'gem';
      g.add(gem);

      // Çevresel ışıklar (mühür ışınları) — 8 küçük çubuk
      const rayGeo = new THREE.BoxGeometry(0.05, 0.16, 0.03);
      disposables.push(rayGeo);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ray = new THREE.Mesh(rayGeo, emblemMat);
        ray.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.02);
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
    /** (a) Malzemeye gömülü yıldızcıklar — kutunun çevresinde sabit, çok küçük. */
    const dustCount = 90;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.25 + Math.random() * 0.35;
      dustPos[i * 3] = Math.cos(a) * r;
      dustPos[i * 3 + 1] = -0.85 + Math.random() * 1.7;
      dustPos[i * 3 + 2] = Math.sin(a) * r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xcfe6ff, size: 0.035, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    disposables.push(dustGeo, dustMat);
    const dust = new THREE.Points(dustGeo, dustMat);
    root.add(dust);

    /** (b) Yükselen ışık parçacıkları — amblemden çıkar, sonra açılışta patlar. */
    const riseCount = 140;
    const riseGeo = new THREE.BufferGeometry();
    const risePos = new Float32Array(riseCount * 3);
    const riseSeed = new Float32Array(riseCount * 3); // [hız, açı, yarıçap]
    for (let i = 0; i < riseCount; i++) {
      const a = Math.random() * Math.PI * 2;
      riseSeed[i * 3] = 0.35 + Math.random() * 0.9;
      riseSeed[i * 3 + 1] = a;
      riseSeed[i * 3 + 2] = 0.08 + Math.random() * 0.5;
      risePos[i * 3] = 0; risePos[i * 3 + 1] = -99; risePos[i * 3 + 2] = 0; // başta gizli
    }
    riseGeo.setAttribute('position', new THREE.BufferAttribute(risePos, 3));
    const riseMat = new THREE.PointsMaterial({
      color: 0xeaf4ff, size: 0.055, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    disposables.push(riseGeo, riseMat);
    const rise = new THREE.Points(riseGeo, riseMat);
    root.add(rise);

    /** (c) Işık sütunu — kapak açılınca içeriden yükselen yumuşak hacimsel huzme. */
    const beamGeo = new THREE.CylinderGeometry(0.15, 1.05, 2.6, 40, 1, true);
    disposables.push(beamGeo);
    const beamMat = new THREE.MeshBasicMaterial({
      color: INNER_GLOW, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    disposables.push(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 1.25;
    root.add(beam);

    // ── ANİMASYON DÖNGÜSÜ ──────────────────────────────────────────────
    let raf = 0;
    let running = true;
    const clock = new THREE.Clock();
    let openAmt = 0;    // yumuşatılmış açılma (0→1)
    let charge = 0.18;  // yumuşatılmış amblem şarjı
    let burstT = -1;    // patlama zamanlayıcısı (reveal'de tetiklenir)
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
      lid.position.y = (BODY_H / 2 - 0.12) + openAmt * 1.5;
      lid.rotation.x = -openAmt * 0.62;
      lid.position.z = -openAmt * 0.35;

      // Amblem: şarj oldukça parlar + mücevher döner
      const emissive = 0.35 + charge * 2.6;
      if (emblemGem) {
        const gm = emblemGem.material as THREE.MeshPhysicalMaterial;
        gm.emissiveIntensity = emissive;
        emblemGem.rotation.y = t * 1.1;
        emblemGem.rotation.z = t * 0.7;
      }
      if (emblemHalo) {
        const hm = emblemHalo.material as THREE.MeshBasicMaterial;
        hm.opacity = 0.12 + charge * 0.5 + Math.sin(t * 2.4) * 0.05 * charge;
        emblemHalo.scale.setScalar(1 + charge * 0.28 + Math.sin(t * 2.2) * 0.03);
      }
      // Kapak açılınca amblem sönümlensin (ışık artık kutunun içinden geliyor)
      emblem.visible = openAmt < 0.92;

      // Kenar dikişleri + kaide: şarjla nabız
      seamMat.emissiveIntensity = 0.7 + charge * 1.4 + Math.sin(t * 3.1) * 0.12;

      // İç ışık: kapak açıldıkça güçlenir
      innerLight.intensity = openAmt * 3.4;
      innerLight.position.y = 0.35 + openAmt * 0.5;

      // Işık sütunu: yalnız açılışta, yumuşak
      beamMat.opacity = Math.max(0, (openAmt - 0.35)) * 0.32;
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

      // (b) yükselen parçacıklar: şarjda amblemden sızar, patlamada fışkırır
      const rpos = riseGeo.attributes.position as THREE.BufferAttribute;
      if (burstT >= 0) burstT += dt;
      for (let i = 0; i < riseCount; i++) {
        const speed = riseSeed[i * 3];
        const ang = riseSeed[i * 3 + 1];
        const rad = riseSeed[i * 3 + 2];
        let y = rpos.getY(i);

        if (y < -50) {
          // Uykuda: şarj yüksekse amblemden yavaş salınsın, patlamada topluca çıksın
          const wake = burstT >= 0 ? Math.random() < dt * 9 : Math.random() < dt * charge * 0.9;
          if (wake) {
            y = 0.4;
            rpos.setX(i, Math.cos(ang) * rad * 0.3);
            rpos.setZ(i, Math.sin(ang) * rad * 0.3);
          }
        } else {
          const boost = burstT >= 0 && burstT < 1.1 ? 2.1 : 1;
          y += dt * speed * boost;
          // Yükseldikçe dışa doğru hafif savrulma (kontrollü, patlayıcı değil)
          const spread = 1 + dt * (burstT >= 0 ? 1.5 : 0.5);
          rpos.setX(i, rpos.getX(i) * spread);
          rpos.setZ(i, rpos.getZ(i) * spread);
          if (y > 2.9) y = -99; // döngüye al
        }
        rpos.setY(i, y);
      }
      rpos.needsUpdate = true;
      riseMat.opacity = 0.35 + charge * 0.55;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    // Sekme gizliyken döngüyü durdur (boşuna CPU/GPU yakma)
    const onVisibility = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; clock.getDelta(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Kapsayıcı boyutu değişince (responsive/mobil döndürme) sahneyi uyarla.
    const ro = new ResizeObserver(() => {
      const s2 = Math.max(1, Math.min(mount.clientWidth || 1, mount.clientHeight || 1));
      renderer.setSize(s2, s2);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    // ── TEMİZLİK ───────────────────────────────────────────────────────
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      for (const p of envPanels) { p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
      envRT.dispose();
      pmrem.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []); // sahne bir kez kurulur; faz phaseRef, boyut ResizeObserver ile akar

  return <div ref={mountRef} className={className} aria-hidden />;
}
