#!/usr/bin/env node
/**
 * 관리자 + 학생 01~18 이미지를 한 번에 변환한다 (convert:admin과 convert:students를
 * 순서대로 실행). 관리자 쪽 변환에서 오류가 나도 `&&`로 스크립트를 이어붙이지 않고 이 파일에서
 * 직접 두 단계를 순서대로 호출하기 때문에, 한쪽이 실패해도 다른 쪽은 계속 실행된다.
 *
 * 실행: npm run convert:all
 */

const adminAssets = require("./convert-admin-assets");
const studentsAssets = require("./convert-students-assets");

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
  await runPhase("관리자 이미지 변환 (convert:admin)", () => adminAssets.main());
  await runPhase("학생 이미지 변환 (convert:students)", () => studentsAssets.main());
}

main();
