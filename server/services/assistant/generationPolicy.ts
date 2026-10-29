import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { runtimeConfig } from '../../config/runtimeConfig';
import { models, configHome } from './assistantService';
import { readProviders } from '../../../agent/runtime.mjs';
import { defaultGenerationValues, generationFields, generationKey, type GenerationPolicy, type GenerationValues, type GenerationModel, type GenerationField, type GenerationCapability } from '../../../src/domain/generationPolicy';
export const generationPolicyPath = path.join(runtimeConfig.systemDirectory, 'assistant-generation-policy.json');
export class GenerationPolicyError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
export async function loadGenerationPolicy(): Promise<GenerationPolicy> {
  try {
    const policy = JSON.parse(await readFile(generationPolicyPath, 'utf8'));
    if (!Number.isSafeInteger(policy.revision) || policy.revision < 0 || !policy.entries || typeof policy.entries !== 'object' || Array.isArray(policy.entries)) throw Error('INVALID');
    for (const values of Object.values(policy.entries)) validateShape(values);
    return policy;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision:0, updatedAt:null, updatedBy:null, entries:{} };
    throw new GenerationPolicyError('GENERATION_POLICY_UNREADABLE', '生成配置无法读取，已有文件保留。请联系管理员检查，系统没有改用另一套默认配置。', 503);
  }
}
const supported = (limits?: { min:number; max:number; step:number }, options?:string[]): GenerationCapability => ({ supported:true, reason:'调用链已接通，模型供应商的实际效果仍需验收。', ...(limits?{limits}:{}), ...(options?{options}:{}) });
const unsupported = (reason:string): GenerationCapability => ({ supported:false, reason });
export function describeGenerationModel(provider:string, profile:any, model:any, policy:GenerationPolicy):GenerationModel {
  const protocol = profile.api ?? (provider === 'openai' ? 'openai-responses' : provider === 'anthropic' ? 'anthropic-messages' : 'unknown');
  const maxOutputTokens = Math.min(Number.isSafeInteger(model.maxTokens) && model.maxTokens > 0 ? model.maxTokens : profile.defaultMaxTokens ?? 2048, 32768);
  const reasoning = model.reasoningEfforts && typeof model.reasoningEfforts === 'object' ? Object.keys(model.reasoningEfforts).filter(level => ['minimal','low','medium','high','xhigh','max'].includes(level) && typeof model.reasoningEfforts[level] === 'string') : [];
  const sampling = !(model.compat?.supportsTemperature === false || profile.compat?.supportsTemperature === false);
  const capabilities:Record<GenerationField,GenerationCapability> = {
    temperature:sampling?supported({min:0,max:2,step:.1}):unsupported('当前模型配置明确不接受温度。'),
    maxTokens:supported({min:1,max:maxOutputTokens,step:1}),
    reasoningEffort:reasoning.length?supported(undefined,reasoning):unsupported(model.reasoningEfforts===false?'此模型已声明不支持推理强度。':'当前配置没有声明可选推理强度，不能伪造档位。'),
  };
  return {provider,id:model.id,name:model.name||model.id,protocol,maxOutputTokens,capabilities,values:policy.entries[generationKey(provider,model.id)]??{...defaultGenerationValues(),maxTokens:Math.min(2048,maxOutputTokens)}};
}
export async function generationAdminState() {
  await models();
  const [policy,providers] = await Promise.all([loadGenerationPolicy(),readProviders(configHome)]);
  return {policy,models:Object.entries(providers).flatMap(([provider,profile]:[string,any])=>(profile.models??[]).map((model:any)=>describeGenerationModel(provider,profile,model,policy)))};
}
function validateShape(value:any):asserts value is GenerationValues {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==generationFields.length || Object.keys(value).some(key=>!generationFields.includes(key as GenerationField))) throw new GenerationPolicyError('INVALID_GENERATION_VALUES','生成参数格式不正确，配置未保存，请刷新后重试。');
  for(const field of generationFields){const item=value[field];if(field==='reasoningEffort'){if(item!==null&&(typeof item!=='string'||item.length>40))throw new GenerationPolicyError('INVALID_GENERATION_VALUES','推理强度无效，配置未保存。');}else if(item!==null&&(typeof item!=='number'||!Number.isFinite(item)))throw new GenerationPolicyError('INVALID_GENERATION_VALUES','参数必须为有效数字，配置未保存。');}
  if(!Number.isSafeInteger(value.maxTokens)||value.maxTokens<1||value.maxTokens>32768)throw new GenerationPolicyError('INVALID_GENERATION_VALUES','最大输出Token必须是1至32768之间的整数，配置未保存。');
  if(value.temperature!==null&&(value.temperature<0||value.temperature>2))throw new GenerationPolicyError('INVALID_GENERATION_VALUES','温度应为0至2，配置未保存。');
}
let writing:Promise<unknown>=Promise.resolve();
export async function saveGenerationPolicy(input:any, actor:string) {
  const pending=writing.catch(()=>{}).then(async()=>{
    if(!input||Object.keys(input).some(key=>!['revision','provider','model','values'].includes(key))||!Number.isSafeInteger(input.revision)||typeof input.provider!=='string'||typeof input.model!=='string')throw new GenerationPolicyError('INVALID_GENERATION_REQUEST','保存请求不完整，配置未改变，请重新载入。');
    validateShape(input.values);
    const {policy,models}=await generationAdminState();
    if(policy.revision!==input.revision)throw new GenerationPolicyError('GENERATION_REVISION_CONFLICT','另一位管理员已更新配置，本次未覆盖。请重新载入后再保存。',409);
    const model=models.find(item=>item.provider===input.provider&&item.id===input.model);
    if(!model)throw new GenerationPolicyError('MODEL_NOT_AVAILABLE','此模型已经不可用，配置未保存，请重新选择。');
    for(const field of generationFields){const cap=model.capabilities[field],value=input.values[field];if(value!==null&&!cap.supported)throw new GenerationPolicyError('UNSUPPORTED_GENERATION_FIELD',`${field}当前不可配置，配置未保存。`);if(value!==null&&cap.limits&&(value<cap.limits.min||value>cap.limits.max))throw new GenerationPolicyError('GENERATION_RANGE','参数超出此模型允许范围，配置未保存。');if(field==='reasoningEffort'&&value!==null&&!cap.options?.includes(value))throw new GenerationPolicyError('GENERATION_REASONING','推理强度不在此模型支持的档位中，配置未保存。');}
    const key=generationKey(input.provider,input.model);
    if(JSON.stringify(policy.entries[key])===JSON.stringify(input.values))return {policy,models};
    const next={revision:policy.revision+1,updatedAt:new Date().toISOString(),updatedBy:actor,entries:{...policy.entries,[key]:input.values}};
    await mkdir(path.dirname(generationPolicyPath),{recursive:true,mode:0o700});
    // Keep one recoverable previous configuration, never credentials.
    if(policy.revision>0)await writeFile(generationPolicyPath+'.previous',JSON.stringify(policy),{mode:0o600});
    const temporary=generationPolicyPath+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(next),{mode:0o600});await rename(temporary,generationPolicyPath);
    return generationAdminState();
  });writing=pending;return pending;
}
export async function generationFingerprint(){return createHash('sha256').update(JSON.stringify(await loadGenerationPolicy())).digest('hex');}
