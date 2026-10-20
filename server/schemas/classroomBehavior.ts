import { z } from 'zod';
const id=z.string().trim().min(1).max(128);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
export const behaviorSchema=z.object({operationId:id,studentId:id,classId:id,kind:z.enum(['participation','cooperation','focus','reminder']),note:z.string().trim().max(1000),occurredDate:date,targetId:id.optional()}).strict();
export const behaviorFilterSchema=z.object({classId:id.optional(),studentId:id.optional(),from:date,to:date,offset:z.coerce.number().int().min(0).max(100000).optional(),limit:z.coerce.number().int().min(1).max(500).optional()}).strict().refine(v=>v.from<=v.to);
