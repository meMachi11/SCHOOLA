import { env } from 'cloudflare:workers';
export const db=()=>{if(!env.DB)throw new Error('Database unavailable');return env.DB};
export const bucket=()=>{if(!env.BUCKET)throw new Error('Storage unavailable');return env.BUCKET};
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin && origin!==new URL(req.url).origin)throw new Error('Invalid origin');}
export function fail(e:unknown){console.error(e);return Response.json({error:'Le service est indisponible. Réessayez.'},{status:503});}
