import { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60000,gcTime:300000,refetchOnWindowFocus:false}}});
export const rpcEndpoints={'PublicNode':'https://solana-rpc.publicnode.com','Solana public RPC':'https://api.mainnet-beta.solana.com'};
export type RpcName=keyof typeof rpcEndpoints;
export interface Progress {name:string;state:'loading'|'complete'|'error';detail?:string;}
export type Update=(progress:Progress)=>void;
export async function request(url:string,signal:AbortSignal,body?:unknown):Promise<unknown>{
 try{const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.any([signal,AbortSignal.timeout(18000)]),credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw new Error(response.status===429?'Rate limit reached (HTTP 429). Wait before retrying.':`Provider returned HTTP ${response.status}.`);
 return await response.json();}catch(e){if(signal.aborted)throw new DOMException('Investigation cancelled','AbortError');if(e instanceof TypeError)throw new Error('Browser request blocked or offline. The source may not allow cross-origin access (CORS).');throw e;}
}
export function cached<T>(key:unknown[],schema:z.ZodType<T>,signal:AbortSignal,fetcher:(signal:AbortSignal)=>Promise<unknown>):Promise<T>{return queryClient.fetchQuery({queryKey:['provider',...key],queryFn:async({signal:querySignal})=>schema.parse(await fetcher(AbortSignal.any([signal,querySignal])))});}
const rpcResponse=z.object({result:z.unknown().optional(),error:z.object({message:z.string(),code:z.number()}).optional()});
export async function rpc<T>(method:string,params:unknown[],schema:z.ZodType<T>,signal:AbortSignal,endpoint:RpcName):Promise<T>{return cached([endpoint,method,params],schema,signal,async(s)=>{const data=rpcResponse.parse(await request(rpcEndpoints[endpoint],s,{jsonrpc:'2.0',id:1,method,params}));if(data.error)throw new Error(data.error.code===429?'RPC rate limit reached. Wait before retrying.':data.error.message);return data.result;});}
export async function step<T>(name:string,update:Update,warnings:string[],signal:AbortSignal,fn:()=>Promise<T>):Promise<T|undefined>{update({name,state:'loading'});try{const data=await fn();update({name,state:'complete'});return data;}catch(e){if(signal.aborted)throw e;const detail=e instanceof z.ZodError?'Source response did not match the documented format.':e instanceof Error?e.message:'Source unavailable.';warnings.push(`${name}: ${detail}`);update({name,state:'error',detail});return undefined;}}
export const capabilities=[{name:'Solana RPC',methods:['account type','SOL balance','parsed transactions','token accounts','mint authorities','largest 20 token accounts'],limits:'Paginated recent history; no complete historical index or guaranteed deployer attribution.'},{name:'DEX Screener',methods:['token search','pools','market data','published website and social links'],limits:'Published links do not prove identity; search results must be selected by address.'}];
