/**
 * Inngest client (P2-20).
 * Set INNGEST_EVENT_KEY to enable event sending; serve works without it.
 */
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'qratex',
  isDev: process.env.NODE_ENV === 'development',
});
