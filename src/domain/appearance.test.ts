import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyTheme,defaultTheme,readStoredTheme,themeOptions} from './appearance';

test('all existing appearance cards retain matching CSS palettes',async()=>{
  const css=await readFile(new URL('../index.css',import.meta.url),'utf8');
  assert.equal(themeOptions.length,8);
  assert.equal(new Set(themeOptions.map(option=>option.value)).size,8);
  for(const option of themeOptions){
    const rule=css.match(new RegExp('\\[data-theme="'+option.value+'"\\]\\s*\\{([^}]+)\\}'))?.[1];
    assert.ok(rule,option.value);
    option.swatches.forEach((color,index)=>assert.match(rule,new RegExp('--palette-'+(index+1)+':\\s*'+color,'i')));
  }
});

test('appearance restoration isolates accounts, preserves storage and resets invalid preferences',()=>{
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const stored=new Map([['app-theme:owner','ink-red-gold-sand'],['app-theme:teacher','mist-blue-silver-gray'],['app-theme:invalid','retired-theme']]);
  const attributes=new Map<string,string>();
  Object.defineProperty(globalThis,'window',{value:{},configurable:true});
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>stored.get(key)??null},configurable:true});
  Object.defineProperty(globalThis,'document',{value:{documentElement:{setAttribute:(key:string,value:string)=>attributes.set(key,value),classList:{remove:()=>{}}}},configurable:true});
  try{
    applyTheme(readStoredTheme('owner'));assert.equal(attributes.get('data-theme'),'ink-red-gold-sand');
    applyTheme(readStoredTheme('teacher'));assert.equal(attributes.get('data-theme'),'mist-blue-silver-gray');
    applyTheme(readStoredTheme('missing'));assert.equal(attributes.get('data-theme'),defaultTheme);
    assert.equal(readStoredTheme('invalid'),defaultTheme);
    applyTheme('retired-theme');assert.equal(attributes.get('data-theme'),defaultTheme);
    assert.equal(attributes.get('data-theme-forced'),'true');
    assert.equal(stored.size,3,'restoring must not overwrite another account or create a preference');
    Object.defineProperty(globalThis,'localStorage',{get:()=>{throw Error('STORAGE_BLOCKED');},configurable:true});
    assert.equal(readStoredTheme('owner'),defaultTheme);
  }finally{
    for(const [key,descriptor] of [['window',oldWindow],['localStorage',oldStorage],['document',oldDocument]] as const){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
    }
  }
});
