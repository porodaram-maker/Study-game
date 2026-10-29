import { z } from 'zod';

export const SUBJECTS = ['국어', '수학', '영어', '한국사', '사회', '과학', '기타'] as const;

export const generateRequestSchema = z.object({
  subject: z.enum(SUBJECTS, { error: '과목을 골라 주세요' }),
  title: z.string().trim().min(1, '단원 이름을 적어 주세요').max(40, '단원 이름은 40자까지예요'),
  mode: z.enum(['naesin', 'suneung']),
  text: z.string().trim().min(100, '자료가 너무 짧아요. 100자 이상 붙여 넣어 주세요').max(100_000, '자료가 너무 길어요'),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const CONFIDENCES = ['sure', 'maybe', 'guess'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const MISTAKE_TYPES = ['concept', 'calc', 'misread'] as const;
export type MistakeType = (typeof MISTAKE_TYPES)[number];
export const MISTAKE_LABELS: Record<MistakeType, string> = {
  concept: '개념 부족',
  calc: '계산 실수',
  misread: '문제 잘못 읽음',
};

/** 유형별 답 형식. 채점은 SQL(grade_answer)이 한다. */
export const pickedSchemas = {
  mcq: z.number().int().min(0).max(3),
  blank: z.string().trim().min(1).max(100),
  ox_reason: z.object({ ox: z.enum(['O', 'X']), reason: z.number().int().min(0).max(3) }),
  essay: z.string().trim().min(1, '답을 적어 주세요').max(2000, '2000자까지 쓸 수 있어요'),
} as const;

export const submitRequestSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  picked: z.unknown(),
  confidence: z.enum(CONFIDENCES),
  durationMs: z.number().int().min(0).max(3_600_000),
});
export type SubmitRequest = z.infer<typeof submitRequestSchema>;
