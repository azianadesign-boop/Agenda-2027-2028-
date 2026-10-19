import {passwordHash,json,newSession} from './_auth.js';
export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:'Base D1 non configurée.'},503);
 let body;try{body=await request.json()}catch{return json({error:'Requête invalide.'},400)}
 const email=String(body.email||'').trim().toLowerCase(), password=String(body.password||'');
 if(email.length>254||password.length>128)return json({error:'Identifiants incorrects.'},401);
 const user=await env.DB.prepare('SELECT id,password_salt,password_hash FROM users WHERE email=?').bind(email).first();
 if(!user||await passwordHash(password,user.password_salt)!==user.password_hash)return json({error:'E-mail ou mot de passe incorrect.'},401);
 return json({ok:true},200,{'Set-Cookie':await newSession(env.DB,user.id)});
}
