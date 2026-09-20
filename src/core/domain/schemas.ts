import { z } from 'zod';
import { CASE_STATUSES, TERMINAL_DECISION_STATUSES } from './case-status';
import { CASE_EVENT_TYPES, DOCUMENT_TYPES } from './types';

export const caseStatusSchema = z.enum(CASE_STATUSES);
export const decisionStatusSchema = z.enum(TERMINAL_DECISION_STATUSES);
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const caseEventTypeSchema = z.enum(CASE_EVENT_TYPES);
export const triageLevelSchema = z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']);

export const evidenceReferenceSchema = z.object({
  sourceType: z.enum(['POLICY', 'MEDICAL_HISTORY', 'ADMISSION', 'DOCUMENT', 'RULE']),
  sourceId: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(600),
});

export const missingDocumentSchema = z.object({
  documentType: documentTypeSchema,
  reason: z.string().min(1).max(400),
  severity: z.enum(['BLOCKING', 'ADVISORY']),
});

// ---------------------------------------------------------------------------
// Inbound API contracts
// ---------------------------------------------------------------------------

export const attachedDocumentSchema = z.object({
  documentType: documentTypeSchema,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20_000),
});

export const admissionInputSchema = z.object({
  hospitalCode: z.string().min(1).max(50),
  patientNationalId: z.string().min(1).max(50),
  policyNumber: z.string().min(1).max(50).optional(),
  admissionReason: z.string().min(1).max(1_000),
  admissionReasonCode: z.string().max(50).optional(),
  triageLevel: triageLevelSchema,
  estimatedCost: z.number().nonnegative().max(10_000_000).optional(),
  admittedAt: z.string().datetime().optional(),
  attachedDocuments: z.array(attachedDocumentSchema).max(20).optional(),
  scenarioId: z.string().max(50).optional(),
});

export const evidenceInputSchema = z.object({
  documentType: documentTypeSchema,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20_000),
  submittedBy: z.string().min(1).max(120).default('hospital'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// AI output contract — validated before ANYTHING downstream touches it
// ---------------------------------------------------------------------------

export const aiAnalysisSchema = z.object({
  suggestedStatus: decisionStatusSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(1_200),
  reason: z.string().min(1).max(2_000),
  evidence: z.array(evidenceReferenceSchema).max(25).default([]),
  missingDocuments: z.array(missingDocumentSchema).max(15).default([]),
  recommendedAction: z.string().min(1).max(600),
  potentiallyRelatedConditions: z
    .array(
      z.object({
        conditionCode: z.string().max(50),
        conditionLabel: z.string().min(1).max(200),
        relationRationale: z.string().min(1).max(800),
        evidenceSufficiency: z.enum(['SUFFICIENT', 'INSUFFICIENT', 'UNKNOWN']),
      }),
    )
    .max(15)
    .default([]),
  openQuestions: z.array(z.string().max(400)).max(15).default([]),
});

export type AiAnalysisParsed = z.infer<typeof aiAnalysisSchema>;

/**
 * JSON Schema handed to the provider for structured output. Kept hand-written
 * (rather than generated) so the shape sent to the model is reviewable in a
 * diff and stays provider-agnostic.
 */
export const AI_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    suggestedStatus: { type: 'string', enum: [...TERMINAL_DECISION_STATUSES] },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    reason: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceType: {
            type: 'string',
            enum: ['POLICY', 'MEDICAL_HISTORY', 'ADMISSION', 'DOCUMENT', 'RULE'],
          },
          sourceId: { type: 'string' },
          excerpt: { type: 'string' },
        },
        required: ['sourceType', 'sourceId', 'excerpt'],
      },
    },
    missingDocuments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          documentType: { type: 'string', enum: [...DOCUMENT_TYPES] },
          reason: { type: 'string' },
          severity: { type: 'string', enum: ['BLOCKING', 'ADVISORY'] },
        },
        required: ['documentType', 'reason', 'severity'],
      },
    },
    recommendedAction: { type: 'string' },
    potentiallyRelatedConditions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          conditionCode: { type: 'string' },
          conditionLabel: { type: 'string' },
          relationRationale: { type: 'string' },
          evidenceSufficiency: {
            type: 'string',
            enum: ['SUFFICIENT', 'INSUFFICIENT', 'UNKNOWN'],
          },
        },
        required: ['conditionCode', 'conditionLabel', 'relationRationale', 'evidenceSufficiency'],
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'suggestedStatus',
    'confidence',
    'summary',
    'reason',
    'evidence',
    'missingDocuments',
    'recommendedAction',
    'potentiallyRelatedConditions',
    'openQuestions',
  ],
} as const;

// ---------------------------------------------------------------------------
// Outbound API contracts (what the frontend can rely on)
// ---------------------------------------------------------------------------

export const agentDecisionSchema = z.object({
  status: decisionStatusSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  reason: z.string(),
  evidence: z.array(evidenceReferenceSchema),
  missingDocuments: z.array(missingDocumentSchema),
  recommendedAction: z.string(),
  requiresHuman: z.boolean(),
  generatedAt: z.string(),
  source: z.enum(['DETERMINISTIC', 'AI_ASSISTED', 'AI_UNAVAILABLE']),
  appliedRules: z.array(z.string()),
  gateOverrode: z.boolean(),
  modelSuggestedStatus: decisionStatusSchema.nullable(),
  checks: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      status: z.enum(['PASSED', 'WARNING', 'FAILED', 'NOT_EVALUATED']),
      detail: z.string(),
      evidence: evidenceReferenceSchema.optional(),
      imposedFloor: decisionStatusSchema.optional(),
    }),
  ),
});
