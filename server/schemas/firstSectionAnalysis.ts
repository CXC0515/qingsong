/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

const evidenceSchema = z.object({
  assetKind: z.enum(['assignment', 'reference-answer']),
  assetId: z.string().min(1),
  fileName: z.string().min(1),
  blockIds: z.array(z.string()),
  quote: z.string(),
  segments: z.array(z.object({
    blockId: z.string().min(1),
    quote: z.string().min(1)
  })),
  visualRegion: z.object({
    pageNumber: z.number().int().positive(),
    boundingBox: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1)
    })
  }).nullable()
});

const rubricPointSchema = z.object({
  point: z.string(),
  score: z.number().nonnegative().nullable(),
  description: z.string()
});

export const knowledgeCandidateSchema = z.object({
  nodeId: z.string(),
  nodeName: z.string(),
  confidence: z.number().min(0).max(1)
});

const questionUnitSchema = z.object({
  displayNo: z.string().min(1),
  title: z.string(),
  stem: z.string().min(1),
  score: z.number().nonnegative().nullable(),
  questionType: z.string().min(1),
  answerRequirement: z.string(),
  standardAnswer: z.string(),
  explanation: z.string(),
  rubricPoints: z.array(rubricPointSchema),
  knowledgeCandidates: z.array(knowledgeCandidateSchema),
  questionSource: evidenceSchema,
  answerSource: evidenceSchema.nullable(),
  confidence: z.number().min(0).max(1),
  reviewReasons: z.array(z.string())
});

export const firstSectionResponseSchema = z.object({
  scope: z.literal('整份作业'),
  questions: z.array(questionUnitSchema.extend({
    subquestions: z.array(questionUnitSchema)
  }))
});

export const firstSectionModelOutputSchema = firstSectionResponseSchema.extend({
  questions: firstSectionResponseSchema.shape.questions.min(1, 'MODEL_NO_QUESTIONS')
});

export type FirstSectionModelOutput = z.infer<typeof firstSectionModelOutputSchema>;
export const firstSectionAnalysisJsonSchema = z.toJSONSchema(firstSectionResponseSchema);
