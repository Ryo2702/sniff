import { classify } from './classify';
import { entity, snapshotSchema, type Snapshot, type Target } from './model';
import { solana } from './providers/solana';
import { dex, publicPage } from './providers/dex';
import { type RpcName, type Update } from './providers/client';
export async function investigate(target:Target,signal:AbortSignal,update:Update,endpoint:RpcName,cursor?:string):Promise<Snapshot>{
 const t=classify(target.value);if(t.kind!==target.kind)throw new Error('Input classification changed. Check the identifier.');
 const r:Snapshot={target:t,root:entity(t,t.kind==='social'?'social':t.kind==='website'?'website':t.kind==='transaction'?'transaction':'unknown'),entities:[],relationships:[],findings:[],transfers:[],at:new Date().toISOString(),warnings:[],coverage:'No supported source established additional information.',page:cursor};
 // Sequential adapters share a snapshot; no concurrent mutation can overwrite token evidence.
 if(t.kind==='address'||t.kind==='transaction')await solana(r,signal,update,endpoint,cursor);
 if(t.kind!=='transaction'&&!cursor)await dex(r,signal,update);
 if(['website','social'].includes(t.kind))await publicPage(r,signal,update);
 signal.throwIfAborted();update({name:'Constructing investigation map',state:'loading'});
 r.entities=[...new Map([...r.entities,r.root].map(e=>[e.id,e])).values()];r.findings=[...new Map(r.findings.map(f=>[f.id,f])).values()];r.relationships=[...new Map(r.relationships.map(e=>[e.id,e])).values()];r.warnings=[...new Set(r.warnings)];const parsed=snapshotSchema.parse(r);update({name:'Constructing investigation map',state:'complete'});return parsed;
}
