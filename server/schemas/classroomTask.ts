/** @license SPDX-License-Identifier: Apache-2.0 */
import { z } from 'zod';
const id = z.string().trim().min(1).max(128);
const date = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).refine(value => { const d = new Date(value + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value; });
const version = z.number().int().min(0);
const result = z.enum(['positive','negative']);
export const createTaskSchema = z.object({classId:id,name:z.string().trim().min(1).max(100),mode:z.enum(['completion','pass']),checkDate:date,dueDate:date.nullable().optional(),description:z.string().trim().max(2000).optional(),excludedStudentIds:z.array(id).max(1000).optional()}).strict();
export const commitTaskSchema = createTaskSchema.extend({operationId:id,previewToken:z.string().min(1).max(50000)});
export const operationMemberSchema = z.object({participantId:id,expectedVersion:version,result:result.optional(),targetEventId:id.optional(),included:z.boolean().optional(),exempt:z.boolean().optional()}).strict();
export const taskOperationSchema = z.object({
  operationId:id,kind:z.enum(['initial','retest','correct','retract','participation','exemption','metadata','lifecycle']),
  source:z.string().trim().max(80).optional(),reason:z.string().trim().max(1000).optional(),occurredAt:z.iso.datetime().optional(),
  participantId:id.optional(),studentId:id.optional(),expectedVersion:version.optional(),result:result.optional(),targetEventId:id.optional(),included:z.boolean().optional(),exempt:z.boolean().optional(),
  expectedMetadataVersion:version,expectedRosterVersion:version.optional(),lifecycle:z.enum(['active','ended','archived']).optional(),
  name:z.string().trim().min(1).max(100).optional(),checkDate:date.optional(),dueDate:date.nullable().optional(),description:z.string().trim().max(2000).optional(),
  members:z.array(operationMemberSchema).min(1).max(1000).optional(),previewToken:z.string().min(1).max(100000).optional()
}).strict();
export const taskOperationPreviewSchema = taskOperationSchema.omit({operationId:true,previewToken:true});

export const quickContextSchema = z.object({classId:id,projectKey:id,checkDate:date,round:z.coerce.number().int().min(1).max(10000).optional()}).strict();
export const quickRecordSchema = quickContextSchema.extend({round:z.number().int().min(1).max(10000),operationId:id,contextToken:z.string().min(1).max(200000),content:z.string().trim().max(100).optional(),expectedMetadataVersion:version,members:z.array(z.object({studentId:id,expectedVersion:version,result}).strict()).min(1).max(1000)});

export const createRecordProjectSchema=z.object({operationId:id,name:z.string().trim().min(1).max(50),category:z.enum(['study','behavior']),mode:z.enum(['completion','pass','event'])}).strict().refine(v=>(v.category==='behavior')===(v.mode==='event'));
