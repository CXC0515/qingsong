import { z } from 'zod';
const id=z.string().trim().min(1).max(128);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
export const behaviorSchema=z.object({operationId:id,studentId:id,classId:id,kind:id,note:z.string().trim().max(1000),occurredDate:date,targetId:id.optional(),scheduleItemId:id.optional(),round:z.number().int().min(1).max(100000).optional()}).strict();
export const behaviorFilterSchema=z.object({kind:id.optional(),round:z.coerce.number().int().min(1).max(100000).optional(),classId:id.optional(),studentId:id.optional(),scheduleItemId:id.optional(),freeOnly:z.enum(['true','false']).transform(v=>v==='true').optional(),from:date,to:date,offset:z.coerce.number().int().min(0).max(100000).optional(),limit:z.coerce.number().int().min(1).max(500).optional()}).strict().refine(v=>v.from<=v.to);

export const behaviorRoundContextSchema=z.object({classId:id,kind:id,occurredDate:date,scheduleItemId:id.optional()}).strict();
export const behaviorNewRoundSchema=behaviorRoundContextSchema.extend({operationId:id,basedOn:z.number().int().min(1).max(99999)});
