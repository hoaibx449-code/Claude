// Upload a review version to the EXISTING Worker; never promote it to production.
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const web=dirname(fileURLToPath(import.meta.url));
for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])if(!process.env[key])throw new Error('Thiếu '+key);
if(process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME!=='web-demo')throw new Error('Chỉ chạy từ nhánh web-demo.');
execFileSync('node',[join(web,'build.mjs')],{stdio:'inherit'});
const cli=join(web,'../node_modules/wrangler/bin/wrangler.js');
const output=execFileSync('node',[cli,'versions','upload','-c','wrangler.preview.jsonc','--preview-alias','web-demo','--message','Review web-demo '+(process.env.GITHUB_SHA||'local').slice(0,12)],{cwd:web,encoding:'utf8',stdio:['ignore','pipe','inherit']});
console.log(output);
const urls=[...new Set(output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\/?/g)||[])];
if(!urls.length)throw new Error('Upload chưa trả về link xem trước; không triển khai production.');
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Web demo\n\n'+urls.map(u=>'['+u+']('+u+'/faciup-live)').join('\n\n')+'\n\nChỉ xem trước. Không gộp nhánh, không cập nhật traffic production.\n');
