import { useEffect } from 'react';
import { useApp } from '../stores/app';
import { analyze } from './workers/analysis';
export function useAnalysis(){
 const snapshots=useApp(s=>s.caseFile.snapshots);const positions=useApp(s=>s.caseFile.positions);
 useEffect(()=>{if(typeof Worker==='undefined'){useApp.setState({analysis:analyze(useApp.getState().caseFile)});return;}let worker:Worker;try{worker=new Worker(new URL('./workers/analysis.worker.ts',import.meta.url),{type:'module'});}catch{useApp.setState({analysis:analyze(useApp.getState().caseFile),notice:'Worker unavailable; bounded graph analysis ran locally.'});return;}worker.onmessage=e=>{if(e.data.result)useApp.setState({analysis:e.data.result});else useApp.setState({error:e.data.error});};worker.onerror=()=>{useApp.setState({analysis:analyze(useApp.getState().caseFile),notice:'Worker unavailable; bounded graph analysis ran locally.'});worker.terminate();};worker.postMessage({id:1,caseFile:useApp.getState().caseFile});return()=>worker.terminate();},[snapshots,positions]);
}
