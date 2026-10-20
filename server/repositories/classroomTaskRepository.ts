/** @license SPDX-License-Identifier: Apache-2.0 */
import type { ClassroomTask, TaskDetail, TaskEvent, TaskOperation, TaskParticipant } from '../../src/domain/classroomTasks';
import { countTaskParticipants, reduceTaskParticipant } from '../../src/domain/classroomTasks';
import { getRosterDatabase } from '../database/rosterDatabase';
const db = getRosterDatabase();
const read = <T>(row: unknown): T => JSON.parse((row as {data_json: string}).data_json) as T;
export const taskTransaction = <T>(callback: () => T): T => db.transaction(callback)();
export const findTask = (id: string) => { const row = db.prepare('SELECT data_json FROM classroom_tasks WHERE id=?').get(id); return row ? read<ClassroomTask>(row) : null; };
export const saveTask = (task: ClassroomTask) => db.prepare('INSERT INTO classroom_tasks(id,class_id,data_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json').run(task.id,task.classId,JSON.stringify(task));
export const saveParticipant = (taskId: string, participant: TaskParticipant) => {
  const {result: _result,currentEventId: _head,firstResult: _first,...metadata} = participant;
  db.prepare('INSERT INTO classroom_task_participants(id,task_id,student_id,data_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json').run(participant.id,taskId,participant.studentId,JSON.stringify(metadata));
};
export const saveTaskEvent = (event: TaskEvent) => db.prepare('INSERT INTO classroom_task_events(id,task_id,participant_id,operation_id,data_json) VALUES(?,?,?,?,?)').run(event.id,event.taskId,event.participantId,event.operationId,JSON.stringify(event));
export const findTaskOperation = (id: string) => {
  const row = db.prepare('SELECT * FROM classroom_task_operations WHERE id=?').get(id) as {fingerprint: string;data_json:string;result_json:string} | undefined;
  return row ? {fingerprint:row.fingerprint,operation:JSON.parse(row.data_json) as TaskOperation,result:JSON.parse(row.result_json) as unknown} : null;
};
export const saveTaskOperation = (operation: TaskOperation, fingerprint: string, _result: unknown) => db.prepare('INSERT INTO classroom_task_operations(id,task_id,fingerprint,data_json,result_json) VALUES(?,?,?,?,?)').run(operation.operationId,operation.taskId,fingerprint,JSON.stringify(operation),JSON.stringify({operationId:operation.operationId,taskId:operation.taskId,kind:operation.kind,committedAt:operation.committedAt}));
export const getTaskDetail = (id: string): TaskDetail | null => taskTransaction(() => {
  const task = findTask(id); if (!task) return null;
  const events = db.prepare('SELECT data_json FROM classroom_task_events WHERE task_id=? ORDER BY rowid').all(id).map(row => read<TaskEvent>(row));
  const operations = db.prepare('SELECT data_json FROM classroom_task_operations WHERE task_id=? ORDER BY rowid').all(id).map(row => read<TaskOperation>(row));
  const participants = db.prepare('SELECT data_json FROM classroom_task_participants WHERE task_id=? ORDER BY rowid').all(id).map(row => {
    const participant = read<TaskParticipant>(row);
    return {...participant,...reduceTaskParticipant(events.filter(event => event.participantId === participant.id))};
  });
  return {task,events,operations,participants,counts:countTaskParticipants(participants)};
});
export const listTaskDetails = () => (db.prepare('SELECT id FROM classroom_tasks ORDER BY rowid DESC').all() as {id:string}[]).map(({id}) => getTaskDetail(id)!);
export const listQuickTaskRounds = () => new Map((db.prepare('SELECT task_id,round FROM classroom_quick_rounds').all() as {task_id:string;round:number}[]).map(row=>[row.task_id,row.round]));
