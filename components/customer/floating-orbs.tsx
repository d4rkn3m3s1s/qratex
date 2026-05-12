'use client';

import { m } from 'framer-motion';

const ORBS = [
  { size: 120, x: '10%', y: '20%', color: 'rgba(139, 92, 246, 0.25)', delay: 0, duration: 12 },
  { size: 80, x: '85%', y: '15%', color: 'rgba(236, 72, 153, 0.2)', delay: 1, duration: 10 },
  { size: 100, x: '75%', y: '70%', color: 'rgba(59, 130, 246, 0.2)', delay: 2, duration: 14 },
  { size: 60, x: '15%', y: '60%', color: 'rgba(34, 197, 94, 0.15)', delay: 0.5, duration: 8 },
  { size: 90, x: '50%', y: '85%', color: 'rgba(251, 191, 36, 0.15)', delay: 1.5, duration: 11 },
];

export function FloatingOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {ORBS.map((orb, i) => (
        <m.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: orb.color,
            filter: 'blur(40px)',
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            delay: orb.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
