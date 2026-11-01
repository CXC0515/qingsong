/** Browser-only, fail-closed demo transport. This module deliberately has no network adapter. */
import { createDemoFixtures, demoGradingMaterials, demoVisionValidation, demoProfile, demoImage, DEMO_DATE, DEMO_NOW } from './fixtures';
import { countTaskParticipants, type TaskDetail, type TaskListItem, type RecordProject, type OperationResult, type OperationInput } from '../domain/classroomTasks';
import type { BehaviorEvent } from '../domain/classroomBehavior';
import type { CalibrationSample, GradingBatch, RosterStudent, TaskQuestionRubric, TrialGradingQuestionInput, TrialGradingSubmissionInput } from '../domain/types';
const unavailable = '演示模式暂未模拟这项操作，本次没有保存任何内容；请体验已有样例或刷新恢复初始数据。';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const id = () => `demo-${crypto.randomUUID()}`;
const now = () => new Date().toISOString();

export function createDemoApi() {
  const data = createDemoFixtures();
  const profile = { ...demoProfile };
  const grading = new Map<string, ReturnType<typeof demoGradingMaterials>>();
  const visionResults = new Map<string, ReturnType<typeof demoVisionValidation>>();
  const rubrics = new Map<string, TaskQuestionRubric[]>();
  const batches = new Map<string, GradingBatch>();
  const operations = new Map<string, OperationResult>();
  const behaviors: BehaviorEvent[] = [];
  const layouts = new Map<string, { classId: string; rowCount: number; columnCount: number; seats: Array<{ seatIndex: number; studentId: string }>; updatedAt: string }>();
  const quickTasks = new Map<string, TaskDetail>();
  const projects: RecordProject[] = [
    { key: 'collection', label: '作业收交', category: 'study', mode: 'completion', positive: '已交', negative: '未交', version: 1 },
    { key: 'correction', label: '练习订正', category: 'study', mode: 'completion', positive: '完成', negative: '未完', version: 1 },
    { key: 'recitation', label: '背诵检查', category: 'study', mode: 'pass', positive: '通过', negative: '未过', version: 1 },
    ...['主动发言', '合作互助', '专注投入', '需要提醒'].map((label, i) => ({ key: ['participation', 'cooperation', 'focus', 'reminder'][i], label, category: 'behavior' as const, mode: 'event' as const, positive: '记录', negative: '', version: 1 })),
  ];
  const counts = () => data.roster.classes.forEach(c => c.studentCount = data.roster.students.filter(s => s.classId === c.id && s.enrollmentStatus === 'active').length);
  const taskList = (task: TaskDetail): TaskListItem => ({ ...task.task, counts: countTaskParticipants(task.participants) });
  const makeTask = (body: Record<string, unknown>): TaskDetail => {
    const classId = String(body.classId), schoolClass = data.roster.classes.find(c => c.id === classId)!;
    const task: TaskDetail = { task: { id: id(), classId, className: schoolClass?.name ?? '模拟班级', name: String(body.name ?? '模拟课堂任务'), mode: body.mode === 'pass' ? 'pass' : 'completion', checkDate: String(body.checkDate ?? DEMO_DATE), dueDate: typeof body.dueDate === 'string' ? body.dueDate : null, description: String(body.description ?? ''), lifecycle: 'active', metadataVersion: 1, rosterVersion: 1, activityRevision: 1, createdAt: now(), updatedAt: now() }, participants: data.roster.students.filter(s => s.classId === classId).map(s => ({ id: id(), studentId: s.id, membershipId: `demo-membership-${s.id}`, name: s.name, studentNo: s.studentNo, enrollmentStatus: s.enrollmentStatus, included: !(body.excludedStudentIds as string[] | undefined)?.includes(s.id), exempt: false, version: 1, result: null, currentEventId: null, firstResult: null })), events: [], operations: [], counts: { positive: 0, negative: 0, unrecorded: 0, exempt: 0, total: 0, required: 0, rate: null } };
    task.counts = countTaskParticipants(task.participants); data.classroomTasks.push(task); return task;
  };
  const operate = (task: TaskDetail, body: OperationInput): OperationResult => {
    if (operations.has(body.operationId)) return operations.get(body.operationId)!;
    const members = body.members ?? [{ participantId: body.participantId ?? task.participants.find(p => p.studentId === body.studentId)?.id ?? '', expectedVersion: body.expectedVersion ?? 1, result: body.result, included: body.included, exempt: body.exempt, targetEventId: body.targetEventId }];
    for (const member of members) {
      const p = task.participants.find(p => p.id === member.participantId); if (!p) continue;
      const eventId = id();
      task.events.push({ id: eventId, taskId: task.task.id, participantId: p.id, operationId: body.operationId, kind: body.kind, result: member.result ?? null, previousEventId: p.currentEventId, targetEventId: member.targetEventId ?? null, occurredAt: now(), recordedAt: now(), actorUserId: 'qingsong-visitor-demo', source: 'demo', reason: body.reason ?? '模拟记录' });
      if (body.kind === 'retract') { p.result = null; p.firstResult = null; p.currentEventId = null; }
      else if (member.result) { p.result = member.result; p.firstResult ??= member.result; p.currentEventId = eventId; }
      if (member.included !== undefined) p.included = member.included;
      if (member.exempt !== undefined) p.exempt = member.exempt;
      p.version++;
    }
    if (body.lifecycle) task.task.lifecycle = body.lifecycle;
    for (const key of ['name', 'checkDate', 'description'] as const) if (body[key] !== undefined) task.task[key] = body[key]!;
    if (body.dueDate !== undefined) task.task.dueDate = body.dueDate;
    task.task.activityRevision++; task.counts = countTaskParticipants(task.participants);
    const result: OperationResult = { operationId: body.operationId, taskId: task.task.id, kind: body.kind, committedAt: now(), detail: task };
    task.operations.push({ operationId: body.operationId, taskId: task.task.id, kind: body.kind, actorUserId: 'qingsong-visitor-demo', source: 'demo', committedAt: result.committedAt, participantIds: members.map(m => m.participantId) }); operations.set(body.operationId, result); return result;
  };
  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'https://demo.invalid');
    const path = decodeURIComponent(url.pathname), parts = path.split('/').filter(Boolean), method = (init.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    const read = method === 'GET';
    let body: Record<string, any> = {}; // Mimic JSON route payloads; domain fixtures remain strongly typed.
    try { if (typeof init.body === 'string') body = JSON.parse(init.body); } catch { return json({ code: unavailable, message: unavailable }, 409); }
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return json({ code: unavailable, message: unavailable }, 409);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (path === '/api/account' && read) return json({ user: { id: 'qingsong-visitor-demo', email: 'demo@qingsong.test', name: '体验老师' }, role: 'teacher', profile });
    if (path === '/api/account/profile' && method === 'PUT') return json({ profile: Object.assign(profile, body) });
    if (path === '/api/roster' && read) { counts(); return json(data.roster); }
    if (path === '/api/classes' && (read || method === 'POST')) { if (read) return json({ classes: data.roster.classes }); const schoolClass = { ...body, id: id(), studentCount: 0, status: 'active' as const } as typeof data.roster.classes[number]; data.roster.classes.push(schoolClass); return json({ schoolClass }); }
    if (parts[1] === 'classes') {
      const c = data.roster.classes.find(c => c.id === parts[2]);
      if (!c) return json({ code: 'CLASS_NOT_FOUND' }, 404);
      if (parts.length === 3 && method === 'PATCH') { Object.assign(c, body); counts(); return json({ schoolClass: c }); }
      if (parts[3] === 'archive' && method === 'POST') { c.status = c.status === 'active' ? 'archived' : 'active'; return json({ schoolClass: c }); }
      const students = data.roster.students.filter(s => s.classId === c.id);
      if (parts[3] === 'students' && read) return json({ students });
      if (parts[3] === 'student-by-no') return json({ student: students.find(s => s.studentNo === parts[4]) });
      if (parts[3] === 'submission-match' && method === 'POST') { const nos = body.studentNos as string[]; return json({ matched: students.filter(s => nos.includes(s.studentNo)), missing: students.filter(s => !nos.includes(s.studentNo)), unknownStudentNos: nos.filter(n => !students.some(s => s.studentNo === n)), duplicateStudentNos: [] }); }
      if (parts[3] === 'committee-assignments' && method === 'PUT') { for (const s of students) s.committeeRoleIds = (body.assignments as Array<{ studentId: string; roleId: string }>).filter(a => a.studentId === s.id).map(a => a.roleId); return json({ students }); }
      if (parts[3] === 'classroom-layout' && !parts[4] && (read || method === 'PUT')) {
        let layout = layouts.get(c.id);
        if (!layout) { layout = { classId: c.id, rowCount: 4, columnCount: 4, seats: students.map((s, i) => ({ seatIndex: i, studentId: s.id })), updatedAt: now() }; layouts.set(c.id, layout); }
        if (method === 'PUT') Object.assign(layout, { rowCount: body.rowCount, columnCount: body.columnCount, seats: body.seats, updatedAt: now() });
        return json({ layout });
      }
    }
    if (path === '/api/students' && method === 'POST') { const student = { ...body, id: id(), enrollmentStatus: 'active' } as RosterStudent; student.studentId = student.id; data.roster.students.push(student); counts(); return json({ student }); }
    if (parts[1] === 'students' && parts.length === 3 && ['PATCH', 'DELETE'].includes(method)) { const i = data.roster.students.findIndex(s => s.id === parts[2]); if (i < 0) return json({ code: 'STUDENT_NOT_FOUND' }, 404); if (method === 'DELETE') { data.roster.students.splice(i, 1); counts(); return json({}); } Object.assign(data.roster.students[i], body); return json({ student: data.roster.students[i] }); }
    if (path === '/api/committee-roles') { if (read) return json({ roles: data.roster.committeeRoles }); const role = { id: id(), name: body.name, sortOrder: data.roster.committeeRoles.length, isDefault: false }; data.roster.committeeRoles.push(role); return json({ role }); }
    if (parts[1] === 'committee-roles' && parts[2]) { const i = data.roster.committeeRoles.findIndex(r => r.id === parts[2]); if (i < 0) return json({}, 404); if (method === 'DELETE') { data.roster.committeeRoles.splice(i, 1); return json({}); } Object.assign(data.roster.committeeRoles[i], body); return json({ role: data.roster.committeeRoles[i] }); }
    if (path === '/api/schedule' && read) return json({ schedule: data.schedule, periods: data.periods, reminders: data.reminders });
    if (path === '/api/schedule/periods' && method === 'PUT') { data.periods = body.periods; return json({ periods: data.periods }); }
    if (parts[1] === 'schedule' && ['draft', 'import'].some(x => parts.includes(x))) return json({ code: unavailable, message: unavailable }, 409);
    if (parts[1] === 'schedule' && (parts[2] === 'items' || parts[2] === 'reminders') && !read) {
      const collection = parts[2] === 'items' ? data.schedule : data.reminders;
      const key = parts[2] === 'items' ? 'item' : 'reminder';
      if (method === 'DELETE') { const index = collection.findIndex(x => x.id === parts[3]); if (index >= 0) collection.splice(index, 1); return json({}); }
      const items = parts[3] === 'batch' ? body[parts[2]] : [body];
      for (const item of items) { const index = collection.findIndex(x => x.id === item.id); if (index >= 0) Object.assign(collection[index], item); else collection.push(item); }
      return json(parts[3] === 'batch' || parts[4] === 'series' ? { [parts[2]]: items } : { [key]: items[0] });
    }
    if (path === '/api/grading-task-list' && read) return json({ tasks: data.tasks });
    if (parts[1] === 'grading-task-list' && parts[2] && ['PUT', 'DELETE'].includes(method)) { const index = data.tasks.findIndex(t => t.id === parts[2]); if (method === 'DELETE') { if (index >= 0) data.tasks.splice(index, 1); return json({}); } if (index >= 0) Object.assign(data.tasks[index], body); else data.tasks.push(body as typeof data.tasks[number]); return json({ task: body }); }
    if (path === '/api/material-pool/folders') { if (read) return json({ folders: data.folders }); const folder = { id: id(), parentId: body.parentId ?? null, name: body.name, presetKey: null, sortOrder: data.folders.length, archivedAt: null }; data.folders.push(folder); return json({ folder }); }
    if (parts[1] === 'material-pool' && parts[2] === 'folders' && parts[3]) { const folder = data.folders.find(f => f.id === parts[3]); if (!folder) return json({}, 404); if (parts[4] === 'archive') folder.archivedAt = now(); else if (parts[4] === 'restore') folder.archivedAt = null; else Object.assign(folder, body); return json({ folder }); }
    if (path === '/api/material-pool/items' && read) { const folder = url.searchParams.get('folderId'), q = url.searchParams.get('q') ?? '', state = url.searchParams.get('state') ?? 'saved'; return json({ items: data.poolItems.filter(i => i.state === state && (!folder || i.folderId === (folder === 'unfiled' ? null : folder)) && i.originalName.includes(q)), nextOffset: null }); }
    if (parts[1] === 'material-pool' && parts[2] === 'items' && parts[3]) { const item = data.poolItems.find(i => i.id === parts[3]); if (!item) return json({}, 404); if (parts[4] === 'trash') item.state = 'trashed'; else if (parts[4] === 'restore') item.state = 'saved'; else if (method === 'PATCH') Object.assign(item, body); else return json({ code: unavailable, message: unavailable }, 409); return json({ item }); }
    if (path === '/api/resources' && read) return json({ resources: data.resources });
    if (parts[1] === 'resources' && parts[2]) { const resource = data.resources.find(r => r.id === parts[2]); if (!resource) return json({}, 404); if (read && parts[3] === 'retrieve') return json({ results: resource.chunks.map((c, i) => ({ ...c, retrievalRank: i + 1 })) }); if (parts[3] === 'pages' && parts[4]) {
        const page = resource.pages.find(p => p.pageNumber === Number(parts[4]));
        if (!page) return json({}, 404);
        if (parts[5] === 'image' && read) return new Response(decodeURIComponent(demoImage.split(',').slice(1).join(',')), { headers: { 'content-type': 'image/svg+xml' } });
        if (!parts[5] && method === 'PATCH') { page.included = Boolean(body.included); page.ragStatus = page.included ? 'indexed' : 'excluded'; return json({ page }); }
        if (!parts[5] && read) return json({ page, chunks: resource.chunks.filter(c => c.pageStart <= page.pageNumber && c.pageEnd >= page.pageNumber) });
      }
      if (!parts[3] && method === 'PATCH') { Object.assign(resource, body); return json({ resource }); }
      if (!parts[3] && read || parts[3] === 'analyze' && method === 'POST') return json({ resource }); }
    if (path === '/api/knowledge' && read) return json(data.knowledge);
    if (path === '/api/knowledge/tree' && read) return json({ subject: '数学', nodes: data.knowledge.nodes, unclassified: [] });
    if (parts[1] === 'knowledge' && parts[2] === 'nodes' && parts[4] === 'focus' && read) { const node = data.knowledge.nodes.find(n => n.id === parts[3]); if (!node) return json({}, 404); return json({ node, motherChain: data.knowledge.nodes.filter(n => n.id === node.primaryMotherId), children: data.knowledge.nodes.filter(n => n.primaryMotherId === node.id), prerequisites: [], dependents: [], questionTypes: [], methods: [], examples: [], abilities: [], errors: [], related: [], confusable: [], sourceLinks: data.knowledge.sourceLinks.filter(l => l.nodeId === node.id), resources: data.resources }); }
    if (parts[1] === 'classroom-tasks') {
      if (parts[2] === 'projects') { if (read) return json({ projects }); const project: RecordProject = { key: id(), label: body.name, category: body.category, mode: body.mode, positive: '完成', negative: '未完', version: 1 }; projects.push(project); return json(project); }
      if (parts[2] === 'creation-preview') return json({ participants: data.roster.students.filter(s => s.classId === body.classId).map(s => ({ studentId: s.id, membershipId: `demo-membership-${s.id}`, name: s.name, studentNo: s.studentNo, enrollmentStatus: s.enrollmentStatus, included: !body.excludedStudentIds?.includes(s.id) })), duplicates: [], previewToken: 'demo-preview', expiresAt: new Date(Date.now() + 600000).toISOString() });
      if (parts[2] === 'quick-context' && read) { const classId = url.searchParams.get('classId'); const contextKey = [classId, url.searchParams.get('projectKey'), url.searchParams.get('checkDate'), url.searchParams.get('round') ?? '1'].join(':'); return json({ round: 1, latestRound: 1, availableRounds: [1], detail: quickTasks.get(contextKey) ?? null, participants: data.roster.students.filter(s => s.classId === classId).map(s => ({ studentId: s.id, membershipId: `demo-membership-${s.id}`, name: s.name, studentNo: s.studentNo, enrollmentStatus: s.enrollmentStatus, included: true })), contextToken: 'demo-context' }); }
      if (parts[2] === 'quick-record' && method === 'POST') { const project = projects.find(p => p.key === body.projectKey); const contextKey = [body.classId, body.projectKey, body.checkDate, body.round ?? 1].join(':'); let task = quickTasks.get(contextKey); if (!task) { task = makeTask({ ...body, name: project?.label ?? '模拟快记', mode: project?.mode }); quickTasks.set(contextKey, task); } return json(operate(task, { operationId: body.operationId, kind: 'initial', members: body.members.map((m: { studentId: string; result: 'positive' | 'negative'; expectedVersion: number }) => ({ ...m, participantId: task.participants.find(p => p.studentId === m.studentId)!.id })) })); }
      if (!parts[2] || parts[2] === 'summary') { if (!read) return json(makeTask(body)); const tasks = data.classroomTasks.filter(t => (!url.searchParams.get('classId') || t.task.classId === url.searchParams.get('classId')) && (!url.searchParams.get('lifecycle') || t.task.lifecycle === url.searchParams.get('lifecycle'))).map(taskList); return json({ tasks, total: tasks.length }); }
      const task = data.classroomTasks.find(t => t.task.id === parts[2]);
      if (task) { if (parts[3] === 'history') return json({ events: task.events, operations: task.operations, total: task.events.length }); if (parts[3] === 'operations' && parts[4] === 'preview') return json({ members: body.members ?? [], conflicts: [], previewToken: 'demo-preview', expiresAt: new Date(Date.now() + 600000).toISOString() }); if (parts[3] === 'operations') return json(operate(task, body as OperationInput)); if (read) return json(task); }
    }
    if (parts[1] === 'classroom-task-operations' && operations.has(parts[2])) return json(operations.get(parts[2]));
    if (parts[1] === 'students' && parts[3] === 'classroom-tasks') return json({ tasks: data.classroomTasks.filter(t => t.participants.some(p => p.studentId === parts[2])).map(t => ({ ...taskList(t), participant: t.participants.find(p => p.studentId === parts[2]) })) });
    if (path === '/api/classroom-behavior/rounds') return json({ round: 1, availableRounds: [1] });
    if (parts[1] === 'classroom-behavior') {
      if (read && parts[2] === 'operations') { const event = behaviors.find(e => e.operationId === parts[3]); return event ? json(event) : json({}, 404); }
      if (read) { const events = behaviors.filter(e => !url.searchParams.get('classId') || e.classId === url.searchParams.get('classId')); const studentCounts: Record<string, number> = {}, counts: Record<string, number> = {}; for (const e of events.filter(e => !e.retracted)) { studentCounts[e.studentId] = (studentCounts[e.studentId] ?? 0) + 1; counts[e.kind] = (counts[e.kind] ?? 0) + 1; } return json({ events, total: events.length, studentCounts, counts, labels: Object.fromEntries(projects.map(p => [p.key, p.label])) }); }
      const previous = behaviors.find(e => e.operationId === body.operationId); if (previous) return json(previous);
      if (body.targetId) { const target = behaviors.find(e => e.id === body.targetId); if (target) target.retracted = true; }
      const student = data.roster.students.find(s => s.id === body.studentId); const event: BehaviorEvent = { id: id(), operationId: body.operationId, studentId: body.studentId, studentName: student?.name ?? '模拟学生', classId: body.classId, kind: body.kind, note: body.note, occurredDate: body.occurredDate, recordedAt: now(), actorUserId: 'qingsong-visitor-demo', targetId: body.targetId ?? null, retracted: false, round: 1 }; behaviors.push(event); return json(event);
    }
    if (parts[1] === 'grading-tasks' && parts[2]) {
      const taskId = parts[2]; if (!grading.has(taskId)) grading.set(taskId, demoGradingMaterials(taskId)); const g = grading.get(taskId)!;
      if (parts[3] === 'materials' && (!parts[4] || parts[4] === 'parse')) { if (method === 'DELETE') return json({ removed: [] }); if (parts[4] === 'parse' || !read) return json({ assets: g.assets, asset: g.assets[0] }); return json({ assets: g.assets, documents: g.documents }); }
      if (parts[3] === 'analysis' && (!parts[4] || (parts[4] === 'questions' && parts.length === 6))) { const question = g.analysis.questions.find(q => q.displayNo === parts[5]); if (question && method === 'PUT' && parts.length === 6) Object.assign(question, body); return json({ analysis: g.analysis }); }
      if (parts[3] === 'rubrics') { if (!rubrics.has(taskId)) rubrics.set(taskId, []); if (read) return json({ rubrics: rubrics.get(taskId) }); const rubric: TaskQuestionRubric = { ...body, taskId, questionId: parts[4], updatedAt: now() } as TaskQuestionRubric; const list = rubrics.get(taskId)!; const i = list.findIndex(r => r.questionId === rubric.questionId); if (i < 0) list.push(rubric); else list[i] = rubric; return json({ rubric }); }
      if (parts[3] === 'trial-grading' || parts[3] === 'batch-grading') {
        const questions = body.questions as TrialGradingQuestionInput[] | undefined, submissions = body.submissions as TrialGradingSubmissionInput[] | undefined;
        if (questions?.length && submissions?.length) g.samples = submissions.flatMap((s, si) => questions.map((q, qi): CalibrationSample => ({ id: `demo-sample-${s.studentId}-${q.questionId}`, questionId: q.questionId, studentId: s.studentId, studentName: s.studentName, studentNo: s.studentNo, sampleType: si % 2 ? 'middle' : 'high', rawImageDescription: '预设模拟答卷，未执行真实识别', rawOcrText: qi ? '5 × 5 = 25' : '2x = 12，x = 6', ocrText: qi ? '5 × 5 = 25' : '2x = 12，x = 6', ocrConfidence: 0.97, aiScore: Math.max(0, q.fullScore - si % 3), fullScore: q.fullScore, gradingConfidence: 0.95, matchedPoints: ['方法正确'], missedPoints: si % 3 ? ['表达完整性'] : [], gradingReason: '【预设模拟结果】用于体验教师核对与调整流程。', sourceAssetId: s.assetId, sourcePreviewUrl: g.assets[2].publicUrl, sourcePreviewType: 'image', status: 'pending', needsTeacherReview: false, rubricVersion: q.rubricVersion })));
        const result = { taskId, model: 'demo-preset-no-ai', samples: g.samples, createdAt: now() };
        if (parts[3] === 'trial-grading') { if (parts[5] === 'teacher-review' || parts[5] === 'ocr-correction') { const sample = g.samples.find(s => s.id === parts[4]); if (!sample) return json({}, 404); if (parts[5] === 'ocr-correction') { sample.ocrText = body.correctedText; sample.teacherCorrectedText = body.correctedText; } else { Object.assign(sample, { teacherScore: body.finalScore, teacherReason: body.reason, resultSource: body.resultSource, status: 'confirmed', isFinal: true, reviewStatus: 'resolved' }); } return json({ sample }); } return json({ result }); }
        let batch = batches.get(taskId); if (!batch) { batch = { taskId, status: 'idle', mode: 'batch-checkpoint', totalStudents: 0, processedStudents: 0, failedStudentIds: [], studentIds: [], confirmedStudentIds: [], updatedAt: now() }; batches.set(taskId, batch); }
        if (parts[4] === 'start' || parts[4] === 'resume') Object.assign(batch, { status: 'completed', mode: body.mode ?? batch.mode, studentIds: [...new Set(g.samples.map(s => s.studentId))], totalStudents: submissions?.length ?? batch.totalStudents, processedStudents: submissions?.length ?? batch.totalStudents, completedAt: now(), updatedAt: now() });
        if (parts[4] === 'pause') batch.status = 'paused'; if (parts[4] === 'confirm') batch.confirmedStudentIds = [...new Set([...batch.confirmedStudentIds, ...body.studentIds])]; return json({ batch, result });
      }
      if (parts[3] === 'diagnosis') { const samples = g.samples; return json({ diagnosis: { taskId, studentCount: data.roster.students.filter(s => s.classId === data.tasks.find(t => t.id === taskId)?.classId).length, gradedStudentCount: new Set(samples.map(s => s.studentId)).size, averageScore: samples.length ? samples.reduce((a, s) => a + (s.teacherScore ?? s.aiScore ?? 0), 0) / Math.max(1, new Set(samples.map(s => s.studentId)).size) : null, averageFullScore: 20, questionPerformance: (body.questions ?? []).map((q: { id: string; displayNo: string; score: number }) => ({ questionId: q.id, displayNo: q.displayNo, averageScore: q.score * 0.9, fullScore: q.score, scoreRate: 0.9, reviewCount: 0 })), commonIssues: [{ label: '【模拟】解题步骤表达不完整', count: 2 }], typicalStudents: [] } }); }
      if (parts[3] === 'vision-validation') {
        const assetId = String(parts[4] ?? body.assetId ?? '');
        const asset = g.assets.find(a => a.id === assetId && a.kind === 'student-submission');
        if (!asset) return json({ code: '模拟答卷不存在，请选择预设答卷后重试。', message: '模拟答卷不存在，本次没有保存；请选择预设答卷后重试。' }, 404);
        const key = `${taskId}:${assetId}`;
        let result = visionResults.get(key);
        if (!result || (method === 'POST' && !parts[4])) {
          result = demoVisionValidation(taskId, assetId, Array.isArray(body.questionNos) ? body.questionNos : g.analysis.questions.map(q => q.displayNo));
          visionResults.set(key, result);
        }
        if (parts[5] === 'questions' && parts[6]) {
          const item = result.items.find(i => i.displayNo === parts[6]);
          if (!item) return json({}, 404);
          if (parts[7] === 'region' && parts[8] === 'compare' && method === 'POST') return json({ originalQuote: item.paddleText, intersectingText: item.paddleText, geometricStatus: 'covered', ocrStatus: body.runOcr ? 'completed' : 'not-run', focusedOcrText: body.runOcr ? item.paddleText : undefined });
          if (parts[7] === 'region' && method === 'PUT') { item.region = { ...body.boundingBox, pageNumber: item.region.pageNumber }; item.locatorSource = 'teacher-manual'; }
          else if (parts[7] === 'source' && method === 'PUT') item.preferredRecognitionSource = body.source;
          else return json({ code: unavailable, message: unavailable }, 409);
        } else if (!(read && parts.length === 5 || method === 'POST' && parts.length === 4)) return json({ code: unavailable, message: unavailable }, 409);
        return json({ result });
      }
    }
    return json({ code: unavailable, message: unavailable, demo: true }, 409);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return json({ code: unavailable, message: unavailable, demo: true }, 409);
    }
  };
}
