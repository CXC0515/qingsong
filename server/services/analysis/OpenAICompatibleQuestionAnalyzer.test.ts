/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { firstSectionModelOutputSchema } from '../../schemas/firstSectionAnalysis';
import { StoredMaterial } from '../../repositories/materialRepository';
import { AnalysisEvidenceRef } from '../../../src/domain/types';
import { OpenAICompatibleQuestionAnalyzer, sanitizeRecoverableFirstSectionOutput } from './OpenAICompatibleQuestionAnalyzer';

const source = (assetKind: 'assignment' | 'reference-answer', assetId: string, fileName: string, blockId: string, quote = assetKind === 'assignment' ? '第一题' : '答案') => ({
  assetKind,
  assetId,
  fileName,
  blockIds: [blockId],
  quote,
  segments: [{ blockId, quote }],
  visualRegion: null
});

const validQuestion = {
  displayNo: '1',
  title: '第一题',
  stem: '第一题',
  score: 5,
  questionType: '简答题',
  answerRequirement: '',
  standardAnswer: '答案',
  explanation: '',
  rubricPoints: [{ point: '采分点', score: 5, description: '' }],
  knowledgeCandidates: [{ nodeId: 'node-1', nodeName: '知识点', confidence: 0.8 }],
  questionSource: source('assignment', 'assignment-1', 'question.txt', 'q-1'),
  answerSource: source('reference-answer', 'answer-1', 'answer.txt', 'a-1'),
  confidence: 0.9,
  reviewReasons: [],
  subquestions: []
};

const modelOutput = { scope: '整份作业', questions: [validQuestion] };
const analysisMaterials: StoredMaterial[] = [
  { id: 'assignment-1', taskId: 'task-1', kind: 'assignment', fileName: 'question.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/question.txt', publicUrl: '/question.txt', normalizedDocument: { assetId: 'assignment-1', sourceFormat: 'text', markdown: '第一题', blocks: [{ id: 'q-1', order: 0, type: 'paragraph', text: '第一题' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } },
  { id: 'answer-1', taskId: 'task-1', kind: 'reference-answer', fileName: 'answer.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/answer.txt', publicUrl: '/answer.txt', normalizedDocument: { assetId: 'answer-1', sourceFormat: 'text', markdown: '答案', blocks: [{ id: 'a-1', order: 0, type: 'paragraph', text: '答案' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } }
];
const modelResponse = (questions: unknown[]) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scope: '整份作业', questions }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('keeps valid knowledge candidates unchanged', () => {
  const recovered = sanitizeRecoverableFirstSectionOutput(modelOutput);
  assert.deepEqual(recovered.recoveries, []);
  assert.deepEqual(firstSectionModelOutputSchema.parse(recovered.output), modelOutput);
});

test('drops malformed knowledge candidates without discarding the question', () => {
  const recovered = sanitizeRecoverableFirstSectionOutput({
    ...modelOutput,
    questions: [{
      ...validQuestion,
      knowledgeCandidates: ['知识点', null, validQuestion.knowledgeCandidates[0]!],
      subquestions: [{ ...validQuestion, displayNo: '1.1', knowledgeCandidates: ['子题知识点'], subquestions: undefined }]
    }]
  });
  const parsed = firstSectionModelOutputSchema.parse(recovered.output);
  assert.deepEqual(parsed.questions[0]?.knowledgeCandidates, [validQuestion.knowledgeCandidates[0]]);
  assert.match(parsed.questions[0]?.reviewReasons.join('\n') ?? '', /知识点返回格式异常/);
  assert.deepEqual(parsed.questions[0]?.subquestions[0]?.knowledgeCandidates, []);
  assert.match(parsed.questions[0]?.subquestions[0]?.reviewReasons.join('\n') ?? '', /知识点返回格式异常/);
  assert.deepEqual(recovered.recoveries, [
    { questionNo: '1', droppedKnowledgeCandidateCount: 2 },
    { questionNo: '1.1', droppedKnowledgeCandidateCount: 1 }
  ]);
});

test('still rejects malformed core question fields', () => {
  const recovered = sanitizeRecoverableFirstSectionOutput({
    ...modelOutput,
    questions: [{ ...validQuestion, stem: '', knowledgeCandidates: ['知识点'] }]
  });
  assert.throws(() => firstSectionModelOutputSchema.parse(recovered.output));
});

test('allows empty model response for recovery, retries once, and accepts recovered questions', async () => {
  let calls = 0;
  let requestSchema: Record<string, unknown> | undefined;
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    requestSchema = (JSON.parse(String(init?.body ?? '{}')) as { response_format: { json_schema: { schema: Record<string, unknown> } } }).response_format.json_schema.schema;
    return calls === 1 ? modelResponse([]) : modelResponse([validQuestion]);
  }) as typeof fetch;
  const result = await new OpenAICompatibleQuestionAnalyzer({ apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'gpt-6-luna' }, fakeFetch)
    .analyzeAssignment(analysisMaterials, []);
  assert.equal(calls, 2);
  assert.equal(result.questions.length, 1);
  assert.equal((requestSchema?.properties as Record<string, { minItems?: number }>).questions?.minItems, undefined);
});

test('fails after two empty responses without returning an empty analysis', async () => {
  let calls = 0;
  const fakeFetch = (async () => { calls += 1; return modelResponse([]); }) as typeof fetch;
  await assert.rejects(
    new OpenAICompatibleQuestionAnalyzer({ apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'gpt-6-luna' }, fakeFetch).analyzeAssignment(analysisMaterials, []),
    /MODEL_NO_QUESTIONS/
  );
  assert.equal(calls, 2);
});

test('retries one transient model outage without changing the configured model', async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    if (calls === 1) return new Response('{"error":"busy"}', { status: 503 });
    return modelResponse([validQuestion]);
  }) as typeof fetch;
  const result = await new OpenAICompatibleQuestionAnalyzer({ apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'gpt-6-luna' }, fakeFetch)
    .analyzeAssignment(analysisMaterials, []);
  assert.equal(calls, 2);
  assert.equal(result.questions[0]?.displayNo, '1');
});

test('retries once when the model returns invalid JSON or an incomplete object', async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ choices: [{ message: { content: '{"scope":"整份作业","questions":[{}]}' } }] }), { status: 200 });
    return modelResponse([validQuestion]);
  }) as typeof fetch;
  const result = await new OpenAICompatibleQuestionAnalyzer({ apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'gpt-6-luna' }, fakeFetch)
    .analyzeAssignment(analysisMaterials, []);
  assert.equal(calls, 2);
  assert.equal(result.questions.length, 1);
});

test('sends OCR coordinates and source pages in one strict multimodal request', async () => {
  let requestBody: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;
  const materials: StoredMaterial[] = [
    {
      id: 'assignment-1', taskId: 'task-1', kind: 'assignment', fileName: 'question.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/question.txt', publicUrl: '/question.txt',
      normalizedDocument: { assetId: 'assignment-1', sourceFormat: 'image', markdown: '第一题', blocks: [{ id: 'q-1', order: 0, type: 'paragraph', text: '第一题', pageNumber: 1, boundingBox: { x: 0.1, y: 0.2, width: 0.8, height: 0.2 } }], resources: [{ id: 'page-1', fileName: 'page-1.jpg', mimeType: 'image/jpeg', publicUrl: '/page-1.jpg', role: 'source-page', pageNumber: 1 }], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' }
    },
    {
      id: 'answer-1', taskId: 'task-1', kind: 'reference-answer', fileName: 'answer.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/answer.txt', publicUrl: '/answer.txt',
      normalizedDocument: { assetId: 'answer-1', sourceFormat: 'text', markdown: '答案', blocks: [{ id: 'a-1', order: 0, type: 'paragraph', text: '答案' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' }
    }
  ];
  const analyzer = new OpenAICompatibleQuestionAnalyzer(
    { apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'test-model' },
    fakeFetch,
    async () => Buffer.from('source-page')
  );
  const result = await analyzer.analyzeAssignment(materials, [{ id: 'node-1', name: '知识点', type: 'concept', description: '' }]);

  const responseFormat = requestBody.response_format as { type?: string; json_schema?: { strict?: boolean; schema?: unknown } };
  assert.equal(responseFormat.type, 'json_schema');
  assert.equal(responseFormat.json_schema?.strict, true);
  assert.ok(responseFormat.json_schema?.schema);
  assert.match(JSON.stringify(requestBody.messages), /knowledgeCandidates 非空时必须返回对象数组/);
  assert.match(JSON.stringify(requestBody.messages), /禁止返回/);
  assert.match(JSON.stringify(requestBody.messages), /一个 block 可以包含多道题/);
  assert.match(JSON.stringify(requestBody.messages), /中文数字、罗马数字、带圈序号/);
  assert.match(JSON.stringify(requestBody.messages), /data:image\/jpeg;base64/);
  assert.match(JSON.stringify(requestBody.messages), /boundingBox/);
  assert.doesNotMatch(JSON.stringify(requestBody.messages), /sourceImagePath/);
  assert.equal(requestBody.reasoning_effort, 'medium');
  assert.equal(result.questions[0]?.stem, '第一题');
});

test('keeps distinct answer fragments from the same OCR block separated', async () => {
  const questions = [
    { ...validQuestion, displayNo: 'Ⅱ', standardAnswer: 'Ⅱ. 第二题答案', answerSource: source('reference-answer', 'answer-1', 'answer.txt', 'a-1', 'Ⅱ. 第二题答案') },
    { ...validQuestion, displayNo: 'Ⅲ', title: '第三题', stem: '第三题', questionSource: source('assignment', 'assignment-1', 'question.txt', 'q-1', '第三题'), standardAnswer: 'Ⅲ. 第三题答案', answerSource: source('reference-answer', 'answer-1', 'answer.txt', 'a-1', 'Ⅲ. 第三题答案') }
  ];
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scope: '整份作业', questions }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const materials: StoredMaterial[] = [
    { id: 'assignment-1', taskId: 'task-1', kind: 'assignment', fileName: 'question.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/question.txt', publicUrl: '/question.txt', normalizedDocument: { assetId: 'assignment-1', sourceFormat: 'text', markdown: '第一题\n第三题', blocks: [{ id: 'q-1', order: 0, type: 'paragraph', text: '第一题\n第三题' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } },
    { id: 'answer-1', taskId: 'task-1', kind: 'reference-answer', fileName: 'answer.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/answer.txt', publicUrl: '/answer.txt', normalizedDocument: { assetId: 'answer-1', sourceFormat: 'text', markdown: 'Ⅱ. 第二题答案 Ⅲ. 第三题答案', blocks: [{ id: 'a-1', order: 0, type: 'paragraph', text: 'Ⅱ. 第二题答案 Ⅲ. 第三题答案' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } }
  ];
  const analyzer = new OpenAICompatibleQuestionAnalyzer({ apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'test-model' }, fakeFetch);
  const result = await analyzer.analyzeAssignment(materials, []);
  assert.equal(calls, 1);
  assert.equal(result.questions[0]?.standardAnswer, 'Ⅱ. 第二题答案');
  assert.equal(result.questions[1]?.standardAnswer, 'Ⅲ. 第三题答案');
  assert.equal(result.questions[0]?.answerSource?.blockIds[0], 'a-1');
  assert.equal(result.questions[1]?.answerSource?.blockIds[0], 'a-1');
});

test('does not make a second model call when different questions reuse the same answer fragment', async () => {
  const sharedAnswerSource = source('reference-answer', 'answer-1', 'answer.txt', 'a-1', '共同答案');
  const firstQuestion = { ...validQuestion, displayNo: '一', standardAnswer: '共同答案', answerSource: sharedAnswerSource };
  const duplicateQuestion = { ...validQuestion, displayNo: '二', title: '第二题', standardAnswer: '共同答案', answerSource: sharedAnswerSource };
  const correctedQuestion = { ...duplicateQuestion, standardAnswer: '第二题答案', answerSource: source('reference-answer', 'answer-1', 'answer.txt', 'a-1', '第二题答案') };
  const responses = [
    { scope: '整份作业', questions: [firstQuestion, duplicateQuestion] },
    { scope: '整份作业', questions: [firstQuestion, correctedQuestion] }
  ];
  let calls = 0;
  const fakeFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(responses[calls++]) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  const materials: StoredMaterial[] = [
    { id: 'assignment-1', taskId: 'task-1', kind: 'assignment', fileName: 'question.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/question.txt', publicUrl: '/question.txt', normalizedDocument: { assetId: 'assignment-1', sourceFormat: 'text', markdown: '第一题', blocks: [{ id: 'q-1', order: 0, type: 'paragraph', text: '第一题' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } },
    { id: 'answer-1', taskId: 'task-1', kind: 'reference-answer', fileName: 'answer.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/answer.txt', publicUrl: '/answer.txt', normalizedDocument: { assetId: 'answer-1', sourceFormat: 'text', markdown: '共同答案 第二题答案', blocks: [{ id: 'a-1', order: 0, type: 'paragraph', text: '共同答案 第二题答案' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } }
  ];
  const analyzer = new OpenAICompatibleQuestionAnalyzer({ apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'test-model' }, fakeFetch);
  const result = await analyzer.analyzeAssignment(materials, []);
  assert.equal(calls, 1);
  assert.equal(result.questions[1]?.standardAnswer, '共同答案');
  assert.match(result.questions[1]?.reviewReasons.join('\n') ?? '', /完全相同的答案来源/);
});

test('keeps a readable answer when punctuation differs and removes repeated small-question text from the top-level question', async () => {
  const question = {
    ...validQuestion,
    stem: '公共要求\n(1)小题',
    questionSource: source('assignment', 'assignment-1', 'question.txt', 'q-1', '公共要求\n(1)小题'),
    standardAnswer: '4. 老舍；舒庆春；《骆驼祥子》；《四世同堂》；《茶馆》',
    answerSource: source('reference-answer', 'answer-1', 'answer.txt', 'a-1', '4. 老舍；舒庆春；《骆驼祥子》；《四世同堂》；《茶馆》'),
    subquestions: [{
      ...validQuestion,
      displayNo: '1(1)',
      stem: '(1)小题',
      questionSource: source('assignment', 'assignment-1', 'question.txt', 'q-1', '(1)小题')
    }]
  };
  const fakeFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scope: '整份作业', questions: [question] }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  const materials: StoredMaterial[] = [
    { id: 'assignment-1', taskId: 'task-1', kind: 'assignment', fileName: 'question.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/question.txt', publicUrl: '/question.txt', normalizedDocument: { assetId: 'assignment-1', sourceFormat: 'text', markdown: '公共要求\n(1)小题', blocks: [{ id: 'q-1', order: 0, type: 'paragraph', text: '公共要求\n(1)小题' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } },
    { id: 'answer-1', taskId: 'task-1', kind: 'reference-answer', fileName: 'answer.txt', mimeType: 'text/plain', status: 'ready', diskPath: '/tmp/answer.txt', publicUrl: '/answer.txt', normalizedDocument: { assetId: 'answer-1', sourceFormat: 'text', markdown: '4. 老舍 舒庆春 骆驼祥子 四世同堂 茶馆 5. CD', blocks: [{ id: 'a-1', order: 0, type: 'paragraph', text: '4. 老舍 舒庆春 骆驼祥子 四世同堂 茶馆 5. CD' }], resources: [], warnings: [], parsedAt: '2026-09-12T00:00:00.000Z' } }
  ];
  const result = await new OpenAICompatibleQuestionAnalyzer({ apiKey: 'test', baseUrl: 'https://example.test/v1', visionModel: 'test-model' }, fakeFetch).analyzeAssignment(materials, []);
  assert.equal(result.questions[0]?.stem, '公共要求');
  assert.equal(result.questions[0]?.standardAnswer, question.standardAnswer);
  assert.equal(result.questions[0]?.answerSource?.quote, '4. 老舍 舒庆春 骆驼祥子 四世同堂 茶馆');
  assert.equal((result.questions[0]?.answerSource as AnalysisEvidenceRef | null)?.matchStatus, 'normalized');
});
