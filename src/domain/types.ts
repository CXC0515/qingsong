/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StudentStatus = 'good' | 'warning' | 'risk' | 'outstanding';
export type EnrollmentStatus = 'active' | 'transferred' | 'withdrawn' | 'suspended';

export interface TeacherProfile {
  nickname: string;
  realName: string;
  schoolName: string;
  title: string;
}

export interface ParentInfo {
  name: string;
  phone: string;
  relation: string;
  remark: string;
}

export interface TeacherObservation {
  date: string;
  type: 'positive' | 'neutral' | 'negative';
  content: string;
  category?: 'study' | 'behavior' | 'emotion' | 'attendance';
  author?: string;
}

export interface HomeworkRecord {
  id: string;
  title: string;
  date: string;
  score: number;
  fullScore: number;
  status: 'submitted' | 'late' | 'missing';
  knowledgeErrors: {
    questionId: string;
    questionTitle: string;
    points: string[];
    errorType: string;
    status: 'fixed' | 'pending' | 'warning';
  }[];
}

export interface Student {
  id: string;
  name: string;
  studentNo: string;
  classId: string;
  className: string;
  gender: 'male' | 'female';
  committeeRoleIds: string[];
  status: StudentStatus;
  behaviorTags: string[];
  parent: ParentInfo;
  secondaryParent?: ParentInfo;
  familyStatus: 'normal' | 'attention' | 'special';
  familyStatusTag?: string; // e.g. "留守儿童", "单亲家庭"
  observationHistory: TeacherObservation[];
  strongKnowledge: string[];
  weakKnowledge: string[];
  recentHomeworkTrend: number[]; // Last 5 homework scores (out of 100)
  homeworkHistory: HomeworkRecord[];
  weaknessEvidence?: WeaknessEvidence[];
}

export interface ClassMembership {
  id: string;
  classId: string;
  studentId: string;
  studentNo: string;
  status: EnrollmentStatus;
  joinedAt: string;
  leftAt?: string;
}

export interface RosterStudent extends Student {
  studentId: string;
  enrollmentStatus: EnrollmentStatus;
}

export interface RosterSnapshot {
  classes: SchoolClass[];
  students: RosterStudent[];
  committeeRoles: CommitteeRole[];
}

export interface CommitteeRole {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
}

export interface CommitteeAssignment {
  classId: string;
  studentId: string;
  roleId: string;
}

export interface ClassroomSeatAssignment {
  seatIndex: number;
  studentId: string;
}

export interface ClassroomLayout {
  classId: string;
  rowCount: number;
  columnCount: number;
  seats: ClassroomSeatAssignment[];
  updatedAt?: string;
}

export interface SubmissionRosterMatch {
  matched: RosterStudent[];
  missing: RosterStudent[];
  unknownStudentNos: string[];
  duplicateStudentNos: string[];
}

export interface WeaknessEvidence {
  id: string;
  knowledgePoint: string;
  issue: string;
  taskName: string;
  questionTitle: string;
  date: string;
  occurrenceCount: number;
  status: 'current' | 'sustained';
}

export interface SchoolClass {
  id: string;
  name: string;
  grade: string;
  term: string;
  headTeacher: string;
  studentCount: number;
  status: 'active' | 'archived';
}

export interface WorkbenchTask {
  id: string;
  name: string;
  classId: string;
  className: string;
  node: 'setup' | 'collection' | 'upload' | 'ocr' | 'grading' | 'verify' | 'report' | 'sync';
  nodeName: string;
  deadline: string;
  createdAt: string;
  collectionDeadlineAt: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress?: number;
  selectedQuestionIds?: string[];
  questionScopeConfirmedAt?: string;
  archivedAt?: string;
}

export type GradingMode = 'per-submission' | 'batch-checkpoint' | 'auto-continue';
export type CalibrationResultSource = 'ai-confirmed' | 'teacher-adjusted' | 'teacher-manual';
export type GradingReviewTrigger = 'answer-missing' | 'rubric-insufficient' | 'answer-region' | 'recognition-conflict' | 'crossed-out' | 'low-confidence';
export type GradingReviewDecision = 'confirmed-score' | 'corrected-recognition' | 'adjusted-score' | 'deferred';
export type GradingFeedbackReason = 'answer-region-incomplete' | 'recognition-error' | 'crossed-out-error' | 'rubric-missing' | 'rubric-judgment-error' | 'score-too-high' | 'score-too-low' | 'other';

export interface SubmissionPage {
  id: string;
  sequence: number;
  studentId?: string;
  expectedStudentName: string;
  detectedStudentNo: string;
  detectedStudentName?: string;
  matchedStudentNo?: string;
  nameMatchSource?: 'ocr' | 'file-name' | 'teacher';
  pageCount: number;
  ocrConfidence: number;
  studentNoConfidence?: number;
  textConfidence?: number;
  regionCompleteness?: number;
  pageContinuity?: number;
  reviewSource?: 'automatic' | 'multimodal' | 'teacher';
  issueReason?: string;
  rosterMatchStatus?: 'pending' | 'matched' | 'unknown-student-no' | 'duplicate-student-no' | 'unreadable-student-no' | 'unreadable-student-name' | 'ambiguous-student-name';
  rosterIssueReason?: string;
  status: 'matched' | 'needs-review' | 'missing-page';
}

export interface CalibrationSample {
  id: string;
  questionId?: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  sampleType: 'high' | 'middle' | 'low' | 'boundary' | 'ocr-risk';
  rawImageDescription: string;
  rawOcrText?: string;
  teacherCorrectedText?: string;
  lunaReviewText?: string;
  recognitionConflict?: boolean;
  ocrSource?: 'paddle' | 'focused-paddle' | 'luna' | 'choice-vision';
  ocrText: string;
  ocrConfidence: number;
  aiScore: number | null;
  fullScore: number;
  gradingConfidence: number;
  needsTeacherReview?: boolean;
  matchedPoints: string[];
  missedPoints: string[];
  gradingReason?: string;
  sourceAssetId?: string;
  sourceFileName?: string;
  sourcePreviewUrl?: string;
  sourcePreviewType?: 'image' | 'document';
  status: 'pending' | 'confirmed';
  resultSource?: CalibrationResultSource;
  teacherScore?: number;
  teacherReason?: string;
  isFinal?: boolean;
  reviewTriggers?: GradingReviewTrigger[];
  reviewStatus?: 'pending' | 'resolved' | 'deferred';
  reviewDecision?: GradingReviewDecision;
  feedbackReasons?: GradingFeedbackReason[];
  reviewedAt?: string;
  rubricVersion: number;
}

export interface TrialGradingQuestionInput {
  questionId: string;
  displayNo: string;
  stem: string;
  fullScore: number;
  standardAnswer: string;
  subquestions?: GradingQuestionPart[];
  rubricPoints: GradingRubricPoint[];
  teacherRules: string[];
  rubricVersion: number;
}

export interface TrialGradingSubmissionInput {
  assetId: string;
  studentId: string;
  studentName: string;
  studentNo: string;
}

export interface TrialGradingResult {
  taskId: string;
  model: string;
  samples: CalibrationSample[];
  createdAt: string;
}

export interface VisionValidationItem {
  pipelineVersion?: number;
  preferredRecognitionSource?: 'paddle' | 'focused-paddle' | 'luna';
  focusedPaddleText?: string;
  focusedOcrStatus?: 'completed' | 'failed';
  screenshotStatus?: 'available' | 'unavailable';
  displayNo: string;
  region: { x: number; y: number; width: number; height: number; pageNumber: number };
  locatorSource: 'paddle-layout' | 'inferred-gap' | 'vision-layout' | 'teacher-manual';
  pageWidth?: number;
  pageHeight?: number;
  locationStatus: 'located' | 'needs-visual' | 'needs-teacher';
  locationReasons: string[];
  cropUrl: string;
  evidenceUnits?: VisionEvidenceUnit[];
  paddleText: string;
  lunaText: string;
  answerFields?: VisionAnswerField[];
  crossedOutText: string[];
  selectedOption: string | null;
  visualEvidence: string;
  existingMarkings: string[];
  confidence: number;
  needsReview: boolean;
}

export type VisionEvidenceKind = 'text' | 'choice' | 'formula' | 'diagram' | 'table' | 'mixed';

export interface VisionEvidenceUnit {
  evidenceId: string;
  kind: VisionEvidenceKind;
  region: { x: number; y: number; width: number; height: number; pageNumber: number };
  cropUrl: string;
  provisionalText: string;
  literalText: string;
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
}

export interface VisionAnswerField {
  fieldId: string;
  label: string;
  text: string;
  crossedOutText: string[];
  confidence: number;
  needsReview: boolean;
}

export interface TaskQuestionRubric {
  taskId: string;
  questionId: string;
  standardAnswer: string;
  gradingRubric: GradingRubricPoint[];
  teacherRules: string[];
  rubricVersion: number;
  updatedAt: string;
}

export interface VisionValidationResult {
  taskId: string;
  assetId: string;
  model: string;
  items: VisionValidationItem[];
  createdAt: string;
}

export interface GradingRubricPoint {
  point: string;
  score: number;
  description: string;
}

export interface QuestionGradingState {
  questionId: string;
  standardAnswer: string;
  standardAnswerOcrText?: string;
  standardAnswerSourceIds?: string[];
  gradingRubric: GradingRubricPoint[];
  teacherRules: string[];
  rubricVersion: number;
  sampleTarget: 3 | 5;
  calibrationSamples: CalibrationSample[];
  jointReviewEnabled: boolean;
}

export interface MissingSubmission {
  studentId: string;
  studentName: string;
  studentNo: string;
  status: 'missing' | 'excused' | 'late';
}

export interface AiReviewOpinion {
  reviewer: string;
  score: number;
  confidence: number;
  reason: string;
}

export interface ScheduleItem {
  id: string;
  day: number; // 1-7
  period: number; // 1-8
  title: string;
  classId: string;
  className: string;
  type: 'class' | 'meeting' | 'research' | 'reminder' | 'parent-comm' | 'grading';
  time: string;
  scope?: 'teacher' | 'class';
  teacherName?: string;
  confidence?: number;
}

export interface SchedulePeriod {
  period: number;
  label: string;
  startTime: string;
  endTime: string;
}

export interface TimerReminder {
  id: string;
  name: string;
  classId: string;
  className: string;
  time: string;
  repeatRule: string;
  status: 'active' | 'completed' | 'inactive';
  important?: boolean;
  urgent?: boolean;
  dueAt?: string;
  timeKind?: 'none' | 'point' | 'range';
  startAt?: string;
  endAt?: string;
  completedAt?: string;
  sortOrder?: number;
  assumptionWarning?: string;
  seriesId?: string;
  occurrenceNumber?: number;
  generatedFromId?: string;
  recurrence?: ReminderRecurrence;
}

export interface ReminderRecurrence {
  enabled: boolean;
  unit: 'day' | 'week' | 'month' | 'year';
  interval: number;
  weekdays?: number[];
  monthDays?: number[];
  endDate?: string;
  maxOccurrences?: number;
}

export interface ReminderImportDraft extends TimerReminder {
  selected: boolean;
  sourceExcerpt: string;
  confidence: number;
  warnings: string[];
}

export interface DocumentAsset {
  id: string;
  taskId: string;
  kind: 'assignment' | 'reference-answer' | 'student-submission';
  fileName: string;
  mimeType: string;
  pageCount?: number;
  publicUrl?: string;
  sourcePageUrl?: string;
  status: 'uploaded' | 'processing' | 'ready' | 'needs-review' | 'failed';
  parseErrorCode?: string;
  preParseRegion?: { x: number; y: number; width: number; height: number };
}

export type MaterialSourceFormat = 'docx' | 'pdf' | 'image' | 'text';

export interface NormalizedDocumentBlock {
  id: string;
  order: number;
  type: 'heading' | 'paragraph' | 'list-item' | 'table' | 'image' | 'formula' | 'page';
  sourceType?: string;
  text: string;
  markdown?: string;
  resourceUrls?: string[];
  listLabel?: string;
  level?: number;
  pageNumber?: number;
  confidence?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface NormalizedDocumentResource {
  id: string;
  fileName: string;
  mimeType: string;
  publicUrl: string;
  role?: 'content' | 'layout-visualization' | 'source-page';
  pageNumber?: number;
}

export interface MaterialParseWarning {
  code: string;
  message: string;
  blockId?: string;
}

export interface NormalizedDocument {
  assetId: string;
  sourceFormat: MaterialSourceFormat;
  markdown: string;
  sourceMarkdown?: string;
  sourcePreviewUrl?: string;
  blocks: NormalizedDocumentBlock[];
  resources: NormalizedDocumentResource[];
  warnings: MaterialParseWarning[];
  pageCount?: number;
  parsedAt: string;
  processingMetrics?: ResourceProcessingMetrics;
}

export interface AnalysisEvidenceRef {
  assetKind: 'assignment' | 'reference-answer';
  assetId: string;
  fileName: string;
  blockIds: string[];
  quote: string;
  segments?: { blockId: string; quote: string }[];
  visualRegion?: {
    pageNumber: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  } | null;
  manualRegion?: {
    pageNumber: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    selectedAt: string;
  } | null;
  matchStatus?: 'exact' | 'normalized' | 'block-level';
  isPartialBlock?: boolean;
  evidenceMode?: 'native-text' | 'source-crop';
  pageNumber?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  imageUrl?: string;
  sourcePageUrl?: string;
  locatorStatus?: 'located' | 'needs-visual' | 'needs-teacher';
  locatorReasons?: string[];
  cropMode?: 'block' | 'estimated-segment' | 'model-within-block' | 'teacher-manual';
  blockImageUrl?: string;
}

export interface AnalyzedQuestionUnit {
  displayNo: string;
  title: string;
  stem: string;
  teacherCorrectedStem?: boolean;
  score: number | null;
  questionType: string;
  answerRequirement: string;
  standardAnswer: string;
  explanation: string;
  rubricPoints: { point: string; score: number | null; description: string }[];
  knowledgeCandidates: { nodeId: string; nodeName: string; confidence: number }[];
  confirmedKnowledgeNodeIds?: string[];
  questionSource: AnalysisEvidenceRef;
  answerSource: AnalysisEvidenceRef | null;
  confidence: number;
  reviewReasons: string[];
}

export interface AnalyzedQuestion extends AnalyzedQuestionUnit {
  subquestions: AnalyzedQuestionUnit[];
}

export interface FirstSectionAnalysis {
  taskId: string;
  scope: string;
  status: 'needs-review' | 'confirmed';
  model: string;
  materialAssetIds: string[];
  questions: AnalyzedQuestion[];
  createdAt: string;
  processingMetrics?: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

export interface SourceEvidence {
  id: string;
  assetId: string;
  assetKind: DocumentAsset['kind'];
  fileName: string;
  pageNumber: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  ocrText: string;
  blockIds?: string[];
  segments?: { blockId: string; quote: string }[];
  isPartialBlock?: boolean;
  confidence: number;
  imageUrl?: string;
  sourcePageUrl?: string;
  evidenceMode?: 'native-text' | 'source-crop';
  locatorStatus?: 'located' | 'needs-visual' | 'needs-teacher';
  locatorReasons?: string[];
  cropMode?: 'block' | 'estimated-segment' | 'model-within-block' | 'teacher-manual';
  blockImageUrl?: string;
  isMock?: boolean;
}

export interface KnowledgeLink {
  nodeId: string;
  nodeName: string;
  confidence: number;
  status: 'suggested' | 'confirmed';
}

export interface GradingQuestion {
  id: string;
  displayNo: string;
  parentId?: string;
  title: string;
  score: number;
  knowledgePoint: string;
  knowledgeLinks: KnowledgeLink[];
  desc: string;
  stem?: string;
  aiQuestionType?: string;
  answerRequirement?: string;
  parseConfidence: number;
  sourceEvidenceIds: string[];
  subquestions?: GradingQuestionPart[];
}

export interface GradingQuestionPart {
  displayNo: string;
  title: string;
  stem: string;
  score: number;
  questionType: string;
  answerRequirement: string;
  standardAnswer: string;
  explanation: string;
  rubricPoints: GradingRubricPoint[];
}

export interface WorkflowState {
  currentStep: number; // 1-10
  taskName: string;
  classId: string;
  deadline: string;
  relatedText: string;
  homeworkType: 'reading' | 'writing' | 'dictation' | 'comprehensive';
  assignment: {
    status: 'draft' | 'assigned';
    analysisStatus: 'idle' | 'uploading' | 'parsing' | 'needs-review' | 'ready' | 'failed';
    questionFileNames: string[];
    answerFileNames: string[];
    note: string;
    selectedQuestionIds?: string[];
    assets: DocumentAsset[];
    documents?: NormalizedDocument[];
    firstSectionAnalysis?: FirstSectionAnalysis;
  };
  questions: GradingQuestion[];
  sourceEvidence: SourceEvidence[];
  standardAnswer: string;
  gradingRubric: GradingRubricPoint[];
  uploadProgress: number;
  isUploading: boolean;
  uploadedCount: number;
  ocrResults: {
    studentName: string;
    rawImage: string;
    ocrText: string;
    matchScore: number;
  }[];
  aiResults: {
    studentId: string;
    studentName: string;
    score: number;
    hitPoints: string[];
    deductions: { point: string; score: number; reason: string }[];
    errorType: string;
    confidence: number;
  }[];
  rubricVersion?: number;
  gradingMode?: GradingMode;
  teacherRules?: string[];
  submissionPages?: SubmissionPage[];
  calibrationSamples?: CalibrationSample[];
  jointReviewQuestionIds?: string[];
  questionGradingStates?: QuestionGradingState[];
  missingSubmissions?: MissingSubmission[];
}

export interface ReviewItem {
  id: string;
  taskId?: string;
  questionId?: string;
  studentId: string;
  studentName: string;
  taskName: string;
  className: string;
  type: 'low-confidence' | 'large-gap' | 'conflict' | 'pending-confirm';
  typeName: string;
  priority: 'high' | 'medium' | 'low';
  studentAnswer: string;
  standardAnswer: string;
  rubric: string;
  aiSuggestedScore: number;
  teacherFinalScore: number;
  differenceReason: string;
  evidenceText: string;
  status: 'pending' | 'completed';
  questionTitle?: string;
  ocrConfidence?: number;
  gradingConfidence?: number;
  rawImageDescription?: string;
  aiReviews?: AiReviewOpinion[];
}

export type GradingBatchStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface GradingBatch {
  taskId: string;
  status: GradingBatchStatus;
  mode: GradingMode;
  totalStudents: number;
  processedStudents: number;
  failedStudentIds: string[];
  studentIds: string[];
  confirmedStudentIds: string[];
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface GradingDiagnosis {
  taskId: string;
  studentCount: number;
  gradedStudentCount: number;
  averageScore: number | null;
  averageFullScore: number;
  questionPerformance: Array<{
    questionId: string;
    displayNo: string;
    averageScore: number;
    fullScore: number;
    scoreRate: number;
    reviewCount: number;
  }>;
  commonIssues: Array<{ label: string; count: number }>;
  typicalStudents: Array<{ studentId: string; studentName: string; totalScore: number; role: '优秀示例' | '需要关注' }>;
}

export interface KnowledgeNode {
  id: string;
  name: string;
  type: 'book' | 'unit' | 'lesson' | 'question' | 'knowledge' | 'capability' | 'error';
  typeName: string;
  desc: string;
  weight: number; // 1-5
  parentId?: string;
}

export type ResourceKind = 'textbook' | 'supplement' | 'worksheet' | 'lesson-plan' | 'ppt-template' | 'notice' | 'other';
export type ResourceStatus = 'uploaded' | 'processing' | 'ready' | 'needs-review' | 'failed';
export type KnowledgeEntityType = 'domain' | 'topic' | 'knowledge' | 'question-type' | 'method' | 'example' | 'ability' | 'error';
export type KnowledgeRelationType = 'parent' | 'prerequisite' | 'related' | 'confusable' | 'examines' | 'applies-to' | 'demonstrates' | 'explains';

export interface LibraryResource {
  id: string;
  poolItemId?: string;
  title: string;
  fileName: string;
  mimeType: string;
  kind: ResourceKind;
  subject: string;
  grade: string;
  publisher: string;
  edition: string;
  isPrimary: boolean;
  status: ResourceStatus;
  pageCount: number | null;
  publicUrl: string;
  parseErrorCode?: string;
  summary: string;
  tags: string[];
  parsedPageStart?: number;
  parsedPageEnd?: number;
  createdAt: string;
  updatedAt: string;
}

export type ResourcePageParseStatus = 'unparsed' | 'processing' | 'ready' | 'failed';

export interface ResourcePageState {
  resourceId: string;
  pageNumber: number;
  included: boolean;
  parseStatus: ResourcePageParseStatus;
  parseErrorCode?: string;
  ragStatus: 'unindexed' | 'indexing' | 'indexed' | 'failed' | 'excluded';
  ragChunkCount: number;
  ragIndexedAt?: string;
  updatedAt: string;
}

export type ResourceProcessingStage = 'queued' | 'preparing' | 'ocr' | 'analyzing' | 'saving' | 'completed' | 'failed' | 'interrupted';

export type ResourceProcessingPhase =
  | 'pdf-extraction'
  | 'uploading'
  | 'recognizing'
  | 'downloading'
  | 'enhancing'
  | 'ocr-saving'
  | 'rag-indexing'
  | 'knowledge-analysis';

export interface ResourceProcessingMetrics {
  pdfExtractionMs?: number;
  uploadingMs?: number;
  recognizingMs?: number;
  downloadingMs?: number;
  enhancingMs?: number;
  ocrSavingMs?: number;
  ragIndexingMs?: number;
  analyzingMs?: number;
  totalMs?: number;
}

export interface ResourceProcessingJob {
  id: string;
  resourceId: string;
  pageStart: number;
  pageEnd: number;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  stage: ResourceProcessingStage;
  phase?: ResourceProcessingPhase;
  metrics: ResourceProcessingMetrics;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ResourceChunk {
  id: string;
  resourceId: string;
  parentId?: string;
  level: 'document' | 'section' | 'content';
  sourceType?: string;
  contentType?: NormalizedDocumentBlock['type'];
  title: string;
  summary: string;
  text: string;
  markdown?: string;
  resourceUrls?: string[];
  tags: string[];
  pageStart: number;
  pageEnd: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  order: number;
}

export interface KnowledgeEntity {
  id: string;
  code: string;
  name: string;
  type: KnowledgeEntityType;
  description: string;
  aliases: string[];
  subject: string;
  grade: string;
  stageIds: string[];
  tags: string[];
  primaryMotherId?: string;
  trainable: boolean;
  sortOrder: number;
  source: 'base' | 'teacher' | 'ai-confirmed';
  version: number;
  status: 'active' | 'archived' | 'merged';
  mergedIntoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSubject {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  status: 'active' | 'inactive';
}

export interface KnowledgeStage {
  id: string;
  name: string;
  sortOrder: number;
  status: 'active' | 'inactive';
}

export interface KnowledgeTag {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface KnowledgeRelation {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: KnowledgeRelationType;
  description: string;
  source: 'base' | 'teacher' | 'ai-confirmed';
  version: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSourceLink {
  id: string;
  nodeId: string;
  resourceId: string;
  chunkId: string;
  pageNumber: number;
  isPrimary: boolean;
  quote: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  createdAt: string;
}

export interface DiscoverySuggestion {
  id: string;
  resourceId: string;
  kind: 'node' | 'relation' | 'source-link';
  status: 'pending' | 'accepted' | 'ignored' | 'merged';
  proposedType: KnowledgeEntityType | KnowledgeRelationType;
  proposedName: string;
  description: string;
  aliases: string[];
  confidence: number;
  rationale: string;
  sourceChunkIds: string[];
  existingNodeId?: string;
  targetNodeId?: string;
  primaryMotherId?: string;
  createdNodeId?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ResourceDetail extends LibraryResource {
  chunks: ResourceChunk[];
  suggestions: DiscoverySuggestion[];
  pages: ResourcePageState[];
  processingJobs: ResourceProcessingJob[];
}

export interface KnowledgeGraphSnapshot {
  nodes: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  sourceLinks: KnowledgeSourceLink[];
  resources: LibraryResource[];
  subjects: KnowledgeSubject[];
  stages: KnowledgeStage[];
  tags: KnowledgeTag[];
}

export interface KnowledgeTreeSnapshot {
  subject: string;
  nodes: KnowledgeEntity[];
  unclassified: KnowledgeEntity[];
}

export interface KnowledgeFocusSnapshot {
  node: KnowledgeEntity;
  motherChain: KnowledgeEntity[];
  children: KnowledgeEntity[];
  prerequisites: KnowledgeEntity[];
  dependents: KnowledgeEntity[];
  questionTypes: KnowledgeEntity[];
  methods: KnowledgeEntity[];
  examples: KnowledgeEntity[];
  abilities: KnowledgeEntity[];
  errors: KnowledgeEntity[];
  related: KnowledgeEntity[];
  confusable: KnowledgeEntity[];
  sourceLinks: KnowledgeSourceLink[];
  resources: LibraryResource[];
}

export type MorandiTheme = 'morandi-green' | 'fog-blue' | 'dusty-pink' | 'warm-gray' | 'dark-graphite';
