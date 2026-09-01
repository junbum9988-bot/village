/**
 * Supabase 프로젝트 연결 정보.
 *
 * 여기 있는 URL/publishableKey는 브라우저에 그대로 노출되는 "publishable"(구 anon) 키다.
 * service_role 키처럼 절대 공개하면 안 되는 비밀키가 아니라서 이 파일을 그대로 커밋해도 된다 -
 * 다만 이 키로 할 수 있는 조작 범위(현재는 RLS를 쓰지 않으므로 placed_items 테이블 조회/추가/
 * 수정/삭제 전체)가 이 값의 실질적인 노출 범위이기도 하다. 나중에 RLS를 도입하면 그에 맞춰
 * 다시 검토할 것.
 *
 * service_role 키는 여기에도, 다른 어떤 클라이언트 코드에도 절대 넣지 않는다 - 그 키는
 * 서버 전용이고 브라우저에 노출되는 순간 테이블을 무엇이든 할 수 있게 된다.
 *
 * 계정 데이터(js/accounts.js)와 같은 이유로 이 파일 하나에만 연결 정보를 모아둔다: 값이
 * 바뀌면 여기 하나만 고치면 된다. 실제 클라이언트 생성은 js/supabase-client.js가 담당한다.
 */
window.SUPABASE_CONFIG = {
  url: "https://zjuvrdwqrpdguvkcemku.supabase.co",
  publishableKey: "sb_publishable_Nw-YTMfedHKlMsHGWtQ0DA_cJTv2_5E",
};
