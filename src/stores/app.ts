import { create } from 'zustand';
import { classify } from '../lib/classify';
import { type CaseFile, type Scene, type Target, type Snapshot, type Entity } from '../lib/model';
import { investigate } from '../lib/engine';
import { type Progress, type RpcName, queryClient } from '../lib/providers/client';
import { db, validateCase } from '../lib/storage';
import { type Analysis } from '../lib/workers/analysis';
const emptyAnalysis:Analysis={entities:[],relationships:[],findings:[],transfers:[],positions:{},shared:[]};
export const newCase=():CaseFile=>({version:1,id:crypto.randomUUID(),name:'Untitled investigation',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),snapshots:[],pins:[],notes:{},positions:{},scene:'lab',filters:{}});
interface AppState {
 caseFile:CaseFile;analysis:Analysis;scene:Scene;selected:string;input:string;busy:boolean;error:string;notice:string;progress:Progress[];historyOpen:boolean;commandOpen:boolean;provider:RpcName;imported:boolean;saveStatus:string;status:'idle'|'sniffing'|'found'|'empty'|'error';
 navigate:(scene:Scene)=>void;run:(value:string,options?:{cursor?:string;stay?:boolean})=>Promise<Snapshot|undefined>;cancel:()=>void;select:(id:string)=>void;follow:(e:Entity)=>void;pin:(id:string)=>void;note:(id:string,text:string,group:string)=>void;setFilter:(key:string,value:string)=>void;setPositions:(positions:CaseFile['positions'])=>void;fresh:()=>void;open:(c:CaseFile,imported?:boolean)=>void;rename:(name:string)=>void;
}
let controller:AbortController|undefined;let generation=0;
export const useApp=create<AppState>((set,get)=>({caseFile:newCase(),analysis:emptyAnalysis,scene:'lab',selected:'',input:'',busy:false,error:'',notice:'',progress:[],historyOpen:false,commandOpen:false,provider:'Solana public RPC',imported:false,saveStatus:'Local only',status:'idle',
 navigate:scene=>set({scene,caseFile:{...get().caseFile,scene},error:''}),
 run:async(value,options={})=>{
  let target:Target;try{target=classify(value);}catch(e){set({error:e instanceof Error?e.message:'Invalid input',status:'error'});return;}
  if(get().caseFile.snapshots.length>=40){set({error:'This case reached its 40-page limit. Export it and start a new case.'});return;}
  controller?.abort();controller=new AbortController();const signal=controller.signal;const id=++generation;
  set({busy:true,status:'sniffing',error:'',notice:'',progress:[{name:'Validating identifier',state:'complete'}],input:value,...(!options.stay?{scene:'map' as Scene}: {})});
  try{const snapshot=await investigate(target,signal,p=>{if(id!==generation)return;set({progress:[...get().progress.filter(x=>x.name!==p.name),p]});},get().provider,options.cursor);if(id!==generation)return;
   const c=get().caseFile;const snapshots=c.snapshots.filter(s=>!(s.root.id===snapshot.root.id&&s.page===snapshot.page));snapshots.push(snapshot);
   const caseFile={...c,snapshots,selected:snapshot.root.id,name:c.snapshots.length?c.name:snapshot.root.label===snapshot.root.value?`Case ${snapshot.root.value.slice(0,10)}`:snapshot.root.label,scene:get().scene,updatedAt:new Date().toISOString()};
   set({caseFile,selected:snapshot.root.id,busy:false,status:snapshot.relationships.length?'found':snapshot.warnings.length&&!snapshot.findings.length?'error':'empty',notice:`${snapshot.relationships.length} documented connection${snapshot.relationships.length===1?'':'s'} loaded. ${snapshot.warnings.length?'Some sources are incomplete.':''}`});return snapshot;
  }catch(e){if(id!==generation)return;set({busy:false,status:signal.aborted?'idle':'error',error:signal.aborted?'Investigation paused. Completed evidence remains in this case.':e instanceof Error?e.message:'Investigation failed.'});}
 },
 cancel:()=>{controller?.abort();generation++;void queryClient.cancelQueries({queryKey:['provider']});set({busy:false,status:'idle',notice:'Expansion paused. Completed evidence is retained.'});},
 select:id=>set({selected:id,caseFile:{...get().caseFile,selected:id}}),
 follow:e=>{if(get().busy)return;void get().run(e.target.value,{stay:true});},
 pin:id=>{const c=get().caseFile;set({caseFile:{...c,pins:c.pins.includes(id)?c.pins.filter(x=>x!==id):[...c.pins,id]}});},
 note:(id,text,group)=>set({caseFile:{...get().caseFile,notes:{...get().caseFile.notes,[id]:{text:text.slice(0,5000),group:group.slice(0,100)}}}}),
 setFilter:(key,value)=>set({caseFile:{...get().caseFile,filters:{...get().caseFile.filters,[key]:value}}}),
 setPositions:positions=>set({caseFile:{...get().caseFile,positions}}),
 fresh:()=>{get().cancel();set({caseFile:newCase(),analysis:emptyAnalysis,scene:'lab',selected:'',input:'',error:'',notice:'',status:'idle',imported:false,progress:[]});},
 open:(raw,imported=false)=>{try{const c=validateCase(raw);get().cancel();const file=imported?{...c,id:crypto.randomUUID(),name:`Imported · ${c.name}`,updatedAt:new Date().toISOString()}:c;set({caseFile:file,scene:file.scene,selected:file.selected??file.snapshots.at(-1)?.root.id??'',input:'',error:'',notice:imported?'Imported evidence is a saved record, not freshly verified. Re-investigate entities to check current sources.':'Saved evidence reopened. Check observation timestamps.',historyOpen:false,imported,status:'idle',progress:[]});}catch(e){set({error:e instanceof Error?e.message:'Could not open this case.'});}},
 rename:name=>set({caseFile:{...get().caseFile,name:name.slice(0,200)}}),
}));
let saveTimer:ReturnType<typeof setTimeout>;
useApp.subscribe((state,previous)=>{if(state.caseFile===previous.caseFile||!state.caseFile.snapshots.length)return;clearTimeout(saveTimer);useApp.setState({saveStatus:'Saving…'});const file=state.caseFile;saveTimer=setTimeout(()=>{void db.cases.put({...file,updatedAt:new Date().toISOString()}).then(()=>{if(useApp.getState().caseFile.id===file.id)useApp.setState({saveStatus:'Saved locally'});}).catch(()=>useApp.setState({saveStatus:'Save failed',error:'Browser storage is unavailable or full. Export your case to retain the evidence.'}));},350);});
export function currentSnapshot(state:Pick<AppState,'caseFile'|'selected'>){return [...state.caseFile.snapshots].reverse().find(s=>s.root.id===state.selected)??state.caseFile.snapshots.at(-1);}
