import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import {createKeilahOnlineService} from '../../server/keilah-online-service.mjs';
export const KEILAH_MIGRATION=new URL('../../supabase/migrations/20261005204125_keilah_coop_rooms.sql',import.meta.url);
export const testEnv={VERCEL:'1',KEILAH_ONLINE_ENABLED:'true',CHALLENGE_ALLOWED_ORIGIN:'https://game.example',CHALLENGE_SUPABASE_URL:'https://jdsjvrynmnzoztfinlzi.supabase.co',CHALLENGE_SUPABASE_SECRET_KEY:'sb_secret_'+'localfixture'.repeat(4)};
export async function openKeilahDb(path){
 const db=new PGlite(path);
 const exists=(await db.query("SELECT to_regnamespace('keilah_coop') IS NOT NULL AS present")).rows[0].present;
 if(!exists){await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;');await db.exec(await fs.readFile(KEILAH_MIGRATION,'utf8'));}
 // All app queries use the same role as the production secret-key gateway.
 await db.exec('SET ROLE service_role');return db;
}
export async function invoke(db,action,input={},key='a'.repeat(64)){
 return (await db.query('SELECT public.keilah_coop_rpc($1,$2::jsonb,$3) AS result',[action,JSON.stringify({version:'keilah-1',...input}),key])).rows[0].result;
}
export function serviceFactory(db){return config=>createKeilahOnlineService({...config,fetchImpl:async(url,options)=>{
 if(url!==testEnv.CHALLENGE_SUPABASE_URL+'/rest/v1/rpc/keilah_coop_rpc')throw Error('Unexpected remote URL; local fixture refused');
 const args=JSON.parse(options.body);return Response.json(await invoke(db,args.p_action,args.p_input,args.p_client_key));
}});}
