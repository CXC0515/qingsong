import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoApi } from './mockApi';

const write = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) });
test('demo handles roster changes per instance, without delegating unknown requests to network', async () => {
  const api = createDemoApi(), otherVisitor = createDemoApi();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('REAL_NETWORK_MUST_NOT_RUN'); };
  try {
    const roster = await (await api('/api/roster')).json();
    assert.equal(roster.classes.length, 2);
    assert.equal(roster.students.length, 20);
    const created = await (await api('/api/classes', write({ name: '模拟新班级', grade: '七年级', term: '模拟学期', headTeacher: '体验老师' }))).json();
    assert.equal(created.schoolClass.name, '模拟新班级');
    assert.equal((await (await api('/api/roster')).json()).classes.length, 3);
    assert.equal((await (await otherVisitor('/api/roster')).json()).classes.length, 2);
    const unknown = await api('/api/assistant/official/api/remote.mux', write({ text: '你好' }));
    assert.equal(unknown.status, 409);
    assert.match((await unknown.json()).message, /没有保存/);
    assert.equal((await api('https://vendor.invalid/generate')).status, 409);
  } finally { globalThis.fetch = originalFetch; }
});

test('demo classroom recording supports confirmation, idempotent replay, history and retract', async () => {
  const api = createDemoApi();
  const initial = await (await api('/api/classroom-tasks/demo-classroom-1')).json();
  const participant = initial.participants.find((p: {result: string | null}) => p.result === null);
  const body = { operationId: 'test-initial', kind: 'initial', participantId: participant.id, result: 'positive', expectedVersion: participant.version };
  const response = await (await api('/api/classroom-tasks/demo-classroom-1/operations', write(body))).json();
  assert.equal(response.detail.counts.positive, initial.counts.positive + 1);
  await api('/api/classroom-tasks/demo-classroom-1/operations', write(body));
  const history = await (await api('/api/classroom-tasks/demo-classroom-1/history')).json();
  assert.equal(history.events.length, 1);
  const retract = await (await api('/api/classroom-tasks/demo-classroom-1/operations', write({ ...body, operationId: 'test-retract', kind: 'retract', result: undefined, targetEventId: history.events[0].id }))).json();
  assert.equal(retract.detail.counts.positive, initial.counts.positive);
});

test('demo grading uses preset materials and results and allows teacher score correction', async () => {
  const api = createDemoApi();
  const material = await (await api('/api/grading-tasks/demo-grading-1/materials')).json();
  assert.equal(material.assets.length, 5);
  assert.match(material.documents[0].warnings[0].message, /未执行真实/);
  const analysis = await (await api('/api/grading-tasks/demo-grading-1/analysis', write({}))).json();
  assert.equal(analysis.analysis.model, 'demo-preset-no-ai');
  const trial = await (await api('/api/grading-tasks/demo-grading-1/trial-grading', write({ questions: [{ questionId: 'question-1', displayNo: '1', fullScore: 10, rubricVersion: 1 }], submissions: [{ assetId: material.assets[2].id, studentId: 'demo-student-1-1', studentName: '林小禾', studentNo: '01' }] }))).json();
  assert.equal(trial.result.samples.length, 1);
  const sample = trial.result.samples[0];
  const reviewed = await (await api(`/api/grading-tasks/demo-grading-1/trial-grading/${sample.id}/teacher-review`, write({ finalScore: 8, reason: '模拟复核', resultSource: 'teacher-adjusted' }, 'PUT'))).json();
  assert.equal(reviewed.sample.teacherScore, 8);
  assert.equal(reviewed.sample.status, 'confirmed');
  assert.equal((await (await api('/api/grading-tasks/demo-grading-1/trial-grading')).json()).result.samples[0].teacherScore, 8);
});

test('profile/layout edits survive re-read within visitor and reset in a new instance; malformed or unsupported requests fail closed', async () => {
  const api = createDemoApi();
  await api('/api/account/profile', write({ nickname: '临时昵称' }, 'PUT'));
  assert.equal((await (await api('/api/account')).json()).profile.nickname, '临时昵称');
  assert.equal((await (await createDemoApi()('/api/account')).json()).profile.nickname, '体验老师');
  await api('/api/classes/demo-class-1/classroom-layout', write({ rowCount: 3, columnCount: 5, seats: [{ seatIndex: 5, studentId: 'demo-student-1-1' }] }, 'PUT'));
  const layout = (await (await api('/api/classes/demo-class-1/classroom-layout')).json()).layout;
  assert.equal(layout.rowCount, 3);
  assert.equal(layout.seats[0].seatIndex, 5);
  assert.equal((await api('/api/schedule/reminders/draft', write({ text: '明天开会' }))).status, 409);
  assert.equal((await api('/api/knowledge', { method: 'DELETE' })).status, 409);
  assert.equal((await api('/api/%ZZ')).status, 409);
  assert.equal((await api('/api/resources/demo-resource-1', { method: 'DELETE' })).status, 409);
});

test('preset answer scripts pass real roster matching and vision prerequisites before trial, batch and diagnosis', async () => {
  const { buildSubmissionPages } = await import('../domain/submissionRoster');
  const api = createDemoApi();
  const roster = await (await api('/api/roster')).json();
  const material = await (await api('/api/grading-tasks/demo-grading-1/materials')).json();
  const pages = buildSubmissionPages(material.assets, material.documents, roster.students.filter((s: {classId: string}) => s.classId === 'demo-class-1'));
  assert.equal(pages.length, 3);
  assert.ok(pages.every(p => p.rosterMatchStatus === 'matched' && p.studentId && p.ocrConfidence > 0.9));
  const analysis = (await (await api('/api/grading-tasks/demo-grading-1/analysis')).json()).analysis;
  for (const page of pages) {
    const stored = (await (await api(`/api/grading-tasks/demo-grading-1/vision-validation/${page.id}`)).json()).result;
    assert.equal(stored.model, 'demo-preset-no-ai');
    for (const q of analysis.questions) {
      const item = stored.items.find((i: {displayNo: string}) => i.displayNo === q.displayNo);
      assert.ok(item && item.paddleText.trim() && item.lunaText.trim());
    }
    const extracted = (await (await api('/api/grading-tasks/demo-grading-1/vision-validation', write({ assetId: page.id, questionNos: ['1', '2'] }))).json()).result;
    assert.deepEqual(extracted.items.map((i: {displayNo: string}) => i.displayNo), ['1', '2']);
  }
  const questions = analysis.questions.map((q: {displayNo: string; score: number; standardAnswer: string}) => ({ questionId: `question-${q.displayNo}`, displayNo: q.displayNo, fullScore: q.score, standardAnswer: q.standardAnswer, rubricVersion: 1 }));
  const submissions = pages.map(p => ({ assetId: p.id, studentId: p.studentId, studentName: p.expectedStudentName, studentNo: p.matchedStudentNo }));
  const trial = (await (await api('/api/grading-tasks/demo-grading-1/trial-grading', write({ questions, submissions }))).json()).result;
  assert.equal(trial.samples.length, 6);
  assert.ok(trial.samples.every((s: {aiScore: number; questionId: string}) => s.aiScore >= 0 && questions.some((q: {questionId: string}) => q.questionId === s.questionId)));
  const batch = (await (await api('/api/grading-tasks/demo-grading-1/batch-grading/start', write({ questions, submissions, mode: 'batch-checkpoint' }))).json()).batch;
  assert.equal(batch.status, 'completed');
  assert.equal(batch.processedStudents, 3);
  const confirmed = (await (await api('/api/grading-tasks/demo-grading-1/batch-grading/confirm', write({ studentIds: submissions.map(s => s.studentId) }))).json()).batch;
  assert.equal(confirmed.confirmedStudentIds.length, 3);
  const diagnosis = (await (await api('/api/grading-tasks/demo-grading-1/diagnosis', write({ questions: questions.map((q: {questionId: string; displayNo: string; fullScore: number}) => ({ id: q.questionId, displayNo: q.displayNo, score: q.fullScore })) }))).json()).diagnosis;
  assert.equal(diagnosis.gradedStudentCount, 3);
  assert.equal(diagnosis.questionPerformance.length, 2);
  assert.ok(diagnosis.averageScore > 0 && diagnosis.averageScore <= diagnosis.averageFullScore);
});
