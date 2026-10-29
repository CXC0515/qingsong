import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reserveMaterialStorage, releaseMaterialStorage } from './officialMaterialQuota';

test('concurrent writers share one bound, reservations cannot be released by another user home', async () => {
  const home=await mkdtemp(path.join(os.tmpdir(),'qs-quota-'));
  let id:string|undefined;
  try {
    id=await reserveMaterialStorage(home,400*1024*1024);
    const concurrent=await Promise.allSettled([reserveMaterialStorage(home,80*1024*1024),reserveMaterialStorage(home,80*1024*1024)]);
    assert.equal(concurrent.filter(value=>value.status==='fulfilled').length,1);
    releaseMaterialStorage(home+'/other',id);
    await assert.rejects(reserveMaterialStorage(home,80*1024*1024));
    releaseMaterialStorage(home,id);id=undefined;
    for(const value of concurrent)if(value.status==='fulfilled')releaseMaterialStorage(home,value.value);
    const replacement=await reserveMaterialStorage(home,512*1024*1024);releaseMaterialStorage(home,replacement);
  }finally{if(id)releaseMaterialStorage(home,id);await rm(home,{recursive:true,force:true});}
});
test('native uploads and derived cache both consume quota without reading source contents', async()=>{
  const home=await mkdtemp(path.join(os.tmpdir(),'qs-quota-disk-'));
  try{
    const directory=path.join(home,'qingsong-materials','cache');await mkdir(directory,{recursive:true});
    const file=await open(path.join(directory,'sparse-derived'),'w');await file.truncate(512*1024*1024);await file.close();
    await assert.rejects(reserveMaterialStorage(home,1),/MATERIAL_STORAGE_LIMIT/);
  }finally{await rm(home,{recursive:true,force:true});}
});
