/**
 * "Çıplak" sayfa bayrağının nitelik adı — sunucu ve istemci ortak (yönergesiz modül;
 * `'use client'` modülünden sabit içe aktarmak sunucuda değer değil istemci referansı verir).
 * Kullanım: lib/pwa/bare-chrome.ts (kanca) ve çevrimdışı sayfanın satır içi betiği.
 */
export const BARE_CHROME_ATTR = 'data-qx-bare';
