import { useState, type FormEvent } from 'react';
const prompts = ['今天有什么课？', '班级学情怎么样？', '帮我看看批改流程'];
function answer(text: string) {
  if (/课|日程/.test(text) && !/批改/.test(text)) return '【预设示例】你可以在“课表与日程”查看虚构班级的课程，在“课堂任务”记录作业收交与课堂表现。\n\n本回答没有查询真实课表，也没有调用模型。';
  if (/批改|OCR|识别/i.test(text)) return '【预设示例】批改流程：材料接入 → 题目分析 → 评分标准 → 试批校准 → 批量批改 → 异常复核 → 学情诊断。\n\n打开“AI 批改”中的演示任务，可以查看预置题目、OCR 与评分结果；所有分数均为虚构样例。';
  if (/学情|学生|班级/.test(text)) return '【预设示例】样例展示了班级学生、成绩与知识点之间的关联。教师可从班级进入学生档案，再查看需要复习的知识点。\n\n这只是虚构数据演示，不代表对真实学生的分析。';
  return '【预设示例】这里展示教学助手的交互方式。你可以体验班级、课表、材料池、知识图谱和批改流程。\n\n当前不会调用真实 AI，不能理解任意问题；可以点击上方示例问题继续体验。';
}
export default function DemoAssistant() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: '这是教学助手演示。选择一个示例问题，看看它如何辅助教师工作；回答均为预设内容。' }]);
  const send = (text: string) => { if (!text.trim()) return; setMessages(items => [...items, { role: 'user', text }, { role: 'assistant', text: answer(text) }]); setInput(''); };
  const submit = (event: FormEvent) => { event.preventDefault(); send(input); };
  return <section className="qs-demo-chat" aria-label="教学助手模拟体验">
    <small>模拟问答 · 不调用真实 AI · 退出或刷新后清空</small>
    <div className="qs-demo-prompts">{prompts.map(text => <button key={text} type="button" onClick={() => send(text)}>{text}</button>)}</div>
    <div role="log" aria-live="polite" className="qs-demo-chat-log">{messages.map((item, i) => <div key={i} className={'qs-demo-message ' + (item.role === 'user' ? 'qs-demo-message-user' : '')}>{item.text}</div>)}</div>
    <form onSubmit={submit}><input aria-label="输入体验问题" className="qs-field-input rounded-xl border px-3" value={input} maxLength={500} onChange={e => setInput(e.target.value)} placeholder="输入问题，查看预设示例" /><button className="rounded-xl bg-emerald-700 text-white" disabled={!input.trim()}>发送</button></form>
  </section>;
}
