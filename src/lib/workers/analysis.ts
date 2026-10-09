import { type CaseFile, type Entity, type Finding, type Relationship, type Transfer, domain } from '../model';
export interface Analysis {entities:Entity[];relationships:Relationship[];findings:Finding[];transfers:Transfer[];positions:Record<string,{x:number;y:number}>;shared:{key:string;label:string;entities:string[];projects:string[];findingIds:string[]}[];}
export function analyze(c:CaseFile):Analysis{
 const entities=new Map<string,Entity>(),findings=new Map<string,Finding>(),relationships=new Map<string,Relationship>(),transfers=new Map<string,Transfer>();
 for(const s of c.snapshots){for(const e of s.entities){const old=entities.get(e.id);entities.set(e.id,old?.verified&&!e.verified?old:old&&e.label===e.value&&old.label!==old.value?{...e,label:old.label}:e);}for(const f of s.findings)findings.set(f.id,f);for(const e of s.relationships)relationships.set(e.id,e);for(const t of s.transfers)transfers.set(t.id,t);}
 const positions:Analysis['positions']={};const root=c.snapshots[0]?.root.id;const levels=new Map<string,number>();if(root)levels.set(root,0);const queue=root?[root]:[];
 const adjacency=new Map<string,Set<string>>();for(const e of relationships.values()){if(!adjacency.has(e.from))adjacency.set(e.from,new Set());if(!adjacency.has(e.to))adjacency.set(e.to,new Set());adjacency.get(e.from)!.add(e.to);adjacency.get(e.to)!.add(e.from);}
 for(let index=0;index<queue.length;index++){const id=queue[index];for(const n of adjacency.get(id)??[]){if(!levels.has(n)){levels.set(n,(levels.get(id)??0)+1);queue.push(n);}}}
 const rows=new Map<number,number>();for(const e of entities.values()){const level=levels.get(e.id)??0;const row=rows.get(level)??0;rows.set(level,row+1);positions[e.id]=c.positions[e.id]??{x:level*310,y:row*130};}
 const associations=new Map<string,{label:string;entities:Set<string>;projects:Set<string>;findingIds:Set<string>}>();
 for(const s of c.snapshots){if(s.root.kind!=='token')continue;const observations=s.relationships.filter(e=>e.from===s.root.id);for(const e of observations){const target=entities.get(e.to),f=findings.get(e.findingId);if(!target||!f||!['onchain','metadata'].includes(f.source.strength))continue;
  const key=target.kind==='website'?`domain:${domain(target.value)}`:target.id;const group=associations.get(key)??{label:target.kind==='website'?domain(target.value):target.label,entities:new Set(),projects:new Set(),findingIds:new Set()};group.entities.add(target.id);group.projects.add(s.root.id);group.findingIds.add(e.findingId);associations.set(key,group);
 }}
 const shared=[...associations.entries()].filter(([,a])=>a.projects.size>1).map(([key,a])=>({key,label:a.label,entities:[...a.entities],projects:[...a.projects],findingIds:[...a.findingIds]}));
 return {entities:[...entities.values()],findings:[...findings.values()],relationships:[...relationships.values()],transfers:[...transfers.values()],positions,shared};
}
export function findPath(edges:Pick<Relationship,'from'|'to'|'id'|'type'>[],start:string,end:string,depth:number){
 if(start===end)return [] as string[];const queue:{node:string;path:string[]}[]=[{node:start,path:[]}];const visited=new Set([start]);
 for(let i=0;i<queue.length;i++){const current=queue[i];if(current.path.length>=Math.min(4,Math.max(1,depth)))continue;for(const e of edges){if(!['funding','transfer'].includes(e.type)||e.from!==current.node)continue;const path=[...current.path,e.id];if(e.to===end)return path;if(!visited.has(e.to)){visited.add(e.to);queue.push({node:e.to,path});}}}return null;
}
