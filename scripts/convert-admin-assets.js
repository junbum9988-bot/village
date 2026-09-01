#!/usr/bin/env node
/**
 * assets/admin/original 폴더의 이미지(PNG/JPG/JPEG/GIF)를 WebP로 일괄 변환해
 * assets/admin/items 폴더에 같은 파일명(.webp)으로 저장하는 스크립트.
 *
 * - 원본 파일(assets/admin/original)은 읽기만 하고 절대 수정/삭제하지 않는다.
 * - GIF는 애니메이션을 유지한 Animated WebP로 변환한다 (프레임이 1장뿐이면 자연히
 *   정지 WebP가 된다).
 * - 이미 같은 이름의 .webp 파일이 items 폴더에 있으면 덮어쓴다.
 *
 * 실행: npm run convert:admin  (내부적으로 node scripts/convert-admin-assets.js 실행)
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "assets", "admin", "original");
const OUTPUT_DIR = path.join(ROOT_DIR, "assets", "admin", "items");

// 변환 대상 확장자 (대소문자 구분 없이 비교)
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif"]);

// 정지 이미지(png/jpg/jpeg)용 WebP 품질. 웹게임 아이템 그림 용도로 충분히 선명하면서
// 용량은 크지 않도록 82로 설정 (sharp 기본값 80보다 살짝 높임).
const STATIC_QUALITY = 82;

// 애니메이션(gif -> animated webp)용 품질. 프레임이 여러 장 쌓이면 용량이 금방 커지므로
// 정지 이미지보다 살짝 낮춰서 75로 설정.
const ANIMATED_QUALITY = 75;

// 인코딩 노력(0~6). 높을수록 용량은 줄지만 변환 시간이 늘어난다. sharp 기본값(4)이
// 품질/속도 균형이 적당해 그대로 사용한다.
const ENCODE_EFFORT = 4;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

async function convertFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, path.extname(fileName));
  const sourcePath = path.join(SOURCE_DIR, fileName);
  const outputPath = path.join(OUTPUT_DIR, `${baseName}.webp`);

  const isGif = ext === ".gif";

  // GIF는 animated: true로 읽어야 모든 프레임을 가져와서, 출력할 때도 애니메이션이
  // 유지된 WebP로 저장된다. sourcePath는 읽기 전용으로만 사용하고 절대 다시 쓰지 않는다.
  const image = isGif ? sharp(sourcePath, { animated: true }) : sharp(sourcePath);

  await image
    .webp({
      quality: isGif ? ANIMATED_QUALITY : STATIC_QUALITY,
      effort: ENCODE_EFFORT,
    })
    .toFile(outputPath); // 출력은 항상 assets/admin/items 쪽에만 저장 (덮어쓰기 허용)

  const { size } = fs.statSync(outputPath);
  return { fileName, outputName: path.basename(outputPath), size, animated: isGif };
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`원본 폴더가 없습니다: ${SOURCE_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const entries = fs.readdirSync(SOURCE_DIR, { withFileTypes: true });
  const targetFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort();

  if (targetFiles.length === 0) {
    console.log(`변환할 이미지가 없습니다 (${SOURCE_DIR} 안에 PNG/JPG/JPEG/GIF 없음).`);
    return;
  }

  console.log(`변환 대상 ${targetFiles.length}개 파일 발견 (${SOURCE_DIR})`);

  const results = [];
  const failures = [];

  for (const fileName of targetFiles) {
    try {
      const result = await convertFile(fileName);
      results.push(result);
      const tag = result.animated ? "animated webp" : "webp";
      console.log(`  ✔ ${fileName} -> ${result.outputName} (${tag}, ${formatBytes(result.size)})`);
    } catch (err) {
      failures.push({ fileName, error: err });
      console.error(`  ✘ ${fileName} 변환 실패: ${err.message}`);
    }
  }

  console.log("");
  console.log(`완료: ${results.length}개 성공, ${failures.length}개 실패`);
  console.log(`출력 폴더: ${OUTPUT_DIR}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("예상치 못한 오류로 변환을 중단합니다:", err);
  process.exit(1);
});
