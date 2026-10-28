import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGenerationPolicy} from './generation-policy.mjs';
test('native generation fields override defaults without changing model, tools or budgets',()=>{
 const config={provider:'p',model:'m',temperature:1,reasoningEffort:'high',maxTokens:2048,tools:['query'],signal:{}};
 const policy={entries:{'["p","m"]':{temperature:0,maxTokens:4096,reasoningEffort:'low'}}};
 const result=applyGenerationPolicy(config,policy);
 assert.deepEqual(result,{...config,temperature:0,maxTokens:4096,reasoningEffort:'low'});
 assert.equal(result.tools,config.tools);assert.equal(result.signal,config.signal);
 assert.equal(config.maxTokens,2048);
});
test('unconfigured models retain the previous cap and nullable fields use native defaults',()=>{
 assert.equal(applyGenerationPolicy({provider:'other',model:'m',maxTokens:8192}).maxTokens,2048);
 assert.equal(applyGenerationPolicy({maxTokens:512}).maxTokens,512);
 const result=applyGenerationPolicy({provider:'p',model:'m',temperature:1,reasoningEffort:'high'},{entries:{'["p","m"]':{temperature:null,maxTokens:128,reasoningEffort:null}}});
 assert.equal(result.maxTokens,128);assert.equal('temperature' in result,false);assert.equal('reasoningEffort' in result,false);
});
