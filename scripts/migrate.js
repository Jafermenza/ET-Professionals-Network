import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
const url=process.env.DATABASE_URL;
if(!url){console.error("DATABASE_URL is required.");process.exit(1);}
const dir=new URL("../db/migrations/",import.meta.url);
for(const file of readdirSync(dir).filter(x=>x.endsWith(".sql")).sort()){
  console.log("Applying",file);
  execFileSync("psql",[url,"-v","ON_ERROR_STOP=1","-f",join(dir.pathname,file)],{stdio:"inherit"});
}
