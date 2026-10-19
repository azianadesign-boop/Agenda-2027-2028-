import {sessionFor} from './api/_auth.js';

const PUBLIC = new Set(['/activation', '/activation.html', '/favicon.ico']);

export async function onRequest({request, env, next}) {
  const path = new URL(request.url).pathname;
  if (PUBLIC.has(path) || path.startsWith('/api/')) return next();
  if (!env.DB) return new Response('Base D1 non configurée.', {status: 503});
  const user = await sessionFor(request, env.DB);
  if (!user) return Response.redirect(new URL('/activation', request.url), 302);
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, {status: response.status, headers});
}
