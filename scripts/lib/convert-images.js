/**
 * 이미지 → WebP 변환 공통 로직.
 *
 * scripts/convert-admin-assets.js(관리자 1명)와 scripts/convert-students-assets.js
 * (학생 01~18)가 이 모듈을 함께 사용한다. "폴더 하나 안의 이미지를 다른 폴더에
 * WebP로 변환한다"는 핵심 동작만 여기 있고, "어떤 폴더를 대상으로 할지"는
 * 각 스크립트가 정한다.
 *
 * - 원본 파일은 읽기만 하고 절대 수정/삭제하지 않는다.
 * - GIF는 애니메이션(프레임/딜레이/반복 횟수)을 유지한 Animated WebP로 변환한다
 *   (프레임이 1장뿐이면 자연히 정지 WebP가 된다).
 * - 이미 같은 이름의 .webp가 있으면 덮어쓴다.
 * - 파일 하나가 실패해도 예외를 던지지 않고 failures 배열에 담아 계속 진행한다.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

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

// items.json을 자동 생성할 때, 게임 방(900x600) 안에서 아이템 하나의 기본 표시 크기가
// 화면을 가득 채우지 않도록 두는 상한(px). js/main.js의 DEFAULT_PERSONAL_ITEM_SIZE(96)와
// 값을 맞춰, "items.json에 w/h가 없을 때 게임이 쓰는 기본값"과 "자동 생성 시 실제로 써 넣는
// 값"이 어긋나지 않게 한다.
const MAX_ITEM_DISPLAY_SIZE = 96;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * dir 안의 지원 확장자(png/jpg/jpeg/gif, 대소문자 무관) 파일 이름 목록을 돌려준다.
 * dir 자체가 없으면 null (호출한 쪽에서 "폴더 없음"과 "폴더는 있는데 빈 목록"을
 * 구분해서 처리할 수 있도록).
 */
function listConvertibleFiles(dir) {
  if (!fs.existsSync(dir)) return null;

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort();
}

async function convertOneFile(sourceDir, outputDir, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, path.extname(fileName));
  const sourcePath = path.join(sourceDir, fileName);
  const outputPath = path.join(outputDir, `${baseName}.webp`);

  const isGif = ext === ".gif";

  // GIF는 animated: true로 읽어야 모든 프레임을 가져와서, 출력할 때도 애니메이션이
  // 유지된 WebP로 저장된다. sourcePath는 읽기 전용으로만 사용하고 절대 다시 쓰지 않는다.
  const image = isGif ? sharp(sourcePath, { animated: true }) : sharp(sourcePath);

  await image
    .webp({
      quality: isGif ? ANIMATED_QUALITY : STATIC_QUALITY,
      effort: ENCODE_EFFORT,
    })
    .toFile(outputPath); // 출력은 항상 outputDir 쪽에만 저장 (덮어쓰기 허용)

  const { size } = fs.statSync(outputPath);

  // items.json을 자동 생성할 때 원본 비율을 유지한 기본 표시 크기를 계산할 수 있도록,
  // 변환된 WebP 자체의 프레임 크기(정지 이미지면 width/height, 애니메이션이면
  // width/pageHeight)를 함께 읽어둔다. 실패해도 변환 자체는 이미 끝났으니 무시하고 넘어간다.
  let width = null;
  let height = null;
  try {
    const metadata = await sharp(outputPath, { animated: isGif }).metadata();
    width = metadata.width || null;
    height = (isGif ? metadata.pageHeight : metadata.height) || metadata.height || null;
  } catch (err) {
    // 크기 정보를 못 읽어도 변환 결과 자체엔 영향 없음 (buildItemCatalogEntries가 기본값으로 대체)
  }

  return {
    fileName,
    baseName,
    outputName: path.basename(outputPath),
    outputPath,
    size,
    animated: isGif,
    width,
    height,
  };
}

/**
 * sourceDir 안의 지원 확장자 파일을 전부 찾아 outputDir에 변환해 저장한다.
 * outputDir이 없으면 만든다. 변환 진행 상황을 콘솔에 출력하고 { results, failures }를
 * 반환한다 — 파일 하나가 실패해도 나머지는 계속 진행하고, 실패 목록은 failures에 담긴다.
 *
 * sourceDir 자체가 없거나 대상 파일이 하나도 없을 때는 아무것도 하지 않고
 * { results: [], failures: [] }를 그대로 반환한다 (호출한 쪽에서 listConvertibleFiles로
 * 미리 상황을 구분해 안내 메시지를 낼 수 있다).
 */
async function convertImagesInDir(sourceDir, outputDir, { logPrefix = "" } = {}) {
  const results = [];
  const failures = [];

  const targetFiles = listConvertibleFiles(sourceDir);
  if (!targetFiles || targetFiles.length === 0) {
    return { results, failures };
  }

  fs.mkdirSync(outputDir, { recursive: true });

  for (const fileName of targetFiles) {
    try {
      const result = await convertOneFile(sourceDir, outputDir, fileName);
      results.push(result);
      const tag = result.animated ? "animated webp" : "webp";
      console.log(`${logPrefix}✔ ${fileName} -> ${result.outputName} (${tag}, ${formatBytes(result.size)})`);
    } catch (err) {
      failures.push({ fileName, error: err });
      console.error(`${logPrefix}✘ ${fileName} 변환 실패: ${err.message}`);
    }
  }

  return { results, failures };
}

// id에 그대로 쓰기 애매한 문자(공백/특수문자)를 하이픈으로 정리한다. 한글 등 유니코드 글자는
// 그대로 남겨서, "테스트나무" 같은 한글 파일명도 알아볼 수 있는 id가 되게 한다
// (완전히 로마자로 바꾸는 번역은 하지 않는다 - 그건 이 스크립트의 책임이 아니다).
function slugifyBaseName(baseName) {
  const slug = String(baseName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}

// 원본 픽셀 크기(width/height)를 바탕으로, 게임 방을 가득 채우지 않도록 MAX_ITEM_DISPLAY_SIZE
// 안에 들어가는 기본 표시 크기를 비율을 유지한 채 계산한다. 이미 상한보다 작은 이미지는
// 확대하지 않고 원본 크기 그대로 쓴다.
function computeDisplaySize(width, height, maxSize = MAX_ITEM_DISPLAY_SIZE) {
  if (!width || !height) {
    return { w: maxSize, h: maxSize };
  }

  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    w: Math.max(16, Math.round(width * scale)),
    h: Math.max(16, Math.round(height * scale)),
  };
}

// filePath에 있는 기존 items.json을 읽어 배열로 돌려준다. Supabase에 이미 이 id들이 저장돼
// 있을 수 있으므로 여기서 실패한다고 예외를 던지면 안 된다 - 파일이 없으면(처음 변환) 빈 배열,
// 내용이 배열이 아니거나 JSON이 깨졌으면 경고만 남기고 역시 빈 배열로 취급해 "새로 만드는 것"과
// 같은 경로를 타게 한다 (기존 id를 하나도 재사용 못 할 뿐, 변환 자체는 계속 진행된다).
function readPreviousItemsJson(filePath) {
  if (!fs.existsSync(filePath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
      console.error(`${filePath}의 내용이 배열이 아니라 기존 id를 재사용하지 못합니다.`);
      return [];
    }
    return parsed;
  } catch (err) {
    console.error(`${filePath}를 읽지 못해 기존 id를 재사용하지 못합니다:`, err.message);
    return [];
  }
}

/**
 * convertImagesInDir()가 돌려준 results를 items.json 항목 배열로 변환한다.
 *
 * id 안정성: Supabase에 저장된 placed_items.item_id가 이 id를 참조하게 될 것이므로, 한 번
 * 발급된 id는 재변환해도 최대한 그대로 유지한다. previousEntries(같은 학생의 기존 items.json
 * 내용)를 넘기면, "결과물 WebP 파일명이 기존 항목의 image 파일명과 같은 경우"를 같은 아이템으로
 * 보고 기존 id를 그대로 재사용한다 - 파일명이 안 바뀌는 한 재변환/재정렬/파일 추가삭제와
 * 무관하게 id가 고정된다. 매번 새 UUID를 찍어내는 방식은 쓰지 않는다.
 *
 * - id: 기존 항목과 매칭되면 그 id를 재사용. 새 아이템이면 `${idPrefix}-${파일명 슬러그}`로 생성.
 *   같은 슬러그가 이미 쓰이고 있으면(지금 배치분 + 과거 items.json에 남아있던 id 전부 포함해서)
 *   -2, -3 ... 을 붙여 절대 겹치지 않게 만든다.
 * - name: 확장자를 뗀 원본 파일명 그대로 (재변환 시에도 항상 최신 파일명으로 갱신)
 * - image: `${imageDirPath}/${출력 파일명}`
 * - animated: 원본이 GIF였는지 여부
 * - w/h: computeDisplaySize()로 계산한 기본 표시 크기
 */
function buildItemCatalogEntries(results, { idPrefix, imageDirPath, previousEntries = [] }) {
  // 기존 항목을 "결과물 파일명"으로 찾아볼 수 있게 색인해둔다 (같은 파일명 = 같은 아이템으로 간주).
  const previousByOutputName = new Map();
  for (const entry of previousEntries) {
    if (!entry || typeof entry.id !== "string" || typeof entry.image !== "string") continue;
    const outputName = path.basename(entry.image);
    if (!previousByOutputName.has(outputName)) {
      previousByOutputName.set(outputName, entry);
    }
  }

  // 지금 이 학생에게 한 번이라도 발급됐던 id는 전부 "이미 쓰인 id"로 취급한다. 재사용되는 id는
  // 물론이고, 지금은 매칭되는 파일이 없어 안 쓰이는(예: 파일이 지워진) 옛 id까지 예약해둬야
  // 새 아이템이 우연히 예전 id와 같은 문자열을 다시 받는 걸 막을 수 있다 (Supabase에는 그
  // id로 이미 예전 아이템이 저장돼 있을 수 있으므로).
  const usedIds = new Set(
    previousEntries.filter((entry) => entry && typeof entry.id === "string").map((entry) => entry.id)
  );

  return results.map((result) => {
    const matchedPrevious = previousByOutputName.get(result.outputName);

    let id;
    if (matchedPrevious) {
      id = matchedPrevious.id; // 같은 파일명 -> 같은 아이템으로 보고 기존 id 그대로 재사용
    } else {
      const baseSlug = slugifyBaseName(result.baseName);
      id = `${idPrefix}-${baseSlug}`;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${idPrefix}-${baseSlug}-${suffix}`;
        suffix += 1;
      }
    }
    usedIds.add(id);

    const { w, h } = computeDisplaySize(result.width, result.height);

    return {
      id,
      name: result.baseName,
      image: `${imageDirPath}/${result.outputName}`,
      animated: result.animated,
      w,
      h,
    };
  });
}

function writeItemsJson(filePath, entries) {
  fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  STATIC_QUALITY,
  ANIMATED_QUALITY,
  ENCODE_EFFORT,
  MAX_ITEM_DISPLAY_SIZE,
  formatBytes,
  listConvertibleFiles,
  convertImagesInDir,
  slugifyBaseName,
  computeDisplaySize,
  readPreviousItemsJson,
  buildItemCatalogEntries,
  writeItemsJson,
};
