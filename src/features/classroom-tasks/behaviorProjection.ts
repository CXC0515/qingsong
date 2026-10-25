import type { BehaviorEvent, BehaviorInput } from '../../domain/classroomBehavior';
import type { RecordingJob } from './recordingQueue';

export type BehaviorIntent = BehaviorInput & { targetOperationId?: string };

/** Server facts plus unconfirmed intents. A lost acknowledgement is never another occurrence. */
export function behaviorProjection(events: BehaviorEvent[], jobs: RecordingJob<BehaviorIntent, BehaviorInput>[], base?:Record<string,number>) {
  const counts = new Map<string, number>(base?Object.entries(base):[]);
  const byOperation = new Map(events.map(event => [event.operationId,event]));
  const byId = new Map(events.map(event => [event.id,event]));
  for (const event of events) if (!base && !event.retracted && !event.targetId) counts.set(event.studentId,(counts.get(event.studentId)??0)+1);
  for (const job of jobs) {
    const intent=job.intent;
    if (!intent) continue;
    const retract=Boolean(intent.targetId||intent.targetOperationId);
    const target=intent.targetId?byId.get(intent.targetId):byOperation.get(intent.targetOperationId??'');
    if ((!retract&&byOperation.has(job.id)) || (retract&&target?.retracted)) continue;
    counts.set(intent.studentId,(counts.get(intent.studentId)??0)+(retract?-1:1));
  }
  return counts;
}
