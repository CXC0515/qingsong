/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SchoolClass } from '../../../src/domain/types';

export type ScheduleClassMatchReason =
  | 'exact-name'
  | 'normalized-name'
  | 'grade-class-number'
  | 'ai-catalog-selection'
  | 'conflicting-evidence'
  | 'ambiguous-candidates'
  | 'no-candidate';

export interface ScheduleClassMatch {
  status: 'matched' | 'unresolved' | 'unassigned';
  reason: ScheduleClassMatchReason | 'teacher-selected' | 'teacher-unassigned';
  candidateClassIds: string[];
}

export interface ScheduleClassEvidence {
  recognizedClassText: string;
  aiCandidateClassId?: string;
  confidence?: number;
  aiNeedsReview?: boolean;
}

const chineseDigitValues: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const parseChineseNumber = (value: string) => {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [tens, ones = ''] = value.split('十');
    return (tens ? chineseDigitValues[tens] ?? 0 : 1) * 10 + (ones ? chineseDigitValues[ones] ?? 0 : 0);
  }
  return chineseDigitValues[value];
};

export const normalizeClassLabel = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('zh-CN')
  .replace(/[\s()（）\[\]【】{}<>《》·,，.。:：;；'"“”‘’/_\\\-—–]/g, '')
  .trim();

export const gradeNumberFromText = (value: string) => {
  const compact = normalizeClassLabel(value);
  const schoolStage = compact.match(/(?:初中|初)([一二三123])/);
  if (schoolStage) return parseChineseNumber(schoolStage[1]) + 6;
  const highStage = compact.match(/(?:高中|高)([一二三123])/);
  if (highStage) return parseChineseNumber(highStage[1]) + 9;
  const grade = compact.match(/([零〇一二两三四五六七八九十\d]+)年级/);
  return grade ? parseChineseNumber(grade[1]) : undefined;
};

export const classNumberFromText = (value: string) => {
  const withoutGrade = normalizeClassLabel(value)
    .replace(/(?:初中|初)[一二三123]/g, '')
    .replace(/(?:高中|高)[一二三123]/g, '')
    .replace(/[零〇一二两三四五六七八九十\d]+年级/g, '');
  const match = withoutGrade.match(/([零〇一二两三四五六七八九十\d]+)班/);
  return match ? parseChineseNumber(match[1]) : undefined;
};

const classIdentity = (value: string, gradeHint = '') => {
  const gradeNumber = gradeNumberFromText(value) ?? gradeNumberFromText(gradeHint);
  const classNumber = classNumberFromText(value);
  return gradeNumber && classNumber ? `${gradeNumber}:${classNumber}` : '';
};

const localCandidates = (evidenceText: string, classes: SchoolClass[]) => {
  const normalizedEvidence = normalizeClassLabel(evidenceText);
  if (!normalizedEvidence) return { ids: [] as string[], reason: undefined as ScheduleClassMatchReason | undefined };

  const exact = classes.filter(item => normalizeClassLabel(item.name) === normalizedEvidence);
  if (exact.length) return { ids: exact.map(item => item.id), reason: 'exact-name' as const };

  const contained = classes.filter(item => {
    const normalizedName = normalizeClassLabel(item.name);
    return normalizedName.length >= 3 && normalizedEvidence.includes(normalizedName);
  });
  if (contained.length) return { ids: contained.map(item => item.id), reason: 'normalized-name' as const };

  const evidenceIdentity = classIdentity(evidenceText);
  if (!evidenceIdentity) return { ids: [] as string[], reason: undefined };
  const identityMatches = classes.filter(item => classIdentity(item.name, item.grade) === evidenceIdentity);
  return { ids: identityMatches.map(item => item.id), reason: identityMatches.length ? 'grade-class-number' as const : undefined };
};

const unique = (values: string[]) => [...new Set(values)];

const editDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const isOrderedSubsequence = (shorter: string, longer: string) => {
  let index = 0;
  for (const character of longer) {
    if (character === shorter[index]) index += 1;
    if (index === shorter.length) return true;
  }
  return false;
};

const isPlausibleAiCorrection = (rawText: string, candidate: SchoolClass) => {
  const raw = normalizeClassLabel(rawText);
  const name = normalizeClassLabel(candidate.name);
  if (!raw || !name) return false;
  const rawGrade = gradeNumberFromText(rawText);
  const candidateGrade = gradeNumberFromText(candidate.name) ?? gradeNumberFromText(candidate.grade);
  const rawClassNumber = classNumberFromText(rawText);
  const candidateClassNumber = classNumberFromText(candidate.name);
  if (rawGrade && candidateGrade && rawGrade !== candidateGrade) return false;
  if (rawClassNumber && candidateClassNumber && rawClassNumber !== candidateClassNumber) return false;
  if (raw.length >= 3 && (raw.includes(name) || name.includes(raw))) return true;
  if (raw.length >= 3 && raw.length / name.length >= 0.4 && isOrderedSubsequence(raw, name)) return true;
  return editDistance(raw, name) <= Math.max(1, Math.ceil(name.length * 0.34));
};

export const matchScheduleClass = (evidence: ScheduleClassEvidence, classes: SchoolClass[]) => {
  const available = new Map(classes.map(item => [item.id, item]));
  const recognized = localCandidates(evidence.recognizedClassText, classes);
  const localIds = unique(recognized.ids);
  const aiClass = evidence.aiCandidateClassId ? available.get(evidence.aiCandidateClassId) : undefined;

  if (localIds.length === 1) {
    if (!aiClass || evidence.aiNeedsReview || aiClass.id !== localIds[0]) {
      return {
        classId: '', className: '',
        match: { status: 'unresolved', reason: 'conflicting-evidence', candidateClassIds: unique([...localIds, ...(aiClass ? [aiClass.id] : [])]) } satisfies ScheduleClassMatch,
      };
    }
    const matched = available.get(localIds[0])!;
    return {
      classId: matched.id, className: matched.name,
      match: { status: 'matched', reason: recognized.reason ?? 'normalized-name', candidateClassIds: [matched.id] } satisfies ScheduleClassMatch,
    };
  }

  if (localIds.length > 1) {
    return {
      classId: '', className: '',
      match: { status: 'unresolved', reason: 'ambiguous-candidates', candidateClassIds: localIds } satisfies ScheduleClassMatch,
    };
  }

  if (aiClass && !evidence.aiNeedsReview && (evidence.confidence ?? 0) >= 0.8 && isPlausibleAiCorrection(evidence.recognizedClassText, aiClass)) {
    return {
      classId: aiClass.id, className: aiClass.name,
      match: { status: 'matched', reason: 'ai-catalog-selection', candidateClassIds: [aiClass.id] } satisfies ScheduleClassMatch,
    };
  }

  return {
    classId: '', className: '',
    match: { status: 'unresolved', reason: 'no-candidate', candidateClassIds: aiClass ? [aiClass.id] : [] } satisfies ScheduleClassMatch,
  };
};
