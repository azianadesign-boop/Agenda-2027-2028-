import {hash,json} from './_auth.js';
export async function onRequestPost({request,env}){
 const m=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)agenda_session=([a-f0-9]{64})(?:;|$)/);
 if(m&&env.DB)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(m[1])).run();
 return json({ok:true},200,{'Set-Cookie':'agenda_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});
}
