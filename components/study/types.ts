export type ReviewQuestion = {
  id: string;
  type: 'mcq' | 'blank' | 'ox_reason' | 'essay' | 'explain';
  concept: string;
  prompt: string;
  options: string[] | null;
};

export function describeAnswer(q: ReviewQuestion, answer: unknown): string {
  switch (q.type) {
    case 'mcq':
      return q.options?.[answer as number] ?? '';
    case 'blank':
      return Array.isArray(answer) ? answer.join(' / ') : String(answer);
    case 'ox_reason': {
      const a = answer as { ox: string; reason: number };
      return `${a.ox} · ${q.options?.[a.reason] ?? ''}`;
    }
    default:
      return '';
  }
}
