// 입력 자료 길이 제한 (SPEC 11.3). 정확한 토큰 수 대신 보수적으로 어림한다:
// 한글·한자·가나는 글자당 1토큰, 그 밖의 글자는 0.3토큰.
const WIDE = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-鿿가-힯]/;

export function estimateTokens(text: string): number {
  let total = 0;
  for (const ch of text) total += WIDE.test(ch) ? 1 : 0.3;
  return Math.ceil(total);
}

/** maxTokens를 넘으면 앞부분만 남기고 truncated: true를 돌려준다. */
export function truncateToTokens(text: string, maxTokens: number): { text: string; truncated: boolean } {
  let total = 0;
  let index = 0;
  for (const ch of text) {
    total += WIDE.test(ch) ? 1 : 0.3;
    if (total > maxTokens) return { text: text.slice(0, index), truncated: true };
    index += ch.length;
  }
  return { text, truncated: false };
}
