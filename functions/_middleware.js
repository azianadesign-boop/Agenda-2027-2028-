import {sessionFor} from './api/_auth.js';
export async function onRequest({request,env,next}){
 const path=new URL(request.url).pathname;
 if(path==='/activation.html'||path.startsWith('/api/'))return next();
 if(!env.DB)return new Response('Base D1 non configurée.',{status:503});
 const user=await sessionFor(request,env.DB);
 if(!user)return Response.redirect(new URL('/activation.html',request.url),302);
 const response=await next();
 // Avoid shared caching of protected content.
 const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');
 return new Response(response.body,{status:response.status,headers});
}
