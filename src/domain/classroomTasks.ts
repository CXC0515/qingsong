/** @license SPDX-License-Identifier: Apache-2.0 */
export type TaskMode = 'completion' | 'pass';
export type TaskResult = 'positive' | 'negative';
export type TaskLifecycle = 'active' | 'ended' | 'archived';
export type TaskOperationKind = 'initial' | 'retest' | 'correct' | 'retract' | 'participation' | 'exemption' | 'metadata' | 'lifecycle';
export interface ClassroomTask {
  id: string; classId: string; className: string; name: string; mode: TaskMode; checkDate: string;
  dueDate: string | null; description: string; lifecycle: TaskLifecycle; previousLifecycle?: TaskLifecycle;
  metadataVersion: number; rosterVersion: number; activityRevision: number; createdAt: string; updatedAt: string;
}
export interface TaskParticipant {
  id: string; studentId: string; membershipId: string; name: string; studentNo: string; enrollmentStatus: string;
  included: boolean; exempt: boolean; version: number; result: TaskResult | null; currentEventId: string | null; firstResult: TaskResult | null;
}
export interface TaskEvent {
  id: string; taskId: string; participantId: string | null; operationId: string; kind: TaskOperationKind | 'create';
  result: TaskResult | null; previousEventId: string | null; targetEventId: string | null;
  occurredAt: string; recordedAt: string; actorUserId: string; source: string; reason: string;
  data?: Record<string, unknown>;
}
export interface TaskOperation { operationId: string; taskId: string; kind: TaskOperationKind | 'create'; actorUserId: string; source: string; committedAt: string; participantIds: string[]; }
export interface TaskCounts { positive: number; negative: number; unrecorded: number; exempt: number; total: number; required: number; rate: number | null; }
export interface TaskDetail { task: ClassroomTask; participants: TaskParticipant[]; counts: TaskCounts; events: TaskEvent[]; operations: TaskOperation[]; }
export interface TaskListItem extends ClassroomTask { counts: TaskCounts; round?: number; }
export interface CreateTaskInput { classId: string; name: string; mode: TaskMode; checkDate: string; dueDate?: string | null; description?: string; excludedStudentIds?: string[]; }
export interface PreviewStudent { studentId: string; membershipId: string; name: string; studentNo: string; enrollmentStatus: string; included: boolean; }
export interface CreationPreview { participants: PreviewStudent[]; duplicates: TaskListItem[]; previewToken: string; expiresAt: string; }
export interface OperationMember { participantId: string; expectedVersion: number; result?: TaskResult; targetEventId?: string; included?: boolean; exempt?: boolean; }
export interface OperationInput {
  operationId: string; kind: TaskOperationKind; source?: string; reason?: string; occurredAt?: string;
  participantId?: string; studentId?: string; expectedVersion?: number; result?: TaskResult; targetEventId?: string; included?: boolean; exempt?: boolean;
  expectedMetadataVersion?: number; expectedRosterVersion?: number; lifecycle?: TaskLifecycle;
  name?: string; checkDate?: string; dueDate?: string | null; description?: string;
  members?: OperationMember[]; previewToken?: string;
}
export interface OperationPreview { members: OperationMember[]; conflicts: Array<{participantId: string; code: string}>; previewToken: string | null; expiresAt: string; }
export interface OperationResult { operationId: string; taskId: string; kind: TaskOperationKind | 'create'; committedAt: string; detail: TaskDetail; }
export const reduceTaskParticipant = (events: TaskEvent[]) => {
  const facts = new Map<string, TaskEvent>();
  let head: TaskEvent | undefined;
  for (const event of events) {
    if (event.kind === 'initial' || event.kind === 'retest' || event.kind === 'correct') { facts.set(event.id, event); head = event; }
    if (event.kind === 'retract' && head?.id === event.targetEventId) head = head.previousEventId ? facts.get(head.previousEventId) : undefined;
  }
  const chain: TaskEvent[] = [];
  const seen = new Set<string>();
  for (let event = head; event && !seen.has(event.id); event = event.previousEventId ? facts.get(event.previousEventId) : undefined) { chain.unshift(event); seen.add(event.id); }
  let first = chain.find(event => event.kind === 'initial');
  let firstResult = first?.result ?? null;
  for (const event of chain) if (event.kind === 'correct' && event.targetEventId === first?.id) { firstResult = event.result; first = event; }
  return {result: head?.result ?? null, currentEventId: head?.id ?? null, firstResult};
};
export const countTaskParticipants = (participants: TaskParticipant[]): TaskCounts => {
  const included = participants.filter(participant => participant.included);
  const required = included.filter(participant => !participant.exempt);
  const positive = required.filter(participant => participant.result === 'positive').length;
  const negative = required.filter(participant => participant.result === 'negative').length;
  return {positive, negative, unrecorded: required.length - positive - negative, exempt: included.length - required.length, total: included.length, required: required.length, rate: required.length ? positive / required.length : null};
};

export const quickProjects = [
  { key: 'collection', label: '作业收交', mode: 'completion', positive: '已交', negative: '未交' },
  { key: 'correction', label: '练习订正', mode: 'completion', positive: '完成', negative: '未完' },
  { key: 'recitation', label: '背诵检查', mode: 'pass', positive: '通过', negative: '未过' },
] as const;
export interface QuickContextInput { classId: string; projectKey: string; checkDate: string; round?: number; }
export interface QuickContext {
  round: number; latestRound: number; detail: TaskDetail | null; participants: PreviewStudent[]; contextToken: string;
}
export interface QuickRecordInput extends QuickContextInput {
  round: number; operationId: string; contextToken: string; content?: string;
  expectedMetadataVersion: number;
  members: Array<{ studentId: string; expectedVersion: number; result: TaskResult }>;
}

export interface RecordProject {
  key: string; label: string; category: 'study' | 'behavior'; mode: TaskMode | 'event';
  positive: string; negative: string;
}
export interface CreateRecordProject { operationId: string; name: string; category: 'study' | 'behavior'; mode: TaskMode | 'event'; }
