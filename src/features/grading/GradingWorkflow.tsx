import ResponsiveDialog from '../../components/ResponsiveDialog';
import { GlassButton } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  Camera,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Eye,
  FileImage,
  FileText,
  Info,
  Layers3,
  Link2,
  LockKeyhole,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  ZoomIn,
  X
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnalyzedQuestionUnit,
  CalibrationResultSource,
  CalibrationSample,
  DocumentAsset,
  FirstSectionAnalysis,
  GradingBatch,
  GradingDiagnosis,
  GradingFeedbackReason,
  GradingMode,
  GradingQuestion,
  KnowledgeNode,
  QuestionGradingState,
  ReviewItem,
  RosterStudent,
  SchoolClass,
  SourceEvidence,
  SubmissionPage,
  TaskQuestionRubric,
  TrialGradingResult,
  VisionValidationItem,
  VisionValidationResult,
  WorkbenchTask,
  WorkflowState
} from '../../domain/types';
import { orderCalibrationSamplesForTrial } from '../../domain/calibrationSamples';
import SourceEvidenceViewer from './SourceEvidenceViewer';
import ScoreKeypad from './ScoreKeypad';
import RichOcrText from './RichOcrText';
import AnnotatedSubmissionView from './AnnotatedSubmissionView';
import { analyzeTaskMaterials, compareSubmissionQuestionRegion, compareTaskEvidenceRegion, confirmBatchStudents, correctTrialOcr, EvidenceRegionComparison, getBatchGrading, getGradingDiagnosis, getTaskAnalysis, getTaskMaterials, getTaskRubrics, getTaskTrialGrading, getVisionValidation, gradeTaskTrial, parseTaskMaterials, regradeTrialQuestion, removeStudentSubmissions, removeTaskMaterials, retryStudentSubmissionParsing, retryTaskMaterialParsing, runVisionValidation, saveSubmissionQuestionRegion, saveTaskEvidenceRegion, saveTaskMaterialRegion, saveTaskQuestionCorrection, saveTaskRubric, saveTeacherReview, setBatchGradingAction, setSubmissionRecognitionSource, setTaskQuestionKnowledgeLink, startBatchGrading, uploadTaskMaterials, waitForTaskMaterials } from '../../services/gradingApi';
import { listRosterClasses, listRosterStudents } from '../../services/rosterApi';
import { buildMissingSubmissions, buildSubmissionPages } from '../../domain/submissionRoster';
import { resolvedQuestionScore, resolvedUnitScore, resolveRubricScores } from '../../domain/gradingScoreDefaults';

interface GradingWorkflowProps {
  workflowState: WorkflowState;
  classes: SchoolClass[];
  tasks: WorkbenchTask[];
  selectedTask: WorkbenchTask;
  knowledgeNodes: KnowledgeNode[];
  reviewQueue: ReviewItem[];
  lowConfidenceThreshold: number;
  ocrHumanReviewThreshold: number;
  ocrAutoPassThreshold: number;
  onBack: () => void;
  onSelectTask: (task: WorkbenchTask) => void;
  onUpdateTask: (task: WorkbenchTask) => Promise<void>;
  onUpdateState: (newState: Partial<WorkflowState>) => void;
  onSyncToProfiles: (aiResults: WorkflowState['aiResults']) => void;
  onConfirmReview: (reviewId: string, finalScore: number, changeReason: string) => void;
  onBounceToOcr: (reviewId: string) => void;
  onMarkAsSample: (studentName: string) => void;
  onShowToast: (message: string) => void;
}

type StageId = 'assignment' | 'rubric' | 'intake' | 'calibration' | 'grading' | 'review' | 'diagnosis';
type VisionValidationPhase = 'idle' | 'loading' | 'extracting' | 'ready' | 'error';

const stages: { id: StageId; label: string }[] = [
  { id: 'assignment', label: '作业内容' },
  { id: 'rubric', label: '评分依据' },
  { id: 'intake', label: '上传质检' },
  { id: 'calibration', label: '试批校准' },
  { id: 'grading', label: '批量批改' },
  { id: 'review', label: '异常复核' },
  { id: 'diagnosis', label: '结果诊断' }
];

const sampleTypeLabel: Record<CalibrationSample['sampleType'], string> = {
  high: '高分样本',
  middle: '中间样本',
  low: '低分样本',
  boundary: '边界样本',
  'ocr-risk': 'OCR 风险'
};

const getEffectiveOcrText = (sample: CalibrationSample) => sample.teacherCorrectedText ?? sample.rawOcrText ?? sample.ocrText;

const RichQuestionText = RichOcrText;

const modeOptions: { id: GradingMode; label: string; description: string }[] = [
  { id: 'per-submission', label: '每份都确认', description: '每份作业完成后等待教师确认' },
  { id: 'batch-checkpoint', label: '每 10 份确认', description: '分批检查，逐步建立本次任务信任' },
  { id: 'auto-continue', label: '自动继续', description: '正常答卷持续处理，异常单独隔离' }
];

const reviewTriggerLabels = {
  'answer-missing': 'OCR 与 Luna 均未识别到答案',
  'answer-region': '答卷范围需确认',
  'recognition-conflict': '两次识别不一致',
  'crossed-out': '划掉内容需确认',
  'low-confidence': '评分把握较低',
  'rubric-insufficient': '评分依据不足'
} as const;

const feedbackReasonOptions: Array<{ id: GradingFeedbackReason; label: string }> = [
  { id: 'answer-region-incomplete', label: '答卷范围不完整' },
  { id: 'recognition-error', label: '识别文字有误' },
  { id: 'crossed-out-error', label: '划掉内容判断错误' },
  { id: 'rubric-missing', label: '采分点遗漏' },
  { id: 'rubric-judgment-error', label: '采分点判断错误' },
  { id: 'score-too-high', label: '评分过高' },
  { id: 'score-too-low', label: '评分过低' },
  { id: 'other', label: '其他' }
];

const getSampleReviewTriggers = (sample: CalibrationSample, _lowConfidenceThreshold: number): NonNullable<CalibrationSample['reviewTriggers']> => {
  const allowed = sample.reviewTriggers?.filter(trigger => trigger === 'answer-missing' || trigger === 'rubric-insufficient') ?? [];
  if (allowed.length) return allowed;
  return [
    ...(!sample.ocrText.trim() && !sample.lunaReviewText?.trim() ? ['answer-missing' as const] : []),
    ...(sample.aiScore === null ? ['rubric-insufficient' as const] : [])
  ];
};

const panelClass = 'glass-panel rounded-[24px]';
const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-900';

const getFiles = (files: FileList | null) => {
  if (!files) return [];
  const result: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index);
    if (file) result.push(file);
  }
  return result;
};

function UploadSourceButtons({ accept, disabled, onFiles }: {
  accept: string;
  disabled: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const sources = [
    { label: '拍照', accept: 'image/*', capture: 'environment' as const, multiple: false, icon: Camera },
    { label: '从图库选', accept: 'image/*', capture: undefined, multiple: true, icon: FileImage },
    { label: '选文件', accept, capture: undefined, multiple: true, icon: Upload }
  ];
  return <div className="flex flex-wrap justify-center gap-2">
    {sources.map(source => <label key={source.label} className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 ${disabled ? 'pointer-events-none opacity-50' : 'hover:border-emerald-600'}`}>
      <source.icon className="h-4 w-4" />{source.label}
      <input type="file" accept={source.accept} capture={source.capture} multiple={source.multiple} className="sr-only" disabled={disabled} onClick={event => { event.currentTarget.value = ''; }} onChange={event => onFiles(event.currentTarget.files)} />
    </label>)}
  </div>;
}

function PendingUploadItem({ file, index, total, disabled, onMove, onRemove, onPreview }: {
  key?: string;
  file: File;
  index: number;
  total: number;
  disabled: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onPreview: (url: string, label: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="flex min-h-16 items-center gap-2 rounded-xl bg-white p-2 dark:bg-zinc-950">
    {previewUrl ? <button type="button" onClick={() => onPreview(previewUrl, file.name)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg" aria-label={`预览 ${file.name}`}><img src={previewUrl} alt="" className="h-full w-full object-cover" /></button> : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 dark:bg-zinc-800"><FileText className="h-5 w-5 text-slate-500" /></div>}
    <div className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{file.name}</span><span className="text-xs text-slate-500">第 {index + 1} / {total} 份{previewUrl ? ' · 点缩略图预览' : ''}</span></div>
    <button type="button" disabled={disabled || index === 0} onClick={() => onMove(index, -1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 disabled:opacity-30" aria-label={`将 ${file.name} 前移`}><ArrowUp className="h-4 w-4" /></button>
    <button type="button" disabled={disabled || index === total - 1} onClick={() => onMove(index, 1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 disabled:opacity-30" aria-label={`将 ${file.name} 后移`}><ArrowDown className="h-4 w-4" /></button>
    <button type="button" disabled={disabled} onClick={() => onRemove(index)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-rose-700 disabled:opacity-30" aria-label={`移除 ${file.name}`}><X className="h-4 w-4" /></button>
  </div>;
}

const getSubmissionStatus = (page: SubmissionPage, asset?: DocumentAsset) => {
  if (asset?.status === 'failed') return { label: asset.parseErrorCode === 'PADDLEOCR_QUEUE_FULL' ? 'OCR 队列已满，可重试' : asset.parseErrorCode === 'PADDLEOCR_RATE_LIMITED' ? 'OCR 受限，可重试' : 'OCR 失败，可重试', className: 'bg-rose-100 text-rose-800' };
  if (asset?.status === 'processing' || asset?.status === 'uploaded') return { label: asset.status === 'processing' ? '正在识别' : '等待识别', className: 'bg-amber-100 text-amber-800' };
  if (page.rosterMatchStatus === 'ambiguous-student-name') return { label: '同名待确认', className: 'bg-rose-100 text-rose-800' };
  if (page.rosterMatchStatus === 'unreadable-student-name') return { label: '姓名待确认', className: 'bg-rose-100 text-rose-800' };
  if (page.rosterMatchStatus === 'duplicate-student-no') return { label: '重复学号', className: 'bg-rose-100 text-rose-800' };
  if (page.rosterMatchStatus === 'unknown-student-no') return { label: '名册无此学号', className: 'bg-rose-100 text-rose-800' };
  if (page.rosterMatchStatus === 'unreadable-student-no') return { label: '学号待确认', className: 'bg-rose-100 text-rose-800' };
  if (page.rosterMatchStatus === 'pending') return { label: '正在匹配', className: 'bg-amber-100 text-amber-800' };
  if (page.status === 'matched') return { label: '自动通过', className: 'bg-emerald-100 text-emerald-800' };
  if (page.reviewSource === 'multimodal') return { label: '多模态核验', className: 'bg-sky-100 text-sky-800' };
  return { label: '教师复核', className: 'bg-rose-100 text-rose-800' };
};

const removeExactQuote = (source: string, quote: string) => {
  const trimmedQuote = quote.trim();
  if (!trimmedQuote || trimmedQuote === source.trim() || !source.includes(trimmedQuote)) return source;
  return source.replace(trimmedQuote, '');
};

const buildQuestionDisplayStem = (question: FirstSectionAnalysis['questions'][number]) => {
  if (question.teacherCorrectedStem && question.stem.trim()) return question.stem.trim();
  const source = question.questionSource.quote.trim();
  if (!source) return question.stem.trim();
  const childEvidenceQuotes = question.subquestions.flatMap(subquestion =>
    subquestion.questionSource.segments?.map(segment => segment.quote) ?? [subquestion.questionSource.quote]
  );
  const childStems = question.subquestions.map(subquestion => subquestion.stem);
  const withoutChildren = [...childEvidenceQuotes, ...childStems]
    .reduce(removeExactQuote, source)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return withoutChildren || question.stem.trim() || source;
};

function VisionItemCard({ item: initialItem, asset, document }: { item: VisionValidationItem; asset?: DocumentAsset; document?: NonNullable<WorkflowState['assignment']['documents']>[number]; key?: string }) {
  const [item, setItem] = useState(initialItem);
  const choiceEvidenceUnits = item.evidenceUnits?.filter(unit => unit.kind === 'choice' && (unit.region.x !== item.region.x || unit.region.y !== item.region.y || unit.region.width !== item.region.width || unit.region.height !== item.region.height)) ?? [];
  const effectiveAnswer = item.selectedOption || (item.preferredRecognitionSource === 'focused-paddle' ? item.focusedPaddleText ?? '' : item.preferredRecognitionSource === 'luna' ? item.lunaText : item.paddleText);
  const sourcePage = document?.resources.find(resource => resource.role === 'source-page' && (resource.pageNumber ?? 1) === item.region.pageNumber);
  const sourceEvidence: SourceEvidence | undefined = asset && sourcePage && item.pageWidth && item.pageHeight ? { id: `${asset.id}-${item.displayNo}-manual`, assetId: asset.id, assetKind: 'student-submission', fileName: asset.fileName, pageNumber: item.region.pageNumber, boundingBox: { x: item.region.x / item.pageWidth, y: item.region.y / item.pageHeight, width: item.region.width / item.pageWidth, height: item.region.height / item.pageHeight }, ocrText: effectiveAnswer, confidence: item.confidence, imageUrl: item.screenshotStatus === 'unavailable' ? sourcePage.publicUrl : item.cropUrl, sourcePageUrl: sourcePage.publicUrl } : undefined;
  const recognitionSources = [
    item.paddleText ? { source: 'paddle' as const, label: 'Paddle 原文片段' } : null,
    item.focusedPaddleText ? { source: 'focused-paddle' as const, label: '手动截图 OCR' } : null,
    item.lunaText ? { source: 'luna' as const, label: 'Luna 加工结果' } : null
  ].filter(Boolean) as Array<{ source: 'paddle' | 'focused-paddle' | 'luna'; label: string }>;
  const selectSource = async (source: 'paddle' | 'focused-paddle' | 'luna') => {
    if (!asset) return;
    const result = await setSubmissionRecognitionSource(asset.taskId, asset.id, item.displayNo, source);
    const updated = result.items.find(candidate => candidate.displayNo === item.displayNo);
    if (updated) setItem(updated);
  };
  return (
    <article className="grid gap-3 border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">第 {item.displayNo} 题</strong>
        <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${item.needsReview ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {item.needsReview ? '需核验' : `置信度 ${Math.round(item.confidence * 100)}%`}
        </span>
      </div>
      {sourceEvidence ? <SourceEvidenceViewer evidence={sourceEvidence} label={item.screenshotStatus === 'unavailable' ? `第 ${item.displayNo} 题原页（暂无可靠截图）` : `第 ${item.displayNo} 题答卷截图`} saveBehavior="focused-ocr" onCompareRegion={(boundingBox, runOcr) => compareSubmissionQuestionRegion(asset!.taskId, asset!.id, item.displayNo, boundingBox, runOcr)} onSaveRegion={async boundingBox => { const result = await saveSubmissionQuestionRegion(asset!.taskId, asset!.id, item.displayNo, boundingBox); const updated = result.items.find(candidate => candidate.displayNo === item.displayNo); if (updated) setItem(updated); }} /> : item.screenshotStatus !== 'unavailable' ? <img src={item.cropUrl} alt={`第 ${item.displayNo} 题完整区域`} className="max-h-48 w-full border border-slate-200 object-contain" /> : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">暂无可靠截图，请从答卷原页手动框选。</p>}
      {choiceEvidenceUnits.length ? (
        <div className="grid grid-cols-2 gap-2">
          {choiceEvidenceUnits.map(unit => (
            <figure key={unit.evidenceId} className="min-w-0">
              <img src={unit.cropUrl} alt={`${unit.evidenceId} 学生作答证据`} className="h-20 w-full border border-slate-200 bg-white object-contain" />
              <figcaption className={`mt-1 truncate text-[10px] ${unit.needsReview ? 'font-bold text-amber-700' : 'text-slate-500'}`} title={unit.reviewReasons.join('；')}>
                {unit.evidenceId}{unit.needsReview ? ' · 待核验' : ''}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {item.locationStatus !== 'located' ? <p className="text-[11px] font-bold text-rose-700">题目区域待确认：{item.locationReasons.join('；')}</p> : null}
      {item.answerFields?.length ? (
        <div className="space-y-1">{item.answerFields.map(field => <p key={field.fieldId} className="text-xs leading-5"><strong>{field.label}：</strong>{field.text || '未填写'}{field.needsReview ? <span className="ml-1 text-amber-700">待核验</span> : null}</p>)}</div>
      ) : <div className="space-y-2 text-xs leading-5"><p><strong>{item.needsReview ? '评分采用文本（待核验）' : '评分采用文本'}：</strong><RichOcrText text={effectiveAnswer || '未识别'} /></p>{item.paddleText ? <p className="text-slate-500"><strong>PaddleOCR 原文片段：</strong><RichOcrText text={item.paddleText} /></p> : null}{item.focusedPaddleText ? <p className="text-slate-500"><strong>手动截图 OCR：</strong><RichOcrText text={item.focusedPaddleText} /></p> : null}{item.focusedOcrStatus === 'failed' ? <p className="font-bold text-rose-700">截图已保存，但局部 OCR 失败；原有识别文本未被覆盖。</p> : null}{item.lunaText ? <p className="text-slate-500"><strong>Luna 加工结果：</strong><RichOcrText text={item.lunaText} /></p> : null}</div>}
      {asset && recognitionSources.length > 1 ? <div className="flex flex-wrap gap-2 text-xs">{recognitionSources.map(option => <button key={option.source} type="button" disabled={item.preferredRecognitionSource === option.source} onClick={() => void selectSource(option.source)} className={`min-h-11 rounded-xl px-3 font-bold disabled:bg-emerald-100 disabled:text-emerald-800 ${option.source === 'luna' ? 'bg-emerald-700 text-white' : 'border border-slate-300'}`}>{item.preferredRecognitionSource === option.source ? `已采用${option.label}` : `采用${option.label}`}</button>)}</div> : null}
      {item.crossedOutText.length ? <p className="text-[11px] leading-5 text-slate-500">已划去：{item.crossedOutText.join('；')}</p> : null}
      {item.existingMarkings.length ? <p className="text-[11px] leading-5 text-amber-700">已有批改痕迹：{item.existingMarkings.join('；')}</p> : null}
    </article>
  );
}

const prefixRubricPoint = (displayNo: string, point: string) => point.trim().startsWith(displayNo) ? point : `${displayNo} ${point}`;

const buildWorkflowFromAnalysis = (taskId: string, analysis: FirstSectionAnalysis, savedRubrics: TaskQuestionRubric[] = []) => {
  const sourceEvidence = analysis.questions.flatMap(question => {
    const questionEvidenceId = `${taskId}-question-${question.displayNo}`;
    const answerEvidenceId = `${taskId}-answer-${question.displayNo}`;
    return [{
      id: questionEvidenceId,
      assetId: question.questionSource.assetId,
      assetKind: question.questionSource.assetKind,
      fileName: question.questionSource.fileName,
      pageNumber: question.questionSource.pageNumber ?? 1,
      boundingBox: question.questionSource.boundingBox ?? { x: 0, y: 0, width: 1, height: 1 },
      ocrText: question.questionSource.quote,
      blockIds: question.questionSource.blockIds,
      segments: question.questionSource.segments,
      isPartialBlock: question.questionSource.isPartialBlock,
      cropMode: question.questionSource.cropMode,
      blockImageUrl: question.questionSource.blockImageUrl,
      confidence: question.confidence,
      imageUrl: question.questionSource.imageUrl,
      sourcePageUrl: question.questionSource.sourcePageUrl,
      evidenceMode: question.questionSource.evidenceMode ?? 'native-text',
      locatorStatus: question.questionSource.locatorStatus ?? 'located',
      locatorReasons: question.questionSource.locatorReasons ?? []
    }, ...(question.answerSource ? [{
      id: answerEvidenceId,
      assetId: question.answerSource.assetId,
      assetKind: question.answerSource.assetKind,
      fileName: question.answerSource.fileName,
      pageNumber: question.answerSource.pageNumber ?? 1,
      boundingBox: question.answerSource.boundingBox ?? { x: 0, y: 0, width: 1, height: 1 },
      ocrText: question.answerSource.quote,
      blockIds: question.answerSource.blockIds,
      segments: question.answerSource.segments,
      isPartialBlock: question.answerSource.isPartialBlock,
      cropMode: question.answerSource.cropMode,
      blockImageUrl: question.answerSource.blockImageUrl,
      confidence: question.confidence,
      imageUrl: question.answerSource.imageUrl,
      sourcePageUrl: question.answerSource.sourcePageUrl,
      evidenceMode: question.answerSource.evidenceMode ?? 'native-text',
      locatorStatus: question.answerSource.locatorStatus ?? 'located',
      locatorReasons: question.answerSource.locatorReasons ?? []
    }] : [])];
  });
  const questions: WorkflowState['questions'] = analysis.questions.map(question => {
    const authoritativeStem = buildQuestionDisplayStem(question);
    const subquestions = question.subquestions.map(unit => ({
      displayNo: unit.displayNo,
      title: unit.title,
      stem: unit.stem,
      score: resolvedUnitScore(unit),
      questionType: unit.questionType,
      answerRequirement: unit.answerRequirement,
      standardAnswer: unit.standardAnswer,
      explanation: unit.explanation,
      rubricPoints: resolveRubricScores(unit.rubricPoints, resolvedUnitScore(unit), '参考答案要点')
    }));
    return {
    id: `${taskId}-q-${question.displayNo}`,
    displayNo: question.displayNo,
    title: question.title || `第 ${question.displayNo} 题`,
    score: resolvedQuestionScore(question),
    knowledgePoint: question.knowledgeCandidates.map(candidate => candidate.nodeName).join('、') || '待关联知识点',
    knowledgeLinks: question.knowledgeCandidates.map(candidate => ({ ...candidate, status: question.confirmedKnowledgeNodeIds?.includes(candidate.nodeId) ? 'confirmed' as const : 'suggested' as const })),
    desc: authoritativeStem,
    stem: authoritativeStem,
    aiQuestionType: question.questionType,
    answerRequirement: question.answerRequirement,
    parseConfidence: question.confidence,
    sourceEvidenceIds: [`${taskId}-question-${question.displayNo}`],
    subquestions
  };
  });
  const rubricByQuestionId = new Map(savedRubrics.map(rubric => [rubric.questionId, rubric]));
  const questionGradingStates: QuestionGradingState[] = analysis.questions.map(question => {
    const questionId = `${taskId}-q-${question.displayNo}`;
    const savedRubric = rubricByQuestionId.get(questionId);
    return {
    questionId,
    standardAnswer: savedRubric?.standardAnswer.trim()
      ? savedRubric.standardAnswer
      : question.standardAnswer || question.subquestions.map(unit => `${unit.displayNo} ${unit.standardAnswer}`).join('\n'),
    standardAnswerSourceIds: question.answerSource ? [`${taskId}-answer-${question.displayNo}`] : [],
    gradingRubric: savedRubric?.gradingRubric.length ? savedRubric.gradingRubric : (question.rubricPoints.length
      ? resolveRubricScores(question.rubricPoints, resolvedQuestionScore(question), '参考答案要点')
      : question.subquestions.length
        ? question.subquestions.flatMap(unit => resolveRubricScores(unit.rubricPoints, resolvedUnitScore(unit), '参考答案要点').map(point => ({ ...point, point: prefixRubricPoint(unit.displayNo, point.point) })))
        : resolveRubricScores([], resolvedQuestionScore(question), '参考答案要点')),
    teacherRules: savedRubric?.teacherRules ?? [],
    rubricVersion: savedRubric?.rubricVersion ?? 1,
    sampleTarget: 3,
    calibrationSamples: [],
    jointReviewEnabled: false
  };});
  return {
    questions,
    sourceEvidence,
    questionGradingStates,
    standardAnswer: questionGradingStates[0]?.standardAnswer ?? '',
    gradingRubric: questionGradingStates[0]?.gradingRubric ?? []
  };
};

const applyTrialSamples = (states: QuestionGradingState[], result: TrialGradingResult | null) => {
  if (!result) return states;
  return states.map(state => ({
    ...state,
    calibrationSamples: orderCalibrationSamplesForTrial(result.samples.filter(sample => sample.questionId === state.questionId))
  }));
};

const hasUsableVisionItem = (item: VisionValidationItem | undefined) => Boolean(item && (
  !(item.preferredRecognitionSource === 'focused-paddle' && item.focusedOcrStatus === 'failed') && (item.selectedOption
  || item.paddleText.trim()
  || item.focusedPaddleText?.trim()
  || item.lunaText.trim()
  || item.evidenceUnits?.some(unit => unit.provisionalText.trim() || unit.literalText.trim()))
));

type EvidenceBox = SourceEvidence['boundingBox'];
type CompareEvidenceRegion = (assetKind: 'assignment' | 'reference-answer', pageNumber: number, boundingBox: EvidenceBox, runOcr: boolean) => Promise<EvidenceRegionComparison>;
type SaveEvidenceRegion = (assetKind: 'assignment' | 'reference-answer', pageNumber: number, boundingBox: EvidenceBox) => Promise<void>;

function AnalysisEvidenceDetails({ unit, scopeLabel, onCompareEvidence, onSaveEvidence }: { unit: AnalyzedQuestionUnit; scopeLabel: '本题' | '本小题'; onCompareEvidence?: CompareEvidenceRegion; onSaveEvidence?: SaveEvidenceRegion }) {
  const toEvidence = (reference: AnalyzedQuestionUnit['questionSource'], id: string): SourceEvidence => ({
    id,
    assetId: reference.assetId,
    assetKind: reference.assetKind,
    fileName: reference.fileName,
    pageNumber: reference.pageNumber ?? 1,
    boundingBox: reference.boundingBox ?? { x: 0, y: 0, width: 1, height: 1 },
    ocrText: reference.quote,
    blockIds: reference.blockIds,
    segments: reference.segments,
    isPartialBlock: reference.isPartialBlock,
    cropMode: reference.cropMode,
    blockImageUrl: reference.blockImageUrl,
    confidence: unit.confidence,
    imageUrl: reference.imageUrl,
    sourcePageUrl: reference.sourcePageUrl,
    evidenceMode: reference.evidenceMode ?? 'native-text',
    locatorStatus: reference.locatorStatus ?? 'located',
    locatorReasons: reference.locatorReasons ?? []
  });
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-bold text-slate-500">查看{scopeLabel}题目与参考答案原文</summary>
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        <SourceEvidenceViewer evidence={toEvidence(unit.questionSource, `${unit.displayNo}-question-source`)} label="题目原文" onCompareRegion={onCompareEvidence ? (box, runOcr) => onCompareEvidence('assignment', unit.questionSource.pageNumber ?? 1, box, runOcr) : undefined} onSaveRegion={onSaveEvidence ? box => onSaveEvidence('assignment', unit.questionSource.pageNumber ?? 1, box) : undefined} />
        {unit.answerSource ? <SourceEvidenceViewer evidence={toEvidence(unit.answerSource, `${unit.displayNo}-answer-source`)} label="参考答案原文" onCompareRegion={onCompareEvidence ? (box, runOcr) => onCompareEvidence('reference-answer', unit.answerSource?.pageNumber ?? 1, box, runOcr) : undefined} onSaveRegion={onSaveEvidence ? box => onSaveEvidence('reference-answer', unit.answerSource?.pageNumber ?? 1, box) : undefined} /> : <section className="border-l-2 border-sky-600 bg-slate-50 p-3 text-xs text-slate-500 dark:bg-zinc-950">参考答案中没有匹配到可引用内容。</section>}
      </div>
    </details>
  );
}

function AnalysisQuestionCard({ question, standardAnswer, onSave, onCompareEvidence, onSaveEvidence }: { question: FirstSectionAnalysis['questions'][number]; standardAnswer: string; onSave: (correction: { title: string; stem: string; answerRequirement: string; standardAnswer: string }) => Promise<void>; onCompareEvidence: CompareEvidenceRegion; onSaveEvidence: SaveEvidenceRegion }) {
  const authoritativeStem = buildQuestionDisplayStem(question);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: question.title, stem: authoritativeStem, answerRequirement: question.answerRequirement, standardAnswer });
  useEffect(() => {
    setEditing(false);
    setDraft({ title: question.title, stem: authoritativeStem, answerRequirement: question.answerRequirement, standardAnswer });
  }, [question.displayNo, question.title, authoritativeStem, question.answerRequirement, standardAnswer]);
  const cancel = () => {
    setDraft({ title: question.title, stem: authoritativeStem, answerRequirement: question.answerRequirement, standardAnswer });
    setEditing(false);
  };
  const save = async () => {
    if (!draft.title.trim() || !draft.stem.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: draft.title.trim(), stem: draft.stem.trim(), answerRequirement: draft.answerRequirement.trim(), standardAnswer: draft.standardAnswer.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><strong className="text-base">第 {question.displayNo} 题</strong><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-zinc-800 dark:text-slate-300">{question.questionType}</span><span className="text-xs font-bold text-emerald-700">{resolvedQuestionScore(question)} 分{question.score === null ? '（暂定）' : ''}</span><span className={`text-xs ${question.confidence < 0.8 ? 'font-bold text-rose-700' : 'text-slate-400'}`}>置信度 {Math.round(question.confidence * 100)}%</span></div>
          {editing ? <div className="mt-4 space-y-3"><label className="block space-y-1"><span className="text-xs font-bold text-slate-500">题目标题</span><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className={'qs-field-input '+(inputClass)} /></label><label className="block space-y-1"><span className="text-xs font-bold text-slate-500">题干</span><textarea rows={6} value={draft.stem} onChange={event => setDraft(current => ({ ...current, stem: event.target.value }))} className={'qs-field-input '+(`${inputClass} resize-y leading-6`)} /></label><label className="block space-y-1"><span className="text-xs font-bold text-slate-500">作答要求</span><input value={draft.answerRequirement} onChange={event => setDraft(current => ({ ...current, answerRequirement: event.target.value }))} className={'qs-field-input '+(inputClass)} /></label><label className="block space-y-1"><span className="text-xs font-bold text-slate-500">标准答案</span><textarea rows={5} value={draft.standardAnswer} onChange={event => setDraft(current => ({ ...current, standardAnswer: event.target.value }))} className={'qs-field-input '+(`${inputClass} resize-y leading-6`)} /></label><div className="flex justify-end gap-2"><GlassButton type="button" disabled={saving} onClick={cancel} variant="secondary" className="px-4 py-2 text-xs font-bold">取消</GlassButton><GlassButton type="button" disabled={saving || !draft.title.trim() || !draft.stem.trim()} onClick={() => void save()} variant="primary" className="flex items-center gap-2 px-4 py-2 text-xs font-bold disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? '保存中...' : '保存'}</GlassButton></div></div> : <><h4 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{question.title}</h4><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300"><RichQuestionText text={authoritativeStem} /></p>{question.answerRequirement ? <p className="mt-2 text-xs leading-5 text-slate-500">作答要求：{question.answerRequirement}</p> : null}</>}
        </div>
        {!editing ? <GlassButton type="button" title="编辑本题" aria-label={`编辑第 ${question.displayNo} 题`} onClick={() => setEditing(true)} variant="secondary" className="p-2"><Pencil className="h-4 w-4" /></GlassButton> : null}
      </div>
      {!editing ? <>{!question.subquestions.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2"><div><span className="text-xs font-bold text-slate-400">标准答案</span><p className="mt-1 whitespace-pre-wrap text-sm leading-6"><RichQuestionText text={standardAnswer || '待教师补充'} /></p></div><div><span className="text-xs font-bold text-slate-400">解析</span><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{question.explanation || '暂无'}</p></div></div> : null}{question.subquestions.length ? <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">{question.subquestions.map(subquestion => <div key={subquestion.displayNo} className="py-4"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">小题 {subquestion.displayNo}</strong><span className="text-xs text-slate-500">{subquestion.questionType} · {resolvedUnitScore(subquestion)} 分{subquestion.score === null ? '（暂定）' : ''}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300"><RichQuestionText text={subquestion.stem} /></p><p className="mt-2 text-sm leading-6"><span className="mr-2 text-xs font-bold text-slate-400">答案</span><RichQuestionText text={subquestion.standardAnswer || '待教师补充'} /></p>{subquestion.rubricPoints.length ? <p className="mt-2 text-xs leading-5 text-emerald-800">采分点：{subquestion.rubricPoints.map(point => `${point.point}（${point.score ?? '待确认'}分）`).join('；')}</p> : null}{subquestion.reviewReasons.length ? <p className="mt-2 text-xs leading-5 text-amber-800"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{subquestion.reviewReasons.join('；')}</p> : null}</div>)}</div> : null}{!question.subquestions.length && question.rubricPoints.length ? <p className="mt-3 text-xs leading-5 text-emerald-800">采分点：{question.rubricPoints.map(point => `${point.point}（${point.score ?? '待确认'}分）`).join('；')}</p> : null}{question.reviewReasons.length ? <p className="mt-3 text-xs leading-5 text-amber-800"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{question.reviewReasons.join('；')}</p> : null}<AnalysisEvidenceDetails unit={question} scopeLabel="本题" onCompareEvidence={onCompareEvidence} onSaveEvidence={onSaveEvidence} /></> : null}
    </article>
  );
}

function MaterialDocumentDetails({ document, asset, activeQuestion, onCompareEvidence, onSaveEvidence, onPreview }: { document: NonNullable<WorkflowState['assignment']['documents']>[number]; asset?: WorkflowState['assignment']['assets'][number]; activeQuestion?: FirstSectionAnalysis['questions'][number]; onCompareEvidence?: CompareEvidenceRegion; onSaveEvidence?: SaveEvidenceRegion; onPreview: (url: string, label: string) => void }) {
  const visibleImages = document.resources.filter(resource => resource.role !== 'source-page' && resource.mimeType.startsWith('image/') && !/\.(?:wmf|emf)$/i.test(resource.fileName));
  const sourcePages = document.resources.filter(resource => resource.role === 'source-page' && resource.mimeType.startsWith('image/'));
  const captureKind = activeQuestion?.questionSource.assetId === document.assetId ? 'assignment' : activeQuestion?.answerSource?.assetId === document.assetId ? 'reference-answer' : undefined;
  const canCaptureForQuestion = Boolean(activeQuestion && captureKind);
  return (
    <details className="border-t border-slate-200 py-3 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-bold text-slate-800 dark:text-slate-100">查看解析内容 · {asset?.fileName ?? document.sourceFormat.toUpperCase()}</summary>
      {document.warnings.length ? <div className="mt-3 space-y-1 text-xs text-amber-800">{document.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{warning.message}</p>)}</div> : null}
      {sourcePages.length ? <section className="mt-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-slate-500">原页预览</strong>{canCaptureForQuestion ? <span className="text-xs font-bold text-emerald-700">可为第 {activeQuestion?.displayNo} 题手动框选截图</span> : <span className="text-xs text-slate-400">点击图片在界面中放大</span>}</div><div className="grid gap-3 sm:grid-cols-2">{sourcePages.map((resource, index) => { const pageNumber = resource.pageNumber ?? index + 1; const pageText = document.blocks.filter(block => block.pageNumber === pageNumber).sort((a, b) => a.order - b.order).map(block => block.text).filter(Boolean).join('\n'); const activeSource = captureKind === 'assignment' ? activeQuestion?.questionSource : activeQuestion?.answerSource; const initialBox = activeSource?.pageNumber === pageNumber ? activeSource.boundingBox ?? { x: 0, y: 0, width: 1, height: 1 } : { x: 0, y: 0, width: 1, height: 1 }; const evidence: SourceEvidence = { id: `${document.assetId}-page-${pageNumber}`, assetId: document.assetId, assetKind: asset?.kind ?? 'assignment', fileName: asset?.fileName ?? resource.fileName, pageNumber, boundingBox: initialBox, ocrText: pageText, confidence: 1, imageUrl: resource.publicUrl, sourcePageUrl: resource.publicUrl }; return <Fragment key={resource.id}><SourceEvidenceViewer evidence={evidence} label={`原页 ${pageNumber}`} onCompareRegion={canCaptureForQuestion && captureKind && onCompareEvidence ? (box, runOcr) => onCompareEvidence(captureKind, pageNumber, box, runOcr) : undefined} onSaveRegion={canCaptureForQuestion && captureKind && onSaveEvidence ? box => onSaveEvidence(captureKind, pageNumber, box) : undefined} /></Fragment>; })}</div></section> : null}
      {visibleImages.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{visibleImages.map(resource => <button type="button" key={resource.id} onClick={() => onPreview(resource.publicUrl, `${asset?.fileName ?? '作业内容'} · 文档图片`)} className="cursor-zoom-in overflow-hidden border border-slate-200 bg-white p-2 text-left dark:border-zinc-800 dark:bg-zinc-950"><img src={resource.publicUrl} alt="文档中的图片" className="max-h-80 w-full object-contain" /><span className="mt-2 flex items-center justify-end gap-1 text-xs font-bold text-emerald-700"><ZoomIn className="h-3.5 w-3.5" />界面内放大</span></button>)}</div> : null}
      {!sourcePages.length && !visibleImages.length && document.resources.length && document.sourcePreviewUrl ? <button type="button" onClick={() => onPreview(document.sourcePreviewUrl!, `${asset?.fileName ?? '作业内容'} · 原版页面`)} className="mt-3 block w-full cursor-zoom-in text-left"><img src={document.sourcePreviewUrl} alt="原版页面预览" className="max-h-96 w-full border border-slate-200 bg-white object-contain dark:border-zinc-800" /><span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><ZoomIn className="h-3.5 w-3.5" />在界面中放大</span></button> : null}
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words bg-slate-50 p-4 text-xs leading-6 text-slate-700 dark:bg-zinc-950 dark:text-slate-200">{document.markdown}</pre>
    </details>
  );
}

const analysisStatusLabel: Record<WorkflowState['assignment']['analysisStatus'], string> = {
  idle: '等待材料', uploading: '上传中', parsing: '材料解析中', 'needs-review': '需要检查', ready: '材料已解析', failed: '解析失败'
};

const materialStatusLabel: Record<WorkflowState['assignment']['assets'][number]['status'], string> = {
  uploaded: '等待解析', processing: '解析中', ready: '已解析', 'needs-review': '需检查', failed: '失败'
};

const materialParseErrorMessage = (code: string | undefined) => {
  const messages: Record<string, string> = {
    DOCX_PARSER_NOT_INSTALLED: 'DOCX 解析环境尚未安装。文件已保存。',
    PADDLEOCR_NOT_CONFIGURED: 'PaddleOCR API 尚未配置。文件已保存。',
    PADDLEOCR_AUTH_FAILED: 'PaddleOCR Token 无效。文件已保存。',
    PADDLEOCR_QUEUE_FULL: 'PaddleOCR 当前队列已满。文件已保存，请稍后原地重试。',
    PADDLEOCR_INVALID_REQUEST: 'PaddleOCR 未接受当前文件。文件已保存，可核对格式后原地重试。',
    PADDLEOCR_RATE_LIMITED: 'PaddleOCR 当前额度或频率受限。文件已保存，请稍后原地重试。',
    PADDLEOCR_TIMEOUT: 'PaddleOCR 解析超时。文件已保存，请稍后原地重试。',
    MATERIAL_PARSE_TIMEOUT: '材料解析等待超时。文件已保存，请稍后原地重试。'
  };
  return messages[code ?? ''] ?? '材料解析未完成。文件已保存，可原地重试。';
};

const analysisErrorMessage = (code: string) => {
  const messages: Record<string, { title: string; detail: string }> = {
    MODEL_NOT_CONFIGURED: { title: 'AI 模型尚未配置', detail: '题目和答案材料已保存，请联系管理员完成模型配置后重试。' },
    MODEL_AUTH_FAILED: { title: 'AI 模型鉴权失败', detail: '题目和答案材料已保存，请联系管理员检查模型授权后重试。' },
    MODEL_RATE_LIMITED: { title: 'AI 服务请求过于频繁', detail: '题目和答案材料已保存，请稍后重新拆题。' },
    MODEL_SERVICE_UNAVAILABLE: { title: 'AI 服务暂时繁忙', detail: '题目和答案材料已保存，本次没有生成拆题结果，请稍后重新拆题。' },
    MODEL_REQUEST_REJECTED: { title: 'AI 服务未接受本次请求', detail: '题目和答案材料已保存，请稍后重试；若持续失败请联系管理员。' },
    MODEL_OUTPUT_INVALID: { title: 'AI 返回的拆题结构不完整', detail: '题目和答案材料已保存，可以重新拆题。' },
    ASSIGNMENT_MATERIAL_REQUIRED: { title: '缺少已解析的题目材料', detail: '请先选择题目文件并完成解析。' },
    REFERENCE_ANSWER_REQUIRED: { title: '缺少已解析的参考答案', detail: '请先选择答案文件并完成解析。' },
    MATERIALS_NOT_READY: { title: '材料尚未准备完成', detail: '请等待题目和答案解析完成后再拆题。' }
  };
  return messages[code] ?? { title: 'AI 拆题没有完成', detail: '题目和答案材料已保存，请稍后重新拆题。' };
};

const materialAccept = '.docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/pdf,image/*';
const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const getInitialStage = (node: WorkbenchTask['node']): StageId => {
  if (node === 'setup' || node === 'collection') return 'assignment';
  if (node === 'upload' || node === 'ocr') return 'intake';
  if (node === 'grading') return 'grading';
  if (node === 'verify') return 'review';
  return 'diagnosis';
};

function QuestionSelector({ questions, states, selectedId, onSelect }: { questions: WorkflowState['questions']; states: QuestionGradingState[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2" role="tablist" aria-label="选择题号">
        {questions.map(question => {
          const state = states.find(item => item.questionId === question.id);
          const confirmed = state?.calibrationSamples.filter(sample => sample.status === 'confirmed').length ?? 0;
          const target = state?.sampleTarget ?? 3;
          const active = selectedId === question.id;
          return (
            <button key={question.id} type="button" role="tab" aria-selected={active} onClick={() => onSelect(question.id)} className={`min-w-36 rounded-2xl border px-4 py-3 text-left transition-all ${active ? 'border-emerald-700 bg-emerald-700 text-white shadow-md shadow-emerald-700/10' : 'border-slate-200 bg-white/70 text-slate-600 hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-slate-300'}`}>
              <span className="block text-sm font-black">第 {question.displayNo} 题</span>
              <span className={`mt-1 block max-w-32 truncate text-xs ${active ? 'text-emerald-50' : 'text-slate-400'}`}>{question.title}</span>
              <span className={`mt-2 block text-[11px] font-bold ${active ? 'text-white' : confirmed >= target ? 'text-emerald-700' : 'text-amber-700'}`}>{confirmed >= target ? '试批已完成' : `试批 ${confirmed}/${target}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuestionContext({ question, number, evidence, onToggleKnowledge, knowledgeLinkSavingId, onSaveCorrection }: { question: GradingQuestion; number: number; evidence?: WorkflowState['sourceEvidence'][number]; onToggleKnowledge?: (nodeId: string) => void; knowledgeLinkSavingId?: string | null; onSaveCorrection?: (correction: { title: string; stem: string; answerRequirement: string }) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: question.title, stem: question.stem ?? question.desc, answerRequirement: question.answerRequirement ?? '' });
  useEffect(() => {
    setEditing(false);
    setDraft({ title: question.title, stem: question.stem ?? question.desc, answerRequirement: question.answerRequirement ?? '' });
  }, [question.id, question.title, question.stem, question.desc, question.answerRequirement]);
  const saveCorrection = async () => {
    if (!onSaveCorrection || !draft.title.trim() || !draft.stem.trim()) return;
    setSaving(true);
    try {
      await onSaveCorrection({ title: draft.title.trim(), stem: draft.stem.trim(), answerRequirement: draft.answerRequirement.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="grid gap-4 rounded-[24px] border border-slate-200 bg-white/70 p-5 lg:grid-cols-[minmax(0,1fr)_230px] dark:border-zinc-800 dark:bg-zinc-900/70">
      <div><div className="flex flex-wrap items-center gap-2 text-xs font-bold"><span className="text-emerald-700">第 {question.displayNo || number} 题 · {question.score} 分</span><span className="rounded-xl bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-zinc-800 dark:text-slate-300">{question.aiQuestionType ?? 'AI 待识别题型'}</span><span className="text-slate-400">解析 {Math.round(question.parseConfidence * 100)}%</span>{onSaveCorrection && !editing ? <GlassButton type="button" onClick={() => setEditing(true)} variant="secondary" containerClassName="ml-auto" className="px-2.5 py-1.5">修正题干</GlassButton> : null}</div>
      {editing ? <div className="mt-3 space-y-3"><label className="block space-y-1"><span className="text-xs font-bold text-slate-500">题目标题</span><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} className={'qs-field-input '+(inputClass)} /></label><label className="block space-y-1"><span className="text-xs font-bold text-slate-500">题干</span><textarea value={draft.stem} onChange={event => setDraft(current => ({ ...current, stem: event.target.value }))} rows={5} className={'qs-field-input '+(`${inputClass} resize-y leading-6`)} /></label><label className="block space-y-1"><span className="text-xs font-bold text-slate-500">作答要求</span><input value={draft.answerRequirement} onChange={event => setDraft(current => ({ ...current, answerRequirement: event.target.value }))} className={'qs-field-input '+(inputClass)} /></label><div className="flex justify-end gap-2"><GlassButton type="button" disabled={saving} onClick={() => { setDraft({ title: question.title, stem: question.stem ?? question.desc, answerRequirement: question.answerRequirement ?? '' }); setEditing(false); }} variant="secondary" className="px-3 py-2 text-xs font-bold">取消</GlassButton><GlassButton type="button" disabled={saving || !draft.title.trim() || !draft.stem.trim()} onClick={() => void saveCorrection()} variant="primary" className="flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? '保存中...' : '保存题干修正'}</GlassButton></div></div> : <><h2 className="mt-3 text-base font-black text-slate-900 dark:text-white">{question.title}</h2><p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200"><RichOcrText text={question.stem ?? question.desc} /></p>{question.answerRequirement ? <p className="mt-2 text-xs text-slate-500">作答要求：<RichOcrText text={question.answerRequirement} /></p> : null}{question.subquestions?.length ? <div className="mt-4 space-y-2">{question.subquestions.map(unit => <article key={unit.displayNo} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950"><strong className="text-xs text-emerald-700">小题 {unit.displayNo}{unit.score ? ` · ${unit.score} 分` : ''}</strong><p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200"><RichOcrText text={unit.stem} /></p></article>)}</div> : null}</>}
      <div className="mt-4 flex flex-wrap gap-2">{question.knowledgeLinks.length ? question.knowledgeLinks.map(link => <button key={link.nodeId} type="button" aria-pressed={link.status === 'confirmed'} disabled={!onToggleKnowledge || Boolean(knowledgeLinkSavingId)} onClick={() => onToggleKnowledge?.(link.nodeId)} className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:cursor-wait disabled:opacity-60 ${link.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-violet-100 text-violet-800 hover:bg-violet-200'}`}><Link2 className="h-3.5 w-3.5" />{link.nodeName}{knowledgeLinkSavingId === link.nodeId ? ' · 保存中' : link.status === 'suggested' ? ` · ${Math.round(link.confidence * 100)}%` : ' · 已关联'}</button>) : <span className="text-xs text-slate-400">资源库中暂无匹配知识点</span>}</div></div>
      {evidence ? <SourceEvidenceViewer evidence={evidence} label={`第 ${question.displayNo || number} 题题干`} /> : null}
    </section>
  );
}

function StandardAnswerReference({ answer, evidence, onPreview }: { answer: string; evidence?: SourceEvidence; onPreview: (url: string, label: string) => void }) {
  return (
    <section className="mt-3 border-t border-slate-200 pt-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2"><strong className="text-xs text-slate-500">标准答案</strong>{evidence?.imageUrl ? <button type="button" onClick={() => onPreview(evidence.imageUrl!, '标准答案原文')} className="flex items-center gap-1 text-xs font-bold text-emerald-700"><ZoomIn className="h-3.5 w-3.5" />查看原文</button> : null}</div>
      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200"><RichOcrText text={answer || '尚未补充标准答案'} /></p>
      {evidence?.imageUrl ? <button type="button" onClick={() => onPreview(evidence.imageUrl!, '标准答案原文')} className="mt-3 block max-h-36 w-full overflow-hidden border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950"><img src={evidence.imageUrl} alt="标准答案原文截图" className="max-h-36 w-full object-contain" /></button> : null}
    </section>
  );
}

function ImagePreviewDialog({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-zinc-950" onClick={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-zinc-800"><strong className="text-sm">{label}</strong><button type="button" title="关闭" aria-label="关闭图片预览" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button></header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-zinc-900"><img src={url} alt={label} className="mx-auto max-h-[calc(100dvh-7rem)] max-w-full bg-white object-contain" /></div>
      </div>
    </div>,
    document.body
  );
}

function RubricEditor({ question, questionState, answerEvidence, dirty, savePhase, canEnterTrial, canGoPrevious, canGoNext, onChange, onCancel, onSaveDraft, onApply, onEnterTrial, onCompleteIntake, onNavigate }: { question: GradingQuestion; questionState: QuestionGradingState; answerEvidence?: WorkflowState['sourceEvidence'][number]; dirty: boolean; savePhase: 'idle' | 'saving' | 'saved' | 'error'; canEnterTrial: boolean; canGoPrevious: boolean; canGoNext: boolean; onChange: (next: QuestionGradingState) => void; onCancel: () => void; onSaveDraft: () => Promise<void>; onApply: () => void; onEnterTrial: () => void; onCompleteIntake: () => void; onNavigate: (offset: -1 | 1) => void }) {
  const [newRule, setNewRule] = useState('');
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [editingRubric, setEditingRubric] = useState(false);
  const [answerSnapshot, setAnswerSnapshot] = useState(questionState.standardAnswer);
  const [rubricSnapshot, setRubricSnapshot] = useState(questionState.gradingRubric);
  useEffect(() => {
    setEditingAnswer(false);
    setEditingRubric(false);
    setAnswerSnapshot(questionState.standardAnswer);
    setRubricSnapshot(questionState.gradingRubric);
  }, [questionState.questionId]);
  const addRule = () => {
    const value = newRule.trim();
    if (!value) return;
    onChange({ ...questionState, teacherRules: [...questionState.teacherRules, value] });
    setNewRule('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-base font-black text-slate-900 dark:text-white">评分依据 V{questionState.rubricVersion}</h3><p className="mt-1 text-xs text-slate-500">当前题目的标准答案、采分点和教师补充规则。</p></div>
        <span className={`rounded-xl px-2.5 py-1.5 text-xs font-bold ${dirty ? 'bg-amber-100 text-amber-800' : savePhase === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{dirty ? '有未保存修改' : savePhase === 'saving' ? '正在保存' : savePhase === 'error' ? '保存失败' : '已保存'}</span>
      </div>
      <div className="space-y-2"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100"><FileText className="h-4 w-4 text-emerald-700" />标准答案</span>{!editingAnswer ? <GlassButton type="button" title="编辑标准答案" aria-label="编辑标准答案" onClick={() => { setAnswerSnapshot(questionState.standardAnswer); setEditingAnswer(true); }} variant="secondary" className="p-2"><Pencil className="h-4 w-4" /></GlassButton> : null}</div><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_230px]"><div>{editingAnswer ? <><label><span className="sr-only">标准答案文本</span><textarea value={questionState.standardAnswer} onChange={event => onChange({ ...questionState, standardAnswer: event.target.value })} rows={7} className={'qs-field-input '+(`${inputClass} resize-y leading-6`)} /></label><div className="mt-3 flex justify-end gap-2"><GlassButton type="button" disabled={savePhase === 'saving'} onClick={() => { onChange({ ...questionState, standardAnswer: answerSnapshot }); setEditingAnswer(false); }} variant="secondary" className="px-4 py-2 text-xs font-bold">取消</GlassButton><GlassButton type="button" disabled={savePhase === 'saving'} onClick={() => void onSaveDraft().then(() => { setAnswerSnapshot(questionState.standardAnswer); setEditingAnswer(false); })} variant="primary" className="flex items-center gap-2 px-4 py-2 text-xs font-bold disabled:opacity-50"><Save className="h-3.5 w-3.5" />{savePhase === 'saving' ? '保存中...' : '保存标准答案'}</GlassButton></div></> : <p className="min-h-28 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-slate-200"><RichOcrText text={questionState.standardAnswer || '待教师补充'} /></p>}</div>{answerEvidence ? <SourceEvidenceViewer evidence={answerEvidence} label="标准答案来源" /> : null}</div>{questionState.standardAnswerOcrText ? <p className="text-[11px] text-slate-400">OCR 原文：<RichOcrText text={questionState.standardAnswerOcrText} /></p> : null}</div>
      {question.subquestions?.length ? <section className="space-y-3"><div><span className="text-sm font-black text-slate-800 dark:text-slate-100">小题依据</span><p className="mt-1 text-xs text-slate-500">仍按整题计分；这里保留每个小题的题干、答案、解析和采分点供核对。</p></div><div className="grid gap-3 md:grid-cols-2">{question.subquestions.map(unit => <article key={unit.displayNo} className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-zinc-800"><strong className="text-xs text-emerald-700">小题 {unit.displayNo}{unit.score ? ` · ${unit.score} 分` : ''}</strong><div className="mt-2 space-y-2 text-sm leading-6"><p><RichOcrText text={unit.stem} /></p><p><span className="font-bold">答案：</span><RichOcrText text={unit.standardAnswer || '待补充'} /></p>{unit.explanation ? <p className="text-slate-500"><span className="font-bold">解析：</span><RichOcrText text={unit.explanation} /></p> : null}{unit.rubricPoints.length ? <ul className="space-y-1 text-xs text-emerald-800">{unit.rubricPoints.map((point, index) => <li key={`${unit.displayNo}-${index}`}><span className="font-bold">采分点：</span><RichOcrText text={point.point} /> · {point.score} 分{point.description ? <> · <RichOcrText text={point.description} /></> : null}</li>)}</ul> : null}</div></article>)}</div></section> : null}
      <div className="space-y-3">
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100"><Sparkles className="h-4 w-4 text-emerald-700" />AI 识别的采分点</span>{!editingRubric ? <GlassButton type="button" title="编辑采分点" aria-label="编辑采分点" onClick={() => { setRubricSnapshot(questionState.gradingRubric); setEditingRubric(true); }} variant="secondary" className="p-2"><Pencil className="h-4 w-4" /></GlassButton> : null}</div>
        {questionState.gradingRubric.map((point, index) => (
          <div key={`${questionState.questionId}-rubric-${index}`} className={`grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_80px_36px] ${editingRubric ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/70'} dark:border-zinc-700 dark:bg-zinc-900`}>
            {editingRubric ? <div className="grid gap-2"><input value={point.point} aria-label={`采分点 ${index + 1}`} placeholder="采分点简称" onChange={event => onChange({ ...questionState, gradingRubric: questionState.gradingRubric.map((item, itemIndex) => itemIndex === index ? { ...item, point: event.target.value } : item) })} className={'qs-field-input '+(inputClass)} /><input value={point.description} aria-label={`采分点 ${index + 1} 完整说明`} placeholder="完整评分说明" onChange={event => onChange({ ...questionState, gradingRubric: questionState.gradingRubric.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} className={'qs-field-input '+(inputClass)} /></div> : <span className="text-sm leading-6 text-slate-700 dark:text-slate-200"><strong><RichOcrText text={point.point} /></strong>{point.description && point.description !== point.point ? <span className="mt-1 block text-xs text-slate-500"><RichOcrText text={point.description} /></span> : null}</span>}
            {editingRubric ? <label className="flex items-center gap-1 text-xs font-bold text-slate-500"><input type="number" value={point.score} aria-label={`采分点 ${index + 1} 分值`} onChange={event => onChange({ ...questionState, gradingRubric: questionState.gradingRubric.map((item, itemIndex) => itemIndex === index ? { ...item, score: Number(event.target.value) } : item) })} className="qs-field-input w-14 rounded-xl border border-slate-200 bg-white px-2 py-2 text-right dark:border-zinc-700 dark:bg-zinc-800" />分</label> : <strong className="text-right text-sm text-emerald-700">{point.score} 分</strong>}
            {editingRubric ? <button type="button" title="删除采分点" aria-label="删除采分点" onClick={() => onChange({ ...questionState, gradingRubric: questionState.gradingRubric.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-xl p-2 text-slate-400 hover:bg-rose-100 hover:text-rose-700"><X className="h-4 w-4" /></button> : <span />}
          </div>
        ))}
        {editingRubric ? <div className="flex flex-wrap items-center justify-between gap-2"><GlassButton type="button" onClick={() => onChange({ ...questionState, gradingRubric: [...questionState.gradingRubric, { point: '', score: 1, description: '' }] })} variant="secondary" className="flex items-center gap-1 px-3 py-2 text-xs font-bold"><Plus className="h-3.5 w-3.5" />添加采分点</GlassButton><div className="flex gap-2"><GlassButton type="button" disabled={savePhase === 'saving'} onClick={() => { onChange({ ...questionState, gradingRubric: rubricSnapshot }); setEditingRubric(false); }} variant="secondary" className="px-3 py-2 text-xs font-bold">取消</GlassButton><GlassButton type="button" disabled={savePhase === 'saving'} onClick={() => void onSaveDraft().then(() => { setRubricSnapshot(questionState.gradingRubric); setEditingRubric(false); })} variant="primary" className="flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:opacity-50"><Save className="h-3.5 w-3.5" />{savePhase === 'saving' ? '保存中...' : '保存采分点'}</GlassButton></div></div> : null}
      </div>
      <div className="space-y-3">
        <div><span className="text-sm font-black text-slate-800 dark:text-slate-100">教师评分细则</span><p className="mt-1 text-xs text-slate-500">可直接补充同义表达、扣分、封顶和特殊答案规则。</p></div>
        {questionState.teacherRules.map((rule, index) => <div key={`${rule}-${index}`} className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><BookOpenCheck className="mt-0.5 h-4 w-4 flex-none" /><span className="flex-1 leading-5">{rule}</span><button type="button" title="删除评分细则" aria-label="删除评分细则" onClick={() => onChange({ ...questionState, teacherRules: questionState.teacherRules.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-xl p-1 text-amber-600 hover:bg-amber-100"><X className="h-3.5 w-3.5" /></button></div>)}
        <div className="flex gap-2"><input value={newRule} onChange={event => setNewRule(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addRule(); }} placeholder="例如：“好人好事代代相传”也算分" className={'qs-field-input '+(inputClass)} /><GlassButton type="button" onClick={addRule} variant="secondary" className="px-4 text-sm font-bold">添加</GlassButton></div>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"><div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><GlassButton type="button" disabled={!canGoPrevious || savePhase === 'saving'} onClick={() => onNavigate(-1)} variant="secondary" className="min-h-11 px-4 text-sm font-bold disabled:opacity-40">上一题</GlassButton><GlassButton type="button" disabled={!canGoNext || savePhase === 'saving'} onClick={() => onNavigate(1)} variant="secondary" className="min-h-11 px-4 text-sm font-bold disabled:opacity-40">下一题</GlassButton></div><div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto"><GlassButton type="button" disabled={!dirty || savePhase === 'saving'} onClick={onCancel} variant="secondary" className="px-4 py-2.5 text-sm font-bold disabled:opacity-40">取消修改</GlassButton><GlassButton type="button" disabled={savePhase === 'saving'} onClick={onSaveDraft} variant="secondary" className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-50"><Save className="h-4 w-4" />{savePhase === 'saving' ? '保存中...' : '保存修改'}</GlassButton><GlassButton type="button" disabled={savePhase === 'saving'} onClick={onApply} variant="secondary" className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-50"><RefreshCw className="h-4 w-4" />保存并重新试批</GlassButton><GlassButton type="button" onClick={canEnterTrial ? onEnterTrial : onCompleteIntake} variant="primary" className="flex items-center gap-1 px-4 py-2.5 text-sm font-bold">{canEnterTrial ? '进入试批' : '先完成上传质检'}<ChevronRight className="h-4 w-4" /></GlassButton></div></div>
    </div>
  );
}

function SubmissionPreview({ page, roster, asset, document, validation, validationPhase, validationError, onClose, onConfirm, onRunVision }: { page: SubmissionPage; roster: RosterStudent[]; asset?: DocumentAsset; document?: NonNullable<WorkflowState['assignment']['documents']>[number]; validation?: VisionValidationResult; validationPhase: VisionValidationPhase; validationError?: string; onClose: () => void; onConfirm: (lookup: { studentId?: string; studentNo?: string }) => string | undefined; onRunVision: () => void }) {
  const [studentId, setStudentId] = useState(page.studentId ?? '');
  const [studentNo, setStudentNo] = useState('');
  const [identityError, setIdentityError] = useState('');
  const previewUrl = asset ? `/api/grading-tasks/${encodeURIComponent(asset.taskId)}/materials/${encodeURIComponent(asset.id)}/content` : undefined;
  const needsIdentityReview = page.rosterMatchStatus !== 'matched';
  const visionReady = document?.resources.some(resource => resource.role === 'source-page') ?? false;
  const signals = [
    ['文字识别', page.textConfidence ?? page.ocrConfidence],
    ['区域完整性', page.regionCompleteness ?? 1],
    ['页面连续性', page.pageContinuity ?? 1]
  ] as const;
  const matchSourceLabel = page.nameMatchSource === 'ocr' ? '来自 OCR 原文' : page.nameMatchSource === 'file-name' ? '来自文件名' : page.nameMatchSource === 'teacher' || page.reviewSource === 'teacher' ? '教师确认' : needsIdentityReview ? '等待教师确认' : '已由姓名文本匹配';
  const confirmIdentity = (lookup: { studentId?: string; studentNo?: string }) => {
    const error = onConfirm(lookup);
    setIdentityError(error ?? '');
  };
  return (
    <div className="m-3 rounded-[24px] border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900 dark:bg-emerald-950/10">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900 dark:text-white">{page.expectedStudentName} · 原始答卷</h3><p className={`mt-1 text-xs ${needsIdentityReview ? 'text-rose-700' : 'text-slate-500'}`}>{page.rosterIssueReason ?? page.issueReason ?? asset?.fileName ?? '已匹配当前班级名册。'}</p></div><GlassButton type="button" title="收起" aria-label="收起" onClick={onClose} variant="secondary" className="p-2"><X className="h-4 w-4" /></GlassButton></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-h-[480px] overflow-hidden border border-slate-300 bg-white shadow-sm">{previewUrl ? (asset?.mimeType === 'application/pdf' ? <object data={previewUrl} type="application/pdf" className="h-[620px] w-full"><a href={previewUrl} target="_blank" rel="noreferrer" className="p-4 text-sm font-bold text-emerald-700">打开原始 PDF</a></object> : <img src={previewUrl} alt={`${page.expectedStudentName} 原始答卷`} className="max-h-[620px] w-full object-contain" />) : <div className="flex h-full items-center justify-center text-sm text-slate-400">原文件不可用</div>}</div>
        <div><div className={`rounded-2xl p-3 ${needsIdentityReview ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}><span className="text-xs font-bold">姓名匹配</span><strong className="mt-1 block text-base">{needsIdentityReview ? '待确认' : page.expectedStudentName}</strong><span className="mt-1 block text-xs">{matchSourceLabel}</span></div><div className="mt-2 grid grid-cols-2 gap-2">{signals.map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-3 dark:bg-zinc-900"><span className="text-[11px] font-bold text-slate-500">{label}</span><strong className="mt-1 block text-lg">{value > 0 ? `${Math.round(value * 100)}%` : '未提供'}</strong></div>)}</div>{needsIdentityReview ? <div className="mt-4 space-y-3"><div><label className="block text-xs font-black text-slate-600">按姓名选择</label><div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><select value={studentId} onChange={event => { setStudentId(event.target.value); setIdentityError(''); }} className={'qs-field-input '+(`${inputClass} min-h-11 text-base sm:text-sm`)}><option value="">请选择学生</option>{roster.filter(student => student.enrollmentStatus === 'active').map(student => <option key={student.studentId} value={student.studentId}>{student.name}{roster.filter(item => item.enrollmentStatus === 'active' && item.name === student.name).length > 1 ? `（名册学号 ${student.studentNo}）` : ''}</option>)}</select><GlassButton type="button" disabled={!studentId} onClick={() => confirmIdentity({ studentId })} variant="primary" className="min-h-11 px-4 text-sm font-bold disabled:opacity-40">确认姓名</GlassButton></div></div><div><label className="block text-xs font-black text-slate-600">或输入肉眼看到的学号</label><div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input value={studentNo} inputMode="numeric" onChange={event => { setStudentNo(event.target.value); setIdentityError(''); }} onKeyDown={event => { if (event.key === 'Enter' && studentNo.trim()) confirmIdentity({ studentNo }); }} placeholder="输入当前班级学号" className={'qs-field-input '+(`${inputClass} min-h-11 text-base sm:text-sm`)} /><GlassButton type="button" disabled={!studentNo.trim()} onClick={() => confirmIdentity({ studentNo })} variant="secondary" className="min-h-11 px-4 text-sm font-bold disabled:opacity-40">按学号确认</GlassButton></div></div>{identityError ? <p role="alert" className="text-xs font-bold leading-5 text-rose-700">{identityError}</p> : null}</div> : null}<p className="mt-3 text-xs leading-5 text-slate-500"><Info className="mr-1 inline h-3 w-3" />自动匹配只比较整份 OCR 原文与班级姓名；手动确认只更正学生归属，不会删除或重跑已保存的 OCR。</p></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><GlassButton type="button" onClick={onClose} variant="secondary" className="min-h-11 px-4 text-xs font-bold">收起</GlassButton></div>
      <section className="mt-5 border-t border-emerald-200 pt-5 dark:border-emerald-900">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-black">逐题答案识别</h4><p className="mt-1 text-xs text-slate-500">复用已保存的 PaddleOCR 文字与坐标，由 Luna 重新定位和转写逐题答案；不会重复上传文件。</p></div><GlassButton type="button" disabled={!visionReady || validationPhase === 'loading' || validationPhase === 'extracting'} onClick={onRunVision} variant="primary" className="min-h-11 px-4 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">{validationPhase === 'loading' ? '正在读取已有结果…' : validationPhase === 'extracting' ? validation ? '正在重新提取…' : '正在首次提取…' : validation ? '重新提取逐题答案' : '开始提取逐题答案'}</GlassButton></div>
        {!visionReady ? <p className="mt-3 text-xs font-bold text-amber-700">这份答卷尚未保留 Paddle 原始坐标，需要重新解析后才能裁图。</p> : null}
        {validationPhase === 'error' ? <p className="mt-3 text-xs font-bold text-rose-700">逐题识别失败（{validationError}）</p> : null}
        {validation ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{validation.items.map(item => <VisionItemCard key={item.displayNo} item={item} asset={asset} document={document} />)}</div> : null}
      </section>
    </div>
  );
}

export default function GradingWorkflow({
  workflowState,
  classes,
  selectedTask,
  knowledgeNodes,
  reviewQueue,
  lowConfidenceThreshold,
  ocrHumanReviewThreshold,
  ocrAutoPassThreshold,
  onBack,
  onUpdateTask,
  onUpdateState,
  onSyncToProfiles,
  onConfirmReview,
  onBounceToOcr,
  onMarkAsSample,
  onShowToast
}: GradingWorkflowProps) {
  const initialQuestionStates = workflowState.questionGradingStates ?? workflowState.questions.map(question => ({
    questionId: question.id,
    standardAnswer: workflowState.standardAnswer,
    gradingRubric: workflowState.gradingRubric,
    teacherRules: workflowState.teacherRules ?? [],
    rubricVersion: workflowState.rubricVersion ?? 1,
    sampleTarget: 3 as const,
    calibrationSamples: (workflowState.calibrationSamples ?? []).map(sample => ({ ...sample, questionId: question.id, fullScore: question.score })),
    jointReviewEnabled: (workflowState.jointReviewQuestionIds ?? []).includes(question.id)
  }));
  const [activeStage, setActiveStage] = useState<StageId>(() => getInitialStage(selectedTask.node));
  const [questionStates, setQuestionStates] = useState<QuestionGradingState[]>(initialQuestionStates);
  const questionStatesRef = useRef(questionStates);
  const [selectedQuestionId, setSelectedQuestionId] = useState(workflowState.questions[0]?.id ?? '');
  const [selectedSampleId, setSelectedSampleId] = useState(initialQuestionStates[0]?.calibrationSamples[0]?.id ?? '');
  const [editedOcr, setEditedOcr] = useState(initialQuestionStates[0]?.calibrationSamples[0] ? getEffectiveOcrText(initialQuestionStates[0].calibrationSamples[0]) : '');
  const [gradingAction, setGradingAction] = useState<'none' | 'adjust' | 'manual'>('none');
  const [teacherScore, setTeacherScore] = useState(0);
  const [teacherReason, setTeacherReason] = useState('');
  const [gradingMode, setGradingMode] = useState<GradingMode>(workflowState.gradingMode ?? 'batch-checkpoint');
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [showOnlyOcrIssues, setShowOnlyOcrIssues] = useState(false);
  const [expandedOcrPageId, setExpandedOcrPageId] = useState<string | null>(null);
  const [ruleAddedNotice, setRuleAddedNotice] = useState(false);
  const [rubricSavePhase, setRubricSavePhase] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [gradedCount, setGradedCount] = useState(() => workflowState.aiResults.length ? 36 : 0);
  const [isPaused, setIsPaused] = useState(false);
  const [diagnosisConfirmed, setDiagnosisConfirmed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisErrorCode, setAnalysisErrorCode] = useState<string | null>(null);
  const [analysisQuestionNo, setAnalysisQuestionNo] = useState(workflowState.assignment.firstSectionAnalysis?.questions[0]?.displayNo ?? '');
  const [questionSelectionDraft, setQuestionSelectionDraft] = useState<string[]>(selectedTask.selectedQuestionIds ?? workflowState.assignment.selectedQuestionIds ?? workflowState.questions.map(question => question.id));
  const [questionSelectionSaving, setQuestionSelectionSaving] = useState(false);
  const [questionSelectionEditing, setQuestionSelectionEditing] = useState(!selectedTask.selectedQuestionIds?.length);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const [rosterClass, setRosterClass] = useState<SchoolClass | null>(null);
  const [classRoster, setClassRoster] = useState<RosterStudent[]>([]);
  const [rosterMatchPhase, setRosterMatchPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rosterMatchError, setRosterMatchError] = useState<string | null>(null);
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);
  const [pendingMaterialFiles, setPendingMaterialFiles] = useState<{ assignment: File[]; referenceAnswer: File[] }>({ assignment: [], referenceAnswer: [] });
  const [materialUploadPhase, setMaterialUploadPhase] = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle');
  const [materialUploadError, setMaterialUploadError] = useState<string | null>(null);
  const [submissionFiles, setSubmissionFiles] = useState<File[]>([]);
  const [submissionUploadPhase, setSubmissionUploadPhase] = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle');
  const [submissionUploadError, setSubmissionUploadError] = useState<string | null>(null);
  const [submissionManagement, setSubmissionManagement] = useState(false);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(() => new Set());
  const [showSubmissionDeleteConfirm, setShowSubmissionDeleteConfirm] = useState(false);
  const [submissionDeletePhase, setSubmissionDeletePhase] = useState<'idle' | 'deleting'>('idle');
  const [knowledgeLinkSavingId, setKnowledgeLinkSavingId] = useState<string | null>(null);
  const [trialGradingPhase, setTrialGradingPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [trialGradingError, setTrialGradingError] = useState<string | null>(null);
  const [trialProgress, setTrialProgress] = useState<{ phase: 'idle' | 'recognition' | 'grading' | 'complete' | 'error'; completed: number; total: number; currentLabel: string; startedAt: number | null; elapsedSeconds: number }>({ phase: 'idle', completed: 0, total: 0, currentLabel: '', startedAt: null, elapsedSeconds: 0 });
  const [visionValidationByAsset, setVisionValidationByAsset] = useState<Record<string, VisionValidationResult>>({});
  const [visionValidationPhase, setVisionValidationPhase] = useState<Record<string, VisionValidationPhase>>({});
  const [visionValidationError, setVisionValidationError] = useState<Record<string, string>>({});
  const [submissionExtractionProgress, setSubmissionExtractionProgress] = useState<{ phase: 'idle' | 'checking' | 'extracting' | 'complete'; requested: number; completed: number; failed: number; skipped: number; startedAt: number | null; elapsedSeconds: number }>({ phase: 'idle', requested: 0, completed: 0, failed: 0, skipped: 0, startedAt: null, elapsedSeconds: 0 });
  const [batch, setBatch] = useState<GradingBatch | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchQuestionId, setBatchQuestionId] = useState('');
  const [batchStudentId, setBatchStudentId] = useState('');
  const [batchViewMode, setBatchViewMode] = useState<'question' | 'submission'>('question');
  const [diagnosis, setDiagnosis] = useState<GradingDiagnosis | null>(null);
  const [reviewStage, setReviewStage] = useState<'all' | 'answer-missing' | 'rubric-insufficient' | 'resolved'>('all');
  const [reviewSampleId, setReviewSampleId] = useState<string | null>(null);
  const [ocrCorrectionSampleIds, setOcrCorrectionSampleIds] = useState<Set<string>>(() => new Set());
  const [reviewEditedOcr, setReviewEditedOcr] = useState('');
  const [reviewScore, setReviewScore] = useState(0);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewFeedbackReasons, setReviewFeedbackReasons] = useState<GradingFeedbackReason[]>([]);
  const [reviewSaving, setReviewSaving] = useState<'idle' | 'ocr' | 'decision'>('idle');
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);

  const currentClass = rosterClass ?? classes.find(item => item.id === selectedTask.classId) ?? null;
  const selectedQuestionIds = selectedTask.selectedQuestionIds ?? workflowState.assignment.selectedQuestionIds ?? workflowState.questions.map(question => question.id);
  const selectedQuestions = workflowState.questions.filter(question => selectedQuestionIds.includes(question.id));
  const selectedQuestionStates = questionStates.filter(state => selectedQuestionIds.includes(state.questionId));
  const currentQuestion = selectedQuestions.find(item => item.id === selectedQuestionId) ?? selectedQuestions[0] ?? workflowState.questions[0];
  const currentQuestionState = selectedQuestionStates.find(item => item.questionId === selectedQuestionId) ?? selectedQuestionStates[0] ?? questionStates[0];
  const persistedCurrentQuestionState = workflowState.questionGradingStates?.find(item => item.questionId === currentQuestionState?.questionId);
  const questionEvidence = currentQuestion?.sourceEvidenceIds.map(id => workflowState.sourceEvidence.find(item => item.id === id)).find(Boolean);
  const answerEvidence = currentQuestionState?.standardAnswerSourceIds?.map(id => workflowState.sourceEvidence.find(item => item.id === id)).find(Boolean);
  const currentTrialSamples = currentQuestionState?.calibrationSamples.slice(0, currentQuestionState.sampleTarget) ?? [];
  const selectedSample = currentTrialSamples.find(sample => sample.id === selectedSampleId) ?? currentTrialSamples[0];
  const matchRows = workflowState.submissionPages ?? [];
  const issueRows = matchRows.filter(row => row.status !== 'matched' || row.rosterMatchStatus !== 'matched');
  const displayedRows = showOnlyOcrIssues ? issueRows : matchRows;
  const missingRows = workflowState.missingSubmissions ?? [];
  const trialSamples = selectedQuestionStates.flatMap(state => state.calibrationSamples);
  const reviewSamples = trialSamples
    .map(sample => ({ ...sample, reviewTriggers: getSampleReviewTriggers(sample, lowConfidenceThreshold) }))
    .filter(sample => sample.reviewTriggers.length);
  const pendingReviewSamples = reviewSamples.filter(sample => sample.status !== 'confirmed' && sample.reviewStatus !== 'resolved');
  const resolvedReviewSamples = reviewSamples.filter(sample => sample.reviewStatus === 'resolved');
  const visibleReviewSamples = reviewStage === 'resolved'
    ? resolvedReviewSamples
    : reviewStage === 'all'
      ? pendingReviewSamples
      : pendingReviewSamples.filter(sample => sample.reviewTriggers?.includes(reviewStage));
  const selectedReviewSample = reviewSamples.find(sample => sample.id === reviewSampleId) ?? null;
  const selectedReviewQuestionState = questionStates.find(state => state.questionId === selectedReviewSample?.questionId);
  const selectedReviewAnswerEvidence = selectedReviewQuestionState?.standardAnswerSourceIds?.map(id => workflowState.sourceEvidence.find(item => item.id === id)).find(Boolean);
  const pendingReviews = pendingReviewSamples.length;
  const allCalibrationComplete = selectedQuestionStates.length > 0 && selectedQuestionStates.every(state => state.calibrationSamples.slice(0, state.sampleTarget).every(sample => sample.status === 'confirmed'));
  const allBatchSamples = selectedQuestionStates.flatMap(state => state.calibrationSamples);
  const batchSamples = batchViewMode === 'question' ? allBatchSamples : [];
  const activeBatchQuestionId = batchQuestionId || selectedQuestionStates[0]?.questionId || '';
  const batchStudents = [...allBatchSamples.reduce((students, sample) => students.set(sample.studentId, sample), new Map<string, CalibrationSample>()).values()];
  const activeBatchStudentId = batchStudentId || batchStudents[0]?.studentId || '';
  const selectedBatchSample = batchSamples.find(sample => sample.questionId === activeBatchQuestionId && sample.studentId === activeBatchStudentId);
  const unconfirmedBatchStudents = batchStudents.filter(sample => !(batch?.confirmedStudentIds ?? []).includes(sample.studentId));
  const pendingReviewStudentIds = new Set(pendingReviewSamples.map(sample => sample.studentId));
  const confirmableBatchStudents = unconfirmedBatchStudents.filter(sample => !pendingReviewStudentIds.has(sample.studentId));
  const currentBatchCheckpoint = confirmableBatchStudents.slice(0, 10).map(sample => sample.studentId);
  const assignmentReady = workflowState.assignment.status === 'assigned';
  const gradingDataReady = selectedQuestions.length > 0 && matchRows.length > 0 && rosterMatchPhase === 'ready' && !issueRows.some(row => row.rosterMatchStatus !== 'matched');
  const normalizedDocuments = workflowState.assignment.documents ?? [];
  const activeBatchStudentSamples = allBatchSamples.filter(sample => sample.studentId === activeBatchStudentId);
  const activeBatchAssetId = activeBatchStudentSamples.find(sample => sample.sourceAssetId)?.sourceAssetId;
  const activeBatchDocument = normalizedDocuments.find(document => document.assetId === activeBatchAssetId);
  const assignmentAssets = workflowState.assignment.assets.filter(asset => asset.kind === 'assignment' || asset.kind === 'reference-answer');
  const failedAssignmentAssets = assignmentAssets.filter(asset => asset.status === 'failed');
  const stagedAssignmentAssets = assignmentAssets.filter(asset => asset.status === 'uploaded');
  const activeMaterialError = materialUploadError ?? failedAssignmentAssets[0]?.parseErrorCode;
  const pendingMaterialCount = pendingMaterialFiles.assignment.length + pendingMaterialFiles.referenceAnswer.length;
  const materialUploadBusy = materialUploadPhase === 'uploading' || materialUploadPhase === 'parsing';
  const assignmentMaterialsReady = assignmentAssets.some(asset => asset.kind === 'assignment' && (asset.status === 'ready' || asset.status === 'needs-review'))
    && assignmentAssets.some(asset => asset.kind === 'reference-answer' && (asset.status === 'ready' || asset.status === 'needs-review'));
  const assignmentAssetIds = new Set(assignmentAssets.map(asset => asset.id));
  const assignmentDocuments = normalizedDocuments.filter(document => assignmentAssetIds.has(document.assetId));
  const activeClassRoster = classRoster.filter(student => student.enrollmentStatus === 'active');
  const expectedStudentCount = rosterMatchPhase === 'ready' ? activeClassRoster.length : currentClass?.studentCount ?? 0;
  const currentClassName = currentClass?.name ?? selectedTask.className;
  const matchedStudentCount = new Set(matchRows.filter(row => row.rosterMatchStatus === 'matched').map(row => row.studentId).filter(Boolean)).size;
  const submissionRosterInputKey = matchRows.map(page => `${page.id}:${page.detectedStudentName ?? ''}:${page.studentId ?? ''}:${page.rosterMatchStatus ?? ''}`).join('|');
  const submissionAssets = workflowState.assignment.assets.filter(asset => asset.kind === 'student-submission');
  const extractableSubmissionIds = matchRows.flatMap(row => {
    const asset = submissionAssets.find(item => item.id === row.id);
    return row.rosterMatchStatus === 'matched' && asset && (asset.status === 'ready' || asset.status === 'needs-review') ? [row.id] : [];
  });
  const submissionExtractionBusy = submissionExtractionProgress.phase === 'checking' || submissionExtractionProgress.phase === 'extracting';
  const failedSubmissionAssets = submissionAssets.filter(asset => asset.status === 'failed');
  const questionSelectionLocked = Boolean(selectedTask.questionScopeConfirmedAt || submissionAssets.length > 0);
  const allQuestionsSelected = workflowState.questions.length > 0 && questionSelectionDraft.length === workflowState.questions.length;
  const questionSelectionDirty = JSON.stringify([...questionSelectionDraft].sort()) !== JSON.stringify([...selectedQuestionIds].sort());
  const submissionMaterialKey = submissionAssets.map(asset => `${asset.id}:${asset.status}`).join('|');
  const rubricDirty = Boolean(currentQuestionState && persistedCurrentQuestionState && JSON.stringify({ standardAnswer: currentQuestionState.standardAnswer, gradingRubric: currentQuestionState.gradingRubric, teacherRules: currentQuestionState.teacherRules }) !== JSON.stringify({ standardAnswer: persistedCurrentQuestionState.standardAnswer, gradingRubric: persistedCurrentQuestionState.gradingRubric, teacherRules: persistedCurrentQuestionState.teacherRules }));

  useEffect(() => { questionStatesRef.current = questionStates; }, [questionStates]);

  useEffect(() => {
    if (batchViewMode !== 'submission' || !activeBatchAssetId || visionValidationByAsset[activeBatchAssetId] || visionValidationPhase[activeBatchAssetId]) return;
    setVisionValidationPhase(current => ({ ...current, [activeBatchAssetId]: 'loading' }));
    void getVisionValidation(selectedTask.id, activeBatchAssetId).then(result => {
      if (result) {
        setVisionValidationByAsset(current => ({ ...current, [activeBatchAssetId]: result }));
        setVisionValidationPhase(current => ({ ...current, [activeBatchAssetId]: 'ready' }));
      } else {
        setVisionValidationPhase(current => ({ ...current, [activeBatchAssetId]: 'error' }));
        setVisionValidationError(current => ({ ...current, [activeBatchAssetId]: 'VISION_VALIDATION_NOT_FOUND' }));
      }
    }).catch(error => {
      setVisionValidationPhase(current => ({ ...current, [activeBatchAssetId]: 'error' }));
      setVisionValidationError(current => ({ ...current, [activeBatchAssetId]: error instanceof Error ? error.message : 'VISION_VALIDATION_FAILED' }));
    });
  }, [activeBatchAssetId, batchViewMode, selectedTask.id, visionValidationByAsset, visionValidationPhase]);

  useEffect(() => {
    setPendingMaterialFiles({ assignment: [], referenceAnswer: [] });
    setMaterialUploadPhase('idle');
    setMaterialUploadError(null);
    setAnalysisErrorCode(null);
    setSubmissionManagement(false);
    setSelectedSubmissionIds(new Set());
    setShowSubmissionDeleteConfirm(false);
    setSubmissionExtractionProgress({ phase: 'idle', requested: 0, completed: 0, failed: 0, skipped: 0, startedAt: null, elapsedSeconds: 0 });
  }, [selectedTask.id]);

  const updateAssignment = (updated: Partial<WorkflowState['assignment']>) => {
    onUpdateState({ assignment: { ...workflowState.assignment, ...updated } });
  };

  const gradingQuestions = () => selectedQuestions.map(question => {
    const state = questionStates.find(item => item.questionId === question.id);
    return { questionId: question.id, displayNo: question.displayNo, stem: question.stem ?? question.desc, fullScore: question.score, standardAnswer: state?.standardAnswer ?? '', subquestions: question.subquestions ?? [], rubricPoints: state?.gradingRubric ?? [], teacherRules: [...(state?.teacherRules ?? []), ...(workflowState.assignment.note.trim() ? [`本次批改补充要求：${workflowState.assignment.note.trim()}`] : [])], rubricVersion: state?.rubricVersion ?? 1 };
  });

  const gradingSubmissions = () => matchRows.filter(page => page.rosterMatchStatus === 'matched' && page.studentId).map(page => ({ assetId: page.id, studentId: page.studentId!, studentName: page.expectedStudentName, studentNo: page.matchedStudentNo ?? page.detectedStudentNo }));

  useEffect(() => {
    if (!isAnalyzing || !analysisStartedAt) return;
    const timer = window.setInterval(() => setAnalysisElapsedSeconds(Math.floor((Date.now() - analysisStartedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isAnalyzing, analysisStartedAt]);

  useEffect(() => {
    if (trialProgress.phase !== 'recognition' && trialProgress.phase !== 'grading') return;
    const timer = window.setInterval(() => setTrialProgress(current => current.startedAt ? { ...current, elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000) } : current), 1000);
    return () => window.clearInterval(timer);
  }, [trialProgress.phase]);

  useEffect(() => {
    if (!submissionExtractionBusy) return;
    const timer = window.setInterval(() => setSubmissionExtractionProgress(current => current.startedAt ? { ...current, elapsedSeconds: Math.floor((Date.now() - current.startedAt) / 1000) } : current), 1000);
    return () => window.clearInterval(timer);
  }, [submissionExtractionBusy]);

  useEffect(() => {
    let active = true;
    void Promise.all([getTaskMaterials(selectedTask.id), getTaskAnalysis(selectedTask.id), getTaskTrialGrading(selectedTask.id), getTaskRubrics(selectedTask.id)]).then(([materials, analysis, trialResult, savedRubrics]) => {
      if (!active || (!materials.assets.length && !analysis)) return;
      const questionFileNames = materials.assets.filter(asset => asset.kind === 'assignment').map(asset => asset.fileName);
      const answerFileNames = materials.assets.filter(asset => asset.kind === 'reference-answer').map(asset => asset.fileName);
      const assignmentAssets = materials.assets.filter(asset => asset.kind !== 'student-submission');
      const needsReview = assignmentAssets.some(asset => asset.status === 'needs-review');
      const derivedWorkflow = analysis ? buildWorkflowFromAnalysis(selectedTask.id, analysis, savedRubrics) : undefined;
      if (derivedWorkflow) {
        const usableTrialResult = trialResult?.samples.every(sample => sample.sourcePreviewType === 'image') ? trialResult : null;
        const restoredStates = applyTrialSamples(derivedWorkflow.questionGradingStates, usableTrialResult);
        const firstSample = restoredStates[0]?.calibrationSamples[0];
        setQuestionStates(restoredStates);
        setSelectedQuestionId(derivedWorkflow.questions[0]?.id ?? '');
        setSelectedSampleId(firstSample?.id ?? '');
        setEditedOcr(firstSample ? getEffectiveOcrText(firstSample) : '');
        setTrialGradingPhase(usableTrialResult ? 'ready' : 'idle');
      }
      onUpdateState({
        assignment: {
          ...workflowState.assignment,
          status: selectedTask.questionScopeConfirmedAt || materials.assets.some(asset => asset.kind === 'student-submission') ? 'assigned' : workflowState.assignment.status,
          questionFileNames,
          answerFileNames,
          assets: materials.assets,
          documents: materials.documents,
          firstSectionAnalysis: analysis ?? undefined,
          selectedQuestionIds: selectedTask.selectedQuestionIds ?? workflowState.assignment.selectedQuestionIds,
          analysisStatus: needsReview ? 'needs-review' : assignmentAssets.length ? 'ready' : workflowState.assignment.analysisStatus
        },
        ...(derivedWorkflow ?? {})
      });
      if (derivedWorkflow) {
        setQuestionSelectionDraft(selectedTask.selectedQuestionIds ?? workflowState.assignment.selectedQuestionIds ?? derivedWorkflow.questions.map(question => question.id));
        setQuestionSelectionEditing(!selectedTask.selectedQuestionIds?.length && !selectedTask.questionScopeConfirmedAt);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [selectedTask.id]);

  useEffect(() => {
    void getBatchGrading(selectedTask.id).then(result => {
      setBatch(result);
      if (result.status !== 'idle') setGradingMode(result.mode);
    }).catch(() => undefined);
  }, [selectedTask.id]);

  useEffect(() => {
    if (activeStage !== 'diagnosis') return;
    void getGradingDiagnosis(selectedTask.id, selectedQuestions).then(setDiagnosis).catch(() => setDiagnosis(null));
  }, [activeStage, selectedTask.id, workflowState.questions, workflowState.assignment.selectedQuestionIds]);

  useEffect(() => {
    if (!selectedReviewSample) return;
    const previousOverflow = document.body.style.overflow;
    const main = document.querySelector('main');
    const previousMainOverflow = main instanceof HTMLElement ? main.style.overflow : '';
    document.body.style.overflow = 'hidden';
    if (main instanceof HTMLElement) main.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (main instanceof HTMLElement) main.style.overflow = previousMainOverflow;
    };
  }, [selectedReviewSample]);

  useEffect(() => {
    let active = true;
    setRosterMatchPhase('loading');
    setRosterMatchError(null);
    void Promise.all([
      listRosterClasses(),
      listRosterStudents(selectedTask.classId)
    ]).then(([schoolClasses, students]) => {
      if (!active) return;
      const selectedClass = schoolClasses.find(item => item.id === selectedTask.classId);
      if (!selectedClass) throw new Error('CLASS_NOT_FOUND');
      setRosterClass(selectedClass);
      setClassRoster(students);
      setRosterMatchPhase('ready');
    }).catch(error => {
      if (!active) return;
      setRosterClass(null);
      setClassRoster([]);
      setRosterMatchPhase('error');
      setRosterMatchError(error instanceof Error ? error.message : 'ROSTER_MATCH_FAILED');
    });
    return () => { active = false; };
  }, [selectedTask.id, selectedTask.classId, rosterRefreshKey]);

  useEffect(() => {
    if (rosterMatchPhase !== 'ready') return;
    const submissionAssetIds = new Set(submissionAssets.map(asset => asset.id));
    const storedDocuments = normalizedDocuments.filter(document => submissionAssetIds.has(document.assetId));
    const rowsMatchStoredAssets = matchRows.length === submissionAssets.length
      && matchRows.every(page => submissionAssetIds.has(page.id) && typeof page.detectedStudentName === 'string');
    const pagesToMatch = submissionAssets.length && !rowsMatchStoredAssets
      ? buildSubmissionPages(submissionAssets, storedDocuments, classRoster)
      : matchRows;
    onUpdateState({
      submissionPages: pagesToMatch,
      missingSubmissions: buildMissingSubmissions(pagesToMatch, classRoster)
    });
  }, [selectedTask.id, selectedTask.classId, submissionRosterInputKey, submissionMaterialKey, normalizedDocuments.length, rosterMatchPhase, rosterRefreshKey]);

  const confirmSubmissionStudent = (pageId: string, lookup: { studentId?: string; studentNo?: string }) => {
    const normalizedStudentNo = lookup.studentNo?.trim();
    const student = classRoster.find(item => item.enrollmentStatus === 'active' && (lookup.studentId ? item.studentId === lookup.studentId : item.studentNo === normalizedStudentNo));
    if (!student) return normalizedStudentNo ? '当前班级名册中没有这个学号。' : '请先选择学生。';
    const duplicate = matchRows.find(page => page.id !== pageId && page.rosterMatchStatus === 'matched' && page.studentId === student.studentId);
    if (duplicate) return `${student.name} 已匹配第 ${duplicate.sequence} 份答卷，请先核对或解除原匹配。`;
    onUpdateState({
      submissionPages: matchRows.map(page => page.id === pageId
        ? { ...page, studentId: student.studentId, expectedStudentName: student.name, detectedStudentName: student.name, detectedStudentNo: student.studentNo, matchedStudentNo: student.studentNo, nameMatchSource: 'teacher', rosterMatchStatus: 'matched', rosterIssueReason: undefined, issueReason: undefined, reviewSource: 'teacher', status: 'matched' }
        : page)
    });
    setExpandedOcrPageId(null);
    onShowToast(`已确认姓名：${student.name}`);
    return undefined;
  };

  const currentQuestionNos = [...new Set(selectedQuestions.map(question => question.displayNo).filter(Boolean))];

  const openSubmissionPreview = (assetId: string) => {
    if (expandedOcrPageId === assetId) {
      setExpandedOcrPageId(null);
      return;
    }
    setExpandedOcrPageId(assetId);
    if (visionValidationByAsset[assetId]) return;
    setVisionValidationPhase(current => ({ ...current, [assetId]: 'loading' }));
    void getVisionValidation(selectedTask.id, assetId).then(result => {
      if (result) {
        setVisionValidationByAsset(current => ({ ...current, [assetId]: result }));
        setVisionValidationPhase(current => ({ ...current, [assetId]: 'ready' }));
        return;
      }
      setVisionValidationPhase(current => ({ ...current, [assetId]: 'idle' }));
    }).catch(error => {
      setVisionValidationPhase(current => ({ ...current, [assetId]: 'error' }));
      setVisionValidationError(current => ({ ...current, [assetId]: error instanceof Error ? error.message : 'VISION_VALIDATION_LOAD_FAILED' }));
    });
  };

  const validateSubmissionVision = async (assetId: string, notify = true) => {
    setVisionValidationPhase(current => ({ ...current, [assetId]: 'extracting' }));
    setVisionValidationError(current => ({ ...current, [assetId]: '' }));
    try {
      const result = await runVisionValidation(selectedTask.id, assetId, currentQuestionNos);
      setVisionValidationByAsset(current => ({ ...current, [assetId]: result }));
      setVisionValidationPhase(current => ({ ...current, [assetId]: 'ready' }));
      if (notify) onShowToast('Luna 已完成整份答卷的证据提取');
      return true;
    } catch (error) {
      const code = error instanceof Error ? error.message : 'VISION_VALIDATION_FAILED';
      setVisionValidationPhase(current => ({ ...current, [assetId]: 'error' }));
      setVisionValidationError(current => ({ ...current, [assetId]: code }));
      if (notify) {
        const message = code === 'VISION_VALIDATION_INPUT_NOT_READY'
          ? '该答卷需要重新解析后才能按题识别'
          : code === 'SOURCE_PAGE_FILE_NOT_FOUND'
            ? '该答卷的原始页面文件缺失，请重新解析后重试'
            : code === 'MODEL_REQUEST_FAILED:429'
              ? 'AI 原图识别请求频率受限，请稍后单独重试'
              : 'AI 原图识别失败，当前答卷已保留，可单独重试';
        onShowToast(message);
      }
      return false;
    }
  };

  const extractStudentAnswers = async () => {
    if (submissionExtractionProgress.phase === 'checking' || submissionExtractionProgress.phase === 'extracting') return;
    const selected = [...selectedSubmissionIds].filter(assetId => extractableSubmissionIds.includes(assetId));
    const assetIds = selected.length ? selected : extractableSubmissionIds;
    if (!assetIds.length) return;
    const startedAt = Date.now();
    setSubmissionExtractionProgress({ phase: 'checking', requested: assetIds.length, completed: 0, failed: 0, skipped: 0, startedAt, elapsedSeconds: 0 });
    const storedResults = await Promise.all(assetIds.map(async assetId => {
      try {
        return { assetId, result: visionValidationByAsset[assetId] ?? await getVisionValidation(selectedTask.id, assetId), lookupFailed: false };
      } catch {
        return { assetId, result: null, lookupFailed: true };
      }
    }));
    const existingResults = storedResults.filter(item => item.result);
    const lookupFailures = storedResults.filter(item => item.lookupFailed).length;
    if (existingResults.length) {
      setVisionValidationByAsset(current => ({ ...current, ...Object.fromEntries(existingResults.map(item => [item.assetId, item.result!])) }));
      setVisionValidationPhase(current => ({ ...current, ...Object.fromEntries(existingResults.map(item => [item.assetId, 'ready' as const])) }));
    }
    const pendingIds = storedResults.filter(item => !item.result && !item.lookupFailed).map(item => item.assetId);
    if (!pendingIds.length) {
      setSubmissionExtractionProgress({ phase: 'complete', requested: assetIds.length, completed: 0, failed: lookupFailures, skipped: existingResults.length, startedAt, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
      onShowToast(lookupFailures ? `跳过已有结果 ${existingResults.length} 份，另有 ${lookupFailures} 份状态读取失败，未调用 Luna` : `已跳过 ${assetIds.length} 份已有结果，没有重复调用 Luna`);
      return;
    }
    setSubmissionExtractionProgress({ phase: 'extracting', requested: assetIds.length, completed: 0, failed: lookupFailures, skipped: existingResults.length, startedAt, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
    const results = await Promise.all(pendingIds.map(async assetId => {
      const succeeded = await validateSubmissionVision(assetId, false);
      setSubmissionExtractionProgress(current => ({ ...current, completed: current.completed + (succeeded ? 1 : 0), failed: current.failed + (succeeded ? 0 : 1) }));
      return succeeded;
    }));
    const completed = results.filter(Boolean).length;
    const failed = pendingIds.length - completed + lookupFailures;
    setSubmissionExtractionProgress({ phase: 'complete', requested: assetIds.length, completed, failed, skipped: existingResults.length, startedAt, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
    onShowToast(failed ? `新完成 ${completed} 份，失败 ${failed} 份，跳过已有结果 ${existingResults.length} 份` : `新完成 ${completed} 份，跳过已有结果 ${existingResults.length} 份`);
  };

  const selectSubmissionFiles = (fileList: FileList | null) => {
    const files = getFiles(fileList);
    if (!files.length) return;
    if (submissionFiles.length + files.length > 20) {
      onShowToast('单次最多上传 20 个答卷文件');
      return;
    }
    setSubmissionFiles(current => [...current, ...files]);
    setSubmissionUploadPhase('idle');
    setSubmissionUploadError(null);
  };

  const removePendingSubmissionFile = (index: number) => {
    setSubmissionFiles(current => current.filter((_, fileIndex) => fileIndex !== index));
    setSubmissionUploadPhase('idle');
    setSubmissionUploadError(null);
  };

  const moveSubmissionFile = (index: number, direction: -1 | 1) => {
    setSubmissionFiles(current => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  };

  const toggleSubmissionSelection = (assetId: string) => setSelectedSubmissionIds(current => {
    const next = new Set(current);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    return next;
  });

  const removableDisplayedIds = displayedRows.flatMap(row => {
    const asset = submissionAssets.find(item => item.id === row.id);
    return asset && asset.status !== 'processing' && asset.status !== 'uploaded' ? [row.id] : [];
  });
  const selectedSubmissionAssets = submissionAssets.filter(asset => selectedSubmissionIds.has(asset.id));

  const toggleAllDisplayedSubmissions = () => setSelectedSubmissionIds(current => {
    const next = new Set(current);
    const allSelected = removableDisplayedIds.length > 0 && removableDisplayedIds.every(id => next.has(id));
    removableDisplayedIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
    return next;
  });

  const deleteSelectedSubmissions = async () => {
    const assetIds = [...selectedSubmissionIds];
    if (!assetIds.length) return;
    setSubmissionDeletePhase('deleting');
    try {
      await removeStudentSubmissions(selectedTask.id, assetIds);
      const materials = await getTaskMaterials(selectedTask.id);
      const removed = new Set(assetIds);
      const nextStates = questionStates.map(state => ({
        ...state,
        calibrationSamples: state.calibrationSamples.filter(sample => !sample.sourceAssetId || !removed.has(sample.sourceAssetId))
      }));
      setQuestionStates(nextStates);
      setBatch(null);
      setExpandedOcrPageId(null);
      setVisionValidationByAsset(current => Object.fromEntries(Object.entries(current).filter(([assetId]) => !removed.has(assetId))));
      setVisionValidationPhase(current => Object.fromEntries(Object.entries(current).filter(([assetId]) => !removed.has(assetId))));
      setVisionValidationError(current => Object.fromEntries(Object.entries(current).filter(([assetId]) => !removed.has(assetId))));
      onUpdateState({
        assignment: { ...workflowState.assignment, assets: materials.assets, documents: materials.documents },
        submissionPages: matchRows.filter(row => !removed.has(row.id)),
        questionGradingStates: nextStates,
        uploadedCount: Math.max(0, submissionAssets.length - removed.size)
      });
      setSelectedSubmissionIds(new Set());
      setShowSubmissionDeleteConfirm(false);
      setSubmissionManagement(false);
      onShowToast(`已删除 ${assetIds.length} 份答卷；教师电脑中的原文件未受影响`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SUBMISSION_DELETE_FAILED';
      onShowToast(code === 'SUBMISSION_PROCESSING' ? '所选答卷仍在处理，完成后才能删除' : '答卷删除失败，现有数据未改变');
    } finally {
      setSubmissionDeletePhase('idle');
    }
  };

  const submitStudentSubmissions = async () => {
    if (!submissionFiles.length) return;
    let uploadedAssetIds: string[] = [];
    setSubmissionUploadPhase('uploading');
    setSubmissionUploadError(null);
    try {
      const uploaded = await uploadTaskMaterials(selectedTask.id, 'student-submission', submissionFiles);
      uploadedAssetIds = uploaded.map(asset => asset.id);
      setSubmissionFiles([]);
      const assets = [...workflowState.assignment.assets, ...uploaded];
      onUpdateState({
        assignment: { ...workflowState.assignment, assets },
        submissionPages: [],
        missingSubmissions: []
      });
      setSubmissionUploadPhase('parsing');
      const result = await waitForTaskMaterials(selectedTask.id, uploadedAssetIds);
      onUpdateState({
        assignment: {
          ...workflowState.assignment,
          assets: result.assets,
          documents: result.documents
        },
        submissionPages: [],
        uploadedCount: uploaded.length
      });
      setSubmissionUploadPhase('idle');
      onShowToast(`已上传并解析 ${uploaded.length} 个答卷文件，正在匹配五班名册`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SUBMISSION_UPLOAD_FAILED';
      if (uploadedAssetIds.length) {
        try {
          const materials = await getTaskMaterials(selectedTask.id);
          onUpdateState({
            assignment: { ...workflowState.assignment, assets: materials.assets, documents: materials.documents },
            submissionPages: [],
            missingSubmissions: [],
            uploadedCount: materials.assets.filter(asset => asset.kind === 'student-submission').length
          });
        } catch {
          // 保留原错误；页面刷新时仍会从服务端恢复材料状态。
        }
      }
      setSubmissionUploadPhase('error');
      setSubmissionUploadError(code);
      const message = code === 'PADDLEOCR_QUEUE_FULL'
        ? 'PaddleOCR 当前队列已满，文件已上传，可稍后直接重试识别'
        : code === 'PADDLEOCR_RATE_LIMITED'
        ? 'PaddleOCR 请求频率受限，文件已上传，可稍后直接重试识别'
        : code === 'PADDLEOCR_TIMEOUT'
          ? 'PaddleOCR 解析超时，文件已上传，可稍后直接重试识别'
          : uploadedAssetIds.length ? '答卷已上传，但部分识别失败；无需重新上传' : '答卷上传失败，文件尚未进入系统，可重新提交';
      onShowToast(message);
    }
  };

  const retryFailedSubmissionParsing = async () => {
    const assetIds = failedSubmissionAssets.map(asset => asset.id);
    if (!assetIds.length) return;
    setSubmissionUploadPhase('parsing');
    setSubmissionUploadError(null);
    try {
      await retryStudentSubmissionParsing(selectedTask.id, assetIds);
      const result = await waitForTaskMaterials(selectedTask.id, assetIds);
      onUpdateState({
        assignment: { ...workflowState.assignment, assets: result.assets, documents: result.documents },
        submissionPages: [],
        missingSubmissions: [],
        uploadedCount: result.assets.filter(asset => asset.kind === 'student-submission').length
      });
      setSubmissionUploadPhase('idle');
      onShowToast(`已重新识别 ${assetIds.length} 份答卷，没有重复上传`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SUBMISSION_PARSE_FAILED';
      try {
        const materials = await getTaskMaterials(selectedTask.id);
        onUpdateState({
          assignment: { ...workflowState.assignment, assets: materials.assets, documents: materials.documents },
          submissionPages: [],
          missingSubmissions: [],
          uploadedCount: materials.assets.filter(asset => asset.kind === 'student-submission').length
        });
      } catch {
        // 保留重试错误；页面刷新时仍会从服务端恢复材料状态。
      }
      setSubmissionUploadPhase('error');
      setSubmissionUploadError(code);
      onShowToast(code === 'PADDLEOCR_QUEUE_FULL' ? 'PaddleOCR 当前队列仍然繁忙，答卷已保留且没有新增副本' : '部分答卷仍未识别，上传记录已保留且没有新增副本');
    }
  };

  const selectMaterialFiles = (kind: 'assignment' | 'referenceAnswer', fileList: FileList | null) => {
    const files = getFiles(fileList);
    if (!files.length) return;
    if (pendingMaterialFiles[kind].length + files.length > 20) {
      onShowToast('题目或答案单次最多选择 20 个文件');
      return;
    }
    setPendingMaterialFiles(current => ({ ...current, [kind]: [...current[kind], ...files] }));
    setMaterialUploadPhase('idle');
    setMaterialUploadError(null);
  };

  const moveMaterialFile = (kind: 'assignment' | 'referenceAnswer', index: number, direction: -1 | 1) => {
    setPendingMaterialFiles(current => {
      const next = [...current[kind]];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return { ...current, [kind]: next };
    });
  };

  const removePendingMaterialFile = (kind: 'assignment' | 'referenceAnswer', index: number) => {
    setPendingMaterialFiles(current => ({ ...current, [kind]: current[kind].filter((_, fileIndex) => fileIndex !== index) }));
  };

  const clearPendingMaterialFiles = (kind: 'assignment' | 'referenceAnswer') => {
    setPendingMaterialFiles(current => ({ ...current, [kind]: [] }));
    setMaterialUploadPhase('idle');
    setMaterialUploadError(null);
  };

  const startMaterialParsing = async () => {
    const pendingGroups = [
      { kind: 'assignment' as const, files: pendingMaterialFiles.assignment },
      { kind: 'reference-answer' as const, files: pendingMaterialFiles.referenceAnswer }
    ].filter(group => group.files.length);
    if (!pendingGroups.length && !stagedAssignmentAssets.length) return;
    const replacing = pendingGroups.filter(group => workflowState.assignment.assets.some(asset => asset.kind === group.kind));
    if (replacing.length && !window.confirm(`重新上传${replacing.map(group => group.kind === 'assignment' ? '题目' : '参考答案').join('和')}会替换该类已上传材料，并使原有拆题和试批结果失效。确定继续吗？`)) return;
    setMaterialUploadPhase('uploading');
    setMaterialUploadError(null);
    setAnalysisErrorCode(null);
    updateAssignment({ analysisStatus: 'uploading' });
    try {
      const uploadedGroups = pendingGroups.length ? await Promise.all(pendingGroups.map(group => uploadTaskMaterials(selectedTask.id, group.kind, group.files))) : [];
      const uploaded = uploadedGroups.flat();
      const replacedKinds = new Set(pendingGroups.map(group => group.kind));
      const assets = [...workflowState.assignment.assets.filter(asset => !replacedKinds.has(asset.kind as 'assignment' | 'reference-answer')), ...uploaded];
      updateAssignment({ assets, analysisStatus: 'uploading' });
      setPendingMaterialFiles(current => ({
        assignment: replacedKinds.has('assignment') ? [] : current.assignment,
        referenceAnswer: replacedKinds.has('reference-answer') ? [] : current.referenceAnswer
      }));
      if (pendingGroups.length) {
        setMaterialUploadPhase('idle');
        onShowToast('材料已上传，可先预览或删除；确认后再开始解析');
        return;
      }
      setMaterialUploadPhase('parsing');
      await parseTaskMaterials(selectedTask.id, stagedAssignmentAssets.map(asset => asset.id));
      const result = await getTaskMaterials(selectedTask.id);
      const nextAssignmentAssets = result.assets.filter(asset => asset.kind === 'assignment' || asset.kind === 'reference-answer');
      const needsReview = nextAssignmentAssets.some(asset => asset.status === 'needs-review');
      onUpdateState({
        assignment: {
          ...workflowState.assignment,
          questionFileNames: nextAssignmentAssets.filter(asset => asset.kind === 'assignment').map(asset => asset.fileName),
          answerFileNames: nextAssignmentAssets.filter(asset => asset.kind === 'reference-answer').map(asset => asset.fileName),
          assets: result.assets,
          documents: result.documents,
          analysisStatus: needsReview ? 'needs-review' : 'ready'
        }
      });
      setPendingMaterialFiles({ assignment: [], referenceAnswer: [] });
      setMaterialUploadPhase('idle');
      onShowToast(needsReview ? '材料解析完成，存在需要检查的内容' : `已解析 ${uploaded.length} 份材料`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'MATERIAL_PARSE_FAILED';
      setMaterialUploadPhase('error');
      setMaterialUploadError(code);
      void getTaskMaterials(selectedTask.id).then(result => {
        const currentMaterials = result.assets.filter(asset => asset.kind === 'assignment' || asset.kind === 'reference-answer');
        const analysisStatus = currentMaterials.some(asset => asset.status === 'failed')
          ? 'failed'
          : currentMaterials.some(asset => asset.status === 'uploaded' || asset.status === 'processing')
            ? 'parsing'
            : currentMaterials.some(asset => asset.status === 'needs-review')
              ? 'needs-review'
              : currentMaterials.length
                ? 'ready'
                : 'idle';
        onUpdateState({
          assignment: {
            ...workflowState.assignment,
            questionFileNames: currentMaterials.filter(asset => asset.kind === 'assignment').map(asset => asset.fileName),
            answerFileNames: currentMaterials.filter(asset => asset.kind === 'reference-answer').map(asset => asset.fileName),
            assets: result.assets,
            documents: result.documents,
            analysisStatus
          }
        });
      }).catch(() => updateAssignment({ analysisStatus: 'failed' }));
      onShowToast(materialParseErrorMessage(code));
    }
  };

  const deleteAssignmentMaterial = async (asset: DocumentAsset) => {
    if (!window.confirm(`删除“${asset.fileName}”？相关拆题与评分草稿会失效。`)) return;
    await removeTaskMaterials(selectedTask.id, [asset.id]);
    const result = await getTaskMaterials(selectedTask.id);
    onUpdateState({ assignment: { ...workflowState.assignment, assets: result.assets, documents: result.documents, firstSectionAnalysis: undefined, analysisStatus: 'idle' } });
    onShowToast('材料已删除');
  };

  const retryFailedMaterialParsing = async () => {
    const assetIds = failedAssignmentAssets.map(asset => asset.id);
    if (!assetIds.length) return;
    setMaterialUploadPhase('parsing');
    setMaterialUploadError(null);
    updateAssignment({ analysisStatus: 'parsing' });
    try {
      await Promise.all(assetIds.map(assetId => retryTaskMaterialParsing(selectedTask.id, assetId)));
      const result = await getTaskMaterials(selectedTask.id);
      const nextAssignmentAssets = result.assets.filter(asset => asset.kind === 'assignment' || asset.kind === 'reference-answer');
      const failed = nextAssignmentAssets.filter(asset => asset.status === 'failed');
      const needsReview = nextAssignmentAssets.some(asset => asset.status === 'needs-review');
      onUpdateState({
        assignment: {
          ...workflowState.assignment,
          questionFileNames: nextAssignmentAssets.filter(asset => asset.kind === 'assignment').map(asset => asset.fileName),
          answerFileNames: nextAssignmentAssets.filter(asset => asset.kind === 'reference-answer').map(asset => asset.fileName),
          assets: result.assets,
          documents: result.documents,
          analysisStatus: failed.length ? 'failed' : needsReview ? 'needs-review' : 'ready'
        }
      });
      if (failed.length) {
        const code = failed[0]?.parseErrorCode ?? 'MATERIAL_PARSE_FAILED';
        setMaterialUploadPhase('error');
        setMaterialUploadError(code);
        onShowToast(materialParseErrorMessage(code));
        return;
      }
      setMaterialUploadPhase('idle');
      onShowToast(`已重新解析 ${assetIds.length} 份材料，没有重复上传`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'MATERIAL_PARSE_FAILED';
      setMaterialUploadPhase('error');
      setMaterialUploadError(code);
      updateAssignment({ analysisStatus: 'failed' });
      onShowToast(materialParseErrorMessage(code));
    }
  };

  const completeAssignment = async () => {
    if (!workflowState.assignment.questionFileNames.length && !workflowState.assignment.note.trim()) {
      onShowToast('请先上传作业题目，或填写作业内容');
      return;
    }
    if (workflowState.assignment.assets.some(asset => asset.kind === 'assignment') && !workflowState.assignment.firstSectionAnalysis) {
      onShowToast('请先完成整份作业拆题，再确认本次批改范围');
      return;
    }
    if (workflowState.assignment.firstSectionAnalysis && !selectedQuestionIds.length) {
      onShowToast('请至少选择一道本次需要批改的题目');
      return;
    }
    if (questionSelectionDirty) {
      onShowToast('题目范围有未保存修改，请先保存');
      return;
    }
    const confirmedAt = new Date().toISOString();
    try {
      await onUpdateTask({ ...selectedTask, node: 'collection', nodeName: '等待收取作业', questionScopeConfirmedAt: confirmedAt });
      updateAssignment({ status: 'assigned' });
      setQuestionSelectionEditing(false);
      onShowToast('作业已布置，题目范围已锁定');
    } catch {
      onShowToast('确认布置失败，请重试');
    }
  };

  const analyzeAssignment = async () => {
    const hasQuestion = workflowState.assignment.assets.some(asset => asset.kind === 'assignment' && (asset.status === 'ready' || asset.status === 'needs-review'));
    const hasAnswer = workflowState.assignment.assets.some(asset => asset.kind === 'reference-answer' && (asset.status === 'ready' || asset.status === 'needs-review'));
    if (!hasQuestion || !hasAnswer) {
      onShowToast('请先完成题目和参考答案解析');
      return;
    }
    setAnalysisErrorCode(null);
    setIsAnalyzing(true);
    const startedAt = Date.now();
    setAnalysisStartedAt(startedAt);
    setAnalysisElapsedSeconds(0);
    try {
      const analysis = await analyzeTaskMaterials(selectedTask.id, knowledgeNodes);
      const savedRubrics = await getTaskRubrics(selectedTask.id);
      const derivedWorkflow = buildWorkflowFromAnalysis(selectedTask.id, analysis, savedRubrics);
      setQuestionStates(derivedWorkflow.questionGradingStates);
      setSelectedQuestionId(derivedWorkflow.questions[0]?.id ?? '');
      setAnalysisQuestionNo(analysis.questions[0]?.displayNo ?? '');
      onUpdateState({ assignment: { ...workflowState.assignment, firstSectionAnalysis: analysis, selectedQuestionIds: derivedWorkflow.questions.map(question => question.id) }, ...derivedWorkflow });
      await onUpdateTask({ ...selectedTask, selectedQuestionIds: derivedWorkflow.questions.map(question => question.id), questionScopeConfirmedAt: undefined });
      setQuestionSelectionEditing(true);
      onShowToast(`拆题完成，共识别 ${analysis.questions.length} 道题`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ANALYSIS_FAILED';
      setAnalysisErrorCode(code);
      onShowToast(analysisErrorMessage(code).title);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStartedAt(null);
    }
  };

  const startSubmissionUpload = () => {
    onUpdateTask({ ...selectedTask, node: 'upload', nodeName: '待上传作业' });
    setActiveStage('intake');
  };

  const selectQuestion = (questionId: string) => {
    const nextState = questionStates.find(item => item.questionId === questionId);
    const trialSamples = nextState?.calibrationSamples.slice(0, nextState.sampleTarget) ?? [];
    const nextSample = trialSamples.find(sample => sample.status === 'pending') ?? trialSamples[0];
    setSelectedQuestionId(questionId);
    setSelectedSampleId(nextSample?.id ?? '');
    setEditedOcr(nextSample?.ocrText ?? '');
    setTeacherScore(nextSample?.teacherScore ?? nextSample?.aiScore ?? 0);
    setTeacherReason(nextSample?.teacherReason ?? '');
    setGradingAction('none');
    setRuleAddedNotice(false);
    setRubricSavePhase('idle');
  };

  const updateQuestionState = (next: QuestionGradingState) => {
    setQuestionStates(current => current.map(item => item.questionId === next.questionId ? next : item));
    setRubricSavePhase('idle');
  };

  const toggleQuestionSelection = (displayNo: string) => {
    const question = workflowState.questions.find(item => item.displayNo === displayNo);
    if (!question) return;
    setQuestionSelectionDraft(current => current.includes(question.id)
      ? current.filter(id => id !== question.id)
      : [...current, question.id]);
  };

  const toggleAllQuestions = () => {
    const allQuestionIds = workflowState.questions.map(question => question.id);
    setQuestionSelectionDraft(questionSelectionDraft.length === allQuestionIds.length ? [] : allQuestionIds);
  };

  const saveQuestionSelection = async () => {
    if (!questionSelectionDraft.length) {
      onShowToast('请至少选择一道本次批改题目');
      return;
    }
    setQuestionSelectionSaving(true);
    try {
      const updatedTask = { ...selectedTask, selectedQuestionIds: questionSelectionDraft };
      await onUpdateTask(updatedTask);
      updateAssignment({ selectedQuestionIds: questionSelectionDraft });
      setQuestionSelectionEditing(false);
      const nextQuestionId = questionSelectionDraft.includes(selectedQuestionId) ? selectedQuestionId : questionSelectionDraft[0];
      setSelectedQuestionId(nextQuestionId);
      onShowToast(`已保存 ${questionSelectionDraft.length} 道本次批改题目`);
    } catch {
      onShowToast('题目范围保存失败，请重试');
    } finally {
      setQuestionSelectionSaving(false);
    }
  };

  const saveAnalysisQuestion = async (displayNo: string, correction: { title: string; stem: string; answerRequirement: string; standardAnswer: string }) => {
    const question = workflowState.questions.find(item => item.displayNo === displayNo);
    const state = questionStates.find(item => item.questionId === question?.id);
    if (!question || !state) throw new Error('QUESTION_NOT_FOUND');
    try {
      const [analysis] = await Promise.all([
        saveTaskQuestionCorrection(selectedTask.id, displayNo, correction),
        saveTaskRubric(selectedTask.id, { questionId: state.questionId, standardAnswer: correction.standardAnswer, gradingRubric: state.gradingRubric, teacherRules: state.teacherRules, rubricVersion: state.rubricVersion })
      ]);
      const questions = workflowState.questions.map(item => item.id === question.id ? { ...item, title: correction.title, desc: correction.stem, stem: correction.stem, answerRequirement: correction.answerRequirement } : item);
      const nextStates = questionStates.map(item => item.questionId === state.questionId ? { ...item, standardAnswer: correction.standardAnswer, calibrationSamples: [] } : item);
      setQuestionStates(nextStates);
      onUpdateState({ questions, questionGradingStates: nextStates, assignment: { ...workflowState.assignment, firstSectionAnalysis: analysis } });
      setTrialGradingPhase('idle');
      setBatch(null);
      onShowToast(`第 ${displayNo} 题已保存`);
    } catch (error) {
      onShowToast(`第 ${displayNo} 题保存失败`);
      throw error;
    }
  };

  const compareEvidenceRegion = (displayNo: string, assetKind: 'assignment' | 'reference-answer', pageNumber: number, boundingBox: EvidenceBox, runOcr: boolean) =>
    compareTaskEvidenceRegion(selectedTask.id, displayNo, assetKind, pageNumber, boundingBox, runOcr);

  const saveEvidenceRegion = async (displayNo: string, assetKind: 'assignment' | 'reference-answer', pageNumber: number, boundingBox: EvidenceBox) => {
    try {
      await saveTaskEvidenceRegion(selectedTask.id, displayNo, assetKind, pageNumber, boundingBox);
      const analysis = await getTaskAnalysis(selectedTask.id);
      if (!analysis) throw new Error('ANALYSIS_NOT_FOUND');
      onUpdateState({ assignment: { ...workflowState.assignment, firstSectionAnalysis: analysis } });
      onShowToast(`第 ${displayNo} 题${assetKind === 'assignment' ? '题目' : '参考答案'}截图范围已保存`);
    } catch (error) {
      onShowToast(`截图范围保存失败（${error instanceof Error ? error.message : '未知错误'}）`);
      throw error;
    }
  };

  const saveQuestionCorrection = async (correction: { title: string; stem: string; answerRequirement: string }) => {
    if (!currentQuestion) return;
    try {
      const analysis = await saveTaskQuestionCorrection(selectedTask.id, currentQuestion.displayNo, correction);
      const questions = workflowState.questions.map(question => question.id === currentQuestion.id ? { ...question, title: correction.title, desc: correction.stem, stem: correction.stem, answerRequirement: correction.answerRequirement } : question);
      onUpdateState({
        questions,
        assignment: { ...workflowState.assignment, firstSectionAnalysis: analysis }
      });
      setTrialGradingPhase('idle');
      setBatch(null);
      onShowToast('题干修正已保存；后续试批会按修正后的题目重新运行');
    } catch (error) {
      onShowToast(`题干修正保存失败（${error instanceof Error ? error.message : '未知错误'}）`);
      throw error;
    }
  };

  const cancelRubricChanges = () => {
    if (!persistedCurrentQuestionState) return;
    setQuestionStates(current => current.map(item => item.questionId === persistedCurrentQuestionState.questionId ? persistedCurrentQuestionState : item));
    setRubricSavePhase('idle');
    onShowToast('已撤销本题尚未保存的修改');
  };

  const toggleKnowledgeLink = async (nodeId: string) => {
    if (!currentQuestion || !knowledgeNodes.some(node => node.id === nodeId) || knowledgeLinkSavingId) return;
    const currentLink = currentQuestion.knowledgeLinks.find(link => link.nodeId === nodeId);
    if (!currentLink) return;
    const confirmed = currentLink.status !== 'confirmed';
    setKnowledgeLinkSavingId(nodeId);
    try {
      const analysis = await setTaskQuestionKnowledgeLink(selectedTask.id, currentQuestion.displayNo, nodeId, confirmed);
      const questions = workflowState.questions.map(question => question.id === currentQuestion.id
        ? { ...question, knowledgeLinks: question.knowledgeLinks.map(link => link.nodeId === nodeId ? { ...link, status: confirmed ? 'confirmed' as const : 'suggested' as const } : link) }
        : question);
      onUpdateState({ questions, assignment: { ...workflowState.assignment, firstSectionAnalysis: analysis } });
      onShowToast(confirmed ? '已关联知识点，再点一次可取消' : '已取消知识点关联');
    } catch {
      onShowToast('知识点关联状态保存失败，现有状态未改变');
    } finally {
      setKnowledgeLinkSavingId(null);
    }
  };

  const setSampleTarget = (target: 3 | 5) => {
    if (!currentQuestionState || !currentQuestion) return;
    updateQuestionState({ ...currentQuestionState, sampleTarget: target });
  };

  const selectSample = (sample: CalibrationSample) => {
    setSelectedSampleId(sample.id);
    setEditedOcr(getEffectiveOcrText(sample));
    setTeacherScore(sample.teacherScore ?? sample.aiScore ?? 0);
    setTeacherReason(sample.teacherReason ?? '');
    setGradingAction('none');
    setRuleAddedNotice(false);
  };

  const prepareTrialCalibration = async () => {
    const matchedSubmissions = matchRows.filter(page => page.rosterMatchStatus === 'matched' && page.studentId);
    if (!matchedSubmissions.length || !selectedQuestions.length) {
      onShowToast('缺少已匹配答卷或评分依据，暂时不能开始试批');
      return;
    }
    setActiveStage('calibration');
    setTrialGradingPhase('loading');
    setTrialGradingError(null);
    const startedAt = Date.now();
    setTrialProgress({ phase: 'recognition', completed: 0, total: matchedSubmissions.length, currentLabel: '准备逐份核对答卷', startedAt, elapsedSeconds: 0 });
    try {
      setTrialProgress(current => ({ ...current, currentLabel: `正在并行读取 ${matchedSubmissions.length} 份已有提取结果` }));
      const recognitionResults = await Promise.allSettled(matchedSubmissions.map(async submission => {
        try {
          const stored = visionValidationByAsset[submission.id] ?? await getVisionValidation(selectedTask.id, submission.id);
          const missingQuestionNos = currentQuestionNos.filter(displayNo => !hasUsableVisionItem(stored?.items.find(item => item.displayNo === displayNo)));
          if (!stored || missingQuestionNos.length) throw new Error('VISION_RESULTS_NOT_READY');
          setVisionValidationByAsset(current => ({ ...current, [submission.id]: stored }));
          setVisionValidationPhase(current => ({ ...current, [submission.id]: 'ready' }));
          return submission;
        } catch (error) {
          const code = error instanceof Error ? error.message : 'VISION_VALIDATION_FAILED';
          setVisionValidationPhase(current => ({ ...current, [submission.id]: 'error' }));
          setVisionValidationError(current => ({ ...current, [submission.id]: code }));
          throw new Error(`${submission.expectedStudentName}：${code}`);
        } finally {
          setTrialProgress(current => ({ ...current, completed: current.completed + 1 }));
        }
      }));
      const successfulSubmissions = recognitionResults.flatMap((result, index) => result.status === 'fulfilled' ? [matchedSubmissions[index]] : []);
      const failedNames = recognitionResults.flatMap((result, index) => result.status === 'rejected' ? [matchedSubmissions[index].expectedStudentName] : []);
      if (failedNames.length) throw new Error(`VISION_RESULTS_NOT_READY:${failedNames.join('、')}`);
      setTrialProgress(current => ({ ...current, phase: 'grading', completed: matchedSubmissions.length, currentLabel: `AI 正在评分 ${successfulSubmissions.length} 份可用答卷` }));
      const result = await gradeTaskTrial(
        selectedTask.id,
        selectedQuestions.map(question => {
          const state = questionStates.find(item => item.questionId === question.id);
          return {
            questionId: question.id,
            displayNo: question.displayNo,
            stem: question.stem ?? question.desc,
            fullScore: question.score,
            standardAnswer: state?.standardAnswer ?? '',
            subquestions: question.subquestions ?? [],
            rubricPoints: state?.gradingRubric ?? [],
            teacherRules: [...(state?.teacherRules ?? []), ...(workflowState.assignment.note.trim() ? [`本次批改补充要求：${workflowState.assignment.note.trim()}`] : [])],
            rubricVersion: state?.rubricVersion ?? 1
          };
        }),
        successfulSubmissions.map(page => ({
          assetId: page.id,
          studentId: page.studentId!,
          studentName: page.expectedStudentName,
          studentNo: page.matchedStudentNo ?? page.detectedStudentNo
        }))
      );
      const nextStates = applyTrialSamples(questionStates, result);
      const firstState = nextStates.find(state => selectedQuestionIds.includes(state.questionId));
      const firstSample = firstState?.calibrationSamples[0];
      setQuestionStates(nextStates);
      setSelectedQuestionId(firstState?.questionId ?? '');
      setSelectedSampleId(firstSample?.id ?? '');
      setEditedOcr(firstSample ? getEffectiveOcrText(firstSample) : '');
      setTeacherScore(firstSample?.aiScore ?? 0);
      setTrialGradingPhase('ready');
      setTrialProgress(current => ({ ...current, phase: 'complete', currentLabel: `已生成 ${result.samples.length} 条试批结果`, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) }));
      onUpdateState({ questionGradingStates: nextStates, calibrationSamples: firstState?.calibrationSamples ?? [] });
      onShowToast(failedNames.length ? `已完成 ${result.samples.length} 条试批；${failedNames.join('、')} 识别失败，可单独重试` : `Luna 已完成 ${result.samples.length} 条试批结果`);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'TRIAL_GRADING_FAILED';
      setTrialGradingPhase('error');
      setTrialGradingError(code);
      setTrialProgress(current => ({ ...current, phase: 'error', currentLabel: code, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) }));
      const messageByCode: Record<string, string> = {
        'MODEL_REQUEST_FAILED:502': 'Luna 服务暂时不可用，已保留完成的识别结果，可直接重试',
        TRIAL_GRADING_OUTPUT_INVALID: 'AI 返回格式异常，已保留答卷识别结果，可直接重试',
        VISION_VALIDATION_OUTPUT_INVALID: '当前答卷视觉结果格式异常，可重试该步骤',
        VISION_VALIDATION_ALL_FAILED: '全部答卷识别失败，已保留已有 OCR，请在上传质检中重试失败项'
      };
      onShowToast(code.startsWith('VISION_RESULTS_NOT_READY:') ? `以下答卷尚未完成逐题提取：${code.slice('VISION_RESULTS_NOT_READY:'.length)}。请返回上传质检主动提取。` : messageByCode[code] ?? '试批没有完成，已保留前序结果，可直接重试');
    }
  };

  const replaceSample = (updated: CalibrationSample) => {
    const nextStates = questionStatesRef.current.map(state => state.questionId === updated.questionId
      ? { ...state, calibrationSamples: state.calibrationSamples.map(sample => sample.id === updated.id ? updated : sample) }
      : state);
    questionStatesRef.current = nextStates;
    setQuestionStates(nextStates);
    onUpdateState({ questionGradingStates: nextStates });
    setDiagnosis(null);
    return nextStates;
  };

  const updateSample = async (source: CalibrationResultSource, score: number, reason: string) => {
    if (!selectedSample || !currentQuestionState) return;
    try {
      const finalText = source === 'ai-confirmed' ? selectedSample.ocrText : editedOcr;
      const updated = await saveTeacherReview(selectedTask.id, selectedSample.id, score, reason, source, finalText);
      const nextStates = replaceSample(updated);
      setGradingAction('none');
      if (ruleAddedNotice && source === 'teacher-adjusted') {
        try { await persistAndRegradeRubric(currentQuestionState, nextStates); }
        catch { onShowToast('当前评分已保存，其他试批样本重新评分失败'); return; }
      }
      onShowToast(source === 'teacher-manual' ? `${selectedSample.studentName} 已完成教师终评，并作为本题校准锚点` : `${selectedSample.studentName} 的试批结果已确认`);
      if (nextStates.every(state => state.calibrationSamples.slice(0, state.sampleTarget).every(sample => sample.status === 'confirmed'))) setShowModeDialog(true);
    } catch { onShowToast('教师评分保存失败'); }
  };

  const goToNextTrialStep = () => {
    if (!currentQuestionState || !selectedSample) return;
    const trialSamples = currentQuestionState.calibrationSamples.slice(0, currentQuestionState.sampleTarget);
    const currentIndex = trialSamples.findIndex(sample => sample.id === selectedSample.id);
    const nextSample = trialSamples.slice(currentIndex + 1).find(sample => sample.status !== 'confirmed')
      ?? trialSamples.find(sample => sample.status !== 'confirmed');
    if (nextSample) {
      selectSample(nextSample);
      return;
    }
    const questionIndex = selectedQuestionStates.findIndex(state => state.questionId === currentQuestionState.questionId);
    const nextQuestion = selectedQuestionStates.slice(questionIndex + 1).find(state => state.calibrationSamples.slice(0, state.sampleTarget).some(sample => sample.status !== 'confirmed'));
    if (nextQuestion) selectQuestion(nextQuestion.questionId);
    else setShowModeDialog(true);
  };

  const openReviewSample = (sample: CalibrationSample) => {
    setReviewSampleId(sample.id);
    setReviewEditedOcr(getEffectiveOcrText(sample));
    setReviewScore(sample.teacherScore ?? sample.aiScore ?? 0);
    setReviewReason(sample.teacherReason ?? sample.gradingReason ?? '教师根据原图和识别证据完成复核');
    setReviewFeedbackReasons(sample.feedbackReasons ?? []);
  };

  const saveReviewOcrCorrection = async () => {
    if (!selectedReviewSample) return;
    const question = gradingQuestions().find(item => item.questionId === selectedReviewSample.questionId);
    const submission = gradingSubmissions().find(item => item.studentId === selectedReviewSample.studentId);
    if (!question || !submission) { onShowToast('无法找到当前题目或学生答卷'); return; }
    setReviewSaving('ocr');
    try {
      const updated = await correctTrialOcr(selectedTask.id, selectedReviewSample.id, reviewEditedOcr, question, submission);
      replaceSample(updated);
      setReviewScore(updated.aiScore ?? 0);
      setReviewReason(updated.gradingReason ?? '教师根据原图和识别证据完成复核');
      onShowToast(`OCR 修正已保存，AI 已重新评分为 ${updated.aiScore ?? '待定'} 分`);
    } catch { onShowToast('OCR 修正保存或重新评分失败'); }
    finally { setReviewSaving('idle'); }
  };

  const confirmReviewDecision = async (source: CalibrationResultSource) => {
    if (!selectedReviewSample) return;
    const finalScore = source === 'ai-confirmed' ? selectedReviewSample.aiScore : reviewScore;
    if (finalScore === null) { onShowToast('AI 尚未给出可确认分数'); return; }
    setReviewSaving('decision');
    try {
      const finalText = source === 'ai-confirmed' ? selectedReviewSample.ocrText : reviewEditedOcr;
      const decision = source === 'ai-confirmed' ? 'confirmed-score' : 'adjusted-score';
      const updated = await saveTeacherReview(selectedTask.id, selectedReviewSample.id, finalScore, reviewReason || '教师根据原图和识别证据完成复核', source, finalText, decision, reviewFeedbackReasons);
      replaceSample(updated);
      setReviewSampleId(null);
      onShowToast(`${updated.studentName} 已完成异常复核，最终得分 ${finalScore} 分`);
    } catch { onShowToast('教师裁定保存失败'); }
    finally { setReviewSaving('idle'); }
  };

  const confirmReviewSampleDirectly = async (sample: CalibrationSample) => {
    if (sample.aiScore === null) { openReviewSample(sample); return; }
    setReviewSaving('decision');
    try {
      const updated = await saveTeacherReview(selectedTask.id, sample.id, sample.aiScore, '教师确认当前 AI 评分', 'ai-confirmed', sample.ocrText, 'confirmed-score', []);
      replaceSample(updated);
      onShowToast(`${updated.studentName} 第 ${workflowState.questions.find(question => question.id === updated.questionId)?.displayNo ?? '-'} 题已确认，最终得分 ${sample.aiScore} 分`);
    } catch { onShowToast('当前评分确认失败'); }
    finally { setReviewSaving('idle'); }
  };

  const deferReviewDecision = async () => {
    if (!selectedReviewSample) return;
    setReviewSaving('decision');
    try {
      const updated = await saveTeacherReview(selectedTask.id, selectedReviewSample.id, selectedReviewSample.aiScore ?? 0, reviewReason || '稍后处理', 'teacher-manual', reviewEditedOcr, 'deferred', reviewFeedbackReasons);
      replaceSample(updated);
      setReviewSampleId(null);
      onShowToast(`${updated.studentName} 的异常已保留，稍后继续处理`);
    } catch { onShowToast('暂缓状态保存失败'); }
    finally { setReviewSaving('idle'); }
  };

  const saveOcrCorrection = async () => {
    if (!selectedSample || !currentQuestionState) return;
    const rawOcrText = selectedSample.rawOcrText ?? selectedSample.ocrText;
    const teacherCorrectedText = editedOcr === rawOcrText ? undefined : editedOcr;
    const question = gradingQuestions().find(item => item.questionId === selectedSample.questionId);
    const submission = gradingSubmissions().find(item => item.studentId === selectedSample.studentId);
    if (!question || !submission) { onShowToast('无法找到当前题目或学生答卷'); return; }
    const sampleId = selectedSample.id;
    setOcrCorrectionSampleIds(current => new Set(current).add(sampleId));
    try {
      const updated = await correctTrialOcr(selectedTask.id, selectedSample.id, teacherCorrectedText ?? rawOcrText, question, submission);
      const nextStates = replaceSample(updated);
      setTeacherScore(updated.aiScore ?? 0);
      onShowToast(`OCR 修正已保存，AI 已重新评分为 ${updated.aiScore ?? '待定'} 分`);
    } catch { onShowToast('OCR 修正保存或重新评分失败'); }
    finally { setOcrCorrectionSampleIds(current => { const next = new Set(current); next.delete(sampleId); return next; }); }
  };

  const confirmCurrentBatch = async () => {
    const activeStudentHasReview = pendingReviewStudentIds.has(activeBatchStudentId);
    const ids = gradingMode === 'per-submission' ? activeStudentHasReview ? [] : [activeBatchStudentId] : currentBatchCheckpoint;
    if (!ids.length) { onShowToast(activeStudentHasReview ? '这份答卷还有异常题目，请先完成异常复核' : '当前没有可直接确认的答卷'); return; }
    try {
      const updated = await confirmBatchStudents(selectedTask.id, ids);
      setBatch(updated);
      const nextStudent = batchStudents.find(sample => !(updated.confirmedStudentIds ?? []).includes(sample.studentId));
      if (nextStudent) setBatchStudentId(nextStudent.studentId);
      onShowToast(gradingMode === 'per-submission' ? '本份答卷已确认' : `当前 ${ids.length} 份答卷已确认`);
    } catch { onShowToast('批改结果确认失败'); }
  };

  const runBatch = async () => {
    setBatchError(null);
    try {
      const result = await startBatchGrading(selectedTask.id, gradingMode, gradingQuestions(), gradingSubmissions());
      setBatch(result.batch);
      const nextStates = applyTrialSamples(questionStates, result.result);
      setQuestionStates(nextStates);
      setBatchQuestionId(nextStates[0]?.questionId ?? '');
      setBatchStudentId(result.result.samples[0]?.studentId ?? '');
      onUpdateState({ questionGradingStates: nextStates });
      onShowToast(result.batch.status === 'completed' ? '批量批改已完成' : '批量批改完成，部分答卷需要处理');
    } catch (error) { setBatchError(error instanceof Error ? error.message : 'BATCH_GRADING_FAILED'); }
  };

  const controlBatch = async (action: 'pause' | 'resume') => {
    try { setBatch(await setBatchGradingAction(selectedTask.id, action)); }
    catch { onShowToast(action === 'pause' ? '暂停失败' : '继续失败'); }
  };

  const persistRubric = (state: QuestionGradingState) => saveTaskRubric(selectedTask.id, {
    questionId: state.questionId,
    standardAnswer: state.standardAnswer,
    gradingRubric: state.gradingRubric,
    teacherRules: state.teacherRules,
    rubricVersion: state.rubricVersion
  });

  const saveRubricDraft = async () => {
    if (!currentQuestionState) return;
    setRubricSavePhase('saving');
    onUpdateState({ questionGradingStates: questionStates });
    try {
      await persistRubric(currentQuestionState);
      setRubricSavePhase('saved');
      onShowToast(`第 ${currentQuestion?.displayNo ?? '-'} 题评分依据草稿已保存`);
    } catch (error) {
      setRubricSavePhase('error');
      onShowToast('评分依据保存失败');
      throw error;
    }
  };

  const navigateRubric = async (offset: -1 | 1) => {
    if (!currentQuestionState) return;
    const index = selectedQuestions.findIndex(question => question.id === currentQuestionState.questionId);
    const next = selectedQuestions[index + offset];
    if (!next) return;
    try {
      if (rubricDirty) await saveRubricDraft();
      selectQuestion(next.id);
    } catch {
      // saveRubricDraft already reports the failure; stay on the current question.
    }
  };

  const persistAndRegradeRubric = async (state: QuestionGradingState, baseStates: QuestionGradingState[]) => {
    setRubricSavePhase('saving');
    const question = selectedQuestions.find(item => item.id === state.questionId);
    if (!question) throw new Error('QUESTION_NOT_FOUND');
    const nextVersion = state.rubricVersion + 1;
    const next = {
      ...state,
      rubricVersion: nextVersion,
      calibrationSamples: state.calibrationSamples.map(sample => sample.status === 'confirmed' ? { ...sample, rubricVersion: nextVersion } : { ...sample, status: 'pending' as const, isFinal: false, rubricVersion: nextVersion })
    };
    const nextStates = baseStates.map(item => item.questionId === next.questionId ? next : item);
    setQuestionStates(nextStates);
    onUpdateState({ questionGradingStates: nextStates });
    try {
      await persistRubric(next);
      const result = await regradeTrialQuestion(selectedTask.id, {
        questionId: question.id,
        displayNo: question.displayNo,
        stem: question.stem ?? question.desc,
        fullScore: question.score,
        standardAnswer: next.standardAnswer,
        rubricPoints: next.gradingRubric,
        teacherRules: [...next.teacherRules, ...(workflowState.assignment.note.trim() ? [`本次批改补充要求：${workflowState.assignment.note.trim()}`] : [])],
        rubricVersion: nextVersion
      }, gradingSubmissions());
      const updatedStates = applyTrialSamples(nextStates, result);
      questionStatesRef.current = updatedStates;
      setQuestionStates(updatedStates);
      onUpdateState({ questionGradingStates: updatedStates });
      setRubricSavePhase('saved');
      onShowToast(`评分依据已更新为 V${nextVersion}，未确认样本已重新评分`);
      return updatedStates;
    } catch (error) {
      setRubricSavePhase('error');
      onShowToast('评分依据已修改，但重新试批没有完成');
      throw error;
    }
  };

  const applyRubric = () => {
    if (!currentQuestionState) return;
    void persistAndRegradeRubric(currentQuestionState, questionStates).catch(() => undefined);
  };

  const lockAndStart = () => {
    onUpdateState({ gradingMode, questionGradingStates: questionStates, jointReviewQuestionIds: questionStates.filter(item => item.jointReviewEnabled).map(item => item.questionId) });
    setShowModeDialog(false);
    setActiveStage('grading');
    onShowToast(`开始按“${modeOptions.find(option => option.id === gradingMode)?.label}”批改`);
    void runBatch();
  };

  const questionNumber = Number(currentQuestion?.displayNo) || 1;
  const assignmentAnalysis = workflowState.assignment.firstSectionAnalysis;
  const analysisSubquestionCount = assignmentAnalysis?.questions.reduce((total, question) => total + question.subquestions.length, 0) ?? 0;
  const selectedAnalysisQuestion = assignmentAnalysis?.questions.find(question => question.displayNo === analysisQuestionNo) ?? assignmentAnalysis?.questions[0];
  const submissionFilePicker = (
    <UploadSourceButtons accept="application/pdf,image/*" disabled={submissionUploadPhase === 'uploading' || submissionUploadPhase === 'parsing'} onFiles={selectSubmissionFiles} />
  );
  const pendingSubmissionUpload = (
    <>
      {submissionFiles.length ? <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-center justify-between gap-3"><strong className="text-sm">待提交 {submissionFiles.length} 个文件</strong><button type="button" disabled={submissionUploadPhase === 'uploading' || submissionUploadPhase === 'parsing'} onClick={() => setSubmissionFiles([])} className="min-h-11 rounded-xl px-3 text-xs font-bold text-rose-700 disabled:opacity-50">清空待提交</button></div><p className="mt-1 text-xs text-slate-500">按名单顺序排列；同一学生的多页照片放在一起。提交前可调整顺序。</p><div className="mt-3 space-y-1.5">{submissionFiles.map((file, index) => <PendingUploadItem key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file} index={index} total={submissionFiles.length} disabled={submissionUploadPhase === 'uploading' || submissionUploadPhase === 'parsing'} onMove={moveSubmissionFile} onRemove={removePendingSubmissionFile} onPreview={(url, label) => setPreviewImage({ url, label })} />)}</div><GlassButton type="button" disabled={submissionUploadPhase === 'uploading' || submissionUploadPhase === 'parsing'} onClick={() => void submitStudentSubmissions()} variant="primary" containerClassName="mt-4 w-full" className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold disabled:cursor-wait disabled:opacity-60">{submissionUploadPhase === 'uploading' ? '正在上传...' : submissionUploadPhase === 'parsing' ? '正在 OCR 解析...' : '提交并开始质检'}<Upload className="h-4 w-4" /></GlassButton></div> : null}
      {submissionUploadPhase === 'error' ? <div className="flex w-full flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-left text-xs text-rose-800 sm:flex-row sm:items-center sm:justify-between"><div><strong>{failedSubmissionAssets.length ? `${failedSubmissionAssets.length} 份答卷 OCR 未完成` : '答卷处理未完成'}</strong><p className="mt-1 font-normal">{failedSubmissionAssets.length ? '文件已经上传，再次识别不会新增上传记录。' : `错误码：${submissionUploadError}`}</p></div>{failedSubmissionAssets.length ? <button type="button" onClick={() => void retryFailedSubmissionParsing()} className="min-h-11 flex-none rounded-xl bg-rose-700 px-4 text-sm font-bold text-white">重试失败的 OCR</button> : null}</div> : null}
    </>
  );

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-3"><GlassButton type="button" title="返回批改任务" aria-label="返回批改任务" onClick={onBack} variant="secondary" className="p-2.5"><ArrowLeft className="h-4 w-4" /></GlassButton><div className="min-w-0"><h1 className="truncate text-xl font-black text-slate-900 dark:text-white">{selectedTask.name}</h1><p className="mt-1 text-xs text-slate-500">{currentClassName} · {expectedStudentCount} 人 · 收作业 {selectedTask.deadline}</p></div></div>
      </header>

      <nav aria-label="任务流程" className="glass-panel grid grid-cols-2 overflow-hidden rounded-[24px] bg-slate-100/60 p-2 sm:grid-cols-4 xl:grid-cols-7 dark:bg-zinc-900/60">
        {stages.map((stage, index) => {
          const active = activeStage === stage.id;
          const disabled = (stage.id === 'rubric' || stage.id === 'intake') ? !assignmentReady : (stage.id === 'calibration' || stage.id === 'grading' || stage.id === 'review' || stage.id === 'diagnosis') ? !gradingDataReady : false;
          return <button key={stage.id} type="button" disabled={disabled} onClick={() => setActiveStage(stage.id)} className={`relative flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-xl text-[11px] ${active ? 'bg-emerald-700 text-white' : 'bg-white/80 text-slate-400 dark:bg-zinc-800'}`}>{index + 1}</span>{stage.label}{stage.id === 'review' && pendingReviews ? <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] text-white">{pendingReviews}</span> : null}</button>;
        })}
      </nav>

      {activeStage === 'assignment' ? (
        <section>
          <div className={`${panelClass} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5 dark:border-zinc-800"><div><h2 className="font-black text-slate-900 dark:text-white">作业材料</h2><p className="mt-1 text-xs text-slate-500">先确定学生收到的题目和本次评分参考。</p></div><div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs"><span className="flex items-center gap-1.5 text-slate-500"><CalendarClock className="h-4 w-4 text-emerald-700" /><strong className="text-slate-700 dark:text-slate-200">收作业提醒</strong>{selectedTask.deadline}</span><span className="text-slate-500"><strong className="mr-1.5 text-slate-700 dark:text-slate-200">当前班级</strong>{currentClassName} · 应交 {expectedStudentCount} 人</span><span className="rounded-xl bg-slate-100 px-2.5 py-1.5 font-bold text-slate-600 dark:bg-zinc-800 dark:text-slate-300">{analysisStatusLabel[workflowState.assignment.analysisStatus]}</span><span className={`rounded-xl px-2.5 py-1.5 font-bold ${assignmentReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{assignmentReady ? '已布置' : '待准备'}</span></div></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-center dark:border-zinc-700 dark:bg-zinc-900/50"><strong className="text-sm">作业题目或试卷</strong><span className="max-w-full truncate text-xs text-slate-500">{pendingMaterialFiles.assignment.length ? `待提交 ${pendingMaterialFiles.assignment.length} 份` : workflowState.assignment.questionFileNames.join('、') || 'DOCX、PDF、图片或文本'}</span><UploadSourceButtons accept={materialAccept} disabled={materialUploadBusy} onFiles={files => selectMaterialFiles('assignment', files)} /></div>
              <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-center dark:border-zinc-700 dark:bg-zinc-900/50"><strong className="text-sm">参考答案</strong><span className="max-w-full truncate text-xs text-slate-500">{pendingMaterialFiles.referenceAnswer.length ? `待提交 ${pendingMaterialFiles.referenceAnswer.length} 份` : workflowState.assignment.answerFileNames.join('、') || 'DOCX、PDF、图片或文本'}</span><UploadSourceButtons accept={materialAccept} disabled={materialUploadBusy} onFiles={files => selectMaterialFiles('referenceAnswer', files)} /></div>
            </div>
            {pendingMaterialCount || stagedAssignmentAssets.length || materialUploadPhase === 'error' || failedAssignmentAssets.length ? <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><strong className="text-sm text-amber-950 dark:text-amber-100">{materialUploadBusy ? materialUploadPhase === 'uploading' ? '正在上传材料' : '正在并行解析材料' : pendingMaterialCount ? `已选择 ${pendingMaterialCount} 份材料` : stagedAssignmentAssets.length ? `${stagedAssignmentAssets.length} 份材料已上传，等待解析` : `${failedAssignmentAssets.length} 份已上传材料解析未完成`}</strong><p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">{pendingMaterialCount ? '先上传，上传后可预览或删除，再由你点击开始解析。' : stagedAssignmentAssets.length ? '请先检查原文件；确认无误后开始 OCR 与 AI 拆题准备。' : '原文件仍保存在系统中；重新解析不会产生副本。'}</p>{activeMaterialError ? <p className="mt-2 text-xs font-bold leading-5 text-rose-700">{materialParseErrorMessage(activeMaterialError)}</p> : null}</div>
                <GlassButton type="button" disabled={materialUploadBusy || (!pendingMaterialCount && !stagedAssignmentAssets.length && !failedAssignmentAssets.length)} onClick={() => void (pendingMaterialCount || stagedAssignmentAssets.length ? startMaterialParsing() : retryFailedMaterialParsing())} variant="primary" containerClassName="w-full sm:w-auto shrink-0" className="flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{pendingMaterialCount || stagedAssignmentAssets.length ? <Play className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}{materialUploadPhase === 'uploading' ? '正在上传...' : materialUploadPhase === 'parsing' ? '正在解析...' : pendingMaterialCount ? '先上传材料' : stagedAssignmentAssets.length ? '开始解析' : '重试已上传材料'}</GlassButton>
              </div>
              {pendingMaterialCount ? <div className="mt-3 space-y-3 border-t border-amber-200 pt-3 dark:border-amber-900">{(['assignment', 'referenceAnswer'] as const).map(kind => pendingMaterialFiles[kind].length ? <div key={kind}><div className="mb-2 flex items-center justify-between gap-2"><strong className="text-sm text-amber-950 dark:text-amber-100">{kind === 'assignment' ? '题目或试卷' : '参考答案'} · {pendingMaterialFiles[kind].length} 份</strong><button type="button" disabled={materialUploadBusy} onClick={() => clearPendingMaterialFiles(kind)} className="min-h-11 rounded-xl px-3 text-xs font-bold text-rose-700 disabled:opacity-40">清空待提交</button></div><div className="space-y-1.5">{pendingMaterialFiles[kind].map((file, index) => <PendingUploadItem key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file} index={index} total={pendingMaterialFiles[kind].length} disabled={materialUploadBusy} onMove={(fileIndex, direction) => moveMaterialFile(kind, fileIndex, direction)} onRemove={fileIndex => removePendingMaterialFile(kind, fileIndex)} onPreview={(url, label) => setPreviewImage({ url, label })} />)}</div>{workflowState.assignment.assets.some(asset => asset.kind === (kind === 'assignment' ? 'assignment' : 'reference-answer')) ? <p className="mt-2 text-xs font-bold text-rose-700">提交后将替换已上传的{kind === 'assignment' ? '题目' : '参考答案'}，并使原拆题和试批结果失效。</p> : null}</div> : null)}</div> : null}
            </section> : null}
          {stagedAssignmentAssets.some(asset => asset.mimeType.startsWith('image/') && asset.publicUrl) ? <section className="mt-4"><strong className="text-xs text-slate-500">解析前预览与框选</strong><div className="mt-2 grid gap-3 sm:grid-cols-2">{stagedAssignmentAssets.filter(asset => asset.mimeType.startsWith('image/') && asset.publicUrl).map(asset => <SourceEvidenceViewer key={asset.id} label={asset.kind === 'assignment' ? '题目原图' : '答案原图'} evidence={{ id: `${asset.id}-preparse`, assetId: asset.id, assetKind: asset.kind, fileName: asset.fileName, pageNumber: 1, boundingBox: asset.preParseRegion ?? { x: 0, y: 0, width: 1, height: 1 }, ocrText: '', confidence: 1, imageUrl: asset.publicUrl, sourcePageUrl: asset.sourcePageUrl ?? asset.publicUrl }} onSaveRegion={async boundingBox => { const updated = await saveTaskMaterialRegion(selectedTask.id, asset.id, boundingBox); updateAssignment({ assets: workflowState.assignment.assets.map(item => item.id === updated.id ? updated : item) }); onShowToast('解析范围已保存'); }} />)}</div></section> : null}
            {assignmentAssets.length ? <section className="mt-5 border-y border-slate-200 dark:border-zinc-800"><div className="flex flex-wrap items-center gap-2 py-3">{assignmentAssets.map(asset => <span key={asset.id} className={`inline-flex max-w-full items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold ${asset.status === 'failed' ? 'bg-rose-100 text-rose-800' : asset.status === 'needs-review' ? 'bg-amber-100 text-amber-800' : asset.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300'}`}><span className="max-w-44 truncate">{asset.fileName}</span><span>{materialStatusLabel[asset.status]}</span>{asset.publicUrl ? <button type="button" title="预览原文件" onClick={() => asset.mimeType.startsWith('image/') ? setPreviewImage({ url: asset.publicUrl!, label: asset.fileName }) : window.open(asset.publicUrl, '_blank', 'noopener,noreferrer')} className="flex h-11 w-11 items-center justify-center rounded-lg"><Eye className="h-4 w-4" /></button> : null}{!questionSelectionLocked ? <button type="button" title="删除材料" onClick={() => void deleteAssignmentMaterial(asset)} className="flex h-11 w-11 items-center justify-center rounded-lg text-rose-700"><Trash2 className="h-4 w-4" /></button> : null}</span>)}</div>{assignmentDocuments.map(document => <Fragment key={document.assetId}><MaterialDocumentDetails document={document} asset={assignmentAssets.find(item => item.id === document.assetId)} activeQuestion={selectedAnalysisQuestion} onCompareEvidence={selectedAnalysisQuestion ? (assetKind, pageNumber, boundingBox, runOcr) => compareEvidenceRegion(selectedAnalysisQuestion.displayNo, assetKind, pageNumber, boundingBox, runOcr) : undefined} onSaveEvidence={selectedAnalysisQuestion ? (assetKind, pageNumber, boundingBox) => saveEvidenceRegion(selectedAnalysisQuestion.displayNo, assetKind, pageNumber, boundingBox) : undefined} onPreview={(url, label) => setPreviewImage({ url, label })} /></Fragment>)}</section> : null}
            {workflowState.assignment.assets.length ? <section className="mt-5 border-y border-slate-200 py-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-sm font-black">AI 拆题</h3><p className="mt-1 text-xs text-slate-500">识别题目后，选择本次需要批改的范围。</p></div>
                <GlassButton type="button" disabled={isAnalyzing || !assignmentMaterialsReady} onClick={() => void analyzeAssignment()} variant="primary" containerClassName="w-full sm:w-auto" className="flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"><Sparkles className="h-4 w-4" />{isAnalyzing ? '正在拆题' : assignmentAnalysis ? '重新拆题' : '开始拆题'}</GlassButton>
              </div>
              {assignmentAnalysis?.processingMetrics && !isAnalyzing ? <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100"><span>拆题完成</span><span>· {assignmentAnalysis.questions.length} 道题</span><span>· {analysisSubquestionCount} 道小题</span><span>· 用时 {formatElapsed(Math.round(assignmentAnalysis.processingMetrics.durationMs / 1000))}</span></div> : null}
              {isAnalyzing ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-emerald-900 dark:text-emerald-100">AI 正在识别作业结构</strong><span className="text-xs font-bold text-emerald-700">已用时 {formatElapsed(analysisElapsedSeconds)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950"><div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-600" /></div><div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><span className="font-bold text-emerald-800">1. 题目与答案材料已就绪</span><span className="font-bold text-emerald-800">2. 正在核对题号、题干和答案</span><span className="text-slate-400">3. 生成评分依据</span></div></div> : null}
              {analysisErrorCode && !isAnalyzing ? <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-rose-900 dark:bg-rose-950/20"><div><strong className="text-sm text-rose-900 dark:text-rose-100">{analysisErrorMessage(analysisErrorCode).title}</strong><p className="mt-1 text-xs leading-5 text-rose-700 dark:text-rose-200">{analysisErrorMessage(analysisErrorCode).detail}</p></div><GlassButton type="button" disabled={!assignmentMaterialsReady} onClick={() => void analyzeAssignment()} variant="danger" containerClassName="w-full sm:w-auto shrink-0" className="min-h-11 px-4 text-sm font-bold disabled:opacity-50">重新拆题</GlassButton></div> : null}
              {assignmentAnalysis && selectedAnalysisQuestion ? <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 xl:grid-cols-[220px_minmax(0,1fr)] dark:border-zinc-800">
                <aside className="space-y-2"><div className="flex items-center justify-between gap-2 text-xs">{questionSelectionEditing && !questionSelectionLocked ? <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={allQuestionsSelected} onChange={toggleAllQuestions} aria-label="全选本次批改题目" className="h-4 w-4 accent-emerald-700" />全选</label> : <strong className="text-slate-700 dark:text-slate-200">本次批改题目</strong>}<span className="font-medium text-slate-600 dark:text-slate-300">已选 {questionSelectionDraft.length} / {assignmentAnalysis.questions.length}</span></div>{assignmentAnalysis.questions.map(question => { const questionId = `${selectedTask.id}-q-${question.displayNo}`; const included = questionSelectionDraft.includes(questionId); const active = selectedAnalysisQuestion.displayNo === question.displayNo; return <div key={question.displayNo} className={`flex items-center gap-2 rounded-lg border p-2 ${active ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-zinc-800'}`}>{questionSelectionEditing && !questionSelectionLocked ? <input type="checkbox" checked={included} onChange={() => toggleQuestionSelection(question.displayNo)} aria-label={`选择第 ${question.displayNo} 题`} className="h-4 w-4 accent-emerald-700" /> : <span aria-hidden="true" className={`h-2 w-2 rounded-full ${included ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-zinc-700'}`} />}<button type="button" onClick={() => setAnalysisQuestionNo(question.displayNo)} className="min-w-0 flex-1 text-left"><strong className="block text-xs">第 {question.displayNo} 题</strong><span className="mt-0.5 block truncate text-[11px] text-slate-500">{question.title || question.stem}</span></button></div>; })}{questionSelectionLocked ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">{submissionAssets.length ? '已上传答卷，题目范围已锁定' : '已确认布置，题目范围已锁定'}</div> : questionSelectionEditing ? <div className="grid grid-cols-2 gap-2"><GlassButton type="button" disabled={questionSelectionSaving} onClick={() => { setQuestionSelectionDraft(selectedQuestionIds); setQuestionSelectionEditing(false); }} variant="secondary" className="px-3 py-2.5 text-xs font-bold">取消</GlassButton><GlassButton type="button" disabled={!questionSelectionDirty || questionSelectionSaving} onClick={() => void saveQuestionSelection()} variant="primary" className="px-3 py-2.5 text-xs font-bold disabled:cursor-not-allowed">{questionSelectionSaving ? '正在保存...' : '保存题目范围'}</GlassButton></div> : <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30"><strong className="text-xs text-emerald-900 dark:text-emerald-100">题目范围已保存</strong><button type="button" onClick={() => setQuestionSelectionEditing(true)} className="text-xs font-bold text-emerald-800 underline underline-offset-2 dark:text-emerald-200">修改</button></div>}</aside>
                <AnalysisQuestionCard question={selectedAnalysisQuestion} standardAnswer={questionStates.find(state => state.questionId === `${selectedTask.id}-q-${selectedAnalysisQuestion.displayNo}`)?.standardAnswer ?? selectedAnalysisQuestion.standardAnswer} onSave={correction => saveAnalysisQuestion(selectedAnalysisQuestion.displayNo, correction)} onCompareEvidence={(assetKind, pageNumber, boundingBox, runOcr) => compareEvidenceRegion(selectedAnalysisQuestion.displayNo, assetKind, pageNumber, boundingBox, runOcr)} onSaveEvidence={(assetKind, pageNumber, boundingBox) => saveEvidenceRegion(selectedAnalysisQuestion.displayNo, assetKind, pageNumber, boundingBox)} />
                <label className="space-y-2 border-t border-slate-200 pt-4 lg:col-span-2 dark:border-zinc-800"><span className="text-xs font-bold text-slate-500">本次批改补充要求 <span className="font-normal text-slate-400">（应用于所有已选题目）</span></span><textarea value={workflowState.assignment.note} onChange={event => updateAssignment({ note: event.target.value })} rows={3} placeholder="例如：开放题允许意思相近；明显划掉的内容不计入答案" className={'qs-field-input '+(`${inputClass} resize-none leading-6`)} /></label>
              </div> : !isAnalyzing ? <p className="mt-4 text-sm text-slate-500">材料解析完成后，点击“开始拆题”识别作业结构。</p> : null}
            </section> : null}
            {!assignmentAnalysis ? <label className="mt-5 block space-y-2"><span className="text-xs font-bold text-slate-500">作业内容补充</span><textarea value={workflowState.assignment.note} onChange={event => updateAssignment({ note: event.target.value })} rows={3} placeholder="没有电子题目时，可在这里补充作业内容" className={'qs-field-input '+(`${inputClass} resize-none leading-6`)} /></label> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5 dark:border-zinc-800">{assignmentReady ? <><GlassButton type="button" onClick={() => setActiveStage('rubric')} variant="secondary" className="px-4 py-2.5 text-sm font-bold">查看评分依据</GlassButton><GlassButton type="button" onClick={startSubmissionUpload} variant="primary" className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold"><Upload className="h-4 w-4" />上传学生作业</GlassButton></> : <GlassButton type="button" onClick={completeAssignment} variant="primary" className="px-4 py-2.5 text-sm font-bold">确认已布置</GlassButton>}</div>
          </div>
        </section>
      ) : null}

      {activeStage === 'intake' ? matchRows.length ? (
        <section className="space-y-4">
          {rosterMatchPhase === 'loading' ? <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">正在读取当前班级名册并核对学号...</div> : null}
          {rosterMatchPhase === 'error' ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>名册核对失败（{rosterMatchError}），当前答卷不能进入自动批改。</span><button type="button" onClick={() => setRosterRefreshKey(value => value + 1)} className="font-bold underline">重新核对</button></div> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[['应交', expectedStudentCount, '人'], ['已匹配', matchedStudentCount, '人'], ['未交', missingRows.length, '人'], ['自动通过', matchRows.filter(row => row.status === 'matched' && row.rosterMatchStatus === 'matched').length, '组'], ['待质检', issueRows.length, '组']].map(([label, value, unit]) => <div key={String(label)} className={`${panelClass} p-4`}><span className="text-xs font-bold text-slate-500">{label}</span><div className="mt-2"><strong className="text-2xl text-slate-900 dark:text-white">{value}</strong><span className="ml-1 text-xs text-slate-400">{unit}</span></div></div>)}
          </div>
          <section className={`${panelClass} flex flex-wrap items-center justify-between gap-3 px-5 py-3`}>
            <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-200"><Users className="h-4 w-4 text-rose-600" />未交 {missingRows.length} 人</span>{missingRows.length ? missingRows.map(student => <button key={student.studentId} type="button" onClick={() => onShowToast(`${student.studentName} 已标记为待补交`)} className="rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 dark:bg-rose-950/20">{student.studentName} · {student.studentNo}</button>) : <span className="text-xs text-emerald-700">全员已交</span>}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200"><Settings2 className="h-4 w-4 text-emerald-700" />当前 OCR 规则</span><span><strong className="text-rose-700">低于 {Math.round(ocrHumanReviewThreshold * 100)}%</strong> 人工复核</span><span><strong className="text-sky-700">中间区间</strong> 视觉核验</span><span><strong className="text-emerald-700">高于 {Math.round(ocrAutoPassThreshold * 100)}%</strong> 自动通过</span></div>
          </section>
          <div>
            <section className={`${panelClass} overflow-hidden`}>
              <div className="border-b border-slate-200/70 p-4 sm:p-5 dark:border-zinc-800"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900 dark:text-white">上传与识别结果</h2><p className="mt-1 text-xs text-slate-500">按名单顺序上传，同一学生页面连续排列。</p></div><div className="flex flex-wrap items-center gap-2">{submissionFilePicker}<GlassButton type="button" onClick={() => { setSubmissionManagement(value => !value); setSelectedSubmissionIds(new Set()); }} variant="secondary" className="min-h-11 px-4 text-sm font-bold">{submissionManagement ? '退出管理' : '管理答卷'}</GlassButton><button type="button" onClick={() => { setShowOnlyOcrIssues(value => !value); setExpandedOcrPageId(null); setSelectedSubmissionIds(new Set()); }} disabled={!issueRows.length} className={`flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold disabled:opacity-50 ${showOnlyOcrIssues ? 'border border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-900' : 'bg-rose-600 text-white'}`}><CircleAlert className="h-4 w-4" />{showOnlyOcrIssues ? '查看全部' : `仅看 ${issueRows.length} 项异常`}</button></div></div>{submissionFiles.length || submissionUploadPhase === 'error' ? <div className="mt-4">{pendingSubmissionUpload}</div> : null}</div>
              {submissionManagement ? <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 shadow-sm md:static md:shadow-none dark:border-zinc-800 dark:bg-zinc-950"><GlassButton type="button" onClick={toggleAllDisplayedSubmissions} disabled={!removableDisplayedIds.length} variant="secondary" className="min-h-11 px-4 text-sm font-bold disabled:opacity-50">{removableDisplayedIds.length > 0 && removableDisplayedIds.every(id => selectedSubmissionIds.has(id)) ? '取消全选当前列表' : '全选当前列表'}</GlassButton><span className="text-sm font-bold text-slate-600 dark:text-slate-300">已选 {selectedSubmissionIds.size} 份{displayedRows.length > removableDisplayedIds.length ? ` · ${displayedRows.length - removableDisplayedIds.length} 份正在处理` : ''}</span><button type="button" disabled={!selectedSubmissionIds.size} onClick={() => setShowSubmissionDeleteConfirm(true)} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-40"><Trash2 className="mr-2 inline h-4 w-4" />删除选中</button></div> : null}
              <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200/70 text-xs font-bold text-slate-400 dark:border-zinc-800">{submissionManagement ? <th className="px-4 py-3"><span className="sr-only">选择</span></th> : null}<th className="px-5 py-3">顺序</th><th className="px-3 py-3">名单匹配</th><th className="px-3 py-3">识别姓名</th><th className="px-3 py-3">页数</th><th className="px-3 py-3">文字识别</th><th className="px-3 py-3">处理状态</th><th className="px-3 py-3" /></tr></thead><tbody>{displayedRows.map(row => { const asset = submissionAssets.find(item => item.id === row.id); const status = getSubmissionStatus(row, asset); const document = normalizedDocuments.find(item => item.assetId === row.id); const textConfidence = row.textConfidence ?? row.ocrConfidence; const removable = asset?.status !== 'processing' && asset?.status !== 'uploaded'; return <Fragment key={row.id}><tr className="border-b border-slate-200/50 last:border-0 dark:border-zinc-800/70">{submissionManagement ? <td className="px-4 py-4"><input type="checkbox" checked={selectedSubmissionIds.has(row.id)} disabled={!removable} onChange={() => toggleSubmissionSelection(row.id)} aria-label={`选择 ${row.expectedStudentName} 的答卷`} className="h-5 w-5 accent-emerald-700 disabled:opacity-40" /></td> : null}<td className="px-5 py-4 tabular-nums">{row.sequence}</td><td className="px-3 py-4 font-bold">{row.expectedStudentName}</td><td className="px-3 py-4 font-mono text-xs">{row.detectedStudentName || "待确认"}</td><td className="px-3 py-4">{row.pageCount}</td><td className="px-3 py-4">{textConfidence > 0 ? `${Math.round(textConfidence * 100)}%` : '未提供'}</td><td className="px-3 py-4"><span className={`rounded-xl px-2.5 py-1.5 text-xs font-bold ${status.className}`}>{status.label}</span></td><td className="px-3 py-4"><button type="button" onClick={() => openSubmissionPreview(row.id)} className="flex h-11 w-11 items-center justify-center rounded-xl text-emerald-700 hover:bg-emerald-50" title="查看答卷" aria-label={`查看 ${row.expectedStudentName} 的答卷`}><Eye className="h-4 w-4" /></button></td></tr>{expandedOcrPageId === row.id ? <tr><td colSpan={submissionManagement ? 8 : 7} className="p-0"><SubmissionPreview page={row} roster={classRoster} asset={asset} document={document} validation={visionValidationByAsset[row.id]} validationPhase={visionValidationPhase[row.id] ?? 'idle'} validationError={visionValidationError[row.id]} onClose={() => setExpandedOcrPageId(null)} onConfirm={lookup => confirmSubmissionStudent(row.id, lookup)} onRunVision={() => void validateSubmissionVision(row.id)} /></td></tr> : null}</Fragment>; })}</tbody></table></div>
              <div className="divide-y divide-slate-200 md:hidden dark:divide-zinc-800">{displayedRows.map(row => { const asset = submissionAssets.find(item => item.id === row.id); const status = getSubmissionStatus(row, asset); const document = normalizedDocuments.find(item => item.assetId === row.id); const textConfidence = row.textConfidence ?? row.ocrConfidence; const removable = asset?.status !== 'processing' && asset?.status !== 'uploaded'; return <div key={row.id} className="p-4"><div className="flex items-start gap-3">{submissionManagement ? <input type="checkbox" checked={selectedSubmissionIds.has(row.id)} disabled={!removable} onChange={() => toggleSubmissionSelection(row.id)} aria-label={`选择 ${row.expectedStudentName} 的答卷`} className="mt-3 h-6 w-6 flex-none accent-emerald-700 disabled:opacity-40" /> : null}<button type="button" onClick={() => openSubmissionPreview(row.id)} className="min-h-11 min-w-0 flex-1 text-left"><div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{row.expectedStudentName}</strong><span className={`flex-none rounded-xl px-2.5 py-1.5 text-xs font-bold ${status.className}`}>{status.label}</span></div><p className="mt-2 text-xs text-slate-500">第 {row.sequence} 份 · 姓名 {row.detectedStudentName || "待确认"} · {row.pageCount} 页</p><p className="mt-1 text-xs text-slate-500">文字识别 {textConfidence > 0 ? `${Math.round(textConfidence * 100)}%` : '未提供'}</p></button></div>{expandedOcrPageId === row.id ? <div className="mt-3"><SubmissionPreview page={row} roster={classRoster} asset={asset} document={document} validation={visionValidationByAsset[row.id]} validationPhase={visionValidationPhase[row.id] ?? 'idle'} validationError={visionValidationError[row.id]} onClose={() => setExpandedOcrPageId(null)} onConfirm={lookup => confirmSubmissionStudent(row.id, lookup)} onRunVision={() => void validateSubmissionVision(row.id)} /></div> : null}</div>; })}</div>
              <div className="border-t border-slate-200/70 bg-emerald-50/60 p-4 sm:p-5 dark:border-zinc-800 dark:bg-emerald-950/10"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm text-emerald-900 dark:text-emerald-100">逐题答案提取</strong><p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">无需展开答卷；已有结果会跳过，旧版本结果需重新提取。</p>{submissionExtractionProgress.phase !== 'idle' ? <p role="status" className="mt-1 text-xs font-bold text-emerald-800 dark:text-emerald-200">{submissionExtractionProgress.phase === 'checking' ? `正在检查 ${submissionExtractionProgress.requested} 份答卷 · 已用时 ${formatElapsed(submissionExtractionProgress.elapsedSeconds)}` : submissionExtractionProgress.phase === 'extracting' ? `完成 ${submissionExtractionProgress.completed}，失败 ${submissionExtractionProgress.failed}，跳过 ${submissionExtractionProgress.skipped} · 已用时 ${formatElapsed(submissionExtractionProgress.elapsedSeconds)}` : `本次完成 ${submissionExtractionProgress.completed}，失败 ${submissionExtractionProgress.failed}，跳过 ${submissionExtractionProgress.skipped} · 用时 ${formatElapsed(submissionExtractionProgress.elapsedSeconds)}`}</p> : null}</div><GlassButton type="button" onClick={() => void extractStudentAnswers()} disabled={!extractableSubmissionIds.length || submissionExtractionBusy || extractableSubmissionIds.some(id => visionValidationPhase[id] === 'loading' || visionValidationPhase[id] === 'extracting')} variant="primary" containerClassName="w-full sm:w-auto" className="min-h-11 px-4 text-sm font-bold disabled:opacity-40"><ScanLine className="mr-2 inline h-4 w-4" />{submissionExtractionBusy ? '正在处理…' : selectedSubmissionIds.size ? '提取选中逐题答案' : '提取全部逐题答案'}</GlassButton></div></div>
              <div className="flex flex-col gap-3 border-t border-slate-200/70 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800"><span className="text-xs text-slate-500">未匹配或重复绑定的学生身份必须处理后才能进入试批。</span><GlassButton type="button" disabled={!gradingDataReady || trialGradingPhase === 'loading'} onClick={() => void prepareTrialCalibration()} variant="primary" containerClassName="w-full sm:w-auto" className="flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">{trialGradingPhase === 'loading' ? 'Luna 正在试批...' : '进入试批校准'}<ArrowRight className="h-4 w-4" /></GlassButton></div>
            </section>
          </div>
        </section>
      ) : (
        <section className={`${panelClass} flex min-h-96 flex-col items-center justify-center p-8 text-center`}>
          <Upload className="h-8 w-8 text-emerald-700" />
          <h2 className="mt-4 font-black text-slate-900 dark:text-white">上传学生作业</h2>
          <p className="mt-2 text-sm text-slate-500">选择 {currentClassName} 的答卷图片或 PDF，系统优先按姓名匹配，重名时再核对学号。</p>
          {rosterMatchPhase === 'loading' ? <span className="mt-3 text-xs font-bold text-sky-700">正在读取班级名册...</span> : null}
          {rosterMatchPhase === 'ready' ? <span className="mt-3 text-xs font-bold text-emerald-700">名册已连接，应交 {expectedStudentCount} 人</span> : null}
          {rosterMatchPhase === 'error' ? <div className="mt-3 flex items-center gap-3 text-xs font-bold text-rose-700"><span>名册连接失败（{rosterMatchError}）</span><button type="button" onClick={() => setRosterRefreshKey(value => value + 1)} className="underline">重试</button></div> : null}
          <div className="mt-5 flex w-full max-w-xl flex-col items-center gap-4">{submissionFilePicker}{pendingSubmissionUpload}</div>
        </section>
      ) : null}

      {activeStage === 'rubric' && currentQuestionState ? (
        <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><QuestionSelector questions={selectedQuestions} states={questionStates} selectedId={selectedQuestionId} onSelect={selectQuestion} /><GlassButton type="button" onClick={() => { setAnalysisQuestionNo(currentQuestion?.displayNo ?? ''); setActiveStage('assignment'); }} variant="secondary" className="px-3 py-2 text-xs font-bold">返回题目确认</GlassButton></div><QuestionContext question={currentQuestion} number={questionNumber} evidence={questionEvidence} onToggleKnowledge={nodeId => void toggleKnowledgeLink(nodeId)} knowledgeLinkSavingId={knowledgeLinkSavingId} onSaveCorrection={saveQuestionCorrection} /><div className={`${panelClass} p-4 sm:p-6`}><RubricEditor question={currentQuestion} questionState={currentQuestionState} answerEvidence={answerEvidence} dirty={rubricDirty} savePhase={rubricSavePhase} canEnterTrial={gradingDataReady} canGoPrevious={selectedQuestions.findIndex(question => question.id === currentQuestionState.questionId) > 0} canGoNext={selectedQuestions.findIndex(question => question.id === currentQuestionState.questionId) < selectedQuestions.length - 1} onChange={updateQuestionState} onCancel={cancelRubricChanges} onSaveDraft={saveRubricDraft} onApply={applyRubric} onEnterTrial={() => void prepareTrialCalibration()} onCompleteIntake={() => setActiveStage('intake')} onNavigate={offset => void navigateRubric(offset)} /></div></section>
      ) : null}

      {activeStage === 'rubric' && !currentQuestionState ? (
        <section className={`${panelClass} flex min-h-80 flex-col items-center justify-center p-8 text-center`}><Sparkles className="h-8 w-8 text-emerald-700" /><h2 className="mt-4 font-black text-slate-900 dark:text-white">尚未生成评分依据</h2><p className="mt-2 text-sm text-slate-500">题目和参考答案解析完成后，各题采分点会出现在这里。</p><GlassButton type="button" onClick={() => setActiveStage('assignment')} variant="secondary" containerClassName="mt-5" className="px-4 py-2.5 text-sm font-bold">返回作业内容</GlassButton></section>
      ) : null}

      {activeStage === 'calibration' && (!currentQuestionState || !selectedSample) ? (
        <section className={`${panelClass} flex min-h-96 flex-col items-center justify-center p-8 text-center`}>
          <Sparkles className={`h-8 w-8 text-emerald-700 ${trialGradingPhase === 'loading' ? 'animate-pulse' : ''}`} />
          <h2 className="mt-4 font-black text-slate-900 dark:text-white">{trialGradingPhase === 'loading' ? trialProgress.phase === 'grading' ? 'AI 正在逐份评分' : '正在核对逐题答卷证据' : trialGradingPhase === 'error' ? '试批没有完成' : '尚未生成试批样本'}</h2>
          {trialGradingPhase === 'loading' ? <div className="mt-4 w-full max-w-xl text-left"><div className="flex items-center justify-between text-xs"><strong className="text-emerald-800">{trialProgress.currentLabel}</strong><span className="text-slate-500">已用时 {formatElapsed(trialProgress.elapsedSeconds)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800"><div className={`h-full rounded-full bg-emerald-600 transition-all ${trialProgress.phase === 'grading' ? 'w-1/2 animate-pulse' : ''}`} style={trialProgress.phase === 'grading' ? undefined : { width: `${trialProgress.total ? Math.max(8, Math.round(trialProgress.completed / trialProgress.total * 100)) : 8}%` }} /></div><div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><span className={trialProgress.completed >= trialProgress.total && trialProgress.total ? 'font-bold text-emerald-800' : 'font-bold text-sky-700'}>1. 逐题区域与 OCR 核对 {trialProgress.completed}/{trialProgress.total}</span><span className={trialProgress.phase === 'grading' ? 'font-bold text-sky-700' : 'text-slate-400'}>2. 依据评分细则逐份评分</span><span className="text-slate-400">3. 校验并保存试批结果</span></div><p className="mt-3 text-[11px] text-slate-500">评分阶段耗时取决于题目和样本数量，因此只显示真实阶段与用时，不伪造百分比或模型内部思维。</p></div> : <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{trialGradingPhase === 'error' ? `处理失败（${trialGradingError}）。已完成的答卷识别会保留，重试时继续使用。` : '请先完成答卷匹配，再运行真实试批。'}</p>}
          {trialGradingPhase !== 'loading' ? <GlassButton type="button" onClick={() => void prepareTrialCalibration()} variant="primary" containerClassName="mt-5" className="px-5 py-2.5 text-sm font-bold">重新运行试批</GlassButton> : null}
        </section>
      ) : null}

      {activeStage === 'calibration' && currentQuestionState && selectedSample ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><QuestionSelector questions={selectedQuestions} states={questionStates} selectedId={selectedQuestionId} onSelect={selectQuestion} /><label className="flex items-center gap-2 text-xs font-bold text-slate-500"><span>本题试批数量</span><select value={currentQuestionState.sampleTarget} onChange={event => setSampleTarget(Number(event.target.value) as 3 | 5)} className="qs-field-input rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-zinc-800 dark:bg-zinc-900"><option value={3}>3 份</option><option value={5}>5 份</option></select></label></div>
          <QuestionContext question={currentQuestion} number={questionNumber} evidence={questionEvidence} />
          <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
            <aside className={`${panelClass} overflow-hidden`}><div className="border-b border-slate-200/70 p-4 dark:border-zinc-800"><h2 className="font-black">第 {questionNumber} 题代表样本</h2><p className="mt-1 text-xs text-slate-500">已确认 {currentQuestionState.calibrationSamples.filter(sample => sample.status === 'confirmed').length} / {currentQuestionState.sampleTarget}</p></div>{currentQuestionState.calibrationSamples.slice(0, currentQuestionState.sampleTarget).map(sample => <button key={sample.id} type="button" onClick={() => selectSample(sample)} className={`w-full border-b border-slate-200/60 p-4 text-left last:border-0 dark:border-zinc-800/70 ${sample.id === selectedSample.id ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'hover:bg-slate-50 dark:hover:bg-zinc-900'}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm">{sample.studentName}</strong>{sample.status === 'confirmed' ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : null}</div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">{sampleTypeLabel[sample.sampleType]}</span><span className={sample.gradingConfidence < lowConfidenceThreshold ? 'font-bold text-rose-700' : 'text-slate-400'}>{Math.round(sample.gradingConfidence * 100)}%</span></div></button>)}</aside>
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <section className={`${panelClass} min-h-80 p-4`}><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-black"><FileImage className="h-4 w-4 text-emerald-700" />本题答卷截图</h3>{selectedSample.sourcePreviewUrl ? <span className="text-xs font-bold text-emerald-700">点击图片放大</span> : <span className="text-xs text-slate-400">可核对</span>}</div>{selectedSample.sourcePreviewUrl ? selectedSample.sourcePreviewType === 'image' ? <button type="button" onClick={() => setPreviewImage({ url: selectedSample.sourcePreviewUrl!, label: `${selectedSample.studentName} · 第 ${questionNumber} 题答卷` })} className="mt-4 flex min-h-56 w-full cursor-zoom-in items-center justify-center overflow-auto bg-slate-50 p-3 dark:bg-zinc-950"><img src={selectedSample.sourcePreviewUrl} alt={`${selectedSample.studentName} 本题答卷截图`} className="min-w-72 max-h-[520px] max-w-full border border-slate-200 bg-white object-contain" /></button> : <object data={selectedSample.sourcePreviewUrl} type="application/pdf" className="mt-4 h-[520px] w-full border border-slate-200 bg-white"><span className="p-4 text-sm text-slate-500">无法预览当前文档</span></object> : <div className="relative mx-auto mt-4 min-h-64 max-w-xs border border-slate-300 bg-[#fffdf7] p-5 shadow-sm"><span className="absolute right-4 top-3 font-mono text-xs text-slate-500">{selectedSample.studentNo.slice(-4)}</span><p className="mt-8 font-serif text-sm leading-8 text-slate-700">{selectedSample.ocrText}</p></div>}<StandardAnswerReference answer={currentQuestionState.standardAnswer} evidence={answerEvidence} onPreview={(url, label) => setPreviewImage({ url, label })} /></section>
                <section className={`${panelClass} min-h-80 p-4`}><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-black"><ScanLine className="h-4 w-4 text-emerald-700" />{selectedSample.ocrSource === 'choice-vision' ? '视觉识别结果' : selectedSample.ocrSource === 'luna' ? 'Luna 主识别' : 'PaddleOCR 主识别'}</h3><span className={`rounded-xl px-2 py-1 text-xs font-bold ${selectedSample.needsTeacherReview || selectedSample.ocrConfidence < ocrHumanReviewThreshold ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>{selectedSample.needsTeacherReview ? '待核验 · ' : ''}{Math.round(selectedSample.ocrConfidence * 100)}%</span></div><textarea value={editedOcr} onChange={event => setEditedOcr(event.target.value)} rows={9} className={'qs-field-input '+(`${inputClass} mt-4 resize-none leading-7`)} />{selectedSample.ocrSource !== 'choice-vision' && selectedSample.lunaReviewText ? <div className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${selectedSample.recognitionConflict ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}><strong>Luna 视觉复核{selectedSample.recognitionConflict ? ' · 与 PaddleOCR 有差异' : ''}</strong><p className="mt-1 whitespace-pre-line">{selectedSample.lunaReviewText}</p></div> : null}<GlassButton type="button" disabled={ocrCorrectionSampleIds.has(selectedSample.id)} onClick={() => void saveOcrCorrection()} variant="secondary" containerClassName="mt-3" className="px-3 py-2 text-xs font-bold disabled:opacity-50">{ocrCorrectionSampleIds.has(selectedSample.id) ? '正在保存并重新评分...' : '保存修正并重新评分'}</GlassButton></section>
              </div>
              <section className={`${panelClass} p-5`}>
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]"><div className="xl:border-r xl:border-slate-200 xl:pr-5 dark:xl:border-zinc-800"><div className="flex flex-wrap items-center gap-2"><h3 className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-emerald-700" />AI 评分</h3><strong className="text-xl text-slate-900 dark:text-white">{selectedSample.aiScore ?? '待定'} <span className="text-xs font-normal text-slate-400">/ {selectedSample.fullScore} 分</span></strong><span className="text-xs text-slate-400">置信度 {Math.round(selectedSample.gradingConfidence * 100)}%</span></div>{selectedSample.gradingReason ? <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{selectedSample.gradingReason}</p> : null}{selectedSample.matchedPoints.length || selectedSample.missedPoints.length ? <div className="mt-3 flex flex-wrap gap-2">{selectedSample.matchedPoints.map(point => <span key={point} className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800"><Check className="h-3.5 w-3.5" />{point}</span>)}{selectedSample.missedPoints.map(point => <span key={point} className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-2 py-1.5 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{point}</span>)}</div> : null}</div><div>{selectedSample.resultSource === 'teacher-manual' ? <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 text-amber-600" /><div><h3 className="font-black">教师终评 {selectedSample.teacherScore} 分，已作为本题锚点</h3><p className="mt-1 text-xs text-slate-500">{selectedSample.teacherReason?.replace(/[。！？.!?]+$/, '')}。后续评分依据变化不会覆盖此结果。</p></div></div><GlassButton type="button" onClick={() => setGradingAction('manual')} variant="secondary" className="px-3 py-2 text-xs font-bold">重新打开</GlassButton></div> : selectedSample.status === 'confirmed' && gradingAction === 'none' ? <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" /><div><h3 className="font-black">试批结果已确认 · {selectedSample.teacherScore ?? selectedSample.aiScore} 分</h3><p className="mt-1 text-xs text-slate-500">{selectedSample.resultSource === 'teacher-adjusted' ? '教师已调整 AI 结果' : '教师已采用 AI 结果'}，当前结果已计入本题试批进度。</p></div></div><GlassButton type="button" onClick={() => setGradingAction('adjust')} variant="secondary" className="px-3 py-2 text-xs font-bold">重新打开</GlassButton></div> : gradingAction === 'none' ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">确认这份试批样本</h3><p className="mt-1 text-xs text-slate-500">教师亲批会成为本题最终结果和校准锚点。</p></div><div className="flex flex-wrap gap-2"><GlassButton type="button" disabled={selectedSample.aiScore === null} onClick={() => { if (selectedSample.aiScore !== null) updateSample('ai-confirmed', selectedSample.aiScore, '教师确认 AI 评分'); }} variant="secondary" className="px-3 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">采用 AI 结果</GlassButton><GlassButton type="button" onClick={() => { setRuleAddedNotice(false); setGradingAction('adjust'); }} variant="secondary" className="px-3 py-2.5 text-xs font-bold">调整 AI 结果</GlassButton><GlassButton type="button" onClick={() => setGradingAction('manual')} variant="primary" className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold"><UserCheck className="h-4 w-4" />由我批改</GlassButton></div></div> : <div className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-black">{gradingAction === 'manual' ? '教师亲自批改' : '调整 AI 结果'}</h3><p className="mt-1 text-xs text-slate-500">保存分数、理由、原图和当前评分依据版本。</p></div><button type="button" title="取消" aria-label="取消" onClick={() => setGradingAction('none')} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-[120px_1fr]"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">最终分数</span><input type="number" min={0} max={selectedSample.fullScore} value={teacherScore} onChange={event => setTeacherScore(Number(event.target.value))} className={'qs-field-input '+(inputClass)} /></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">评分理由与证据</span><input value={teacherReason} onChange={event => { setTeacherReason(event.target.value); setRuleAddedNotice(false); }} className={'qs-field-input '+(inputClass)} placeholder="说明采用或调整分数的依据" /></label></div><div className="flex flex-wrap items-center justify-end gap-2">{ruleAddedNotice ? <span className="mr-auto flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />已加入本题评分细则，可继续确认调整</span> : null}{gradingAction === 'adjust' ? <GlassButton type="button" disabled={ruleAddedNotice} onClick={() => { updateQuestionState({ ...currentQuestionState, teacherRules: [...currentQuestionState.teacherRules, teacherReason || '从当前边界样本补充的评分规则'] }); setRuleAddedNotice(true); onShowToast('已加入本题评分细则'); }} variant="secondary" className="px-4 py-2.5 text-xs font-bold">{ruleAddedNotice ? '已加入评分细则' : '加入本题评分细则'}</GlassButton> : null}<GlassButton type="button" onClick={() => updateSample(gradingAction === 'manual' ? 'teacher-manual' : 'teacher-adjusted', teacherScore, teacherReason || '教师完成分项判断')} variant="primary" className="px-4 py-2.5 text-xs font-bold">{gradingAction === 'manual' ? '完成教师批改' : '确认调整'}</GlassButton></div></div>}</div></div>
              </section>
              {selectedSample.status === 'confirmed' ? <div className="flex justify-end"><GlassButton type="button" onClick={goToNextTrialStep} variant="primary" className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold">{currentTrialSamples.some(sample => sample.status !== 'confirmed') ? '下一份' : '下一题'}<ChevronRight className="h-4 w-4" /></GlassButton></div> : null}
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{allCalibrationComplete ? '所有题目的试批样本均已完成。' : '批改方式将在所有题目的试批样本完成后统一选择。'}</p>{allCalibrationComplete ? <GlassButton type="button" onClick={() => setShowModeDialog(true)} variant="primary" className="px-4 py-2.5 text-sm font-bold">选择本次批改方式</GlassButton> : null}</div>
            </div>
          </div>
        </section>
      ) : null}

      {activeStage === 'grading' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-zinc-900"><button type="button" onClick={() => setBatchViewMode('question')} className={`min-h-11 rounded-xl px-4 text-xs font-bold ${batchViewMode === 'question' ? 'bg-white shadow-sm dark:bg-zinc-800' : 'text-slate-500'}`}>分题查看</button><button type="button" onClick={() => setBatchViewMode('submission')} className={`min-h-11 rounded-xl px-4 text-xs font-bold ${batchViewMode === 'submission' ? 'bg-white shadow-sm dark:bg-zinc-800' : 'text-slate-500'}`}>整份答卷</button></div>{batchViewMode === 'submission' ? <select value={activeBatchStudentId} onChange={event => setBatchStudentId(event.target.value)} className={'qs-field-input '+(`${inputClass} min-h-11 w-full text-base sm:w-auto sm:text-sm`)}>{batchStudents.map(sample => <option key={sample.studentId} value={sample.studentId}>{sample.studentName}</option>)}</select> : null}</div>
          {batchViewMode === 'submission' && allBatchSamples.length ? <section className={`${panelClass} p-4`}><AnnotatedSubmissionView document={activeBatchDocument} validation={activeBatchAssetId ? visionValidationByAsset[activeBatchAssetId] : undefined} validationPhase={activeBatchAssetId ? visionValidationPhase[activeBatchAssetId] : 'error'} samples={activeBatchStudentSamples} questions={selectedQuestions} /></section> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['已匹配答卷', `${matchedStudentCount} 份`],
              ['已完成批改', `${batch?.processedStudents ?? 0} / ${batch?.totalStudents || matchedStudentCount}`],
              ['待复核证据', `${pendingReviews} 项`],
              ['批改方式', modeOptions.find(option => option.id === gradingMode)?.label ?? '未选择']
            ].map(([label, value]) => <div key={label} className={`${panelClass} p-5`}><span className="text-xs font-bold text-slate-500">{label}</span><strong className="mt-2 block text-2xl text-slate-900 dark:text-white">{value}</strong></div>)}
          </div>
          <section className={`${panelClass} p-6`}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-black text-slate-900 dark:text-white">{batch?.status === 'completed' ? '批量批改已完成' : batch?.status === 'running' ? 'AI 正在批量批改' : batch?.status === 'paused' ? '批量批改已暂停' : batch?.status === 'failed' ? '批量批改有未完成项' : '准备批量批改'}</h2><p className="mt-1 text-sm text-slate-500">已完成结果会复用；单份异常隔离后进入本任务复核。</p></div><div className="flex gap-2">{batch?.status === 'running' ? <GlassButton type="button" onClick={() => void controlBatch('pause')} variant="secondary" className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold"><Pause className="h-4 w-4" />暂停</GlassButton> : null}{batch?.status === 'paused' ? <GlassButton type="button" onClick={() => void runBatch()} variant="primary" className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold"><Play className="h-4 w-4" />继续</GlassButton> : null}{!batch || batch.status === 'idle' || batch.status === 'failed' ? <GlassButton type="button" onClick={() => void runBatch()} variant="primary" className="px-4 py-2.5 text-sm font-bold">开始批量批改</GlassButton> : null}</div></div><div className="mt-7 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${batch?.totalStudents ? Math.round(batch.processedStudents / batch.totalStudents * 100) : 0}%` }} /></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{batch?.processedStudents ?? 0} 人已处理</span><span>{batch?.failedStudentIds.length ?? 0} 人处理失败</span></div>{batchError ? <p className="mt-4 text-xs font-bold text-rose-700">批改失败：{batchError}</p> : null}</section>
          {batchSamples.length ? <section className={`${panelClass} overflow-hidden`}><div className="grid min-h-[620px] lg:grid-cols-[210px_minmax(0,1fr)]"><aside className="border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r dark:border-zinc-800 dark:bg-zinc-900/50"><div className="border-b border-slate-200 p-4 text-xs font-black dark:border-zinc-800">学生答卷</div><div className="max-h-[620px] overflow-y-auto">{batchStudents.map(sample => { const confirmed = (batch?.confirmedStudentIds ?? []).includes(sample.studentId); const hasReview = pendingReviewStudentIds.has(sample.studentId); return <button key={sample.studentId} type="button" onClick={() => setBatchStudentId(sample.studentId)} className={`flex w-full items-center justify-between border-b border-slate-200/70 px-4 py-3 text-left text-sm dark:border-zinc-800 ${activeBatchStudentId === sample.studentId ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30' : 'hover:bg-white dark:hover:bg-zinc-900'}`}><span className="font-bold">{sample.studentName}</span>{confirmed ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : hasReview ? <span className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">有异常</span> : <span className="text-[10px] text-slate-400">待确认</span>}</button>; })}</div></aside><div className="min-w-0 p-5"><div className="flex gap-2 overflow-x-auto pb-2">{selectedQuestionStates.map(state => { const displayNo = selectedQuestions.find(question => question.id === state.questionId)?.displayNo; return <button key={state.questionId} type="button" onClick={() => setBatchQuestionId(state.questionId)} className={`flex-none rounded-xl px-3 py-2 text-xs font-bold ${activeBatchQuestionId === state.questionId ? 'bg-emerald-700 text-white' : 'border border-slate-200 text-slate-600 dark:border-zinc-700'}`}>第 {displayNo} 题</button>; })}</div>{selectedBatchSample ? <div className="mt-4 grid gap-4 xl:grid-cols-2"><div className="border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">{selectedBatchSample.sourcePreviewUrl ? <img src={selectedBatchSample.sourcePreviewUrl} alt={`${selectedBatchSample.studentName} 答卷截图`} className="max-h-[520px] w-full object-contain" /> : null}</div><div className="space-y-3"><section className="rounded-lg border border-slate-200 p-4 dark:border-zinc-800"><strong>{selectedBatchSample.ocrSource === 'luna' ? 'Luna 主识别' : 'PaddleOCR 主识别'}</strong><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedBatchSample.ocrText || '未识别到作答'}</p></section>{selectedBatchSample.lunaReviewText ? <section className="rounded-lg bg-amber-50 p-4 text-amber-900"><strong>Luna 视觉复核</strong><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedBatchSample.lunaReviewText}</p></section> : null}<section className="rounded-lg bg-emerald-50 p-4 text-emerald-900"><strong>AI 评分：{selectedBatchSample.aiScore ?? '待定'} / {selectedBatchSample.fullScore}</strong><p className="mt-2 text-sm leading-6">{selectedBatchSample.gradingReason}</p></section></div></div> : null}<div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-zinc-800"><span className="text-xs text-slate-500">已确认 {(batch?.confirmedStudentIds ?? []).length} / {batchStudents.length} 份</span>{gradingMode !== 'auto-continue' && unconfirmedBatchStudents.length ? pendingReviewStudentIds.has(activeBatchStudentId) && gradingMode === 'per-submission' ? <button type="button" onClick={() => setActiveStage('review')} className="rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white">先处理本份异常</button> : <GlassButton type="button" disabled={!currentBatchCheckpoint.length} onClick={() => void confirmCurrentBatch()} variant="primary" className="px-4 py-2.5 text-sm font-bold disabled:opacity-40">{gradingMode === 'per-submission' ? '确认本份并查看下一份' : `确认当前批次（${currentBatchCheckpoint.length} 份）`}</GlassButton> : <span className="text-xs font-bold text-emerald-700">无需人工逐份确认</span>}</div></div></div></section> : null}
        </section>
      ) : null}

      {activeStage === 'review' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900 dark:text-white">本任务异常复核</h2><p className="mt-1 text-xs text-slate-500">点击卡片核对答卷并完成本题批改。</p></div><span className="rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800">{pendingReviews} 项待复核</span></div>
          <div className="flex flex-wrap gap-2">{([['all','全部'], ...Object.entries(reviewTriggerLabels), ['resolved','已处理']] as Array<[typeof reviewStage, string]>).map(([id,label]) => <button key={id} type="button" onClick={() => setReviewStage(id)} className={`rounded-2xl px-4 py-2 text-xs font-bold ${reviewStage === id ? 'bg-emerald-700 text-white' : 'border border-slate-200 text-slate-500 dark:border-zinc-800'}`}>{label}</button>)}</div>
          {visibleReviewSamples.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleReviewSamples.map(sample => {
            const question = workflowState.questions.find(item => item.id === sample.questionId);
            const shownScore = sample.status === 'confirmed' ? sample.teacherScore ?? sample.aiScore : sample.aiScore;
            return <article key={sample.id} className={`${panelClass} overflow-hidden`}><button type="button" onClick={() => openReviewSample(sample)} className="block w-full text-left"><div className="h-36 bg-slate-100 dark:bg-zinc-900">{sample.sourcePreviewUrl ? <img src={sample.sourcePreviewUrl} alt={`${sample.studentName} 第 ${question?.displayNo} 题`} className="h-full w-full object-contain" /> : null}</div><div className="p-4 pb-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-base">{sample.studentName}</strong><p className="mt-1 text-xs text-slate-500">第 {question?.displayNo ?? '-'} 题 · 当前 {shownScore ?? '待定'} / {sample.fullScore} 分</p></div><span className={`rounded-xl px-2 py-1 text-[10px] font-bold ${sample.reviewStatus === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{sample.reviewStatus === 'resolved' ? '已完成复核' : reviewTriggerLabels[sample.reviewTriggers?.[0] ?? 'low-confidence']}</span></div><div className="mt-3 flex flex-wrap gap-1">{sample.reviewTriggers?.map(trigger => <span key={trigger} className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">{reviewTriggerLabels[trigger]}</span>)}</div><p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{sample.reviewStatus === 'resolved' ? sample.teacherReason : sample.gradingReason}</p></div></button>{sample.reviewStatus !== 'resolved' ? <div className="flex gap-2 border-t border-slate-200 p-3 dark:border-zinc-800"><GlassButton type="button" disabled={sample.aiScore === null || reviewSaving !== 'idle'} onClick={() => void confirmReviewSampleDirectly(sample)} variant="secondary" containerClassName="flex-1" className="px-3 py-2 text-xs font-bold disabled:opacity-40">确认当前分数</GlassButton><GlassButton type="button" onClick={() => openReviewSample(sample)} variant="primary" containerClassName="flex-1" className="px-3 py-2 text-xs font-bold">修改评分</GlassButton></div> : null}</article>;
          })}</div> : <section className={`${panelClass} flex min-h-56 flex-col items-center justify-center p-8 text-center`}><CheckCircle2 className="h-9 w-9 text-emerald-500" /><p className="mt-3 text-sm font-bold text-slate-600">当前环节没有异常</p></section>}
          {selectedReviewSample ? createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={`${selectedReviewSample.studentName} 异常复核`}><div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] dark:bg-zinc-950"><header className="flex flex-none items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-zinc-800"><div><h2 className="text-lg font-black">{selectedReviewSample.studentName} · 异常复核</h2><p className="mt-1 text-xs text-slate-500">先修正证据，再确认这道题的最终得分。</p></div><button type="button" aria-label="关闭异常详情" onClick={() => setReviewSampleId(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="mb-3 flex flex-wrap gap-2">{selectedReviewSample.reviewTriggers?.map(trigger => <span key={trigger} className="rounded-xl bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900">{reviewTriggerLabels[trigger]}</span>)}</div><div className="grid gap-4 lg:grid-cols-2"><section className="border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">{selectedReviewSample.sourcePreviewUrl ? <button type="button" onClick={() => setPreviewImage({ url: selectedReviewSample.sourcePreviewUrl!, label: `${selectedReviewSample.studentName} · 答卷原图依据` })} className="block w-full cursor-zoom-in"><img src={selectedReviewSample.sourcePreviewUrl} alt="答卷原图依据" className="max-h-[620px] w-full object-contain" /></button> : <p className="p-8 text-center text-sm text-slate-400">暂无原图</p>}<StandardAnswerReference answer={selectedReviewQuestionState?.standardAnswer ?? ''} evidence={selectedReviewAnswerEvidence} onPreview={(url, label) => setPreviewImage({ url, label })} /></section><div className="space-y-3 text-sm"><section className="rounded-lg border border-slate-200 p-4 dark:border-zinc-800"><div className="flex items-center justify-between gap-3"><strong>{selectedReviewSample.ocrSource === 'luna' ? 'Luna 主识别' : 'PaddleOCR 主识别'}</strong><span className="text-xs text-slate-400">可按原图修正</span></div><textarea value={reviewEditedOcr} onChange={event => setReviewEditedOcr(event.target.value)} rows={6} className={'qs-field-input '+(`${inputClass} mt-3 h-auto resize-y py-3 leading-6`)} /><GlassButton type="button" disabled={reviewSaving !== 'idle' || selectedReviewSample.resultSource === 'teacher-manual'} onClick={() => void saveReviewOcrCorrection()} variant="secondary" containerClassName="mt-3" className="px-3 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">{selectedReviewSample.resultSource === 'teacher-manual' ? '教师终评已锁定识别文本' : reviewSaving === 'ocr' ? '正在重新评分...' : '修正识别并重新评分'}</GlassButton></section>{selectedReviewSample.lunaReviewText ? <section className="rounded-lg bg-amber-50 p-4 text-amber-900"><strong>Luna 视觉复核</strong><p className="mt-2 whitespace-pre-wrap leading-6">{selectedReviewSample.lunaReviewText}</p></section> : null}<section className="rounded-lg bg-emerald-50 p-4 text-emerald-900"><strong>AI 评分：{selectedReviewSample.aiScore ?? '待定'} / {selectedReviewSample.fullScore}</strong><p className="mt-2 leading-6">{selectedReviewSample.gradingReason}</p></section></div></div><section className="mt-4"><strong className="text-xs text-slate-500">问题原因（可多选）</strong><div className="mt-2 flex flex-wrap gap-2">{feedbackReasonOptions.map(option => <button key={option.id} type="button" onClick={() => setReviewFeedbackReasons(current => current.includes(option.id) ? current.filter(id => id !== option.id) : [...current, option.id])} className={`rounded-xl px-3 py-2 text-xs font-bold ${reviewFeedbackReasons.includes(option.id) ? 'bg-emerald-700 text-white' : 'border border-slate-200 text-slate-600 dark:border-zinc-700'}`}>{option.label}</button>)}</div></section></div><footer className="flex-none border-t border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><div className="grid items-end gap-3 lg:grid-cols-[120px_minmax(0,1fr)_auto]"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">教师最终分</span><input type="number" min={0} max={selectedReviewSample.fullScore} value={reviewScore} onChange={event => setReviewScore(Math.min(selectedReviewSample.fullScore, Math.max(0, Number(event.target.value))))} className={'qs-field-input '+(inputClass)} /></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">补充说明（非必填）</span><input value={reviewReason} onChange={event => setReviewReason(event.target.value)} placeholder="可说明采用或调整分数的依据" className={'qs-field-input '+(inputClass)} /></label><div className="flex flex-wrap gap-2"><GlassButton containerClassName="h-11" type="button" disabled={reviewSaving !== 'idle'} onClick={() => void deferReviewDecision()} variant="secondary" className="px-4 text-xs font-bold disabled:opacity-50">稍后处理</GlassButton><GlassButton containerClassName="h-11" type="button" disabled={selectedReviewSample.aiScore === null || reviewSaving !== 'idle'} onClick={() => void confirmReviewDecision('ai-confirmed')} variant="secondary" className="px-4 text-xs font-bold disabled:opacity-50">确认当前分数</GlassButton><GlassButton containerClassName="h-11" type="button" disabled={reviewSaving !== 'idle'} onClick={() => void confirmReviewDecision('teacher-manual')} variant="primary" className="px-4 text-xs font-bold disabled:opacity-50">{reviewSaving === 'decision' ? '正在保存...' : '修改分数并确认'}</GlassButton></div></div></footer></div></div>, document.body) : null}
        </section>
      ) : null}

      {activeStage === 'diagnosis' && diagnosis ? <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className={`${panelClass} p-5`}><span className="text-xs font-bold text-slate-500">完成批改</span><strong className="mt-2 block text-2xl">{diagnosis.gradedStudentCount} 人</strong></div><div className={`${panelClass} p-5`}><span className="text-xs font-bold text-slate-500">班级平均分</span><strong className="mt-2 block text-2xl">{diagnosis.averageScore?.toFixed(1) ?? '-'} / {diagnosis.averageFullScore}</strong></div><div className={`${panelClass} p-5`}><span className="text-xs font-bold text-slate-500">待复核证据</span><strong className="mt-2 block text-2xl">{pendingReviews} 项</strong></div></div><div className="grid gap-4 lg:grid-cols-2"><section className={`${panelClass} p-5`}><h2 className="font-black">各题表现</h2><div className="mt-4 space-y-3">{diagnosis.questionPerformance.map(item => <div key={item.questionId}><div className="flex justify-between text-xs"><strong>第 {item.displayNo} 题</strong><span>{Math.round(item.scoreRate * 100)}%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600" style={{width:`${Math.round(item.scoreRate * 100)}%`}} /></div></div>)}</div></section><section className={`${panelClass} p-5`}><h2 className="font-black">主要失分点</h2><div className="mt-4 space-y-2">{diagnosis.commonIssues.length ? diagnosis.commonIssues.map(item => <div key={item.label} className="flex items-start justify-between gap-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900"><span>{item.label}</span><strong>{item.count} 人次</strong></div>) : <p className="text-sm text-slate-500">暂无明确共性失分点。</p>}</div></section></div><section className={`${panelClass} p-5`}><h2 className="font-black">典型学生</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{diagnosis.typicalStudents.map(item => <div key={`${item.role}-${item.studentId}`} className="rounded-2xl border border-slate-200 p-4"><span className="text-xs font-bold text-emerald-700">{item.role}</span><strong className="mt-1 block">{item.studentName}</strong><span className="mt-1 block text-xs text-slate-500">总分 {item.totalScore} / {diagnosis.averageFullScore}</span></div>)}</div></section></section> : null}
      {activeStage === 'diagnosis' && !diagnosis ? <section className={`${panelClass} flex min-h-80 flex-col items-center justify-center p-8 text-center`}><BookOpenCheck className="h-10 w-10 text-emerald-700" /><h2 className="mt-4 font-black">正在汇总真实批改结果</h2></section> : null}

      {activeStage === 'calibration' && gradingAction !== 'none' && selectedSample ? createPortal(<div className="fixed bottom-24 right-3 z-[110] w-[min(270px,calc(100vw-1.5rem))] shadow-2xl sm:bottom-28 sm:right-6"><ScoreKeypad value={teacherScore} max={selectedSample.fullScore} onChange={setTeacherScore} onConfirm={() => void updateSample(gradingAction === 'manual' ? 'teacher-manual' : 'teacher-adjusted', teacherScore, teacherReason || '教师完成分项判断')} /></div>, document.body) : null}
      {selectedReviewSample ? createPortal(<div className="fixed bottom-24 right-3 z-[110] w-[min(270px,calc(100vw-1.5rem))] shadow-2xl sm:bottom-28 sm:right-6"><ScoreKeypad value={reviewScore} max={selectedReviewSample.fullScore} disabled={reviewSaving !== 'idle'} onChange={setReviewScore} onConfirm={() => void confirmReviewDecision('teacher-manual')} /></div>, document.body) : null}

      {showSubmissionDeleteConfirm ? (
        <ResponsiveDialog title={`确认删除 ${selectedSubmissionAssets.length} 份答卷？`}
          busy={submissionDeletePhase === 'deleting'} onClose={() => setShowSubmissionDeleteConfirm(false)}
          footer={<>
            <GlassButton type="button" disabled={submissionDeletePhase === 'deleting'} onClick={() => setShowSubmissionDeleteConfirm(false)} variant="secondary">取消</GlassButton>
            <GlassButton type="button" disabled={submissionDeletePhase === 'deleting'} onClick={() => void deleteSelectedSubmissions()} variant="danger">{submissionDeletePhase === 'deleting' ? '正在删除…' : '确认删除答卷'}</GlassButton>
          </>}
        >
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">这是第二次确认。删除后会移除应用内上传副本、OCR、截图、质检和对应批改结果；题目、参考答案、评分细则及教师电脑中的原文件不会受影响。</p>
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-zinc-900">{selectedSubmissionAssets.map(asset => <p key={asset.id} className="break-all text-xs text-slate-600 dark:text-slate-300">{asset.fileName}</p>)}</div>
        </ResponsiveDialog>
      ) : null}

      {previewImage ? <ImagePreviewDialog url={previewImage.url} label={previewImage.label} onClose={() => setPreviewImage(null)} /> : null}

      {showModeDialog ? (
        <ResponsiveDialog title="选择本次批改方式" subtitle="所有题目试批已完成，现在决定本次任务需要教师介入的频率。"
          wide compactFull onClose={() => setShowModeDialog(false)}
          footer={<GlassButton type="button" onClick={lockAndStart} variant="primary" className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" />锁定评分依据并开始批改</GlassButton>}
        >
          <div className="grid gap-3 md:grid-cols-3" role="group" aria-label="批改方式">{modeOptions.map(option => <GlassButton key={option.id} type="button" aria-pressed={gradingMode === option.id} onClick={() => setGradingMode(option.id)} variant="secondary" className={`flex h-full min-h-11 flex-col items-start p-4 text-left ${gradingMode === option.id ? 'ring-2 ring-emerald-700/30' : ''}`}><strong className="text-sm">{option.label}</strong><span className="mt-2 block text-xs font-normal leading-5 text-slate-500">{option.description}</span></GlassButton>)}</div>
        </ResponsiveDialog>
      ) : null}
    </div>
  );
}
