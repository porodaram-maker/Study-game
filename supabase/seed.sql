-- 로컬 개발용 시드. 게임 설정값(6.1)은 3단계, 슬롯·애니메이션 레지스트리(7.2, 14.1, 14.2)는 4단계에서 채운다.
insert into public.schools (name, region) values
  ('픽셀고등학교', '서울'),
  ('도트고등학교', '부산')
on conflict do nothing;
