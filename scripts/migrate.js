import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const url=process.env.DATABASE_URL;
if(!url){console.error("DATABASE_URL is required.");process.exit(1);}

const dir=fileURLToPath(new URL("../db/migrations/",import.meta.url));
const files=readdirSync(dir).filter(x=>x.endsWith(".sql")).sort();
const ledger="app_schema_migration";

function psql(args,options={}){
  return execFileSync("psql",[url,"-X","-v","ON_ERROR_STOP=1",...args],{stdio:"inherit",...options});
}

psql(["-c",`create table if not exists ${ledger} (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
)`]);

for(const filename of files){
  const path=join(dir,filename);
  const sql=readFileSync(path,"utf8");
  const checksum=createHash("sha256").update(sql).digest("hex");
  const existing=execFileSync("psql",[url,"-X","-A","-t","-q","-v","ON_ERROR_STOP=1","-c",
    `select checksum from ${ledger} where filename='${filename.replace(/'/g,"''")}'`],{encoding:"utf8"}).trim();

  if(existing){
    if(existing!==checksum){
      throw new Error(`Applied migration ${filename} has changed. Add a new migration instead of editing historical SQL.`);
    }
    console.log("Already applied",filename);
    continue;
  }

  console.log("Applying",filename);
  // Execute the migration and its ledger write in one transaction. A failed migration
  // rolls back both schema changes and the history entry, so retries are safe.
  const record=`insert into ${ledger}(filename,checksum) values ('${filename.replace(/'/g,"''")}','${checksum}')`;
  psql(["-1","-c",`${sql}\n\n${record};`]);
}
