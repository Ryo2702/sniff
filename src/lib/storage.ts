import Dexie, { type Table } from 'dexie';
import { caseSchema, type CaseFile, entityId } from './model';
import { classify } from './classify';
export const db=new Dexie('sniff-cases') as Dexie&{cases:Table<CaseFile,string>};db.version(1).stores({cases:'id,updatedAt,name'});
export function validateCase(raw:unknown){const c=caseSchema.parse(raw);for(const s of c.snapshots){if(classify(s.target.value).kind!==s.target.kind)throw new Error('Invalid case target.');const entities=new Set(s.entities.map(e=>e.id));for(const e of s.entities){if(entityId(e.target)!==e.id||classify(e.target.value).kind!==e.target.kind)throw new Error('Invalid entity identifier.');}const findings=new Set(s.findings.map(f=>f.id));for(const e of s.relationships)if(!entities.has(e.from)||!entities.has(e.to)||!findings.has(e.findingId))throw new Error('Case has a relationship without evidence.');}return c;}
export function download(name:string,content:Blob|string){const url=URL.createObjectURL(typeof content==='string'?new Blob([content],{type:'application/json'}):content);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function exportCase(c:CaseFile){download(`sniff-${c.id}.json`,JSON.stringify(c,null,2));}
