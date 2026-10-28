import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
export async function database(t){
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB']});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
  for(const name of ['0000_quick_runaways.sql']){
    const sql=readFileSync(new URL('../../drizzle/'+name,import.meta.url),'utf8').replaceAll('--> statement-breakpoint','');
    for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
  }
  return db;
}
