// 그룹 소식 스티커 (8.6). 픽셀 스티커 그림은 아이콘 세트가 들어오면 글자 위에 붙인다.
export const STICKERS = { clap: '최고야', cheer: '힘내', thanks: '고마워', together: '같이 하자' } as const;
export type Sticker = keyof typeof STICKERS;

const GROUP_ERRORS: Record<string, string> = {
  social_banned: '지금은 친구·그룹 기능을 쓸 수 없어요',
  too_many_groups: '그룹은 3개까지 들어갈 수 있어요',
  group_not_found: '초대 코드를 다시 확인해 주세요',
  group_full: '그룹 인원이 꽉 찼어요',
  not_member: '그룹원만 할 수 있어요',
  deck_not_found: '내가 만든 단원만 공유할 수 있어요',
  rights_not_confirmed: '원문을 공개하려면 공유 권리를 확인해 주세요',
  share_not_found: '공유가 멈췄거나 숨겨진 단원이에요',
  own_deck: '내 단원은 가져올 필요가 없어요',
  already_poked: '오늘은 이미 콕 찔렀어요',
  already_done: '오늘 복습을 이미 끝냈어요',
  not_allowed: '할 수 없는 동작이에요',
};

export function groupErrorMessage(message: string | undefined | null): string {
  if (message) for (const [code, text] of Object.entries(GROUP_ERRORS)) if (message.includes(code)) return text;
  return '잠시 후 다시 시도해 주세요';
}
