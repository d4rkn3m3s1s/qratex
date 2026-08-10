'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * ADMIN GİZLİ KAPI — havalı/uzay temalı erişim ekranı. ADMIN rolü olan ama gizli soruyu
 * henüz cevaplamamış kullanıcıya çıkar. Doğru tek-rakam cevap → sunucu gate cookie set eder
 * → /admin'e geçilir. Yanlış → portal reddeder (shake + kırmızı flaş). Cevap istemciye gelmez;
 * sunucuda doğrulanır (/api/admin/gate).
 */
export default function AdminGatePage() {
  const [question, setQuestion] = useState<string>('');
  const [digit, setDigit] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'wrong' | 'ok'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Soruyu getir.
  useEffect(() => {
    fetch('/api/admin/gate')
      .then((r) => r.json())
      .then((d) => { if (d?.question) setQuestion(d.question); })
      .catch(() => setQuestion('Evrenin sırrını çöz.'));
    inputRef.current?.focus();
  }, []);

  // ── Yıldız alanı + nebula (canvas) — hafif, sonsuz kayan derin uzay ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = 0, h = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    type Star = { x: number; y: number; z: number; r: number; tw: number };
    let stars: Star[] = [];

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * DPR; canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = Math.min(220, Math.floor((w * h) / 6000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        z: Math.random() * 0.8 + 0.2, r: Math.random() * 1.4 + 0.2,
        tw: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const draw = () => {
      t += 0.006;
      ctx.clearRect(0, 0, w, h);
      // Nebula parıltısı (iki radial glow, yavaş nefes alır)
      const g1 = ctx.createRadialGradient(w * 0.3, h * 0.35, 0, w * 0.3, h * 0.35, w * 0.5);
      g1.addColorStop(0, `rgba(147,51,234,${0.10 + 0.04 * Math.sin(t)})`);
      g1.addColorStop(1, 'rgba(147,51,234,0)');
      ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h);
      const g2 = ctx.createRadialGradient(w * 0.72, h * 0.7, 0, w * 0.72, h * 0.7, w * 0.5);
      g2.addColorStop(0, `rgba(6,182,212,${0.08 + 0.04 * Math.cos(t * 1.3)})`);
      g2.addColorStop(1, 'rgba(6,182,212,0)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
      // Yıldızlar (parallax + twinkle)
      for (const s of stars) {
        s.y += s.z * 0.15; // yavaş aşağı akış
        if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
        const alpha = 0.5 + 0.5 * Math.sin(t * 3 + s.tw);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * s.z})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const submit = useCallback(async (value: string) => {
    if (status === 'checking' || status === 'ok') return;
    setStatus('checking');
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setStatus('ok');
        // Kısa "portal açılıyor" animasyonu sonrası hedefe git.
        const from = new URLSearchParams(window.location.search).get('from') || '/admin';
        setTimeout(() => { window.location.href = from.startsWith('/admin') ? from : '/admin'; }, 900);
      } else {
        setStatus('wrong');
        setErrorMsg(data?.error || 'Yanlış frekans.');
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setTimeout(() => { setDigit(''); setStatus('idle'); inputRef.current?.focus(); }, 700);
      }
    } catch {
      setStatus('wrong');
      setErrorMsg('Bağlantı hatası.');
      setTimeout(() => setStatus('idle'), 700);
    }
  }, [status]);

  // KAMUFLAJ: istediğin kadar harf/rakam yaz — ekranda görünmez, uzunluk sızmaz.
  // Gerçek cevap, yazdığın metindeki SON rakamdır (kamuflaj harfleri gönderilmez).
  const onCamouflage = (v: string) => {
    setDigit(v); // ham metni tut (görünmez); sadece nokta gösterilir
    if (status === 'wrong') setStatus('idle');
  };

  const trySubmit = () => {
    const lastDigit = (digit.match(/[0-9]/g) ?? []).slice(-1)[0] ?? '';
    if (lastDigit) submit(lastDigit);
    else {
      // Rakam yoksa yanlış gibi davran (ipucu verme — kamuflaj korunur).
      setStatus('wrong'); setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => { setDigit(''); setStatus('idle'); inputRef.current?.focus(); }, 700);
    }
  };

  const ringColor =
    status === 'ok' ? '#10b981' : status === 'wrong' ? '#ef4444' : '#a855f7';

  return (
    <div
      style={{ background: 'radial-gradient(ellipse at center, #0a0a1f 0%, #05050f 60%, #000 100%)' }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden text-white"
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* Merkez portal */}
      <div className={`relative z-10 flex flex-col items-center px-6 text-center ${shake ? 'animate-[gateShake_0.5s_ease-in-out]' : ''}`}>
        {/* Portal halkası */}
        <div className="relative mb-8 grid place-items-center">
          <div
            className="h-40 w-40 rounded-full transition-all duration-500"
            style={{
              background: `conic-gradient(from 0deg, ${ringColor}00, ${ringColor}cc, ${ringColor}00)`,
              filter: 'blur(2px)',
              animation: 'gateSpin 6s linear infinite',
            }}
          />
          <div
            className="absolute h-32 w-32 rounded-full border transition-all duration-500"
            style={{ borderColor: `${ringColor}55`, boxShadow: `0 0 60px ${ringColor}55, inset 0 0 40px ${ringColor}33` }}
          />
          <div className="absolute grid h-28 w-28 place-items-center rounded-full bg-black/40 backdrop-blur-sm">
            <span className="text-5xl transition-transform duration-500" style={{ filter: `drop-shadow(0 0 12px ${ringColor})` }}>
              {status === 'ok' ? '🌌' : status === 'wrong' ? '🚫' : '🛸'}
            </span>
          </div>
        </div>

        {/* Başlık */}
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.4em] text-purple-300/80">
          Boyutlar Arası Geçit
        </p>
        <h1 className="mb-1 text-2xl font-black sm:text-3xl">
          {status === 'ok' ? 'Geçit açılıyor…' : 'Erişim Doğrulaması'}
        </h1>

        {/* Soru */}
        <p className="mb-8 max-w-md text-base leading-relaxed text-white/70">
          {status === 'ok'
            ? 'Doğru frekansı buldun. Hoş geldin, kâşif. 🌠'
            : question || 'Sırra ulaşmak için evrenin şifresini çöz…'}
        </p>

        {/* Kamuflaj input — ne yazdığın ve KAÇ karakter yazdığın görünmez (hep sabit nokta) */}
        {status !== 'ok' && (
          <>
            <div className="relative">
              {/* Görünür katman: HEP 9 sabit nokta (uzunluk sızmaz). Yazılan metin bunun altında görünmez. */}
              <div
                onClick={() => inputRef.current?.focus()}
                className="flex h-20 w-[22rem] max-w-[85vw] cursor-text items-center justify-center gap-2.5 rounded-2xl bg-white/5 backdrop-blur-md transition-all"
                style={{
                  border: `2px solid ${ringColor}66`,
                  boxShadow: `0 0 30px ${ringColor}44, inset 0 0 20px ${ringColor}22`,
                }}
              >
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={i}
                    className="h-3 w-3 rounded-full transition-all duration-300"
                    style={{
                      background: digit.length ? `${ringColor}` : `${ringColor}44`,
                      boxShadow: digit.length ? `0 0 10px ${ringColor}` : 'none',
                      // Hafif "canlı" his: yazınca noktalar sırayla parlar ama SAYI hep 9 (uzunluk gizli)
                      opacity: digit.length ? 0.85 + 0.15 * Math.sin((i + digit.length) * 1.1) : 0.5,
                    }}
                  />
                ))}
              </div>
              {/* Gerçek input: tamamen görünmez (metin, caret, arka plan yok). İstediğin kadar yaz. */}
              <input
                ref={inputRef}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={digit}
                onChange={(e) => onCamouflage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); trySubmit(); } }}
                disabled={status === 'checking'}
                className="absolute inset-0 h-full w-full cursor-text rounded-2xl bg-transparent text-transparent caret-transparent outline-none"
                style={{ WebkitTextFillColor: 'transparent' }}
                aria-label="Gizli frekans"
                autoFocus
              />
              {status === 'checking' && (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/30">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                </div>
              )}
            </div>
            <button
              onClick={trySubmit}
              disabled={status === 'checking'}
              className="mt-5 rounded-full px-6 py-2.5 text-sm font-bold tracking-wide text-white transition-all hover:scale-105 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ringColor}, #e879f9)`, boxShadow: `0 0 24px ${ringColor}55` }}
            >
              Frekansı Gönder →
            </button>
            <p className="mt-4 text-xs text-white/40">İstediğini yaz — frekansı yalnızca içeri ait olanlar bilir</p>
            {status === 'wrong' && errorMsg && (
              <p className="mt-3 text-sm font-semibold text-red-400">{errorMsg}</p>
            )}
          </>
        )}
      </div>

      {/* Alt imza */}
      <p className="absolute bottom-6 z-10 text-[11px] tracking-widest text-white/25">
        QRATEX · GÜVENLİ GEÇİT PROTOKOLÜ
      </p>

      <style jsx global>{`
        @keyframes gateSpin { to { transform: rotate(360deg); } }
        @keyframes gateShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-7px); }
          80% { transform: translateX(7px); }
        }
      `}</style>
    </div>
  );
}
