/** Synthetic browser-only demonstration data. Never import production records. */
import type { RosterSnapshot, KnowledgeGraphSnapshot, ResourceDetail, WorkbenchTask, DocumentAsset, NormalizedDocument, FirstSectionAnalysis, ScheduleItem, SchedulePeriod, TimerReminder, CalibrationSample } from '../domain/types';
import type { PoolFolder, PoolItem } from '../domain/materialPool';
import { countTaskParticipants, type TaskDetail } from '../domain/classroomTasks';

const demoToday = new Date();
export const DEMO_DATE = `${demoToday.getFullYear()}-${String(demoToday.getMonth() + 1).padStart(2, '0')}-${String(demoToday.getDate()).padStart(2, '0')}`;
export const DEMO_NOW = `${DEMO_DATE}T08:00:00.000Z`;
export const demoProfile = { nickname: '体验老师', realName: '体验老师', schoolName: '青松示范学校（虚构）', title: '数学教师' };
export { demoImage } from './assets';
import { demoImage } from './assets';
export function createDemoFixtures() {
  const classes: RosterSnapshot['classes'] = [
    { id: 'demo-class-1', name: '七年级（1）班', grade: '七年级', term: '2026-2027 学年第一学期', headTeacher: '体验老师', studentCount: 12, status: 'active' },
    { id: 'demo-class-2', name: '七年级（2）班', grade: '七年级', term: '2026-2027 学年第一学期', headTeacher: '体验老师', studentCount: 8, status: 'active' },
  ];
  const names = ['林小禾', '陈知远', '周语桐', '许星野', '吴沐阳', '沈书宁', '叶思齐', '苏雨晴', '何嘉树', '方予安', '陆清和', '唐可欣'];
  const students: RosterSnapshot['students'] = classes.flatMap((c, ci) => Array.from({ length: c.studentCount }, (_, i) => ({
    id: `demo-student-${ci + 1}-${i + 1}`, studentId: `demo-student-${ci + 1}-${i + 1}`, name: names[(i + ci * 3) % names.length], studentNo: String(i + 1).padStart(2, '0'), classId: c.id, className: c.name, gender: i % 2 ? 'female' as const : 'male' as const, enrollmentStatus: 'active' as const,
    committeeRoleIds: i === 0 ? ['demo-role-1'] : [], status: i % 5 === 0 ? 'warning' as const : i % 3 === 0 ? 'outstanding' as const : 'good' as const, behaviorTags: i % 3 === 0 ? ['积极发言'] : [],
    parent: { name: '模拟家长', phone: '', relation: '家长', remark: '虚构资料，无真实联系方式' }, familyStatus: 'normal' as const,
    observationHistory: [{ date: DEMO_DATE, type: 'positive' as const, content: '【模拟记录】小组讨论中主动解释解题思路。', category: 'study' as const, author: '体验老师' }],
    strongKnowledge: ['一元一次方程'], weakKnowledge: i % 3 === 0 ? [] : ['几何面积'], recentHomeworkTrend: [70 + i, 72 + i, 76 + i, 74 + i, 80 + i],
    homeworkHistory: [{ id: `demo-homework-${i}`, title: '方程与面积练习（模拟）', date: DEMO_DATE, score: 14 + i % 7, fullScore: 20, status: 'submitted' as const, knowledgeErrors: i % 3 === 0 ? [] : [{ questionId: 'demo-question-2', questionTitle: '正方形面积', points: ['几何面积'], errorType: '单位遗漏', status: 'pending' as const }] }],
  })));
  const roster: RosterSnapshot = { classes, students, committeeRoles: [{ id: 'demo-role-1', name: '班长', sortOrder: 0, isDefault: true }, { id: 'demo-role-2', name: '学习委员', sortOrder: 1, isDefault: true }] };
  const periods: SchedulePeriod[] = Array.from({ length: 8 }, (_, i) => ({ period: i + 1, label: `第${i + 1}节`, startTime: `${String(8 + i).padStart(2, '0')}:00`, endTime: `${String(8 + i).padStart(2, '0')}:40` }));
  const schedule: ScheduleItem[] = Array.from({ length: 5 }, (_, i) => ({ id: `demo-course-${i}`, day: i + 1, period: i % 3 + 1, title: '数学', classId: classes[i % 2].id, className: classes[i % 2].name, type: 'class', time: periods[i % 3].startTime + '-' + periods[i % 3].endTime, scope: 'teacher', teacherName: '体验老师' }));
  const reminders: TimerReminder[] = [{ id: 'demo-reminder-1', name: '复核练习中的易错题（模拟）', classId: classes[0].id, className: classes[0].name, time: '16:00', repeatRule: '不重复', status: 'active', important: true, dueAt: `${DEMO_DATE}T16:00:00`, timeKind: 'point' }];
  const tasks: WorkbenchTask[] = [{ id: 'demo-grading-1', name: '方程与面积练习（模拟）', classId: classes[0].id, className: classes[0].name, node: 'setup', nodeName: '任务设置', deadline: DEMO_DATE, createdAt: DEMO_NOW, collectionDeadlineAt: `${DEMO_DATE}T18:00:00`, status: 'pending', progress: 0 }];
  const resources: ResourceDetail[] = [{ id: 'demo-resource-1', poolItemId: 'demo-pool-1', title: '方程与面积教学笔记（模拟）', fileName: '教学笔记.txt', mimeType: 'text/plain', kind: 'worksheet', subject: '数学', grade: '七年级', publisher: '模拟资料', edition: '演示版', isPrimary: true, status: 'ready', pageCount: 1, publicUrl: 'data:text/plain;charset=utf-8,' + encodeURIComponent('【模拟资料】一元一次方程：等式两边同时加减同一个数，等式仍然成立。正方形面积等于边长乘边长。'), summary: '【模拟内容】通过等式性质理解方程求解，并联系正方形面积进行巩固。', tags: ['方程', '面积', '模拟资料'], parsedPageStart: 1, parsedPageEnd: 1, createdAt: DEMO_NOW, updatedAt: DEMO_NOW,
    chunks: [{ id: 'demo-chunk-1', resourceId: 'demo-resource-1', level: 'content', contentType: 'paragraph', title: '一元一次方程', summary: '等式性质与移项', text: '【模拟资料】解方程 2x + 6 = 18，两边减去 6，再除以 2，可得 x = 6。', tags: ['方程'], pageStart: 1, pageEnd: 1, order: 0 }], suggestions: [], pages: [{ resourceId: 'demo-resource-1', pageNumber: 1, included: true, parseStatus: 'ready', ragStatus: 'indexed', ragChunkCount: 1, updatedAt: DEMO_NOW }], processingJobs: [] }];
  const knowledge: KnowledgeGraphSnapshot = {
    nodes: ['数学基础', '一元一次方程', '几何面积', '等式性质'].map((name, i) => ({ id: `demo-knowledge-${i}`, code: `demo-k-${i}`, name, type: i === 0 ? 'domain' : 'knowledge', description: `【模拟知识点】${name}，用于展示知识组织与资料关联。`, aliases: [], subject: '数学', grade: '七年级', stageIds: ['demo-stage-1'], tags: [], primaryMotherId: i ? 'demo-knowledge-0' : undefined, trainable: i > 0, sortOrder: i, source: 'teacher', version: 1, status: 'active', createdAt: DEMO_NOW, updatedAt: DEMO_NOW })),
    relations: [1, 2, 3].map(i => ({ id: `demo-relation-${i}`, sourceNodeId: `demo-knowledge-${i}`, targetNodeId: 'demo-knowledge-0', type: 'parent', description: '模拟层级', source: 'teacher', version: 1, status: 'active', createdAt: DEMO_NOW, updatedAt: DEMO_NOW })),
    sourceLinks: [{ id: 'demo-link-1', nodeId: 'demo-knowledge-1', resourceId: resources[0].id, chunkId: 'demo-chunk-1', pageNumber: 1, isPrimary: true, quote: resources[0].chunks[0].text, createdAt: DEMO_NOW }], resources, subjects: [{ id: 'demo-subject-1', code: 'math', name: '数学', sortOrder: 0, status: 'active' }], stages: [{ id: 'demo-stage-1', name: '初中', sortOrder: 0, status: 'active' }], tags: [{ id: 'demo-tag-1', name: '模拟资料', status: 'active' }],
  };
  const folders: PoolFolder[] = [{ id: 'demo-folder-1', name: '数学教学（模拟）', parentId: null, presetKey: null, sortOrder: 0, archivedAt: null }];
  const poolItems: PoolItem[] = [{ id: 'demo-pool-1', folderId: folders[0].id, originalName: '教学笔记.txt', detectedMime: 'text/plain', sizeBytes: 260, sha256: 'demo-synthetic-content', state: 'saved', source: 'demo', createdAt: DEMO_NOW, updatedAt: DEMO_NOW, tags: ['方程', '模拟'], resourceId: resources[0].id, resourceStatus: 'ready', contentUrl: resources[0].publicUrl }];
  const classroomTasks: TaskDetail[] = [{ task: { id: 'demo-classroom-1', classId: classes[0].id, className: classes[0].name, name: '课堂练习收交（模拟）', mode: 'completion', checkDate: DEMO_DATE, dueDate: null, description: '可尝试记录完成情况，所有变化仅保留在当前演示页面。', lifecycle: 'active', metadataVersion: 1, rosterVersion: 1, activityRevision: 1, createdAt: DEMO_NOW, updatedAt: DEMO_NOW }, participants: students.filter(s => s.classId === classes[0].id).map((s, i) => ({ id: `demo-participant-${s.id}`, studentId: s.id, membershipId: `demo-membership-${s.id}`, name: s.name, studentNo: s.studentNo, enrollmentStatus: 'active', included: true, exempt: false, version: 1, result: i < 7 ? 'positive' : i < 9 ? 'negative' : null, currentEventId: null, firstResult: i < 7 ? 'positive' : i < 9 ? 'negative' : null })), counts: { positive: 0, negative: 0, unrecorded: 0, exempt: 0, total: 0, required: 0, rate: null }, events: [], operations: [] }];
  classroomTasks.forEach(t => t.counts = countTaskParticipants(t.participants));
  return { roster, periods, schedule, reminders, tasks, resources, knowledge, folders, poolItems, classroomTasks };
}
export function demoGradingMaterials(taskId: string): { assets: DocumentAsset[]; documents: NormalizedDocument[]; analysis: FirstSectionAnalysis; samples: CalibrationSample[] } {
  const assets: DocumentAsset[] = ['assignment', 'reference-answer', 'student-submission'].map((kind, i) => ({ id: `demo-asset-${taskId}-${i}`, taskId, kind: kind as DocumentAsset['kind'], fileName: ['模拟练习题.png', '模拟参考答案.png', '01_模拟答卷.png'][i], mimeType: 'image/png', pageCount: 1, publicUrl: demoImage, sourcePageUrl: demoImage, status: 'ready' }));
  assets[2].fileName = '01_林小禾_模拟答卷.png';
  assets.push(...['陈知远', '周语桐'].map((name, i): DocumentAsset => ({ ...assets[2], id: `demo-asset-${taskId}-${i + 3}`, fileName: `${String(i + 2).padStart(2, '0')}_${name}_模拟答卷.png` })));
  const texts = ['1. 解方程：2x + 6 = 18。（10分）\n2. 正方形边长为5，求面积。（10分）', '1. x = 6。\n2. 面积 = 5 × 5 = 25。', ...['林小禾', '陈知远', '周语桐'].map(name => `姓名：${name}\n1. 2x = 12，x = 6。\n2. 5 × 5 = 25。`)];
  const documents: NormalizedDocument[] = assets.map((a, i) => ({ assetId: a.id, sourceFormat: 'image', markdown: texts[i], blocks: [{ id: `demo-block-${i}`, order: 0, type: 'paragraph', text: texts[i], pageNumber: 1, confidence: 0.97 }], resources: [{ id: `demo-page-${i}`, fileName: a.fileName, mimeType: 'image/svg+xml', publicUrl: demoImage, role: 'source-page', pageNumber: 1 }], warnings: [{ code: 'DEMO', message: '预设模拟结果，未执行真实 OCR。' }], pageCount: 1, parsedAt: DEMO_NOW }));
  const analysis: FirstSectionAnalysis = { taskId, scope: '模拟练习', status: 'needs-review', model: 'demo-preset-no-ai', materialAssetIds: assets.slice(0, 2).map(a => a.id), questions: [1, 2].map((n, i) => ({ displayNo: String(n), title: i ? '正方形面积' : '解一元一次方程', stem: texts[0].split('\n')[i], score: 10, questionType: '解答题', answerRequirement: '写出计算过程', standardAnswer: texts[1].split('\n')[i], explanation: '【模拟分析】根据数学规则逐步计算。', rubricPoints: [{ point: '方法正确', score: 5, description: '写出计算过程' }, { point: '结果正确', score: 5, description: '计算结果正确' }], knowledgeCandidates: [{ nodeId: `demo-knowledge-${n}`, nodeName: i ? '几何面积' : '一元一次方程', confidence: 0.95 }], confirmedKnowledgeNodeIds: [`demo-knowledge-${n}`], questionSource: { assetKind: 'assignment', assetId: assets[0].id, fileName: assets[0].fileName, blockIds: ['demo-block-0'], quote: texts[0].split('\n')[i], pageNumber: 1 }, answerSource: { assetKind: 'reference-answer', assetId: assets[1].id, fileName: assets[1].fileName, blockIds: ['demo-block-1'], quote: texts[1].split('\n')[i], pageNumber: 1 }, confidence: 0.95, reviewReasons: ['预设演示结果，请体验人工核对流程'], subquestions: [] })), createdAt: DEMO_NOW };
  return { assets, documents, analysis, samples: [] };
}

/** Precomputed visual evidence; never performs OCR or calls a model. */
export function demoVisionValidation(taskId: string, assetId: string, questionNos = ['1', '2']): import('../domain/types').VisionValidationResult {
  return {
    taskId, assetId, model: 'demo-preset-no-ai', createdAt: DEMO_NOW,
    items: questionNos.map((displayNo, index) => {
      const text = displayNo === '2' ? '5 × 5 = 25' : '2x + 6 = 18，2x = 12，x = 6';
      const region = { x: 48, y: 143 + index * 220, width: 704, height: 165, pageNumber: 1 };
      return {
        pipelineVersion: 2, preferredRecognitionSource: 'paddle' as const, screenshotStatus: 'available' as const,
        displayNo, region, locatorSource: 'paddle-layout' as const, pageWidth: 800, pageHeight: 1100,
        locationStatus: 'located' as const, locationReasons: ['预设模拟区域，未执行真实识别'], cropUrl: demoImage,
        evidenceUnits: [{ evidenceId: `demo-evidence-${assetId}-${displayNo}`, kind: 'formula' as const, region, cropUrl: demoImage, provisionalText: text, literalText: text, confidence: 0.97, needsReview: false, reviewReasons: [] }],
        paddleText: text, lunaText: text, answerFields: [{ fieldId: `demo-answer-${displayNo}`, label: '解答', text, crossedOutText: [], confidence: 0.97, needsReview: false }],
        crossedOutText: [], selectedOption: null, visualEvidence: '【模拟证据】来自预设样例，未调用 OCR 或 AI。', existingMarkings: [], confidence: 0.97, needsReview: false,
      };
    }),
  };
}
