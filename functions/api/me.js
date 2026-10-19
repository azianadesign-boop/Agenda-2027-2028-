import {sessionFor,json} from './_auth.js';
export async function onRequestGet({request,env}){if(!env.DB)return json({error:'Base D1 absente'},503);const u=await sessionFor(request,env.DB);return u?json({email:u.email,licensed:true,lifetime:true}):json({licensed:false},401)}
