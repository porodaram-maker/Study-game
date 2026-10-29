import { z } from 'zod';

// 클라이언트 폼과 서버 액션이 같은 스키마를 쓴다. 금칙어와 중복은 DB 함수가 다시 확인한다.
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]+$/;

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, '닉네임은 2자 이상이에요')
  .max(12, '닉네임은 12자까지예요')
  .regex(NICKNAME_PATTERN, '한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요');

export const loginSchema = z.object({
  email: z.string().trim().email('이메일 형식을 확인해 주세요'),
  password: z.string().min(1, '비밀번호를 입력해 주세요'),
});

export const signupSchema = z.object({
  email: z.string().trim().email('이메일 형식을 확인해 주세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이에요').max(72, '비밀번호는 72자까지예요'),
  age14: z.literal(true, { error: '만 14세 이상만 가입할 수 있어요' }),
  terms: z.literal(true, { error: '이용약관과 개인정보처리방침에 동의해 주세요' }),
});

export const onboardingSchema = z.object({
  nickname: nicknameSchema,
  grade: z.coerce.number().int().min(1, '학년을 골라 주세요').max(3, '학년을 골라 주세요'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type OnboardingInput = z.input<typeof onboardingSchema>;

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
