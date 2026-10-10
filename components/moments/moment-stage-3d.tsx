'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { isReducedMotion } from '@/lib/motion/policy';
import { darkenHex, lightenHex, mixHex, type ScenePair } from '@/lib/moments/scene-colors';
import {
  GEM_SCREEN_FRACTION,
  GEM_TIMELINE,
  MEDALLION_TIMELINE,
  RING_SCREEN_FRACTION,
  RING_TIMELINE,
  burstEnvelope,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  fitVerticalFov,
  halfExtentAt,
  progressBetween,
  stageDpr,
  backbufferSize,
  type SceneClock,
} from './scenes/scene-math';
import type { StagePreset } from './scenes/stage-fallback-2d';
import {
  ASSEMBLY_FRAGMENT,
  ASSEMBLY_VERTEX,
  BURST_FRAGMENT,
  BURST_VERTEX,
  DUST_FRAGMENT,
  DUST_VERTEX,
  GEM_CENTER_Y,
  GEM_FRAGMENT,
  GEM_HALF_HEIGHT,
  MEDALLION_FRAGMENT,
  RING_FRAGMENT,
  SCATTER_FRAGMENT,
  SCATTER_VERTEX,
  SHOCK_FRAGMENT,
  SURFACE_VERTEX,
  buildDust,
  buildFacetedGem,
  buildRayBurst,
  buildRingAssembly,
  buildSurfaceScatter,
  createBloomPipeline,
  studioUniforms,
} from './scenes/stage-gl';

/**
 * An Motoru 3B sahnesi — TEK lazy chunk (spec §3). Üç ön ayar:
 *
 *   ring      → seviye: parçacıklar girdap çizerek parlak halkada toplanır; kapanışta ışın
 *               patlaması + şok halkası.
 *   gem       → lig: eski amblem (eski lig renginde taş) parçacıklara dağılır; yeni lig
 *               fasetli taşı kamera yaklaşırken iner; inişte patlama.
 *   medallion → rozet: madalyon dönerek gelir, takla atar, yüzü kameraya döner; patlama.
 *
 * Zaman, sahne kabuğunun `SceneClock`'undan okunur (DOM metinleriyle aynı saat; sekme
 * gizlenince ikisi birlikte durur). Kurallar: DPR ≤ 1,5; sekme gizliyken çizim durur;
 * unmount'ta geometri/malzeme/render hedefi/renderer `dispose`; WebGL yoksa ya da bağlam
 * kaybolursa `onUnavailable` (kabuk 2B yedeği gösterir); tuval boyutu kapsayıcının
 * `clientWidth/clientHeight`'ından (ölçekli ebeveynde `getBoundingClientRect` yanlış ölçer).
 *
 * Bu modül YALNIZ `next/dynamic` ile (scenes/stage-lazy.tsx) yüklenir; three.js ana pakete girmez.
 */
export interface MomentStage3DProps {
  preset: StagePreset;
  /** Hedef renk çifti (yeni lig / rozet / marka). */
  colors: ScenePair;
  /** Lig sahnesinde eski ligin renkleri (dağılan amblem). */
  fromColors?: ScenePair;
  /** Sahne kabuğunun saati (DOM zaman çizelgesiyle ortak). */
  clock: SceneClock;
  /** Sahne odağının tuvaldeki dikey konumu (0 üst – 1 alt). Varsayılan 0,5. */
  focusY?: number;
  /** İlk kare çizildi. */
  onReady?: () => void;
  /** WebGL yok / bağlam kayboldu → kabuk 2B yedeğe geçer. */
  onUnavailable?: () => void;
  className?: string;
}

const BASE_FOV = 40;

type Built = {
  /** t: sahne saniyesi, now: performance.now() (sürekli ortam hareketi için). */
  update(t: number, now: number): void;
  /** Kamera mesafesi (dolly için her kare okunur). */
  distance(t: number): number;
  bloom(t: number): number;
};

const color = (hex: string) => new THREE.Color(hex);
/** Bloom eşiğini aşacak şekilde ışık rengi (doğrusal uzayda > 1). */
const hot = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);

export default function MomentStage3D({
  preset,
  colors,
  fromColors,
  clock,
  focusY = 0.5,
  onReady,
  onUnavailable,
  className,
}: MomentStage3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ onReady, onUnavailable });
  const clockRef = useRef(clock);
  const focusRef = useRef(focusY);
  useEffect(() => {
    cbRef.current = { onReady, onUnavailable };
    clockRef.current = clock;
    focusRef.current = focusY;
  });

  const colorKey = `${colors[0]}|${colors[1]}|${fromColors?.[0] ?? ''}|${fromColors?.[1] ?? ''}`;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const fail = () => {
      try {
        cbRef.current.onUnavailable?.();
      } catch {
        /* yoksay */
      }
    };
    // Kabuk azaltılmış harekette bu bileşeni zaten yüklemez; yine de savunmacı.
    if (isReducedMotion()) {
      fail();
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      fail();
      return;
    }
    const dpr = stageDpr(window.devicePixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.NoToneMapping; // ton eşleme bindirme geçişinde
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 100);
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(x: T): T => {
      disposables.push(x);
      return x;
    };

    const [ca, cb] = colors;
    const [fa, fb] = fromColors ?? colors;
    let pointScale = 1;
    const pointScaleU = { value: 1 };
    const pixelRatioU = { value: dpr };

    // ── Ortak: arka plan tozu ─────────────────────────────────────────
    const addDust = (spread: number, hex: string, opacity: number) => {
      const geo = track(buildDust(110, spread));
      const mat = track(
        new THREE.ShaderMaterial({
          vertexShader: DUST_VERTEX,
          fragmentShader: DUST_FRAGMENT,
          uniforms: {
            uTime: { value: 0 },
            uSpread: { value: spread },
            uPixelRatio: pixelRatioU,
            uPointScale: pointScaleU,
            uColor: { value: color(lightenHex(hex, 0.4)) },
            uOpacity: { value: opacity },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      return mat;
    };

    const addBurst = (rays: number, perRay: number, flatten: number, hex: string) => {
      const geo = track(buildRayBurst(rays, perRay, flatten));
      const mat = track(
        new THREE.ShaderMaterial({
          vertexShader: BURST_VERTEX,
          fragmentShader: BURST_FRAGMENT,
          uniforms: {
            uBurst: { value: -1 },
            uSpeed: { value: 1.1 },
            uRadius: { value: 2 },
            uSize: { value: 5 },
            uRim: { value: 0.55 },
            uPixelRatio: pixelRatioU,
            uPointScale: pointScaleU,
            uColor: { value: hot(lightenHex(hex, 0.2), 1.3) },
            uHot: { value: new THREE.Color(1.6, 1.6, 1.6) },
            uGate: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false; // konum shader'da üretiliyor
      return { pts, mat };
    };

    const addShock = (hex: string) => {
      const geo = track(new THREE.CircleGeometry(1, 128));
      const mat = track(
        new THREE.ShaderMaterial({
          vertexShader: SURFACE_VERTEX,
          fragmentShader: SHOCK_FRAGMENT,
          uniforms: { uColor: { value: color(lightenHex(hex, 0.3)) }, uOpacity: { value: 0 } },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      return { mesh: new THREE.Mesh(geo, mat), mat };
    };

    // ═══════════════════════════════════════════════════════════════════
    //  ÖN AYARLAR
    // ═══════════════════════════════════════════════════════════════════

    const buildRing = (): Built => {
      const D = 6;
      const R = RING_SCREEN_FRACTION * halfExtentAt(D, BASE_FOV);
      const group = new THREE.Group();
      scene.add(group);

      const ringMat = track(
        new THREE.ShaderMaterial({
          vertexShader: SURFACE_VERTEX,
          fragmentShader: RING_FRAGMENT,
          uniforms: {
            uColorA: { value: color(lightenHex(ca, 0.15)) },
            uColorB: { value: color(lightenHex(cb, 0.15)) },
            uGlow: { value: 1.4 },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      group.add(new THREE.Mesh(track(new THREE.TorusGeometry(R, R * 0.024, 18, 240)), ringMat));

      const haloMat = track(
        new THREE.ShaderMaterial({
          vertexShader: SURFACE_VERTEX,
          fragmentShader: RING_FRAGMENT,
          uniforms: {
            uColorA: { value: color(cb) },
            uColorB: { value: color(ca) },
            uGlow: { value: 0.9 },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      group.add(new THREE.Mesh(track(new THREE.TorusGeometry(R * 1.1, R * 0.006, 8, 200)), haloMat));

      const asmGeo = track(buildRingAssembly(1800, R, R * 0.03));
      const asmMat = track(
        new THREE.ShaderMaterial({
          vertexShader: ASSEMBLY_VERTEX,
          fragmentShader: ASSEMBLY_FRAGMENT,
          uniforms: {
            uT: { value: 0 },
            uEnd: { value: RING_TIMELINE.assembleEnd },
            uSpin: { value: 0 },
            uSize: { value: 2.2 },
            uPixelRatio: pixelRatioU,
            uPointScale: pointScaleU,
            uColorA: { value: color(ca) },
            uColorB: { value: color(cb) },
            uGate: { value: 1 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const asm = new THREE.Points(asmGeo, asmMat);
      asm.frustumCulled = false;
      group.add(asm);

      const burst = addBurst(160, 4, 0.75, cb);
      burst.mat.uniforms.uRadius.value = R * 2.7;
      group.add(burst.pts);
      const shock = addShock(ca);
      group.add(shock.mesh);
      const dust = addDust(3.2, cb, 0.7);

      return {
        distance: () => D,
        bloom: (t) => 0.75 + burstEnvelope(t, RING_TIMELINE.burstAt) * 0.85,
        update(t, now) {
          const amb = now / 1000;
          const appear = progressBetween(t, RING_TIMELINE.assembleEnd - 0.3, RING_TIMELINE.assembleEnd + 0.05);
          const env = burstEnvelope(t, RING_TIMELINE.burstAt);
          group.rotation.x = Math.sin(amb * 0.6) * 0.07 * appear;
          group.rotation.y = Math.sin(amb * 0.45) * 0.09 * appear;

          asmMat.uniforms.uT.value = t;
          asmMat.uniforms.uSpin.value = t * 0.22;
          asmMat.uniforms.uGate.value = t <= 0 ? 0 : 1 - appear * 0.45;

          ringMat.uniforms.uOpacity.value = appear;
          ringMat.uniforms.uGlow.value = 1.3 + env * 1.1 + Math.sin(amb * 2.6) * 0.08 * appear;
          ringMat.uniforms.uTime.value = amb;
          haloMat.uniforms.uOpacity.value = appear * 0.55;
          haloMat.uniforms.uTime.value = amb;

          const bt = t - RING_TIMELINE.burstAt;
          burst.mat.uniforms.uBurst.value = bt;
          burst.mat.uniforms.uGate.value = bt >= 0 ? 1 : 0;

          const s = progressBetween(t, RING_TIMELINE.burstAt, RING_TIMELINE.burstAt + 0.85);
          shock.mesh.scale.setScalar(R * (1.02 + easeOutCubic(s) * 1.5));
          shock.mat.uniforms.uOpacity.value = bt >= 0 ? (1 - s) * 0.85 : 0;

          dust.uniforms.uTime.value = amb;
        },
      };
    };

    const buildGem = (): Built => {
      const D0 = 7.6;
      const D1 = 5.6;
      const S = (GEM_SCREEN_FRACTION * halfExtentAt(D1, BASE_FOV)) / GEM_HALF_HEIGHT;
      const yRest = -GEM_CENTER_Y * S;

      // Yeni lig taşı.
      const gemGeo = track(buildFacetedGem(12));
      const gemMat = track(
        new THREE.ShaderMaterial({
          vertexShader: SURFACE_VERTEX,
          fragmentShader: GEM_FRAGMENT,
          uniforms: {
            ...studioUniforms(color(lightenHex(ca, 0.12)), color(darkenHex(cb, 0.86)), color(cb)),
            uTint: { value: color(lightenHex(ca, 0.35)) },
            uFire: { value: color(lightenHex(cb, 0.25)) },
            uIndex: { value: 1.42 },
            uDispersion: { value: 0.055 },
            uSpecular: { value: 700 },
            uCharge: { value: 0.3 },
            uOpacity: { value: 0 },
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.scale.setScalar(S);
      scene.add(gem);

      // Eski amblem (eski lig renginde, daha küçük taş) + dağılma parçacıkları.
      const oldGroup = new THREE.Group();
      const oldScale = S * 0.62;
      oldGroup.scale.setScalar(oldScale);
      oldGroup.position.y = -GEM_CENTER_Y * oldScale;
      scene.add(oldGroup);
      const oldGeo = track(buildFacetedGem(8));
      const oldMat = track(
        new THREE.ShaderMaterial({
          vertexShader: SURFACE_VERTEX,
          fragmentShader: GEM_FRAGMENT,
          uniforms: {
            ...studioUniforms(color(lightenHex(fa, 0.1)), color(darkenHex(fb, 0.88)), color(fb)),
            uTint: { value: color(lightenHex(fa, 0.3)) },
            uFire: { value: color(fb) },
            uIndex: { value: 1.4 },
            uDispersion: { value: 0.04 },
            uSpecular: { value: 500 },
            uCharge: { value: 0.15 },
            uOpacity: { value: 1 },
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const oldGem = new THREE.Mesh(oldGeo, oldMat);
      oldGroup.add(oldGem);
      const scatterGeo = track(buildSurfaceScatter(oldGeo, 1100));
      const scatterMat = track(
        new THREE.ShaderMaterial({
          vertexShader: SCATTER_VERTEX,
          fragmentShader: SCATTER_FRAGMENT,
          uniforms: {
            uK: { value: 0 },
            uDist: { value: 3.4 },
            uSize: { value: 4.2 },
            uPixelRatio: pixelRatioU,
            uPointScale: pointScaleU,
            uColor: { value: hot(lightenHex(mixHex(fa, fb, 0.5), 0.35), 1.4) },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const scatter = new THREE.Points(scatterGeo, scatterMat);
      scatter.frustumCulled = false;
      oldGroup.add(scatter);

      const burst = addBurst(190, 4, 0, cb);
      burst.mat.uniforms.uRadius.value = S * 2.8;
      burst.pts.position.y = 0;
      scene.add(burst.pts);
      const shock = addShock(ca);
      shock.mesh.rotation.x = -1.25;
      shock.mesh.position.y = (-1.05 - GEM_CENTER_Y) * S * 0.9;
      scene.add(shock.mesh);
      const dust = addDust(4, cb, 0.8);

      return {
        distance: (t) => D0 + (D1 - D0) * easeInOutCubic(progressBetween(t, GEM_TIMELINE.descendStart, GEM_TIMELINE.dollyEnd)),
        bloom: (t) => 0.7 + burstEnvelope(t, GEM_TIMELINE.landAt) * 0.95,
        update(t, now) {
          const amb = now / 1000;
          // Eski amblem: kısa bekleyiş, sonra söner ve parçacıklara dağılır.
          const oldFade = progressBetween(t, GEM_TIMELINE.holdOld - 0.08, GEM_TIMELINE.holdOld + 0.1);
          oldMat.uniforms.uOpacity.value = 1 - oldFade;
          oldGem.visible = oldFade < 1;
          oldGem.rotation.y = amb * 0.8;
          scatter.rotation.y = oldGem.rotation.y;
          scatterMat.uniforms.uK.value = progressBetween(t, GEM_TIMELINE.holdOld - 0.06, GEM_TIMELINE.scatterEnd);
          oldGroup.position.y = -GEM_CENTER_Y * oldScale + Math.sin(amb * 1.3) * 0.04;

          // Yeni taş: yukarıdan iner (hafif aşmalı yerleşme), inerken hızla döner.
          const dp = progressBetween(t, GEM_TIMELINE.descendStart, GEM_TIMELINE.landAt);
          const land = easeOutBack(dp, 1.1);
          const settled = progressBetween(t, GEM_TIMELINE.landAt, GEM_TIMELINE.landAt + 1.2);
          gem.position.y = yRest + (1 - land) * 4.2 + Math.sin(amb * 1.1) * 0.05 * settled;
          gem.rotation.y = amb * 0.5 + (1 - easeOutCubic(dp)) * 5.5;
          gem.rotation.z = Math.sin(amb * 0.7) * 0.05 * settled;
          gemMat.uniforms.uOpacity.value = progressBetween(t, GEM_TIMELINE.descendStart, GEM_TIMELINE.descendStart + 0.3);
          const env = burstEnvelope(t, GEM_TIMELINE.landAt);
          gemMat.uniforms.uCharge.value = 0.3 + env * 0.9 + settled * 0.15;

          const bt = t - GEM_TIMELINE.landAt;
          burst.mat.uniforms.uBurst.value = bt;
          burst.mat.uniforms.uGate.value = bt >= 0 ? 1 : 0;
          const s = progressBetween(t, GEM_TIMELINE.landAt, GEM_TIMELINE.landAt + 0.9);
          shock.mesh.scale.setScalar(S * (0.4 + easeOutCubic(s) * 2.4));
          shock.mat.uniforms.uOpacity.value = bt >= 0 ? (1 - s) * 0.8 : 0;

          dust.uniforms.uTime.value = amb;
        },
      };
    };

    const buildMedallion = (): Built => {
      const D = 5;
      const Rm = 0.6 * halfExtentAt(D, BASE_FOV);
      const thick = Rm * 0.14;
      const pivot = new THREE.Group();
      scene.add(pivot);
      const medMat = track(
        new THREE.ShaderMaterial({
          vertexShader: SURFACE_VERTEX,
          fragmentShader: MEDALLION_FRAGMENT,
          uniforms: {
            ...studioUniforms(color(lightenHex(ca, 0.25)), color(darkenHex(ca, 0.9)), color(cb)),
            uMetal: { value: color(lightenHex(ca, 0.3)) },
            uEdgeCol: { value: color(lightenHex(cb, 0.2)) },
            uEnamel: { value: color(darkenHex(ca, 0.62)) },
            uEdgeGlow: { value: 1.2 },
            uRough: { value: 0.18 },
            uRadius: { value: Rm },
          },
        }),
      );
      const med = new THREE.Mesh(track(new THREE.CylinderGeometry(Rm, Rm, thick, 120, 1, false)), medMat);
      med.rotation.x = Math.PI / 2; // yüz kameraya (+Z)
      pivot.add(med);

      const burst = addBurst(140, 4, 0.6, cb);
      burst.mat.uniforms.uRadius.value = Rm * 2.1;
      scene.add(burst.pts);
      const shock = addShock(cb);
      scene.add(shock.mesh);

      const T = MEDALLION_TIMELINE;
      return {
        distance: () => D,
        bloom: (t) => 0.7 + burstEnvelope(t, T.burstAt) * 0.8,
        update(t, now) {
          const amb = now / 1000;
          const ent = progressBetween(t, 0, T.enterEnd);
          const e = easeOutBack(ent, 1.3);
          pivot.scale.setScalar(Math.max(0.001, 0.35 + 0.65 * e));
          pivot.position.z = -3 * (1 - easeOutCubic(ent));
          const fp = progressBetween(t, T.flipStart, T.flipEnd);
          const spin = (1 - easeOutCubic(progressBetween(t, 0, T.flipEnd))) * Math.PI * 4;
          const settle = progressBetween(t, T.flipEnd, T.flipEnd + 0.8);
          pivot.rotation.x = easeInOutCubic(fp) * Math.PI * 2 + Math.sin(amb * 1.1) * 0.06 * settle;
          pivot.rotation.y = spin + Math.sin(amb * 1.3) * 0.12 * settle;
          const env = burstEnvelope(t, T.burstAt);
          medMat.uniforms.uEdgeGlow.value = 1.1 + env * 1.3 + Math.sin(amb * 2.4) * 0.08 * settle;

          const bt = t - T.burstAt;
          burst.mat.uniforms.uBurst.value = bt;
          burst.mat.uniforms.uGate.value = bt >= 0 ? 1 : 0;
          const s = progressBetween(t, T.burstAt, T.burstAt + 0.75);
          shock.mesh.scale.setScalar(Rm * (1 + easeOutCubic(s) * 0.9));
          shock.mat.uniforms.uOpacity.value = bt >= 0 ? (1 - s) * 0.7 : 0;
        },
      };
    };

    let built: Built;
    let bloom: ReturnType<typeof createBloomPipeline>;
    try {
      built = preset === 'ring' ? buildRing() : preset === 'gem' ? buildGem() : buildMedallion();
      bloom = createBloomPipeline(renderer);
    } catch {
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
      fail();
      return;
    }

    let cssW = 1;
    let cssH = 1;
    const applyCamera = () => {
      const aspect = cssW / cssH;
      camera.aspect = aspect;
      camera.fov = fitVerticalFov(aspect, BASE_FOV);
      const offY = (0.5 - focusRef.current) * cssH;
      if (Math.abs(offY) > 0.5) camera.setViewOffset(cssW, cssH, 0, offY, cssW, cssH);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      // clientWidth/clientHeight: CSS transform ile ölçeklenen ebeveynde de gerçek düzen boyutu.
      cssW = Math.max(1, mount.clientWidth || 1);
      cssH = Math.max(1, mount.clientHeight || 1);
      renderer.setSize(cssW, cssH, false);
      const { w, h } = backbufferSize(cssW, cssH, dpr);
      bloom.resize(w, h);
      pointScale = Math.min(cssW, cssH) / 420;
      pointScaleU.value = Math.max(0.6, Math.min(2.4, pointScale));
      applyCamera();
    };
    resize();

    let raf = 0;
    let running = true;
    let lost = false;
    let readySent = false;
    let lastFocus = focusRef.current;

    const frame = () => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const t = Math.max(0, clockRef.current.elapsedMs(now) / 1000);
      if (focusRef.current !== lastFocus) {
        lastFocus = focusRef.current;
        applyCamera();
      }
      built.update(t, now);
      camera.position.set(0, 0, built.distance(t));
      camera.lookAt(0, 0, 0);
      bloom.render(scene, camera, built.bloom(t));
      if (!readySent) {
        readySent = true;
        try {
          cbRef.current.onReady?.();
        } catch {
          /* yoksay */
        }
      }
    };
    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running && !lost) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      running = false;
      cancelAnimationFrame(raf);
      fail();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(mount);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      ro?.disconnect();
      bloom.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      // Bağlamı hemen bırak: oturumda art arda birkaç an oynarsa tarayıcının ~16
      // WebGL bağlamı sınırına yaklaşılmasın (dinleyici yukarıda kaldırıldı).
      try {
        renderer.forceContextLoss();
      } catch {
        /* yoksay */
      }
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    };
    // Sahne bir kez kurulur; saat/odak/geri çağırmalar ref ile akar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, colorKey]);

  return <div ref={mountRef} className={className} aria-hidden />;
}
