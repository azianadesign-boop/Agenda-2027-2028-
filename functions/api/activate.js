import {hash,passwordHash,randomHex,json,newSession} from './_auth.js';

function isMasterCode(code, env){
 const master=String(env.CODE_MAITRE||'').trim().toUpperCase();
 return master.length>=6 && code===master;
}

export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:'Base D1 non configurée.'},503);
 let body;try{body=await request.json()}catch{return json({error:'Requête invalide.'},400)}
 const code=String(body.code||'').trim().toUpperCase();
 const email=String(body.email||'').trim().toLowerCase();
 const password=String(body.password||'');
 const master=isMasterCode(code,env);
 if(!master&&!/^AG27-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code))return json({error:'Code invalide.'},400);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:'Adresse e-mail invalide.'},400);
 if(password.length<12||password.length>128)return json({error:'Mot de passe : 12 caractères minimum.'},400);
 const salt=randomHex(16), passHash=await passwordHash(password,salt), id=crypto.randomUUID(), now=Date.now();
 if(master){
  try{
   await env.DB.prepare('INSERT INTO users(id,email,password_salt,password_hash,created_at) VALUES(?,?,?,?,?)').bind(id,email,salt,passHash,now).run();
   return json({ok:true},200,{'Set-Cookie':await newSession(env.DB,id)});
  }catch(e){return json({error:'Cet e-mail est déjà enregistré : utilisez « Se connecter ».'},409)}
 }
 const codeHash=await hash(code);
 try{
  await env.DB.batch([
   env.DB.prepare('INSERT INTO users(id,email,password_salt,password_hash,created_at) VALUES(?,?,?,?,?)').bind(id,email,salt,passHash,now),
   env.DB.prepare('INSERT INTO redemptions(code_hash,user_id,activated_at) SELECT code_hash,?,? FROM codes WHERE code_hash=? AND activated_at IS NULL').bind(id,now,codeHash),
   env.DB.prepare('UPDATE codes SET activated_at=? WHERE code_hash=? AND activated_at IS NULL AND EXISTS (SELECT 1 FROM redemptions WHERE code_hash=? AND user_id=?)').bind(now,codeHash,codeHash,id)
  ]);
  const redeemed=await env.DB.prepare('SELECT user_id FROM redemptions WHERE code_hash=?').bind(codeHash).first();
  if(redeemed?.user_id!==id){await env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();return json({error:'Code inconnu ou déjà utilisé.'},403)}
  return json({ok:true},200,{'Set-Cookie':await newSession(env.DB,id)});
 }catch(e){return json({error:'Activation impossible : code déjà utilisé ou e-mail déjà enregistré.'},409)}
}
