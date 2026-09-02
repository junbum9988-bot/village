/**
 * ⚠️ 테스트용 임시 계정 데이터입니다. 실제 운영 비밀번호가 아닙니다. ⚠️
 *
 * 아래 PIN은 전부 로그인 "화면 흐름"만 확인하기 위해 하드코딩해 둔 더미 값
 * (1000, 1001, 1002 ... 처럼 순서대로 매긴 값)이며, 실제 학생이 쓰는
 * 비밀번호가 아닙니다. 이 파일은 GitHub 공개 저장소에 그대로 커밋되므로,
 * 실제 서비스에서 쓰는 진짜 비밀번호/PIN은 절대 여기에 적지 마세요.
 *
 * Supabase Auth/DB를 연결하기 전까지, 로그인 화면 흐름만 확인하기 위한
 * 하드코딩된 임시 계정 목록입니다. 이 파일에서만 계정 정보를 관리합니다.
 *
 * - code    : 접속 코드 (로그인 화면에 입력). 모든 계정을 통틀어 유일해야 한다 -
 *             마을이 여러 개여도 로그인 화면은 하나뿐이라, 서로 다른 마을 계정이라도
 *             같은 코드를 쓰면 안 된다. (그래서 마을마다 접두사를 다르게 뒀다: T/S = 첫
 *             번째 마을, B = 두 번째 마을)
 * - name    : 학생 이름. js/main.js의 해당 village LAYOUT에 있는 이름과 정확히 같아야
 *             해당 학생의 공간을 찾아 그 자리에서 시작할 수 있습니다.
 * - pin     : 4자리 테스트용 더미 PIN (실제 비밀번호 아님 - 필요하면 이 값만 바꾸면 됩니다)
 * - village : 이 계정이 속한 마을 id. js/main.js의 VILLAGES 객체 키와 정확히 같아야 한다.
 *             다른 마을 계정과 배치 아이템 데이터가 절대 섞이지 않도록, 로그인하면 이 값
 *             기준으로 Supabase placed_items를 걸러서 불러오고 실시간 구독한다.
 *
 * 실 서비스로 전환할 때는 이 파일 전체(계정 목록 + findAccount)를 삭제하고
 * Supabase Auth 쪽 인증으로 완전히 교체해야 합니다. PIN을 프론트엔드 코드에
 * 하드코딩하는 이 방식은 테스트 전용이며 실 서비스에 그대로 쓰면 안 됩니다.
 */
const ACCOUNTS = [
  // ---------------------------------------------------------------
  // 첫 번째 마을 (village-1) - 기존 계정. 절대 코드/이름/PIN을 바꾸지 않는다.
  // ---------------------------------------------------------------
  { code: "T00", name: "준범", pin: "1000", village: "village-1" },
  { code: "S01", name: "강민", pin: "1001", village: "village-1" },
  { code: "S02", name: "동국", pin: "1002", village: "village-1" },
  { code: "S03", name: "라임", pin: "1003", village: "village-1" },
  { code: "S04", name: "태현", pin: "1004", village: "village-1" },
  { code: "S05", name: "서준", pin: "1005", village: "village-1" },
  { code: "S06", name: "민호", pin: "1006", village: "village-1" },
  { code: "S07", name: "민서", pin: "1007", village: "village-1" },
  { code: "S08", name: "준석", pin: "1008", village: "village-1" },
  { code: "S09", name: "아영", pin: "1009", village: "village-1" },
  { code: "S10", name: "지원", pin: "1010", village: "village-1" },
  { code: "S11", name: "서윤", pin: "1011", village: "village-1" },
  { code: "S12", name: "서율", pin: "1012", village: "village-1" },
  { code: "S13", name: "용욱", pin: "1013", village: "village-1" },
  { code: "S14", name: "명준", pin: "1014", village: "village-1" },
  { code: "S15", name: "예설", pin: "1015", village: "village-1" },
  { code: "S16", name: "하늘", pin: "1016", village: "village-1" },
  { code: "S17", name: "현우", pin: "1017", village: "village-1" },
  { code: "S18", name: "혜윤", pin: "1018", village: "village-1" },

  // ---------------------------------------------------------------
  // 두 번째 마을 (village-2) - 테스트용 임시 계정. 실제 학생 명단이 아니라
  // 자리표시용 이름("학생1" ~ "학생18")을 쓴다. js/main.js VILLAGES["village-2"].layout과
  // 이름이 정확히 일치해야 한다.
  // ---------------------------------------------------------------
  { code: "B00", name: "관리자", pin: "2000", village: "village-2" },
  { code: "B01", name: "학생1", pin: "2001", village: "village-2" },
  { code: "B02", name: "학생2", pin: "2002", village: "village-2" },
  { code: "B03", name: "학생3", pin: "2003", village: "village-2" },
  { code: "B04", name: "학생4", pin: "2004", village: "village-2" },
  { code: "B05", name: "학생5", pin: "2005", village: "village-2" },
  { code: "B06", name: "학생6", pin: "2006", village: "village-2" },
  { code: "B07", name: "학생7", pin: "2007", village: "village-2" },
  { code: "B08", name: "학생8", pin: "2008", village: "village-2" },
  { code: "B09", name: "학생9", pin: "2009", village: "village-2" },
  { code: "B10", name: "학생10", pin: "2010", village: "village-2" },
  { code: "B11", name: "학생11", pin: "2011", village: "village-2" },
  { code: "B12", name: "학생12", pin: "2012", village: "village-2" },
  { code: "B13", name: "학생13", pin: "2013", village: "village-2" },
  { code: "B14", name: "학생14", pin: "2014", village: "village-2" },
  { code: "B15", name: "학생15", pin: "2015", village: "village-2" },
  { code: "B16", name: "학생16", pin: "2016", village: "village-2" },
  { code: "B17", name: "학생17", pin: "2017", village: "village-2" },
  { code: "B18", name: "학생18", pin: "2018", village: "village-2" },
];

// 접속 코드로 빠르게 찾기 위한 조회용 맵 (대문자 기준)
const ACCOUNTS_BY_CODE = Object.fromEntries(
  ACCOUNTS.map((account) => [account.code.toUpperCase(), account])
);

/**
 * 접속 코드 + PIN이 맞는 계정을 찾아 반환한다. 없거나 틀리면 null.
 * 코드는 대소문자를 구분하지 않고, 앞뒤 공백은 무시한다.
 */
function findAccount(code, pin) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const normalizedPin = String(pin || "").trim();

  const account = ACCOUNTS_BY_CODE[normalizedCode];
  if (!account) return null;
  if (account.pin !== normalizedPin) return null;

  return account;
}
