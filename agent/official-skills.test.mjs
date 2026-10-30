import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {apply,skillManifest} from './official-skills.mjs';
import {apply as applyTeaching} from './official-teaching.mjs';
test('published Skill is the only provider entry, dependency-checked, versioned, and abortable',async()=>{
 let provider;apply({skills:{registerProvider:create=>{provider=create({});}}});
 const rows=await provider.list({});assert.equal(rows.length,1);assert.equal(rows[0].name,'system-data');assert.equal(rows[0].metadata.sha256,skillManifest.sha256);
 assert.equal(await provider.get({...rows[0],provider:'forged'},{}),undefined);
 let types=skillManifest.requires;
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;assert.equal(JSON.parse(body).action,'discover');assert.equal(req.headers.authorization,'Bearer fixture-only');res.setHeader('content-type','application/json');res.end(JSON.stringify({data:{objects:types.map(type=>({type}))}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const oldEndpoint=process.env.QS_TOOL_ENDPOINT,oldToken=process.env.QS_TOOL_TOKEN;
 process.env.QS_TOOL_ENDPOINT='http://127.0.0.1:'+server.address().port;process.env.QS_TOOL_TOKEN='fixture-only';
 try{
  const skill=await provider.get(rows[0],{});assert.match(skill.content,/SHA256/);assert.ok(skill.content.includes(skillManifest.sha256));assert.match(skill.content,/qingsong_search/);
  types=[];await assert.rejects(provider.get(rows[0],{}),/所需能力尚未开放/);
  await assert.rejects(provider.list({signal:AbortSignal.abort()}));
 }finally{if(oldEndpoint===undefined)delete process.env.QS_TOOL_ENDPOINT;else process.env.QS_TOOL_ENDPOINT=oldEndpoint;if(oldToken===undefined)delete process.env.QS_TOOL_TOKEN;else process.env.QS_TOOL_TOKEN=oldToken;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('real DSH schema compilation registers the unified tools without enabling arbitrary execution',()=>{
 const names=[];let guard;
 applyTeaching({effect:f=>f(),systemPrompt:{context:()=>{},section:()=>{}},on:()=>{},tools:{guard:g=>{guard=g;},register:t=>{names.push(t.name);}}});
 assert.deepEqual(names,['qingsong_discover','qingsong_search','qingsong_read','qingsong_material','qingsong_memory']);
 assert.equal(guard({name:'qingsong_read'}),undefined);
 for(const name of ['qingsong_query','shell','read_file'])assert.ok(guard({name}));
 assert.match(guard({name:'skill',arguments:{name:'unpublished-skill'}}),/不在青松发布目录/);
});
