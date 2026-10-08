const API_BASE=(process.env.NEXT_PUBLIC_API_BASE_URL||"").replace(/\\/$/,"");
export async function api<T>(path:string,init:RequestInit={},token?:string):Promise<T>{
  const headers=new Headers(init.headers);
  if(!(init.body instanceof FormData)) headers.set("Content-Type","application/json");
  if(token) headers.set("Authorization","Bearer "+token);
  const r=await fetch(API_BASE+path,{...init,headers,cache:"no-store"});
  if(!r.ok) throw new Error(await r.text()||"Request failed: "+r.status);
  const body=await r.json();
  return (body?.data??body) as T;
}