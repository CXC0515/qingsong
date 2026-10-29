import test from 'node:test';
import assert from 'node:assert/strict';
import {syncAssistantAppearance} from './assistantAppearance';

test('embedded reading surface follows host appearance changes without replacing native styles',()=>{
  const root=new Map([['--native-session-marker','keep']]),body=new Map<string,string>();
  const node=(values:Map<string,string>)=>({style:{setProperty:(key:string,value:string,priority:string)=>{
    assert.equal(priority,'important');values.set(key,value);
  }}});
  const document={documentElement:node(root),body:node(body)} as unknown as Document;
  const values=new Map([['--qs-workbench-surface','#fcfcfb'],['--qs-ink','#293f35'],['--qs-muted','#6b7270'],['--qs-line','#dddddd'],['--theme-primary-light','#e8efec']]);
  const host={getPropertyValue:(key:string)=>values.get(key)??''};
  syncAssistantAppearance(document,host);
  for(const style of [root,body]){
    assert.equal(style.get('--dsw-alias-bg-base'),'#fcfcfb');
    assert.equal(style.get('--dsw-alias-bg-layer-3'),'#fcfcfb');
    assert.equal(style.get('--dsw-alias-label-primary'),'#293f35');
  }
  values.set('--qs-workbench-surface','#fbfaf9');values.set('--qs-ink','#493b36');
  syncAssistantAppearance(document,host);
  assert.equal(body.get('--dsw-alias-bg-base'),'#fbfaf9');
  assert.equal(root.get('--dsw-alias-label-primary'),'#493b36');
  assert.equal(root.get('--native-session-marker'),'keep');
});

test('missing host colors preserve native defaults and tolerate an early document without body',()=>{
  let writes=0;
  const document={documentElement:{style:{setProperty:()=>{writes++;}}},body:null} as unknown as Document;
  syncAssistantAppearance(document,{getPropertyValue:()=>''});assert.equal(writes,0);
  syncAssistantAppearance(document,{getPropertyValue:key=>key==='--qs-workbench-surface'?'#fafafa':''});
  assert.equal(writes,5);
});
