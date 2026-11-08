import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {apply,skillManifest,skillManifests} from './official-skills.mjs';
import {apply as applyTeaching} from './official-teaching.mjs';
test('published Skills have fixed provider entries, dependency-checked, versioned, and abortable',async()=>{
 let provider;apply({skills:{registerProvider:create=>{provider=create({});}}});
 let types=skillManifest.requires;
 const skillNodes=skillManifests.map(manifest=>({id:'skill:'+manifest.name,kind:'skill',enabled:true,hash:manifest.sha256,content:`---\nname: ${manifest.name}\ndescription: fixture\nversion: 1.0.0\n---\nqingsong_search`}));
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(req.headers.authorization,'Bearer fixture-only');res.setHeader('content-type','application/json');res.end(JSON.stringify(input.kind==='dsh-prompts'?{nodes:skillNodes}:{data:{objects:types.map(type=>({type}))}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const oldEndpoint=process.env.QS_TOOL_ENDPOINT,oldToken=process.env.QS_TOOL_TOKEN;
 process.env.QS_TOOL_ENDPOINT='http://127.0.0.1:'+server.address().port;process.env.QS_TOOL_TOKEN='fixture-only';
 try{
  const rows=await provider.list({});assert.equal(rows.length,5);assert.deepEqual(rows.map(r=>r.name),skillManifests.map(m=>m.name));assert.equal(rows[0].name,'system-data');assert.equal(rows[0].metadata.sha256,skillManifest.sha256);
  assert.equal(await provider.get({...rows[0],provider:'forged'},{}),undefined);
  const skill=await provider.get(rows[0],{});assert.match(skill.content,/SHA256/);assert.ok(skill.content.includes(skillManifest.sha256));assert.match(skill.content,/qingsong_search/);
  skillNodes[0].enabled=false;assert.equal((await provider.list({})).length,4);skillNodes[0].enabled=true;
  types=[];await assert.rejects(provider.get(rows[0],{}),/所需能力尚未开放/);
  await assert.rejects(provider.list({signal:AbortSignal.abort()}));
 }finally{if(oldEndpoint===undefined)delete process.env.QS_TOOL_ENDPOINT;else process.env.QS_TOOL_ENDPOINT=oldEndpoint;if(oldToken===undefined)delete process.env.QS_TOOL_TOKEN;else process.env.QS_TOOL_TOKEN=oldToken;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('real DSH schema compilation registers the unified tools without enabling arbitrary execution',()=>{
 const names=[],contexts=[],sections=[];let guard;
 applyTeaching({effect:f=>f(),systemPrompt:{context:value=>contexts.push(value),section:value=>sections.push(value)},on:()=>{},tools:{guard:g=>{guard=g;},register:t=>{names.push(t.name);}}});
 assert.deepEqual(names,['qingsong_discover','qingsong_search','qingsong_read','qingsong_material','qingsong_preparation','qingsong_memory']);
 assert.equal(sections.length,0,'a static teaching rule must not conflict with the admin-managed prompt');
 const prompt=contexts.find(value=>value.name==='管理员配置的教学提示词');assert.equal(typeof prompt.text,'function');assert.equal(prompt.text({agent:{id:'outside-turn'}}),'');
 assert.equal(guard({name:'qingsong_read'}),undefined);
 for(const name of ['qingsong_query','shell','read_file'])assert.ok(guard({name}));
 assert.match(guard({name:'skill',arguments:{name:'unpublished-skill'}}),/不在青松发布目录/);
});
