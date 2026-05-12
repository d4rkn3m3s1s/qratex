'use client';

import { useEffect, useState } from 'react';
import { m, useSpring } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  format?: (n: number) => string;
}

export function AnimatedNumber({
  value,
  className = '',
  format = (n) => Math.round(n).toLocaleString('tr-TR'),
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const spring = useSpring(0, { stiffness: 75, damping: 25 });

  useEffect(() => {
    spring.set(0);
    const unsub = spring.on('change', (v) => setDisplay(value * v));
    spring.set(1);
    return () => unsub();
  }, [value, spring]);

  return (
    <m.span className={className} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
      {format(display)}
    </m.span>
  );
}
