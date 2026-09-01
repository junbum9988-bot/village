/**
 * 우리 반 마을 꾸미기 - 진입점 스크립트
 *
 * 지금은 프로젝트 기본 구조만 잡아둔 단계입니다.
 * 실제 기능(맵 렌더링, 아이템 배치, 저장/불러오기, Supabase 연동 등)은
 * 이후 단계에서 이 파일 또는 별도 모듈 파일로 나누어 구현합니다.
 *
 * 앞으로 예상되는 모듈 구성 (예시):
 *   js/main.js        - 앱 초기화 및 화면 전환
 *   js/config.js       - 학생 수, 타일 크기 등 상수 정의
 *   js/room.js          - 학생 개인 공간(방) 렌더링/편집 로직
 *   js/village.js        - 전체 마을(다른 학생 공간 탐험) 로직
 *   js/items.js           - 아이템 팔레트, 배치/드래그 로직
 *   js/storage.js          - 로컬 저장 및 Supabase 연동
 */

// 전체 학생 수 (assets/students/01 ~ 18 폴더와 대응)
const STUDENT_COUNT = 18;

document.addEventListener("DOMContentLoaded", () => {
  console.log("[village-game] 초기화 준비 완료 (기본 구조 단계)");

  const btnMyRoom = document.getElementById("btn-my-room");
  const btnExplore = document.getElementById("btn-explore");

  // 추후 화면 전환 로직 연결 예정
  btnMyRoom?.addEventListener("click", () => {
    console.log("[village-game] 내 방 꾸미기 화면 전환 (미구현)");
  });

  btnExplore?.addEventListener("click", () => {
    console.log("[village-game] 마을 탐험하기 화면 전환 (미구현)");
  });
});
