import { z } from 'zod';
const text=z.string().max(10000);
export const httpUrl=z.string().url().refine(v=>{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;},'Only HTTP(S) links are allowed');
export const targetSchema=z.object({kind:z.enum(['address','transaction','website','social','search']),value:z.string().min(1).max(2048)});
export type Target=z.infer<typeof targetSchema>;
export const entitySchema=z.object({id:z.string().max(2200),value:z.string().max(2048),kind:z.enum(['unknown','wallet','token','tokenAccount','program','authority','pool','transaction','website','social']),label:text,verified:z.boolean(),target:targetSchema});
export type Entity=z.infer<typeof entitySchema>;
export const strengthSchema=z.enum(['onchain','metadata','heuristic','insufficient']);
export type Strength=z.infer<typeof strengthSchema>;
export const sourceSchema=z.object({provider:text,url:httpUrl,at:z.string(),strength:strengthSchema,slot:z.number().optional()});
export const findingSchema=z.object({id:text,title:text,description:text,entityIds:z.array(z.string()),source:sourceSchema,category:z.enum(['identity','transfer','funding','holder','authority','deployment','metadata','interaction','candidate'])});
export type Finding=z.infer<typeof findingSchema>;
export const relationshipSchema=z.object({id:text,from:text,to:text,type:z.enum(['funding','transfer','holding','authority','pool','website','social','interaction','initialization']),findingId:text});
export type Relationship=z.infer<typeof relationshipSchema>;
export const transferSchema=z.object({id:text,from:z.string(),to:z.string(),raw:z.string().regex(/^\d+$/),decimals:z.number().int().min(0).max(255),asset:text,mint:z.string().optional(),signature:z.string(),timestamp:z.number().nullable(),findingId:text,source:sourceSchema});
export type Transfer=z.infer<typeof transferSchema>;
export const holderSchema=z.object({address:z.string(),owner:z.string().optional(),raw:z.string().regex(/^\d+$/),percent:z.number().finite(),findingId:text});
export const snapshotSchema=z.object({
 target:targetSchema,root:entitySchema,entities:z.array(entitySchema).max(500),relationships:z.array(relationshipSchema).max(2000),findings:z.array(findingSchema).max(2000),transfers:z.array(transferSchema).max(1000),
 at:z.string(),warnings:z.array(text),coverage:text,cursor:z.string().optional(),page:z.string().optional(),balance:z.string().optional(),
 token:z.object({name:text.optional(),symbol:text.optional(),supply:z.string().optional(),decimals:z.number().optional(),mintAuthority:z.string().nullable().optional(),freezeAuthority:z.string().nullable().optional(),price:z.string().optional(),liquidity:z.number().optional(),volume:z.number().optional(),marketCap:z.number().optional(),poolCreatedAt:z.number().optional(),holders:z.array(holderSchema),top10:z.number().nullable(),top20:z.number().nullable(),top50:z.number().nullable()}).optional(),
 holdings:z.array(z.object({mint:z.string(),account:z.string(),raw:z.string(),decimals:z.number()})).optional(),
});
export type Snapshot=z.infer<typeof snapshotSchema>;
export const scenes=['lab','map','wallet','token','trail','social','ocr','evidence'] as const;
export type Scene=typeof scenes[number];
export const caseSchema=z.object({version:z.literal(1),id:z.string().max(100),name:z.string().max(200),createdAt:z.string(),updatedAt:z.string(),snapshots:z.array(snapshotSchema).max(40),pins:z.array(z.string()).max(500),notes:z.record(z.string(),z.object({text:z.string().max(5000),group:z.string().max(100)})),positions:z.record(z.string(),z.object({x:z.number().finite(),y:z.number().finite()})),scene:z.enum(scenes),filters:z.record(z.string(),z.string().max(2048)),selected:z.string().optional()});
export type CaseFile=z.infer<typeof caseSchema>;
export const strengths:Record<Strength,string>={onchain:'Confirmed on-chain observation',metadata:'Verified public metadata link',heuristic:'Heuristic association',insufficient:'Insufficient information'};
export function entityId(t:Target){return t.kind==='website'||t.kind==='social'?`${t.kind}:${normalizeUrl(t.value)}`:`solana:${t.kind}:${t.value}`;}
export function entity(t:Target,kind:Entity['kind']='unknown',label=t.value,verified=false):Entity{return {id:entityId(t),value:t.value,target:t,kind,label,verified};}
export const addr=(value:string):Target=>({kind:'address',value});
export const short=(s:string,n=6)=>s.length>n*2+4?`${s.slice(0,n)}…${s.slice(-n)}`:s;
export function safeUrl(s:string){try{return httpUrl.parse(s);}catch{return undefined;}}
export function normalizeUrl(value:string){try{const u=new URL(value);u.hostname=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^twitter\.com$/,'x.com');u.hash='';u.search='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';if(u.hostname==='x.com')u.pathname=u.pathname.toLowerCase();u.protocol='https:';return u.href;}catch{return value;}}
export function domain(value:string){try{return new URL(normalizeUrl(value)).hostname;}catch{return value;}}
export function units(raw:string,decimals:number){if(!/^\d+$/.test(raw)||!Number.isInteger(decimals)||decimals<0||decimals>255)return 'Unavailable';const v=raw.padStart(decimals+1,'0');return decimals?`${v.slice(0,-decimals)}.${v.slice(-decimals).replace(/0+$/,'')}`.replace(/\.$/,''):v;}
export function percent(raw:string,supply:string){return BigInt(supply)>0n?Number(BigInt(raw)*1000000n/BigInt(supply))/10000:0;}
export function date(value:string|number|null|undefined){return value==null?'Time unavailable':new Date(value).toLocaleString();}
