import { createHash } from 'node:crypto';

/** 같은 자료 재사용 판단용 해시 (5.1-2). 공백 차이는 무시하고, 모드가 다르면 다른 자료로 본다. */
export function contentHash(mode: string, text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(`${mode}\n${normalized}`).digest('hex');
}
