import { analyze, findPath } from './analysis';
self.onmessage=e=>{try{self.postMessage({id:e.data.id,result:e.data.kind==='path'?findPath(e.data.edges,e.data.start,e.data.end,e.data.depth):analyze(e.data.caseFile)});}catch{self.postMessage({id:e.data.id,error:'Graph analysis failed.'});}};
