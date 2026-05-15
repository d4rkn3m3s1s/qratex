import { getPublicAppOrigin } from '@/lib/public-app-origin';

describe('getPublicAppOrigin', () => {
  const saved = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  };

  afterEach(() => {
    if (saved.NEXTAUTH_URL !== undefined) process.env.NEXTAUTH_URL = saved.NEXTAUTH_URL;
    else delete process.env.NEXTAUTH_URL;
    if (saved.NEXT_PUBLIC_APP_URL !== undefined) process.env.NEXT_PUBLIC_APP_URL = saved.NEXT_PUBLIC_APP_URL;
    else delete process.env.NEXT_PUBLIC_APP_URL;
    if (saved.VERCEL_URL !== undefined) process.env.VERCEL_URL = saved.VERCEL_URL;
    else delete process.env.VERCEL_URL;
  });

  it('prefers NEXTAUTH_URL over others', () => {
    process.env.NEXTAUTH_URL = 'https://auth.example.com/';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    delete process.env.VERCEL_URL;
    expect(getPublicAppOrigin()).toBe('https://auth.example.com');
  });

  it('falls back to NEXT_PUBLIC_APP_URL', () => {
    delete process.env.NEXTAUTH_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';
    delete process.env.VERCEL_URL;
    expect(getPublicAppOrigin()).toBe('https://app.example.com');
  });

  it('falls back to https VERCEL_URL', () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = 'my-app.vercel.app';
    expect(getPublicAppOrigin()).toBe('https://my-app.vercel.app');
  });

  it('uses localhost when nothing is set', () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    expect(getPublicAppOrigin()).toBe('http://localhost:3000');
  });
});
