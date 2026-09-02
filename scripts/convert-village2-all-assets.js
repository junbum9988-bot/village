#!/usr/bin/env node
/**
 * 두 번째 마을(village-2)의 관리자(B00) + 학생(B01~B18) 이미지를 한 번에 변환한다
 * (convert:village2:admin과 convert:village2:students를 순서대로 실행). 관리자 쪽 변환에서
 * 오류가 나도 `&&`로 스크립트를 이어붙이지 않고 이 파일에서 직접 두 단계를 순서대로 호출하기
 * 때문에, 한쪽이 실패해도 다른 쪽은 계속 실행된다 (첫 번째 마을의 convert-all-assets.js와 동일한
 * 구조).
 *
 * 실행: npm run convert:village2:all
 */

const adminAssets = require("./convert-village2-admin-assets");
const studentsAssets = require("./convert-village2-students-assets");

async function runPhase(label, run) {
  console.log(`=== ${label} ===`);
  try {
    await run();
  } catch (err) {
    console.error(`${label} 처리 중 예상치 못한 오류:`, err);
    process.exitCode = 1;
  }
  console.log("");
}

async function main() {
  await runPhase("village-2 관리자 이미지 변환 (convert:village2:admin)", () => adminAssets.main());
  await runPhase("village-2 학생 이미지 변환 (convert:village2:students)", () => studentsAssets.main());
}

main();
