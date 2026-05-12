'use client';

import { useState, useEffect } from 'react';

/**
 * Returns true only after mount. Use to render decorative elements that use
 * Math.random() so server and client don't mismatch (hydration).
 */
export function useParticlesMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
