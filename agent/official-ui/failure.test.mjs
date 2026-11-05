import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('./failure.js',import.meta.url),'utf8'),context);
const {reason,saved} = context.QingsongAssistantFailure;
test('503 explains provider failure; saved state comes only from readback',()=>{
  assert.match(reason({code:'SERVER',message:'503: {"message":"Service temporarily unavailable"}'}),/模型服务暂时不可用/);
  assert.doesNotMatch(reason({message:'503'}),/已保存|已撤回/);
  assert.match(reason({code:'AUTH'}),/连接或登录/);
  assert.match(saved({bound:false}),/无法.*确认/);
  assert.match(saved({bound:true,revision:7,pending:1,applied:0,tasks:[{status:'interrupted'}]}),/第 7 版.*1 份待应用建议.*已中断/);
  assert.doesNotMatch(saved({bound:true,revision:7,pending:0,applied:0,tasks:[]}),/正文未修改|全部保存/);
});
