/**
 * 계정 데이터 (프로토타입용 임시 데이터)
 *
 * Supabase Auth/DB를 연결하기 전까지, 로그인 화면 흐름만 확인하기 위한
 * 하드코딩된 임시 계정 목록입니다. 이 파일에서만 계정 정보를 관리합니다.
 *
 * - code : 접속 코드 (로그인 화면에 입력)
 * - name : 학생 이름 (js/main.js의 마을 배치(LAYOUT)에 있는 이름과 정확히 같아야
 *          해당 학생의 공간을 찾아 그 자리에서 시작할 수 있습니다)
 * - pin  : 4자리 PIN (테스트용 임시 값 - 필요하면 이 값만 바꾸면 됩니다)
 *
 * 실제 서비스에서는 이 데이터를 Supabase 쪽 인증/DB로 옮기고,
 * 여기 있는 findAccount()만 그에 맞게 교체하면 됩니다.
 */
const ACCOUNTS = [
  { code: "T00", name: "준범", pin: "1000" },
  { code: "S01", name: "강민", pin: "1001" },
  { code: "S02", name: "동국", pin: "1002" },
  { code: "S03", name: "라임", pin: "1003" },
  { code: "S04", name: "태현", pin: "1004" },
  { code: "S05", name: "서준", pin: "1005" },
  { code: "S06", name: "민호", pin: "1006" },
  { code: "S07", name: "민서", pin: "1007" },
  { code: "S08", name: "준석", pin: "1008" },
  { code: "S09", name: "아영", pin: "1009" },
  { code: "S10", name: "지원", pin: "1010" },
  { code: "S11", name: "서윤", pin: "1011" },
  { code: "S12", name: "서율", pin: "1012" },
  { code: "S13", name: "용욱", pin: "1013" },
  { code: "S14", name: "명준", pin: "1014" },
  { code: "S15", name: "예설", pin: "1015" },
  { code: "S16", name: "하늘", pin: "1016" },
  { code: "S17", name: "현우", pin: "1017" },
  { code: "S18", name: "혜윤", pin: "1018" },
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
