#!/usr/bin/env node
/**
 * assets/students/<두 자리 번호>/original 폴더의 이미지(PNG/JPG/JPEG/GIF)를 WebP로 일괄
 * 변환해 같은 학생의 assets/students/<번호>/items 폴더에 저장하고, 그 결과를 바탕으로
 * assets/students/<번호>/items/items.json을 자동으로 만들거나 덮어쓴다.
 *
 * - 학생 번호(01~18)를 하나하나 하드코딩하지 않는다. assets/students 폴더 밑에서
 *   이름이 두 자리 숫자인 폴더를 전부 찾아 그 목록을 그대로 순회한다 - 학생이 늘거나 줄어도
 *   이 스크립트를 고칠 필요가 없다.
 * - original 폴더가 아예 없거나 비어 있는 학생은 오류 없이 건너뛴다.
 * - 원본 파일(original)은 읽기만 하고 절대 수정/삭제하지 않는다.
 * - GIF는 애니메이션을 유지한 Animated WebP로 변환한다.
 * - 이미 같은 이름의 .webp가 items 폴더에 있으면 덮어쓴다.
 * - 학생 한 명, 파일 하나가 실패해도 전체 작업은 멈추지 않고 나머지 학생/파일을 계속 처리한다.
 *
 * 실제 변환 로직(파일 하나 변환, items.json 항목 만들기)은 scripts/lib/convert-images.js에
 * 있다 (관리자용 변환 스크립트인 scripts/convert-admin-assets.js와 공유).
 *
 * 실행: npm run convert:students
 */

const fs = require("fs");
const path = require("path");
const {
  listConvertibleFiles,
  convertImagesInDir,
  readPreviousItemsJson,
  buildItemCatalogEntries,
  writeItemsJson,
} = require("./lib/convert-images");

const ROOT_DIR = path.join(__dirname, "..");
const STUDENTS_DIR = path.join(ROOT_DIR, "assets", "students");

// assets/students 밑에서 이름이 "01".."18"처럼 정확히 두 자리 숫자인 폴더만 학생 폴더로
// 인식한다. js/main.js의 getPersonalItemsPath()가 접속 코드(S01 등)에서 뽑아낸 번호를
// padStart(2, "0")로 두 자리로 맞추는 것과 같은 규칙이라, 두 로직이 항상 같은 경로를 가리킨다.
function listStudentNumbers() {
  if (!fs.existsSync(STUDENTS_DIR)) return [];

  return fs
    .readdirSync(STUDENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function convertStudent(studentNumber) {
  const sourceDir = path.join(STUDENTS_DIR, studentNumber, "original");
  const outputDir = path.join(STUDENTS_DIR, studentNumber, "items");
  const itemsJsonPath = path.join(outputDir, "items.json");
  const label = `S${studentNumber}`;

  const targetFiles = listConvertibleFiles(sourceDir);

  if (targetFiles === null) {
    console.log(`  [${label}] original 폴더가 없어 건너뜁니다.`);
    return { results: [], failures: [] };
  }

  if (targetFiles.length === 0) {
    console.log(`  [${label}] 변환할 이미지가 없어 건너뜁니다 (${sourceDir}).`);
    return { results: [], failures: [] };
  }

  console.log(`  [${label}] 대상 ${targetFiles.length}개 파일 발견 (${sourceDir})`);

  const { results, failures } = await convertImagesInDir(sourceDir, outputDir, { logPrefix: "    " });

  // 변환에 성공한 파일만으로 items.json을 새로 만든다 (실패한 파일은 자연히 빠진다).
  // 성공한 파일이 하나도 없으면(전부 실패) 굳이 빈 items.json으로 덮어쓰지 않는다.
  if (results.length > 0) {
    // 기존 items.json을 먼저 읽어서 넘긴다 - buildItemCatalogEntries가 "결과물 파일명이 같으면
    // 같은 아이템"으로 보고 예전 id를 그대로 재사용하므로, Supabase에 이미 저장됐을 수 있는
    // item_id가 재변환한다고 바뀌지 않는다.
    const previousEntries = readPreviousItemsJson(itemsJsonPath);

    const entries = buildItemCatalogEntries(results, {
      idPrefix: `s${studentNumber}`,
      imageDirPath: `assets/students/${studentNumber}/items`,
      previousEntries,
    });
    writeItemsJson(itemsJsonPath, entries);
    console.log(`    -> items.json 갱신 (${entries.length}개 아이템)`);
  }

  return { results, failures };
}

async function main() {
  const studentNumbers = listStudentNumbers();

  if (studentNumbers.length === 0) {
    console.log(`학생 폴더를 찾을 수 없습니다 (${STUDENTS_DIR}).`);
    return;
  }

  console.log(`학생 ${studentNumbers.length}명 처리 시작 (${STUDENTS_DIR})`);

  let totalSuccess = 0;
  let totalFailure = 0;

  for (const studentNumber of studentNumbers) {
    try {
      const { results, failures } = await convertStudent(studentNumber);
      totalSuccess += results.length;
      totalFailure += failures.length;
    } catch (err) {
      // convertStudent 안에서 예상 못 한 오류(권한 문제 등)가 나도 다른 학생 처리는 계속한다.
      console.error(`  [S${studentNumber}] 처리 중 예상치 못한 오류로 건너뜁니다:`, err.message);
      totalFailure += 1;
    }
  }

  console.log("");
  console.log(`완료: 총 ${totalSuccess}개 성공, ${totalFailure}개 실패 (학생 ${studentNumbers.length}명 확인)`);

  if (totalFailure > 0) {
    process.exitCode = 1;
  }
}

module.exports = { main };

// `node scripts/convert-students-assets.js`로 직접 실행했을 때만 바로 돈다. convert-all-assets.js처럼
// 다른 스크립트가 require()해서 main()을 직접 호출하는 경우에는 여기서 다시 실행되지 않는다.
if (require.main === module) {
  main().catch((err) => {
    console.error("예상치 못한 오류로 변환을 중단합니다:", err);
    process.exitCode = 1;
  });
}
