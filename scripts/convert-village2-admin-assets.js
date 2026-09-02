#!/usr/bin/env node
/**
 * assets/village2/admin/original 폴더의 이미지(PNG/JPG/JPEG/GIF)를 WebP로 일괄 변환해
 * assets/village2/admin/items 폴더에 같은 파일명(.webp)으로 저장하는 스크립트.
 *
 * 두 번째 마을(village-2)의 관리자(B00) 전용 버전이다 - 폴더만 assets/admin 대신
 * assets/village2/admin을 본다는 점만 다르고, 그 외 동작은 scripts/convert-admin-assets.js와
 * 완전히 같다 (assets/village2/README.md 참고).
 *
 * - 원본 파일(assets/village2/admin/original)은 읽기만 하고 절대 수정/삭제하지 않는다.
 * - GIF는 애니메이션을 유지한 Animated WebP로 변환한다 (프레임이 1장뿐이면 자연히
 *   정지 WebP가 된다).
 * - 이미 같은 이름의 .webp 파일이 items 폴더에 있으면 덮어쓴다.
 *
 * 실제 변환 로직은 scripts/lib/convert-images.js에 있다 (첫 번째 마을 스크립트들과 공유).
 * items.json은 만들지 않는다 - 관리자 items.json은 이름/크기를 수작업으로 정리해 관리하는
 * 파일이라 자동 생성 대상이 아니다 (첫 번째 마을 관리자와 동일한 방침).
 *
 * 실행: npm run convert:village2:admin
 */

const path = require("path");
const { listConvertibleFiles, convertImagesInDir } = require("./lib/convert-images");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "assets", "village2", "admin", "original");
const OUTPUT_DIR = path.join(ROOT_DIR, "assets", "village2", "admin", "items");

async function main() {
  const targetFiles = listConvertibleFiles(SOURCE_DIR);

  if (targetFiles === null) {
    console.error(`원본 폴더가 없습니다: ${SOURCE_DIR}`);
    process.exitCode = 1;
    return;
  }

  if (targetFiles.length === 0) {
    console.log(`변환할 이미지가 없습니다 (${SOURCE_DIR} 안에 PNG/JPG/JPEG/GIF 없음).`);
    return;
  }

  console.log(`변환 대상 ${targetFiles.length}개 파일 발견 (${SOURCE_DIR})`);

  const { results, failures } = await convertImagesInDir(SOURCE_DIR, OUTPUT_DIR, { logPrefix: "  " });

  console.log("");
  console.log(`완료: ${results.length}개 성공, ${failures.length}개 실패`);
  console.log(`출력 폴더: ${OUTPUT_DIR}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

module.exports = { main };

// `node scripts/convert-village2-admin-assets.js`로 직접 실행했을 때만 바로 돈다.
// convert-village2-all-assets.js처럼 다른 스크립트가 require()해서 main()을 직접 호출하는
// 경우에는 여기서 다시 실행되지 않는다.
if (require.main === module) {
  main().catch((err) => {
    console.error("예상치 못한 오류로 변환을 중단합니다:", err);
    process.exitCode = 1;
  });
}
