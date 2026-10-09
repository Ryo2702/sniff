import { type Target, normalizeUrl, safeUrl } from './model';
export function base58Bytes(s:string){let n=0n;for(const c of s){const i='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(c);if(i<0)return 0;n=n*58n+BigInt(i);}let bytes=0;while(n>0n){bytes++;n>>=8n;}return bytes+(s.match(/^1*/)?.[0].length??0);}
export function classify(input:string):Target{
 const value=input.trim();if(!value||value.length>2048)throw new Error('Enter an address, transaction, URL, X handle, or project name.');
 if(/^0x[\da-f]+$/i.test(value))throw new Error('This workspace supports Solana mainnet. EVM addresses are not supported.');
 const padreMarket=value.match(/^https?:\/\/trade\.padre\.gg\/trade\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:[\/?#]|$)/i);if(padreMarket&&base58Bytes(padreMarket[1])===32)return {kind:'address',value:padreMarket[1]};
 if(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)&&base58Bytes(value)===32)return {kind:'address',value};
 if(/^[1-9A-HJ-NP-Za-km-z]{85,88}$/.test(value)&&base58Bytes(value)===64)return {kind:'transaction',value};
 if(/^@[a-zA-Z0-9_]{1,15}$/.test(value))return {kind:'social',value:`https://x.com/${value.slice(1).toLowerCase()}`};
 const url=safeUrl(value.includes('://')?value:`https://${value}`);
 if(url&&(value.includes('://')||/^[\w-]+(?:\.[\w-]+)+(?:\/.*)?$/.test(value))){const u=new URL(url);if(!u.hostname.includes('.')||u.port||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.endsWith('.local'))throw new Error('Use a public website domain.');return {kind:['x.com','twitter.com','www.x.com','www.twitter.com'].includes(u.hostname)?'social':'website',value:normalizeUrl(url)};}
 if(/^[a-z]+:\/\//i.test(value)||/^[^\s]{32,}$/.test(value))throw new Error('That identifier is not a valid Solana address or transaction. Check for OCR errors.');
 return {kind:'search',value};
}
export function extractCandidates(text:string):Target[]{const matches=text.match(/https?:\/\/[^\s<>"')]+|\b[1-9A-HJ-NP-Za-km-z]{85,88}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b|@[a-zA-Z0-9_]{1,15}\b|\b(?:[a-zA-Z0-9-]+\.)+(?:com|org|io|xyz|finance|fun|net|app)\b(?:\/[^\s<>"')]*)?|\$[A-Z][A-Z0-9]{1,14}\b/g)??[];const results=new Map<string,Target>();for(const m of matches){try{const t=classify(m.replace(/[.,;]+$/,''));results.set(t.value,t);}catch{/* Invalid OCR strings remain editable in the extracted text. */}}return [...results.values()].slice(0,40);}
