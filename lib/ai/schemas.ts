import { z } from 'zod';

// Claude에게 받는 생성 결과. 유형마다 필요한 칸이 달라서 평평한 모양으로 받고
// (구조화 출력이 형식을 맞춘다), normalizeGenerated()에서 유형별 규칙을 엄격히 검사한다.
export const generatedQuestionSchema = z.object({
  type: z.enum(['mcq', 'blank', 'ox_reason', 'essay']),
  concept: z.string(),
  prompt: z.string(),
  options: z.array(z.string()).nullable(),
  answer_index: z.number().int().nullable(),
  accepted_answers: z.array(z.string()).nullable(),
  ox: z.enum(['O', 'X']).nullable(),
  model_answer: z.string().nullable(),
  rubric: z
    .array(z.object({ point: z.string(), keywords: z.array(z.string()), score: z.number() }))
    .nullable(),
  explanation: z.string(),
});

export const generatedSetSchema = z.object({
  concepts: z.array(z.string()),
  questions: z.array(generatedQuestionSchema),
});

export type GeneratedSet = z.infer<typeof generatedSetSchema>;
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

/** questions 테이블에 들어가는 모양 */
export type QuestionRow = {
  concept: string;
  type: 'mcq' | 'blank' | 'ox_reason' | 'essay';
  prompt: string;
  options: string[] | null;
  answer: unknown;
  rubric: { point: string; keywords: string[]; score: number }[] | null;
  explanation: string;
};

const text = (max: number) => z.string().trim().min(1).max(max);

const rowSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('mcq'),
    concept: text(10),
    prompt: text(500),
    options: z.array(text(200)).length(4),
    answer: z.number().int().min(0).max(3),
    rubric: z.null(),
    explanation: text(400),
  }),
  z.object({
    type: z.literal('blank'),
    concept: text(10),
    prompt: text(500).refine((p) => /_{2,}|\(\s*\)/.test(p), '빈칸 표시(___)가 없어요'),
    options: z.null(),
    answer: z.array(text(50)).min(1).max(5),
    rubric: z.null(),
    explanation: text(400),
  }),
  z.object({
    type: z.literal('ox_reason'),
    concept: text(10),
    prompt: text(500),
    options: z.array(text(200)).min(2).max(4),
    answer: z.object({ ox: z.enum(['O', 'X']), reason: z.number().int().min(0) }),
    rubric: z.null(),
    explanation: text(400),
  }),
  z.object({
    type: z.literal('essay'),
    concept: text(10),
    prompt: text(500),
    options: z.null(),
    answer: text(1000),
    rubric: z
      .array(z.object({ point: text(200), keywords: z.array(text(30)).max(6), score: z.number().positive().max(10) }))
      .min(1)
      .max(6),
    explanation: text(400),
  }),
]);

function toRow(q: GeneratedQuestion): unknown {
  const base = { type: q.type, concept: q.concept, prompt: q.prompt, explanation: q.explanation };
  switch (q.type) {
    case 'mcq':
      return { ...base, options: q.options, answer: q.answer_index, rubric: null };
    case 'blank':
      return { ...base, options: null, answer: q.accepted_answers, rubric: null };
    case 'ox_reason':
      return { ...base, options: q.options, answer: { ox: q.ox, reason: q.answer_index }, rubric: null };
    case 'essay':
      return { ...base, options: null, answer: q.model_answer, rubric: q.rubric };
  }
}

export type NormalizeResult = { ok: true; questions: QuestionRow[] } | { ok: false; problems: string[] };

/** 생성 결과를 검사하고 DB 모양으로 바꾼다. 문제가 있으면 재시도 프롬프트에 넣을 이유 목록을 준다. */
export function normalizeGenerated(set: GeneratedSet, mode: 'naesin' | 'suneung'): NormalizeResult {
  const problems: string[] = [];
  const questions: QuestionRow[] = [];

  if (set.questions.length < 8 || set.questions.length > 15) {
    problems.push(`문제 수가 ${set.questions.length}개입니다. 8~15개여야 합니다.`);
  }
  set.questions.forEach((q, i) => {
    if (mode === 'suneung' && q.type === 'essay') {
      problems.push(`${i + 1}번: 수능 모드에는 서술형을 내지 않습니다.`);
      return;
    }
    const parsed = rowSchema.safeParse(toRow(q));
    if (!parsed.success) {
      problems.push(`${i + 1}번(${q.type}): ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join(', ')}`);
      return;
    }
    const row = parsed.data;
    if (row.type === 'ox_reason' && row.answer.reason >= row.options.length) {
      problems.push(`${i + 1}번(ox_reason): 이유 정답 번호가 선택지 범위를 벗어났습니다.`);
      return;
    }
    questions.push(row as QuestionRow);
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, questions };
}

// 서술형 채점 결과 (rubric 항목별 충족 여부)
export const essayGradeSchema = z.object({
  met: z.array(z.boolean()),
  missing_keywords: z.array(z.string()),
  questions: z.array(z.string()),
});
export type EssayGrade = z.infer<typeof essayGradeSchema>;

// 통합 노트 (8.6)
export const mergedNoteSchema = z.object({
  sections: z.array(z.object({ heading: z.string(), points: z.array(z.string()) })),
  differences: z.array(z.string()),
});
export type MergedNote = z.infer<typeof mergedNoteSchema>;

/** AI 결과를 검사한다. 빈 노트나 지나치게 긴 항목은 거절. */
export function checkMergedNote(note: MergedNote): { ok: true; value: MergedNote } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const sections = note.sections
    .map((s) => ({ heading: s.heading.trim().slice(0, 60), points: s.points.map((p) => p.trim()).filter(Boolean) }))
    .filter((s) => s.heading && s.points.length > 0);
  if (sections.length === 0) problems.push('정리된 내용이 비어 있습니다.');
  if (sections.length > 30) problems.push('소단원이 너무 많습니다. 30개 이하로 묶어 주세요.');
  if (sections.some((s) => s.points.some((p) => p.length > 400))) problems.push('한 항목이 너무 깁니다. 400자 이하로 나눠 주세요.');
  return problems.length ? { ok: false, problems } : { ok: true, value: { sections, differences: note.differences.map((d) => d.trim()).filter(Boolean) } };
}

/** 통합 노트를 문제 생성용 텍스트로 */
export function noteToText(title: string, note: MergedNote): string {
  const body = note.sections.map((s) => `## ${s.heading}\n${s.points.map((p) => `- ${p}`).join('\n')}`).join('\n\n');
  const diff = note.differences.length ? `\n\n## 자료마다 다른 부분\n${note.differences.map((d) => `- ${d}`).join('\n')}` : '';
  return `# ${title}\n\n${body}${diff}`;
}
