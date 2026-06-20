'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Gerçek 3D (Three.js) düşman/boss çekirdeği. Merkezde dönen ikozahedron + tel
 * kafes kabuk + içten ışıyan çekirdek + yörüngedeki parçacık halkası. "angry"
 * prop'u true olunca renk kızarır ve sarsılır (can kaybı geri bildirimi).
 *
 * Hafif: tek sahne, düşük poligon, WebGL yoksa / reduce-animations'ta sessizce
 * boş döner. Kendi animasyon döngüsü var (oyun döngüsünden bağımsız).
 */
export function Boss3D({
  color = '#a855f7',
  angry = false,
  size = 220,
}: {
  color?: string;
  angry?: boolean;
  size?: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const angryRef = useRef(angry);
  // Prop'u render dışında (commit fazında) ref'e yansıt; animasyon döngüsü okur.
  useEffect(() => {
    angryRef.current = angry;
  }, [angry]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (document.documentElement.classList.contains('reduce-animations')) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return; // WebGL yok
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;

    const base = new THREE.Color(color);
    const angryColor = new THREE.Color('#ff2d55');

    // Çekirdek — içten ışıyan düşük-poli küre
    const coreGeo = new THREE.IcosahedronGeometry(1.15, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: base,
      emissive: base,
      emissiveIntensity: 0.65,
      metalness: 0.4,
      roughness: 0.25,
      flatShading: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    // Tel kafes dış kabuk
    const shellGeo = new THREE.IcosahedronGeometry(1.7, 1);
    const shellMat = new THREE.MeshBasicMaterial({
      color: base,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shell);

    // İki "göz" — parlak küçük küreler
    const eyeGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.42, 0.2, 1.05);
    eyeR.position.set(0.42, 0.2, 1.05);
    core.add(eyeL);
    core.add(eyeR);

    // Yörünge parçacık halkası
    const ringCount = 90;
    const ringGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(ringCount * 3);
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const r = 2.3 + Math.random() * 0.25;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    ringGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const ringMat = new THREE.PointsMaterial({
      color: base,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Points(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.4;
    scene.add(ring);

    // Işıklar
    const key = new THREE.PointLight(base.getHex(), 30, 20);
    key.position.set(3, 3, 4);
    scene.add(key);
    const fill = new THREE.PointLight(0x4422aa, 12, 20);
    fill.position.set(-3, -2, 2);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x221133, 1.2));

    let raf = 0;
    let t = 0;
    let shake = 0;
    let prevAngry = false;
    const tmp = new THREE.Color();

    const animate = () => {
      t += 0.016;
      const a = angryRef.current;
      if (a && !prevAngry) shake = 1; // kızgınlığa yeni geçiş → sars
      prevAngry = a;
      shake *= 0.88;

      core.rotation.y += a ? 0.05 : 0.012;
      core.rotation.x = Math.sin(t * 0.6) * 0.2;
      shell.rotation.y -= 0.008;
      shell.rotation.z += 0.004;
      ring.rotation.z += 0.01;

      // Nefes alma + sars
      const breathe = 1 + Math.sin(t * 1.6) * 0.05;
      core.scale.setScalar(breathe + shake * 0.15);
      core.position.x = (Math.random() - 0.5) * shake * 0.4;
      core.position.y = (Math.random() - 0.5) * shake * 0.4;

      // Renk geçişi (sakin ↔ kızgın)
      const target = a ? angryColor : base;
      tmp.copy(coreMat.color).lerp(target, 0.15);
      coreMat.color.copy(tmp);
      coreMat.emissive.copy(tmp);
      coreMat.emissiveIntensity = a ? 1.1 : 0.65 + Math.sin(t * 3) * 0.1;
      shellMat.color.copy(tmp);
      ringMat.color.copy(tmp);
      key.color.copy(tmp);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      coreGeo.dispose();
      shellGeo.dispose();
      eyeGeo.dispose();
      ringGeo.dispose();
      coreMat.dispose();
      shellMat.dispose();
      eyeMat.dispose();
      ringMat.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [color, size]);

  return <div ref={mountRef} style={{ width: size, height: size }} className="select-none" />;
}
