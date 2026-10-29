// create_profile(SQL)이 던지는 예외 이름 → 화면 문구
const PROFILE_ERRORS: Record<string, string> = {
  nickname_length: '닉네임은 2~12자예요',
  nickname_charset: '한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요',
  nickname_banned: '쓸 수 없는 단어가 들어 있어요',
  nickname_taken: '이미 누가 쓰고 있는 닉네임이에요',
  grade_invalid: '학년을 골라 주세요',
  age_not_confirmed: '만 14세 이상 확인이 필요해요. 다시 가입해 주세요',
  profile_exists: '이미 설정을 마쳤어요',
  not_authenticated: '다시 로그인해 주세요',
};

export function profileErrorMessage(message: string | undefined | null): string {
  if (message) {
    for (const [code, text] of Object.entries(PROFILE_ERRORS)) {
      if (message.includes(code)) return text;
    }
  }
  return '잠시 후 다시 시도해 주세요';
}

// Supabase Auth 오류 → 화면 문구
export function authErrorMessage(code: string | undefined, fallback = '잠시 후 다시 시도해 주세요'): string {
  switch (code) {
    case 'invalid_credentials':
      return '이메일 또는 비밀번호가 맞지 않아요';
    case 'email_not_confirmed':
      return '메일함에서 인증 링크를 먼저 눌러 주세요';
    case 'user_already_exists':
    case 'email_exists':
      return '이미 가입한 이메일이에요';
    case 'weak_password':
      return '더 긴 비밀번호를 써 주세요';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return '요청이 많아요. 잠시 후 다시 시도해 주세요';
    default:
      return fallback;
  }
}
