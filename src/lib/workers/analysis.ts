import { type CaseFile, type Entity, type Finding, type Relationship, type Transfer, domain } from '../model';
export interface Analysis {entities:Entity[];relationships:Relationship[];findings:Finding[];transfers:Transfer[];positions:Record<string,{x:number;y:number}>;shared:{key:string;label:string;kind:Entity['kind'];entities:string[];projects:string[];findingIds:string[]}[];}
export function analyze(c:CaseFile):Analysis{
 const entities=new Map<string,Entity>(),findings=new Map<string,Finding>(),relationships=new Map<string,Relationship>(),transfers=new Map<string,Transfer>();
 for(const s of c.snapshots){for(const e of s.entities){const old=entities.get(e.id);entities.set(e.id,old?.verified&&!e.verified?old:old&&e.label===e.value&&old.label!==old.value?{...e,label:old.label}:e);}for(const f of s.findings)findings.set(f.id,f);for(const e of s.relationships)relationships.set(e.id,e);for(const t of s.transfers)transfers.set(t.id,t);}
 const positions:Analysis['positions']={};const root=c.snapshots[0]?.root.id;const levels=new Map<string,number>();if(root)levels.set(root,0);const queue=root?[root]:[];
 const adjacency=new Map<string,Set<string>>();for(const e of relationships.values()){if(!adjacency.has(e.from))adjacency.set(e.from,new Set());if(!adjacency.has(e.to))adjacency.set(e.to,new Set());adjacency.get(e.from)!.add(e.to);adjacency.get(e.to)!.add(e.from);}
 for(let index=0;index<queue.length;index++){const id=queue[index];for(const n of adjacency.get(id)??[]){if(!levels.has(n)){levels.set(n,(levels.get(id)??0)+1);queue.push(n);}}}
 const rows=new Map<number,number>();for(const e of entities.values()){const level=levels.get(e.id)??0;const row=rows.get(level)??0;rows.set(level,row+1);positions[e.id]=c.positions[e.id]??{x:level*310,y:row*130};}
 const associations=new Map<string,{label:string;kind:Entity['kind'];entities:Set<string>;projects:Set<string>;findingIds:Set<string>}>();
 const addAssociation=(key:string,label:string,kind:Entity['kind'],entityId:string,projectId:string,findingId:string)=>{const group=associations.get(key)??{label,kind,entities:new Set(),projects:new Set(),findingIds:new Set()};group.entities.add(entityId);group.projects.add(projectId);group.findingIds.add(findingId);associations.set(key,group);};
 for(const s of c.snapshots){if(s.root.kind!=='token')continue;const observations=s.relationships.filter(e=>e.from===s.root.id);for(const e of observations){const target=entities.get(e.to),f=findings.get(e.findingId);if(!target||!f||!['onchain','metadata'].includes(f.source.strength))continue;
  const key=target.kind==='website'?`domain:${domain(target.value)}`:target.id;addAssociation(key,target.kind==='website'?domain(target.value):target.label,target.kind,target.id,s.root.id,e.findingId);
 }
  const owners=new Map<string,{entity:Entity;findingId:string}>();
  for(const relation of s.relationships.filter(e=>e.type==='holding')){const owner=entities.get(relation.from),account=entities.get(relation.to);if(owner?.kind==='wallet'&&account?.kind==='tokenAccount')owners.set(account.id,{entity:owner,findingId:relation.findingId});}
  for(const relation of observations.filter(e=>e.type==='holding')){const owner=owners.get(relation.to);if(owner)addAssociation(`wallet:${owner.entity.id}`,owner.entity.label,'wallet',owner.entity.id,s.root.id,owner.findingId);}
 }
 const shared=[...associations.entries()].filter(([,a])=>a.projects.size>1).map(([key,a])=>({key,label:a.label,kind:a.kind,entities:[...a.entities],projects:[...a.projects],findingIds:[...a.findingIds]}));
 return {entities:[...entities.values()],findings:[...findings.values()],relationships:[...relationships.values()],transfers:[...transfers.values()],positions,shared};
}
export function findPath(edges:Pick<Relationship,'from'|'to'|'id'|'type'>[],start:string,end:string,depth:number){
 if(start===end)return [] as string[];const queue:{node:string;path:string[]}[]=[{node:start,path:[]}];const visited=new Set([start]);
 for(let i=0;i<queue.length;i++){const current=queue[i];if(current.path.length>=Math.min(4,Math.max(1,depth)))continue;for(const e of edges){if(!['funding','transfer'].includes(e.type)||e.from!==current.node)continue;const path=[...current.path,e.id];if(e.to===end)return path;if(!visited.has(e.to)){visited.add(e.to);queue.push({node:e.to,path});}}}return null;
}
