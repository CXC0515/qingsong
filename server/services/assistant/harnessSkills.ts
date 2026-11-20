import {z} from 'zod';
import {createRequire} from 'node:module';
import path from 'node:path';
const yaml=createRequire(path.join(process.cwd(),'agent/package.json'))('yaml');
const safePath=z.string().min(1).max(240).refine(p=>!p.startsWith('/')&&!p.includes('\\')&&p.split('/').every(s=>s!=='.'&&s!=='..'&&s.trim()===s&&s.length>0&&!/[\x00-\x1f]/.test(s)),'文件路径无效');
const file=z.object({id:z.string().min(1).max(240),name:safePath,kind:z.enum(['markdown','json']),content:z.string().max(100000)}).strict();
export const librarySchema=z.array(z.object({id:z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),name:z.string().trim().min(1).max(100),description:z.string().max(1000),archived:z.boolean().optional(),files:z.array(file).min(1).max(100),emptyFolders:z.array(safePath).max(100)}).strict()).min(1).max(50).superRefine((skills,ctx)=>{
 const ids=new Set<string>(),fileIds=new Set<string>();
 for(const s of skills){
  const issue=(message:string)=>ctx.addIssue({code:'custom',message});
  if(ids.has(s.id))issue('Skill 编号重复');ids.add(s.id);
  const paths=new Set<string>();
  for(const f of s.files){if(paths.has(f.name)||fileIds.has(f.id))issue('文件重复');paths.add(f.name);fileIds.add(f.id);}
  for(const d of s.emptyFolders)if(paths.has(d))issue('文件与目录重名');
  for(const p of [...paths,...s.emptyFolders]){const parts=p.split('/');parts.pop();while(parts.length){if(paths.has(parts.join('/')))issue('文件不可作为目录');parts.pop();}}
  if(new Set(s.emptyFolders).size!==s.emptyFolders.length)issue('文件夹重复');
  const entry=s.files.find(f=>f.name==='SKILL.md');if(!entry){issue('缺少根目录 SKILL.md');continue;}
  try{const header=yaml.parse(entry.content.match(/^---\n([\s\S]*?)\n---\n/)?.[1]??'');if(!header||typeof header.name!=='string'||!header.name.trim()||typeof header.description!=='string'||!header.description.trim())issue('SKILL.md 需要 name 和 description');}catch{issue('SKILL.md 头信息无效');}
 }
});
export type HarnessSkill=z.infer<typeof librarySchema>[number];
