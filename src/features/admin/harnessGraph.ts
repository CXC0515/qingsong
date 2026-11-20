import {Activity,BookOpen,Check,Code2,Layers3,ShieldCheck,Wrench} from 'lucide-react';
type PartId = 'orchestrator' | 'context' | 'agent' | 'router' | 'skills' | 'tools' | 'memory' | 'verify' | 'guard' | 'output';
type Part = { id: PartId; title: string; en: string; x: number; y: number; icon: typeof Activity; summary: string; status: string; responsibility: string };
const parts: Part[] = [
  { id: 'orchestrator', title: '会话与运行', en: 'Orchestrator', x: 25, y: 280, icon: Layers3, summary: '前台请求，会话，Run 生命周期', status: 'DSH SDK / 青松应用桥接', responsibility: '接收消息并管理会话、运行、取消与完成回执。它负责运行生命周期，不负责决定如何回答。' },
  { id: 'context', title: 'Context Builder', en: '上下文组装', x: 215, y: 280, icon: BookOpen, summary: '规则，历史，材料，工具结果', status: '青松代码已接入', responsibility: '组装教师规则、相关记忆与本轮引用材料。工具结果写入会话，供后续模型请求使用。' },
  { id: 'agent', title: 'Main Agent / Loop', en: '主 Agent', x: 405, y: 280, icon: Activity, summary: '理解，判断，调用，继续 / 结束', status: 'DSH 原生单 Agent Loop', responsibility: '理解请求，选择 Skill 或调用工具。根据返回结果继续执行或结束本轮。' },
  { id: 'router', title: 'Skill Router', en: 'Skill 发现', x: 595, y: 70, icon: Activity, summary: '发现候选，披露 Meta，主 Agent 决策', status: 'DSH Skill Provider', responsibility: 'DSH 中 Skill 发现与候选能力披露部分的界面名称。主 Agent 决定是否加载。' },
  { id: 'skills', title: 'Skill 库', en: '能力与执行方案', x: 785, y: 70, icon: BookOpen, summary: '先发现能力，命中后加载详情', status: 'DSH Provider + 青松配置', responsibility: '保存能力摘要与执行方案，命中后按需加载。' },
  { id: 'tools', title: 'Tools', en: '业务读写接口', x: 595, y: 280, icon: Wrench, summary: 'discover，search，read，task tools', status: '已注册 / bridge 校验', responsibility: '通过授权接口查询或更新业务数据。执行结果与保存回执分别记录。' },
  { id: 'memory', title: 'Memory', en: '记忆', x: 215, y: 480, icon: Code2, summary: '按需召回，仅保存必要字段', status: '青松个人规则 / 学习记忆', responsibility: '按授权范围读取规则与记忆，保存必要字段。' },
  { id: 'verify', title: 'Verify', en: '答案与执行校验', x: 785, y: 280, icon: Check, summary: '意图，证据，工具结果，状态', status: '交付前校验', responsibility: '检查回答依据、约束和执行状态，不通过时最多修订两次文本。' },
  { id: 'guard', title: 'Guardrail Hook', en: '边界检查', x: 785, y: 480, icon: ShieldCheck, summary: '查看挂载点，规则，放行 / 阻断', status: '检查总览', responsibility: '查看上下文准备、模型请求和工具执行边界的检查记录。' },
  { id: 'output', title: '对话输出', en: 'Reply / turn end', x: 975, y: 280, icon: Check, summary: '回答，completed / failed / cancelled', status: '运行终态与业务回执分开', responsibility: '记录回答与本轮运行终态，业务保存结果以独立回执为准。' },
];
type Link = { id: string; source: PartId; target: PartId; sourceHandle: string; targetHandle: string; label: string; type: 'straight' | 'smoothstep' | 'simplebezier' };
const links: Link[] = [
  { id: 'entry', source: 'orchestrator', target: 'context', sourceHandle: 'right', targetHandle: 'left', label: '新请求', type: 'straight' },
  { id: 'context-agent', source: 'context', target: 'agent', sourceHandle: 'right', targetHandle: 'left', label: '上下文', type: 'straight' },
  { id: 'agent-router', source: 'agent', target: 'router', sourceHandle: 'top', targetHandle: 'bottom', label: '按需请求候选', type: 'smoothstep' },
  { id: 'router-skills', source: 'router', target: 'skills', sourceHandle: 'right', targetHandle: 'left', label: '候选 Meta', type: 'straight' },
  { id: 'skills-agent', source: 'skills', target: 'agent', sourceHandle: 'bottom', targetHandle: 'top', label: '加载方案后继续', type: 'smoothstep' },
  { id: 'agent-tools', source: 'agent', target: 'tools', sourceHandle: 'right', targetHandle: 'left', label: '按需调用', type: 'straight' },
  { id: 'tools-context', source: 'tools', target: 'context', sourceHandle: 'bottom', targetHandle: 'bottom', label: '工具结果 / 错误回流', type: 'smoothstep' },
  { id: 'memory-context', source: 'memory', target: 'context', sourceHandle: 'top', targetHandle: 'bottom', label: '按需读写', type: 'straight' },
  { id: 'agent-verify', source: 'agent', target: 'verify', sourceHandle: 'top', targetHandle: 'left', label: '候选答案', type: 'smoothstep' },
  { id: 'verify-agent', source: 'verify', target: 'agent', sourceHandle: 'top', targetHandle: 'top', label: '纠偏 / 重答', type: 'smoothstep' },
  { id: 'verify-output', source: 'verify', target: 'output', sourceHandle: 'right', targetHandle: 'left', label: '校验通过后输出', type: 'straight' },
];

export {parts,links};
export type {PartId,Part};
