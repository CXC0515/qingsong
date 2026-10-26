import {defineTool} from '../../../agent/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
export const name='qingsong-prototype-tools';
export const inject=['tools'];
export function apply(ctx){
 ctx.effect(()=>ctx.tools.guard(exec=>exec.name==='qingsong_query'?undefined:'原型仅允许样本课表查询。'));
 ctx.effect(()=>ctx.tools.register(defineTool({name:'qingsong_query',description:'查询教师今天的课表（隔离演示样本）',parameters:{kind:{type:'string',required:true}},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},async execute(){return JSON.stringify({date:'2026-10-27',classes:[{time:'08:50–09:30',name:'七年级（1）班',lesson:'语文 · 济南的冬天'},{time:'14:00–14:40',name:'七年级（2）班',lesson:'语文 · 阅读练习'}],source:'隔离样本课表，不是生产数据'});}})));
}
