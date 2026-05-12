'use client';

import dynamic from 'next/dynamic';

/** Root layout: ağır framer-motion + ikon yükünü ilk JS’ten ayırır. */
export const ChatbotLazy = dynamic(() => import('./chatbot').then((m) => m.Chatbot), {
  ssr: false,
  loading: () => null,
});
