import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      points: number;
      level: number;
      preferredLanguage?: 'tr' | 'en';
      dealerId?: string; // when role is STAFF, the employer dealer id
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    role: string;
    points: number;
    level: number;
    preferredLanguage?: 'tr' | 'en';
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    points: number;
    level: number;
    preferredLanguage?: 'tr' | 'en';
    dealerId?: string;
    jti?: string;
  }
}

