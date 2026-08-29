import { Redis } from '@upstash/redis';

// Usa la REST API de Upstash — funciona sin conexión persistente,
// ideal para funciones serverless de Vercel.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
