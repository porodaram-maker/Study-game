import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs';

// card_states.fsrs에 저장하는 JSON 모양 (날짜는 ISO 문자열)
export type StoredCard = Omit<Card, 'due' | 'last_review'> & { due: string; last_review?: string | null };

/** submit_answer(SQL)에 넘기는 등급별 다음 상태. SQL이 채점한 뒤 등급에 맞는 것을 고른다. */
export type Candidates = Record<'1' | '2' | '3' | '4', { card: StoredCard; due: string }>;

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/**
 * 복습은 하루 단위라 분 단위 학습 단계(short-term)는 끈다.
 * 목표 기억률은 game_config.srs_retention에서 받는다.
 */
export function makeScheduler(retention: number) {
  return fsrs(generatorParameters({ request_retention: retention, enable_short_term: false, enable_fuzz: false }));
}

export function toStored(card: Card): StoredCard {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function fromStored(stored: StoredCard | null | undefined, now: Date): Card {
  if (!stored) return createEmptyCard(now);
  return {
    ...stored,
    due: new Date(stored.due),
    last_review: stored.last_review ? new Date(stored.last_review) : undefined,
  } as Card;
}

export function newCard(now: Date): StoredCard {
  return toStored(createEmptyCard(now));
}

export function candidatesFor(stored: StoredCard | null | undefined, now: Date, retention: number): Candidates {
  const preview = makeScheduler(retention).repeat(fromStored(stored, now), now);
  const out = {} as Candidates;
  for (const grade of GRADES) {
    const next = preview[grade].card;
    out[String(grade) as keyof Candidates] = { card: toStored(next), due: next.due.toISOString() };
  }
  return out;
}

/** 현재 기억 확률. 한 번도 안 푼 카드는 0 (SPEC 5.3). */
export function retrievability(stored: StoredCard | null | undefined, now: Date, retention: number): number {
  if (!stored || stored.state === State.New) return 0;
  return makeScheduler(retention).get_retrievability(fromStored(stored, now), now, false);
}

/** 단원 진행 바 = 단원 카드 기억 확률 평균 */
export function deckProgress(cards: (StoredCard | null | undefined)[], now: Date, retention: number): number {
  if (cards.length === 0) return 0;
  const sum = cards.reduce((acc, c) => acc + retrievability(c, now, retention), 0);
  return sum / cards.length;
}
