'use client';

import { useEffect, useRef } from 'react';
import { Gift, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LEAGUE_EGG_THEME, LEAGUE_HEADER_THEME } from '@/lib/league-egg-themes';
import type { LeagueKey } from '@/lib/utils';

interface SurpriseEggThreeModalProps {
  open: boolean;
  title?: string;
  couponCode?: string | null;
  leagueKey?: LeagueKey;
  onClose: () => void;
}

const LEAGUE_DISPLAY_NAMES: Record<LeagueKey, string> = {
  BASLANGIC: 'Başlangıç',
  KOR: 'Kor',
  VEYRA: 'Veyra',
  SAVASCI: 'Savaşçı',
  ETERON: 'Eteron',
  VETRA: 'Vetra',
  ZENOR: 'Zenor',
};

export function SurpriseEggThreeModal({
  open,
  title = 'Sürpriz Ödül Açıldı!',
  couponCode,
  leagueKey = 'ZENOR',
  onClose,
}: SurpriseEggThreeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const headerGradient = LEAGUE_HEADER_THEME[leagueKey];

  useEffect(() => {
    if (!open || !canvasRef.current) return;

    let disposed = false;
    let frameId = 0;

    async function runScene() {
      const THREE = await import('three');
      if (disposed || !canvasRef.current) return;
      const theme = LEAGUE_EGG_THEME[leagueKey];
      const toHex = (color: string) => new THREE.Color(color).getHex();

      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
      camera.position.set(0, 1.05, 7.8);
      camera.lookAt(0, 0.65, 0);

      const ambient = new THREE.HemisphereLight(toHex(theme.shellLight), toHex(theme.bg), 0.9);
      const keyLight = new THREE.SpotLight(toHex(theme.shellLight), 3.8, 40, Math.PI / 6, 0.4);
      keyLight.position.set(3.2, 6.2, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      const rimLight = new THREE.PointLight(toHex(theme.glowPrimary), 2.2, 28);
      rimLight.position.set(-4.6, 2.2, -2.5);
      const fillLight = new THREE.PointLight(toHex(theme.glowSecondary), 1.2, 24);
      fillLight.position.set(2.8, 1.8, -3.2);
      scene.add(ambient, keyLight, rimLight, fillLight);

      const bgSphere = new THREE.Mesh(
        new THREE.SphereGeometry(26, 32, 32),
        new THREE.MeshBasicMaterial({ color: toHex(theme.bg), side: THREE.BackSide })
      );
      scene.add(bgSphere);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(3.8, 64),
        new THREE.MeshPhysicalMaterial({
          color: toHex(theme.bg),
          roughness: 0.35,
          metalness: 0.15,
          clearcoat: 0.8,
          clearcoatRoughness: 0.25,
          transparent: true,
          opacity: 0.95,
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.38;
      floor.receiveShadow = true;
      scene.add(floor);

      const makeEggTexture = () => {
        const texCanvas = document.createElement('canvas');
        texCanvas.width = 1024;
        texCanvas.height = 1024;
        const ctx = texCanvas.getContext('2d');
        if (!ctx) return null;
        const gradient = ctx.createRadialGradient(450, 360, 120, 520, 520, 550);
        gradient.addColorStop(0, theme.shellLight);
        gradient.addColorStop(0.45, theme.shellMid);
        gradient.addColorStop(1, theme.shellDark);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, texCanvas.width, texCanvas.height);

        for (let i = 0; i < 120; i++) {
          const x = Math.random() * texCanvas.width;
          const y = Math.random() * texCanvas.height;
          const r = 4 + Math.random() * 20;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + Math.random() * 0.15})`;
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        const texture = new THREE.CanvasTexture(texCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
      };

      const eggTexture = makeEggTexture();

      const eggMaterial = new THREE.MeshPhysicalMaterial({
        color: toHex(theme.shellMid),
        map: eggTexture || undefined,
        roughness: 0.3,
        metalness: 0.03,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        sheen: 0.5,
        sheenColor: new THREE.Color(0xffe5f0),
      });

      const topShellGeom = new THREE.SphereGeometry(1, 48, 48, 0, Math.PI * 2, 0, Math.PI / 2);
      const bottomShellGeom = new THREE.SphereGeometry(1, 48, 48, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      const topShell = new THREE.Mesh(topShellGeom, eggMaterial);
      const bottomShell = new THREE.Mesh(bottomShellGeom, eggMaterial);
      topShell.position.y = 0.52;
      bottomShell.position.y = -0.48;
      topShell.scale.set(1.05, 1.34, 1.05);
      bottomShell.scale.set(1.05, 1.34, 1.05);
      topShell.castShadow = true;
      bottomShell.castShadow = true;
      bottomShell.receiveShadow = true;

      const crackRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.06, 0.028, 24, 96),
        new THREE.MeshStandardMaterial({
          color: toHex(theme.shellLight),
          emissive: toHex(theme.glowPrimary),
          emissiveIntensity: 0,
          transparent: true,
          opacity: 0.85,
        })
      );
      crackRing.rotation.x = Math.PI / 2;
      crackRing.position.y = 0.04;
      scene.add(crackRing);

      const coreLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 24, 24),
        new THREE.MeshBasicMaterial({ color: toHex(theme.shellLight) })
      );
      coreLight.position.set(0, 0.05, 0);
      coreLight.visible = false;
      const corePoint = new THREE.PointLight(toHex(theme.glowPrimary), 0, 25, 2);
      corePoint.position.set(0, 0.05, 0);
      scene.add(corePoint);

      const dragonGroup = new THREE.Group();
      dragonGroup.visible = false;
      const dragonMaterial = new THREE.MeshStandardMaterial({
        color: toHex(theme.glowPrimary),
        roughness: 0.45,
        metalness: 0.18,
        emissive: toHex(theme.bg),
        emissiveIntensity: 0.55,
      });
      const dragonAccent = new THREE.MeshStandardMaterial({
        color: toHex(theme.glowSecondary),
        roughness: 0.36,
        metalness: 0.1,
        emissive: toHex(theme.bg),
        emissiveIntensity: 0.3,
      });

      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.05, 8, 18), dragonMaterial);
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 16), dragonMaterial);
      neck.position.set(0.52, 0.24, 0);
      neck.rotation.z = -Math.PI / 4;
      neck.castShadow = true;

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), dragonMaterial);
      head.position.set(0.74, 0.42, 0);
      head.scale.set(1.1, 0.85, 0.95);
      head.castShadow = true;

      const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 14), dragonAccent);
      jaw.rotation.z = -Math.PI / 2;
      jaw.position.set(0.95, 0.34, 0);
      jaw.scale.set(1, 0.42, 0.65);

      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 10), dragonAccent);
      hornL.position.set(0.68, 0.62, -0.1);
      hornL.rotation.z = -0.38;
      const hornR = hornL.clone();
      hornR.position.z = 0.1;

      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      eyeL.position.set(0.84, 0.45, -0.1);
      const eyeR = eyeL.clone();
      eyeR.position.z = 0.1;

      const wingGeometry = new THREE.PlaneGeometry(0.98, 0.48, 2, 2);
      const wingMaterial = new THREE.MeshStandardMaterial({
        color: toHex(theme.glowSecondary),
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        emissive: toHex(theme.bg),
        emissiveIntensity: 0.4,
      });
      const wingLeft = new THREE.Mesh(wingGeometry, wingMaterial);
      wingLeft.position.set(-0.02, 0.45, -0.36);
      wingLeft.rotation.y = Math.PI / 2.2;
      wingLeft.rotation.z = 0.26;
      wingLeft.castShadow = true;
      const wingRight = wingLeft.clone();
      wingRight.position.z = 0.36;
      wingRight.rotation.y = -Math.PI / 2.2;
      wingRight.rotation.z = -0.26;

      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.75, 14), dragonMaterial);
      tail.rotation.z = Math.PI / 2;
      tail.position.set(-0.72, 0.1, 0);
      tail.castShadow = true;

      const tailSpike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), dragonAccent);
      tailSpike.position.set(-1.02, 0.08, 0);
      tailSpike.rotation.z = Math.PI / 2;

      dragonGroup.add(body, neck, head, jaw, hornL, hornR, eyeL, eyeR, wingLeft, wingRight, tail, tailSpike);
      dragonGroup.scale.set(0.001, 0.001, 0.001);
      dragonGroup.position.set(0, -0.02, 0);

      const shardMaterial = new THREE.MeshPhysicalMaterial({
        color: toHex(theme.shellMid),
        roughness: 0.42,
        clearcoat: 0.95,
        clearcoatRoughness: 0.16,
      });
      const shards: Array<{
        mesh: InstanceType<typeof THREE.Mesh>;
        velocity: InstanceType<typeof THREE.Vector3>;
        spin: InstanceType<typeof THREE.Vector3>;
      }> = [];
      for (let i = 0; i < 26; i++) {
        const shard = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.06 + Math.random() * 0.05, 0),
          shardMaterial
        );
        shard.position.set(0, 0.15, 0);
        shard.visible = false;
        shard.castShadow = true;
        const angle = (i / 26) * Math.PI * 2;
        shards.push({
          mesh: shard,
          velocity: new THREE.Vector3(Math.cos(angle) * (0.01 + Math.random() * 0.03), 0.03 + Math.random() * 0.035, Math.sin(angle) * (0.01 + Math.random() * 0.03)),
          spin: new THREE.Vector3(Math.random() * 0.15, Math.random() * 0.14, Math.random() * 0.13),
        });
        scene.add(shard);
      }

      const particleCount = 150;
      const particleGeom = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      }
      particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particles = new THREE.Points(
        particleGeom,
        new THREE.PointsMaterial({ color: toHex(theme.glowSecondary), size: 0.042, transparent: true, opacity: 0.95 })
      );
      particles.visible = false;

      scene.add(topShell, bottomShell, coreLight, particles, dragonGroup);

      const clock = new THREE.Clock();

      function render() {
        if (disposed) return;
        const t = clock.getElapsedTime();

        bgSphere.rotation.y += 0.0008;

        const eggFloat = Math.sin(t * 2.1) * 0.045;
        const wobble = Math.sin(t * 4.3) * 0.035;
        bottomShell.position.y = -0.48 + eggFloat * 0.45;
        bottomShell.rotation.z = wobble * 0.1;
        crackRing.position.y = 0.04 + eggFloat * 0.2;

        camera.position.x = Math.sin(t * 0.35) * 0.36;
        camera.position.y = 1.05 + Math.sin(t * 0.55) * 0.08;
        camera.lookAt(0, 0.65, 0);

        if (t < 1.8) {
          topShell.position.y = 0.52 + eggFloat;
          topShell.rotation.z = Math.sin(t * 2.2) * 0.05;
          topShell.rotation.y = Math.sin(t * 1.4) * 0.03;
          crackRing.material.emissiveIntensity = 0;
          corePoint.intensity = 0;
        } else if (t < 2.8) {
          const crack = Math.min(1, (t - 1.8) / 1);
          topShell.position.y = 0.52 + crack * 1.7;
          topShell.rotation.z = crack * 0.52;
          topShell.rotation.y = crack * 0.48;
          crackRing.material.emissiveIntensity = 0.6 + crack * 1.6;
          coreLight.visible = true;
          coreLight.scale.setScalar(1 + crack * 2.4);
          corePoint.intensity = 2 + crack * 7;
          particles.visible = true;
          particles.rotation.y += 0.07;
          particles.rotation.x += 0.025;
        } else {
          topShell.visible = false;
          coreLight.visible = false;
          crackRing.visible = false;
          corePoint.intensity = 0;
          particles.visible = true;
          particles.rotation.y += 0.03;
          particles.position.y = 0.2 + Math.sin(t * 1.8) * 0.1;

          for (const shard of shards) {
            if (!shard.mesh.visible) shard.mesh.visible = true;
            shard.mesh.position.add(shard.velocity);
            shard.velocity.y -= 0.0015;
            shard.mesh.rotation.x += shard.spin.x;
            shard.mesh.rotation.y += shard.spin.y;
            shard.mesh.rotation.z += shard.spin.z;
          }

          dragonGroup.visible = true;

          const dragonT = Math.min(1, (t - 2.8) / 1.3);
          const dragonScale = 0.7 + dragonT * 0.8;
          dragonGroup.scale.setScalar(dragonScale);
          dragonGroup.position.x = Math.sin(t * 0.95) * 1.85;
          dragonGroup.position.y = 0.68 + Math.sin(t * 3.2) * 0.24;
          dragonGroup.position.z = Math.cos(t * 0.95) * 0.88;
          dragonGroup.rotation.y = Math.sin(t * 0.95 + Math.PI / 2);
          dragonGroup.rotation.z = Math.sin(t * 2.1) * 0.05;

          wingLeft.rotation.z = 0.26 + Math.sin(t * 13) * 0.62;
          wingRight.rotation.z = -0.26 - Math.sin(t * 13) * 0.62;
        }

        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(render);
      }

      function onResize() {
        if (!canvasRef.current) return;
        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      }

      window.addEventListener('resize', onResize);
      render();

      return () => {
        window.removeEventListener('resize', onResize);
        window.cancelAnimationFrame(frameId);
        renderer.dispose();
        eggTexture?.dispose();
        topShellGeom.dispose();
        bottomShellGeom.dispose();
        particleGeom.dispose();
        crackRing.geometry.dispose();
        crackRing.material.dispose();
        floor.geometry.dispose();
        floor.material.dispose();
        bgSphere.geometry.dispose();
        bgSphere.material.dispose();
        for (const shard of shards) {
          shard.mesh.geometry.dispose();
        }
        shardMaterial.dispose();
      };
    }

    let cleanup: (() => void) | undefined;
    runScene().then((disposeFn) => {
      cleanup = disposeFn;
    });

    return () => {
      disposed = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      cleanup?.();
    };
  }, [leagueKey, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className={`relative w-full max-w-4xl rounded-2xl border border-primary/35 bg-gradient-to-br ${headerGradient} p-4 sm:p-6`}>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 text-white/80 hover:text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="mb-3 text-center">
          <h3 className="text-xl sm:text-3xl font-bold text-white">{title}</h3>
          <p className="text-sm text-white/85 mt-1">
            {LEAGUE_DISPLAY_NAMES[leagueKey]} lig sürpriz kutusu açıldı. Ödülünüz hesabınıza tanımlandı.
          </p>
        </div>
        <div className="h-[360px] sm:h-[450px] rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/20 overflow-hidden">
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/25 bg-white/10 p-3">
            <p className="text-xs text-white/70">Odul statusu</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
              <Gift className="h-4 w-4 text-white/85" />
              Teslim edildi ve hesabina tanimlandi
            </p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
            <p className="text-xs text-white/70">Kupon kodu</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-primary" />
              {couponCode || 'Kod olusturuldu'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

