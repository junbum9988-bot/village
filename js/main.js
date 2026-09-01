/**
 * 우리 반 마을 꾸미기 - 프로토타입
 *
 * 로그인(임시 프론트엔드 계정)을 통과해야 마을에 들어갈 수 있고, 로그인한 학생의 공간에서
 * 시작한다. 마을 안에서는 걸어다니거나(WASD/방향키/화면 이동키), 전체 마을을 줌아웃해서
 * 구경하거나, 자기 공간에서는 아이템을 놓고 꾸밀 수 있다.
 * 계정 데이터는 js/accounts.js 에서만 관리한다 (이 파일은 로그인 "흐름"만 다룬다).
 *
 * 다루지 않는 것: Supabase Auth/RLS, 캐릭터 위치 동기화, 이미지 Storage 업로드.
 *
 * 구성
 *   - 맵 데이터 생성   : 방/통로/광장 데이터를 만들고 #world에 DOM으로 렌더링 (로그인과 무관, 한 번만 수행)
 *   - 입력 처리        : 방향키 / WASD / 화면 터치 방향키 입력 수집 (로그인 여부와 무관하게 항상 리스닝)
 *   - 게임 루프        : 로그인에 성공했을 때만 실행 (update → 이동/카메라, render → 화면 반영)
 *   - 전체 마을 보기    : 카메라를 줌아웃해 4x5 마을 전체를 보여주는 관람 전용 모드 (이동/조작 비활성)
 *   - 꾸미기 모드       : 자기 공간에서만 켤 수 있는 관람 전용 아님 모드. 이동은 멈추고 인벤토리에서
 *                        아이템을 골라 배치/이동/크기조절/삭제할 수 있다.
 *                        관리자(T00)와 학생(S01~S18) 계정은 각자 공통 아이템에 더해
 *                        assets/admin/items/items.json, assets/students/<번호>/items/items.json
 *                        에서 불러온 전용 아이템도 함께 보인다 (계정별 경로는 getPersonalItemsPath).
 *   - Supabase 연동    : 배치된 아이템(placedItems)을 Supabase의 placed_items 테이블에 저장하고,
 *                        페이지를 열면 전체를 한 번 불러와 렌더링한 뒤 Realtime으로 다른 접속자의
 *                        변경사항을 구독한다 (7-3절). 드래그 중간값/캐릭터 위치는 절대 보내지 않고,
 *                        "손을 놓는 순간"처럼 결과가 확정되는 시점에만 1회 INSERT/UPDATE/DELETE한다.
 *                        Supabase 연결이 안 되거나 요청이 실패해도 로컬 조작 자체는 계속 동작한다.
 *   - 로그인 흐름       : 접속 코드+PIN 검사, 성공 시 해당 학생 공간에서 게임 시작, 로그아웃 시 로그인 화면으로 복귀
 */

document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------
  // 1. 마을 크기 상수 (방 / 통로 크기는 여기서만 바꾸면 전체에 반영됨)
  // ---------------------------------------------------------
  const ROOM_W = 900; // 개인 공간 가로 크기 (px) - 화면보다 약간 크게
  const ROOM_H = 600; // 개인 공간 세로 크기 (px)
  const PATH_W = 160; // 공용 통로 너비 (px) - 방과 방 사이, 그리고 마을 바깥 둘레

  const COLS = 5;
  const ROWS = 4;

  const WORLD_W = PATH_W * (COLS + 1) + ROOM_W * COLS;
  const WORLD_H = PATH_W * (ROWS + 1) + ROOM_H * ROWS;

  // 학생 배치 (요구사항의 행/열 순서 그대로). 마지막 칸(4행 5열)은 광장.
  // 각 이름은 js/accounts.js의 계정 이름과 정확히 일치해야 로그인 시 해당 공간을 찾을 수 있다.
  const LAYOUT = [
    ["준범", "강민", "동국", "라임", "태현"],
    ["서준", "민호", "민서", "준석", "아영"],
    ["지원", "서윤", "서율", "용욱", "명준"],
    ["예설", "하늘", "현우", "혜윤", null], // null = 마을 광장
  ];

  const PLAYER_SPEED = 300; // px / sec
  const PLAYER_RADIUS = 18; // 월드 경계 충돌에 사용하는 반지름
  const CAMERA_TAU = 0.15; // 카메라가 목표 위치를 따라가는 부드러움 정도(초). 작을수록 빠르게 따라붙음.

  // ---------------------------------------------------------
  // 1-1. 꾸미기 아이템 카탈로그
  // ---------------------------------------------------------
  // w/h는 scale=1일 때 기본 표시 크기(px). thumb은 인벤토리 썸네일이자 배치된 아이템의 그림으로도 그대로 쓴다.
  //
  // BASE_ITEM_CATALOG: 모든 계정이 공통으로 쓰는 테스트 아이템 (1차 프로토타입용). 아직 삭제하지 않고 유지한다.
  // 계정별 전용 아이템(관리자/학생)은 여기에 하드코딩하지 않고, 계정별 JSON 카탈로그를 fetch로 불러와
  // ITEM_CATALOG_BY_ID / activeItemCatalog에 합쳐 넣는 방식으로 확장한다 (7-2-0절 loadPersonalItemCatalog 참고).
  const BASE_ITEM_CATALOG = [
    { id: "tree", name: "나무", thumb: "assets/common/items/tree.svg", w: 64, h: 64 },
    { id: "flower", name: "꽃", thumb: "assets/common/items/flower.svg", w: 48, h: 48 },
    { id: "bench", name: "벤치", thumb: "assets/common/items/bench.svg", w: 72, h: 48 },
    { id: "lamp", name: "가로등", thumb: "assets/common/items/lamp.svg", w: 40, h: 72 },
    { id: "fence", name: "울타리", thumb: "assets/common/items/fence.svg", w: 72, h: 40 },
  ];
  // 배치된 아이템(instance.itemId)을 그릴 때는 항상 이 맵 하나로 조회한다. 처음엔 공통 아이템만
  // 들어있고, 관리자 전용 아이템은 로그인 후 비동기로 불러와 이 맵에 추가된다(불변 const여도
  // 객체 내용 자체는 계속 채워 넣을 수 있다).
  const ITEM_CATALOG_BY_ID = Object.fromEntries(BASE_ITEM_CATALOG.map((item) => [item.id, item]));
  const ITEMS_PER_PAGE = 20; // 인벤토리 한 페이지 최대 개수

  // ---------------------------------------------------------
  // 2. 맵 데이터 생성 (로그인 여부와 무관하게 한 번만 만들어둔다)
  // ---------------------------------------------------------
  const worldEl = document.getElementById("world");
  worldEl.style.width = `${WORLD_W}px`;
  worldEl.style.height = `${WORLD_H}px`;

  /** @type {{row:number, col:number, x:number, y:number, w:number, h:number, name:string, isPlaza:boolean}[]} */
  const rooms = [];

  LAYOUT.forEach((rowNames, row) => {
    rowNames.forEach((name, col) => {
      const isPlaza = name === null;
      const x = PATH_W + col * (ROOM_W + PATH_W);
      const y = PATH_W + row * (ROOM_H + PATH_W);

      rooms.push({
        row,
        col,
        x,
        y,
        w: ROOM_W,
        h: ROOM_H,
        name: isPlaza ? "마을 광장" : name,
        isPlaza,
      });
    });
  });

  // 방/광장 바닥 + 표지판 렌더링
  const fragment = document.createDocumentFragment();

  rooms.forEach((room) => {
    const roomEl = document.createElement("div");
    roomEl.className = room.isPlaza ? "room plaza" : "room";
    roomEl.style.left = `${room.x}px`;
    roomEl.style.top = `${room.y}px`;
    roomEl.style.width = `${room.w}px`;
    roomEl.style.height = `${room.h}px`;
    fragment.appendChild(roomEl);

    // 표지판: 통로(아래쪽)를 향한 입구 쪽, 방 하단 중앙에 배치
    const signEl = document.createElement("div");
    signEl.className = "sign";
    signEl.style.left = `${room.x + room.w / 2}px`;
    signEl.style.top = `${room.y + room.h - 46}px`;

    const boardEl = document.createElement("div");
    boardEl.className = room.isPlaza ? "sign-board plaza-board" : "sign-board";
    boardEl.textContent = room.isPlaza ? "우리 반 마을 광장" : `${room.name}의 공간`;

    const postEl = document.createElement("div");
    postEl.className = "sign-post";

    signEl.appendChild(boardEl);
    signEl.appendChild(postEl);
    fragment.appendChild(signEl);
  });

  worldEl.appendChild(fragment);

  // 전체 마을 보기 전용 이름표. #world 안에 두면 줌아웃 배율만큼 글자도 같이 작아져
  // 안 보이게 되므로, 화면 배율의 영향을 받지 않는 #overview-labels(별도 레이어)에 만들어둔다.
  // 평소에는 컨테이너 자체가 숨겨져 있고, 전체 마을 보기에 들어갈 때만 위치를 계산해 배치한다.
  const overviewLabelsEl = document.getElementById("overview-labels");
  const overviewLabelFragment = document.createDocumentFragment();

  const roomLabels = rooms.map((room) => {
    const labelEl = document.createElement("div");
    labelEl.className = room.isPlaza ? "overview-label plaza" : "overview-label";
    labelEl.textContent = room.isPlaza ? "🏛 마을 광장" : room.name;
    overviewLabelFragment.appendChild(labelEl);
    return { room, el: labelEl };
  });

  overviewLabelsEl.appendChild(overviewLabelFragment);

  // ---------------------------------------------------------
  // 3. DOM 참조
  // ---------------------------------------------------------
  const stageEl = document.getElementById("game-stage");
  const playerEl = document.getElementById("player");
  const hudNameEl = document.getElementById("hud-name");
  const hudLocationEl = document.getElementById("hud-location");

  const loginScreenEl = document.getElementById("login-screen");
  const gameScreenEl = document.getElementById("game-screen");
  const loginFormEl = document.getElementById("login-form");
  const loginCodeEl = document.getElementById("login-code");
  const loginPinEl = document.getElementById("login-pin");
  const loginErrorEl = document.getElementById("login-error");
  const logoutBtnEl = document.getElementById("btn-logout");
  const overviewBtnEl = document.getElementById("btn-overview");
  const btnDecorateEl = document.getElementById("btn-decorate");
  const decorateStatusEl = document.getElementById("decorate-status");

  const sidePanelEl = document.getElementById("side-panel");
  const itemPaletteEl = document.getElementById("item-palette");
  const btnDecorateDoneEl = document.getElementById("btn-decorate-done");
  const selectionHintEl = document.getElementById("selection-hint");
  const selectionControlsEl = document.getElementById("selection-controls");
  const selectionNameEl = document.getElementById("selection-name");
  const btnItemBiggerEl = document.getElementById("btn-item-bigger");
  const btnItemSmallerEl = document.getElementById("btn-item-smaller");
  const btnItemForwardEl = document.getElementById("btn-item-forward");
  const btnItemBackwardEl = document.getElementById("btn-item-backward");
  const btnItemDeleteEl = document.getElementById("btn-item-delete");
  const btnPagePrevEl = document.getElementById("btn-page-prev");
  const btnPageNextEl = document.getElementById("btn-page-next");
  const pageIndicatorEl = document.getElementById("page-indicator");

  // ---------------------------------------------------------
  // 4. 플레이어 / 카메라 상태
  // ---------------------------------------------------------
  // 실제 시작 좌표는 로그인에 성공했을 때 placePlayerForAccount()가 채워 넣는다.
  const player = { x: 0, y: 0, facingLeft: false, moving: false };
  const camera = { x: 0, y: 0, scale: 1 }; // scale은 평소 1, 전체 마을 보기에서만 줄어든다.

  let currentAccount = null; // 로그인한 계정 (js/accounts.js의 항목). 로그인 전에는 null.

  // 전체 마을 보기(관람 전용) 상태. 켜져 있는 동안은 이동 입력을 전부 무시한다.
  let overviewMode = false;
  let savedCamera = null; // 돌아가기를 눌렀을 때 복원할, 전체 마을 보기 이전의 카메라 상태

  // decorateMode는 7-2절에서 선언되지만, 두 모드 모두 "이동 입력을 막는다"는 점이 같아서
  // 여기서 함께 판단할 수 있게 헬퍼로 묶어둔다. (함수 본문은 실제로 호출되는 시점에만 평가되므로
  // 아래쪽에서 let으로 선언되는 decorateMode를 미리 참조해도 문제없다.)
  function isMovementLocked() {
    return overviewMode || decorateMode;
  }

  function getClampedCamera(targetX, targetY) {
    const viewW = stageEl.clientWidth;
    const viewH = stageEl.clientHeight;

    const maxX = Math.max(0, WORLD_W - viewW);
    const maxY = Math.max(0, WORLD_H - viewH);

    return {
      x: Math.min(Math.max(targetX - viewW / 2, 0), maxX),
      y: Math.min(Math.max(targetY - viewH / 2, 0), maxY),
    };
  }

  // 전체 마을(4x5 + 통로)이 여백을 두고 화면 안에 전부 들어오도록 축소 배율과
  // 카메라 위치를 계산한다. (일반 카메라와 달리 scale이 1이 아닐 수 있음)
  function computeOverviewCamera() {
    const viewW = stageEl.clientWidth;
    const viewH = stageEl.clientHeight;
    const FIT_MARGIN = 0.9; // 화면 가장자리에 딱 붙지 않도록 10% 여백을 둔다.

    const scale = Math.min(viewW / WORLD_W, viewH / WORLD_H) * FIT_MARGIN;

    return {
      scale,
      x: WORLD_W / 2 - viewW / (2 * scale),
      y: WORLD_H / 2 - viewH / (2 * scale),
    };
  }

  // ---------------------------------------------------------
  // 5. 입력 처리 (방향키 + WASD) - 로그인 여부와 무관하게 항상 리스닝한다.
  // ---------------------------------------------------------
  // 눌려있는 방향을 "up" / "down" / "left" / "right" 로 정규화해서 관리한다.
  // e.code(물리적 키 위치)를 우선으로 보고, 없는 경우에는 e.key로도 인식한다.
  // (실제 키보드 입력은 항상 code가 채워지지만, 일부 자동화 도구 등 code가 비는 환경도 있어 보강함)
  //
  // 키보드 입력과 화면 이동키(터치) 입력은 반드시 서로 다른 Set에 저장한다.
  // 하나의 Set을 같이 썼다면, 두 입력이 같은 방향을 동시에 누르고 있다가
  // 한쪽만 손을 뗐을 때 방향 자체가 지워져서 다른 쪽 입력까지 같이 끊겨버리는 충돌이 생긴다.
  // (예: 화면 이동키로 오른쪽을 누른 채 키보드 오른쪽 화살표도 눌렀다 떼면, 화면 이동키를
  //  누르고 있는데도 멈춰버리는 문제) 최종 이동 방향은 getInputVector()에서 두 Set을 합쳐 계산한다.
  const keyboardPressed = new Set();
  const touchPressed = new Set();

  const CODE_TO_DIR = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    KeyW: "up",
    KeyS: "down",
    KeyA: "left",
    KeyD: "right",
  };

  const KEY_TO_DIR = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };

  function resolveDirection(e) {
    return CODE_TO_DIR[e.code] || KEY_TO_DIR[e.key.toLowerCase()] || null;
  }

  // 로그인 접속 코드/PIN 입력창처럼 글자를 직접 타이핑하는 요소에 포커스가 있을 때는
  // WASD/방향키를 이동 입력으로 가로채면 안 된다 (안 그러면 "S06" 같은 코드에 든
  // s/d조차 입력이 안 먹는 문제가 생긴다).
  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;

    const dir = resolveDirection(e);
    if (dir) {
      e.preventDefault(); // 방향키로 페이지가 스크롤되는 것 방지 (전체 마을 보기/꾸미기 중에도 동일)
      if (!isMovementLocked()) {
        keyboardPressed.add(dir);
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (isTypingTarget(e.target)) return;

    const dir = resolveDirection(e);
    if (dir) {
      keyboardPressed.delete(dir);
    }
  });

  // 창 포커스를 잃으면 눌린 키 상태를 초기화 (키가 눌린 채로 고정되는 버그 방지)
  window.addEventListener("blur", () => keyboardPressed.clear());

  function getInputVector() {
    let dx = 0;
    let dy = 0;

    const isPressed = (dir) => keyboardPressed.has(dir) || touchPressed.has(dir);

    if (isPressed("left")) dx -= 1;
    if (isPressed("right")) dx += 1;
    if (isPressed("up")) dy -= 1;
    if (isPressed("down")) dy += 1;

    if (dx !== 0 && dy !== 0) {
      const inv = Math.SQRT1_2; // 대각선 이동 속도 보정
      dx *= inv;
      dy *= inv;
    }

    return { dx, dy };
  }

  // ---------------------------------------------------------
  // 5-1. 화면 이동키 (모바일 / 태블릿 / 전자칠판용 터치 십자 방향키)
  // ---------------------------------------------------------
  // 키보드와는 별도의 touchPressed Set을 사용한다 (충돌 방지 이유는 위 5번 주석 참고).
  // Pointer Event를 사용해 마우스/터치/펜을 하나의 로직으로 통일하고,
  // 버튼별로 눌고 있는 pointerId를 추적해 멀티터치 상황(다른 손가락이 다른 버튼을 누르는 경우)에도
  // 한쪽 손가락을 떼도 다른 손가락이 여전히 누르고 있으면 계속 이동하도록 처리한다.
  const dpadEl = document.getElementById("dpad");

  if (dpadEl) {
    // 버튼 위에서 스크롤/확대/컨텍스트 메뉴 등 브라우저 기본 동작이 끼어들지 않도록 차단
    dpadEl.addEventListener("contextmenu", (e) => e.preventDefault());

    dpadEl.querySelectorAll(".dpad-btn").forEach((btn) => {
      const direction = btn.dataset.direction;
      const activePointerIds = new Set();

      const press = (e) => {
        e.preventDefault();
        if (isMovementLocked()) return; // 전체 마을 보기/꾸미기 중에는 화면 이동키도 무시한다.

        activePointerIds.add(e.pointerId);
        // 포인터를 캡처해서, 버튼 밖으로 손가락이 살짝 밀려도 손을 뗄 때까지는 계속 눌린 상태로 인식한다.
        if (btn.setPointerCapture) {
          try {
            btn.setPointerCapture(e.pointerId);
          } catch (err) {
            /* 일부 환경에서 캡처가 실패해도 이동 자체에는 지장 없음 */
          }
        }
        touchPressed.add(direction);
        btn.classList.add("active");
      };

      const release = (e) => {
        activePointerIds.delete(e.pointerId);
        // 같은 버튼을 여러 포인터가 누르고 있을 수도 있으니, 모두 뗐을 때만 이동을 멈춘다.
        if (activePointerIds.size === 0) {
          touchPressed.delete(direction);
          btn.classList.remove("active");
        }
      };

      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
    });
  }

  // ---------------------------------------------------------
  // 6. 현재 위치(구역) 판별 -> HUD 문구 / 꾸미기 버튼 상태
  // ---------------------------------------------------------
  function getCurrentRoomOrNull() {
    return (
      rooms.find(
        (r) =>
          player.x >= r.x &&
          player.x <= r.x + r.w &&
          player.y >= r.y &&
          player.y <= r.y + r.h
      ) || null
    );
  }

  let lastLocationLabel = "";

  function updateLocationLabel() {
    const inside = getCurrentRoomOrNull();

    const label = inside
      ? inside.isPlaza
        ? "우리 반 마을 광장"
        : `${inside.name}의 공간`
      : "마을 길";

    if (label !== lastLocationLabel) {
      lastLocationLabel = label;
      hudLocationEl.textContent = `📍 ${label}`;
      refreshHudControls(); // 구역이 바뀌면 "꾸미기" 버튼 / "구경 중" 표시도 같이 갱신한다.
    }
  }

  // 지금 상태(전체 마을 보기 / 꾸미기 / 위치)에 맞춰 HUD 버튼들을 보이거나 숨긴다.
  function refreshHudControls() {
    if (overviewMode) {
      // 전체 마을 보기 중에는 "돌아가기"만 의미가 있고, 나머지 버튼은 다 숨긴다.
      overviewBtnEl.hidden = false;
      btnDecorateEl.hidden = true;
      decorateStatusEl.hidden = true;
      return;
    }

    if (decorateMode) {
      // 꾸미기 패널의 "꾸미기 완료" 버튼이 그 역할을 대신하므로 HUD 버튼들은 숨긴다.
      overviewBtnEl.hidden = true;
      btnDecorateEl.hidden = true;
      decorateStatusEl.hidden = true;
      return;
    }

    overviewBtnEl.hidden = false;

    const room = getCurrentRoomOrNull();

    if (!currentAccount || !room || room.isPlaza) {
      // 마을 길과 광장은 이번 단계에서는 꾸미기 비활성 (버튼도, "구경 중" 표시도 없음)
      btnDecorateEl.hidden = true;
      decorateStatusEl.hidden = true;
    } else if (room.name === currentAccount.name) {
      btnDecorateEl.hidden = false;
      decorateStatusEl.hidden = true;
    } else {
      btnDecorateEl.hidden = true;
      decorateStatusEl.hidden = false;
    }
  }

  // ---------------------------------------------------------
  // 7. 게임 루프 (로그인에 성공했을 때만 동작)
  // ---------------------------------------------------------
  let lastTime = null;
  let rafId = null;

  function update(dt) {
    const { dx, dy } = getInputVector();
    const isMoving = dx !== 0 || dy !== 0;

    if (isMoving) {
      player.x += dx * PLAYER_SPEED * dt;
      player.y += dy * PLAYER_SPEED * dt;

      // 맵 바깥으로는 나갈 수 없도록 월드 경계로 위치를 제한
      player.x = Math.min(Math.max(player.x, PLAYER_RADIUS), WORLD_W - PLAYER_RADIUS);
      player.y = Math.min(Math.max(player.y, PLAYER_RADIUS), WORLD_H - PLAYER_RADIUS);

      if (dx < 0) player.facingLeft = true;
      else if (dx > 0) player.facingLeft = false;
    }

    player.moving = isMoving;

    // 카메라: 목표 지점을 향해 지수적으로 부드럽게 따라감 (프레임레이트에 영향받지 않는 감쇠)
    const target = getClampedCamera(player.x, player.y);
    const smoothing = 1 - Math.exp(-dt / CAMERA_TAU);
    camera.x += (target.x - camera.x) * smoothing;
    camera.y += (target.y - camera.y) * smoothing;

    updateLocationLabel();
  }

  function render() {
    // scale을 translate보다 뒤에 적용해 "월드 좌표 - 카메라" 만큼 이동한 다음 배율을 곱하는
    // 순서가 되도록 한다 (World transform-origin: 0 0 기준). 평소(scale=1)에는 기존과 동일하게 동작한다.
    worldEl.style.transform = `scale(${camera.scale}) translate3d(${-camera.x}px, ${-camera.y}px, 0)`;

    playerEl.style.left = `${(player.x - camera.x) * camera.scale}px`;
    playerEl.style.top = `${(player.y - camera.y) * camera.scale}px`;
    playerEl.classList.toggle("facing-left", player.facingLeft);
    playerEl.classList.toggle("moving", player.moving);

    if (overviewMode) {
      renderOverviewLabels();
    }
  }

  // 각 이름표를 방 중심의 화면 좌표(줌아웃 배율 반영)로 옮겨준다.
  function renderOverviewLabels() {
    roomLabels.forEach(({ room, el }) => {
      const centerX = (room.x + room.w / 2 - camera.x) * camera.scale;
      const centerY = (room.y + room.h / 2 - camera.y) * camera.scale;
      el.style.left = `${centerX}px`;
      el.style.top = `${centerY}px`;
    });
  }

  function loop(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 1 / 20); // dt 상한을 둬서 탭 전환 후 튐 방지
    lastTime = timestamp;

    update(dt);
    render();

    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    lastTime = null;
    if (rafId === null) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ---------------------------------------------------------
  // 7-1. 전체 마을 보기 (관람 전용 - 이동/조작 모두 비활성화)
  // ---------------------------------------------------------
  function enterOverview() {
    if (isMovementLocked()) return; // 이미 전체 마을 보기 중이거나, 꾸미기 중에는 들어갈 수 없다.
    overviewMode = true;

    // 지금 누르고 있던 키/터치가 남아있으면 전체 마을 보기에서 빠져나올 때
    // 갑자기 이동해버릴 수 있으므로 모두 비워둔다.
    keyboardPressed.clear();
    touchPressed.clear();

    // 돌아가기를 눌렀을 때 그대로 복원할 수 있도록 현재 카메라 상태만 저장한다.
    // (플레이어는 전체 마을 보기 중에 절대 움직이지 않으므로 별도로 저장할 필요가 없다.)
    savedCamera = { x: camera.x, y: camera.y };

    // 게임 루프 자체를 멈춘다 - 전체 마을 보기는 정적인 화면이라 계속 갱신할 것이 없고,
    // 루프가 돌고 있으면 카메라가 다시 플레이어를 따라가려고 해서 화면이 흔들리게 된다.
    stopLoop();

    const overview = computeOverviewCamera();
    camera.x = overview.x;
    camera.y = overview.y;
    camera.scale = overview.scale;

    playerEl.style.display = "none"; // 관람 모드에서는 플레이어 슬라임을 표시하지 않는다.
    overviewLabelsEl.hidden = false;

    stageEl.classList.add("overview-active");
    overviewBtnEl.textContent = "돌아가기";

    hudLocationEl.textContent = "🗺️ 전체 마을 보기 (관람 모드)";
    refreshHudControls();

    render();
  }

  function exitOverview() {
    if (!overviewMode) return;
    overviewMode = false;

    if (savedCamera) {
      camera.x = savedCamera.x;
      camera.y = savedCamera.y;
    }
    camera.scale = 1;
    savedCamera = null;

    playerEl.style.display = "";
    overviewLabelsEl.hidden = true;

    stageEl.classList.remove("overview-active");
    overviewBtnEl.textContent = "전체 마을 보기";

    lastLocationLabel = ""; // 강제로 다시 계산해서 원래 위치 문구로 되돌린다.
    updateLocationLabel();

    render();
    startLoop();
  }

  overviewBtnEl.addEventListener("click", () => {
    if (overviewMode) {
      exitOverview();
    } else {
      enterOverview();
    }
  });

  // ---------------------------------------------------------
  // 7-2. 꾸미기 모드 (1차 프로토타입)
  // ---------------------------------------------------------
  // 배치한 아이템은 이 배열(placedItems)에 있는 동안 화면에 그려진다. 최초 목록은 페이지를 열 때
  // Supabase에서 한 번 불러와 채우고(7-3절 initPlacedItemsFromSupabase), 이후로는 내가 직접
  // 놓거나/옮기거나/지운 것과, 다른 접속자가 Realtime으로 알려준 변경이 계속 반영된다.
  //
  // 아이템마다 ownerCode(배치한 학생의 접속 코드)를 붙여두고, 클릭/드래그 핸들러에서 "지금
  // 로그인한 사람 == ownerCode"인지 매번 확인한다. 다른 학생 공간의 아이템도 화면에는 항상 같이
  // 그려지지만(누구나 마을을 돌아다니며 구경할 수 있어야 하므로), 이 체크 하나로 "남의 아이템은
  // 못 만짐"이 유지된다.
  //
  // instanceId는 세션 내 DOM 식별(el.dataset.instanceId)에만 쓰는 임시 번호이고, dbId가
  // Supabase placed_items.id(uuid)와 실제로 연결되는 값이다. dbId는 로컬에서 막 놓아서 아직
  // INSERT 응답을 못 받은 아이템일 때만 잠깐 null이고, 그 외에는(초기 로드/INSERT 완료/다른
  // 접속자가 만든 아이템) 항상 채워져 있다. instanceId를 Supabase PK로 쓰지 않는다.
  const ITEM_MIN_SCALE = 0.5;
  const ITEM_MAX_SCALE = 2;
  const ITEM_SCALE_STEP = 0.15;

  let decorateMode = false;
  let activeRoomForDecorate = null; // 꾸미기 모드에 들어갈 때의 "내 방" (모드가 켜져 있는 동안 고정)
  let selectedItem = null;
  let nextInstanceId = 1;
  let nextZ = 1; // 다음에 놓일 아이템의 쌓임 순서. Supabase에서 불러온 뒤 그 최댓값+1로 복원된다.
  let currentPage = 0; // 인벤토리 현재 페이지 (0부터 시작)
  /** @type {{instanceId:number, dbId:(string|null), itemId:string, ownerCode:string, x:number, y:number, scale:number, z:number, el:HTMLElement}[]} */
  const placedItems = [];

  // ---------------------------------------------------------
  // 7-2-0. 계정별 아이템 카탈로그 (관리자/학생 전용 items.json 로드)
  // ---------------------------------------------------------
  // 지금 인벤토리 화면에 보여줄 아이템 목록. 평소엔 공통 아이템뿐이지만, 관리자/학생 계정으로
  // 꾸미기 모드에 들어가면 각자 전용 items.json에서 불러온 아이템이 여기 합쳐진다.
  let activeItemCatalog = BASE_ITEM_CATALOG;
  let totalPages = 1; // renderInventory()가 activeItemCatalog 기준으로 매번 다시 계산해 넣는다.

  // 지금은 접속 코드가 "T"로 시작하면(교사/관리자용, 현재는 T00 하나뿐) 관리자로 취급한다.
  // accounts.js에 관리자가 늘어나도 코드 접두사 규칙만 지키면 이 함수를 바꿀 필요가 없다.
  function isAdminAccount(account) {
    return !!account && String(account.code || "").toUpperCase().startsWith("T");
  }

  // 계정의 전용 items.json 경로를 규칙으로 계산한다. 학생 코드는 S01~S18을 하드코딩하지 않고,
  // 접속 코드에서 숫자 부분만 뽑아 assets/students/<두 자리 번호>/items/items.json 경로를
  // 그대로 만들어낸다 (S1, S01 등 자릿수가 달라도 항상 두 자리로 맞춘다).
  // 관리자/학생이 아니거나 코드 형식이 안 맞으면 전용 카탈로그가 없다는 뜻으로 null을 반환한다.
  function getPersonalItemsPath(account) {
    if (!account) return null;

    if (isAdminAccount(account)) {
      return "assets/admin/items/items.json";
    }

    const code = String(account.code || "").toUpperCase();
    const studentMatch = code.match(/^S(\d+)$/);
    if (studentMatch) {
      const studentNumber = studentMatch[1].padStart(2, "0");
      return `assets/students/${studentNumber}/items/items.json`;
    }

    return null;
  }

  // items.json 안 아이템에 크기(w/h)를 지정하지 않은 경우 쓸 기본 표시 크기(px).
  const DEFAULT_PERSONAL_ITEM_SIZE = 96;

  // 계정 코드별 전용 아이템 캐시. { items, promise } 형태로 저장해서, 같은 로그인 세션에서
  // 같은 계정으로 꾸미기 모드를 여러 번 여닫아도 fetch가 중복으로 일어나지 않게 하고
  // (promise 캐싱), fetch가 끝나기 전에도 이전에 불러온 값을 즉시 보여줄 수 있게 한다(items 캐싱).
  // Map을 계정 코드로 구분해두기 때문에 관리자든 학생이든, 로그아웃 후 다른 계정으로 들어와도
  // 서로의 캐시가 섞이지 않는다.
  const personalItemsCache = new Map();

  // 지금까지 캐시된(=이미 로드가 끝난) 전용 아이템을 즉시 돌려준다. 아직 한 번도 불러온 적이
  // 없거나 이 계정에 전용 카탈로그 자체가 없으면 빈 배열을 반환한다.
  function getCachedPersonalItems(account) {
    if (!account) return [];
    const cached = personalItemsCache.get(account.code);
    return cached ? cached.items : [];
  }

  // 계정의 전용 items.json을 fetch로 읽어와 기존 카탈로그 형식(id/name/thumb/w/h)에 맞게
  // 옮겨 담는다. items.json 쪽 필드명(image, animated)은 그대로 두고 thumb = image로 매핑한다.
  // 불러온 아이템은 ITEM_CATALOG_BY_ID에도 합쳐 넣어야, 이미 배치된 아이템을 다시 그리거나
  // (크기 조절, 앞/뒤 순서 변경 등) 선택할 때 항상 같은 맵 하나로 조회할 수 있다.
  //
  // 파일이 없거나(아직 학생용 items.json을 안 만든 경우), 비어 있거나, JSON 형식이 잘못됐어도
  // 예외를 밖으로 던지지 않고 빈 배열로 조용히 폴백한다 - 게임 자체는 공통 아이템만으로 계속 쓸 수 있다.
  function loadPersonalItemCatalog(account) {
    const path = getPersonalItemsPath(account);
    if (!path) return Promise.resolve([]); // 전용 카탈로그가 없는 계정(형식이 안 맞는 코드 등)

    const existing = personalItemsCache.get(account.code);
    if (existing) return existing.promise; // 이미 불러왔거나 불러오는 중이면 재사용

    const cacheEntry = { items: [], promise: null };

    cacheEntry.promise = fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`items.json 응답 오류 (HTTP ${res.status})`);
        return res.json();
      })
      .then((rawItems) => {
        const mapped = (Array.isArray(rawItems) ? rawItems : []).map((raw) => ({
          id: raw.id,
          name: raw.name,
          thumb: raw.image,
          animated: Boolean(raw.animated),
          w: raw.w || DEFAULT_PERSONAL_ITEM_SIZE,
          h: raw.h || DEFAULT_PERSONAL_ITEM_SIZE,
        }));

        mapped.forEach((item) => {
          ITEM_CATALOG_BY_ID[item.id] = item;
        });

        cacheEntry.items = mapped;
        return mapped;
      })
      .catch((err) => {
        // 정적 서버 없이 index.html을 file://로 직접 열었거나, 아직 이 계정의 items.json이
        // 없거나 형식이 잘못됐을 때도 게임 자체는 계속 쓸 수 있어야 하므로 조용히 폴백한다.
        console.error(`전용 아이템 목록(${path})을 불러오지 못했습니다:`, err);
        cacheEntry.items = [];
        return cacheEntry.items;
      });

    personalItemsCache.set(account.code, cacheEntry);
    return cacheEntry.promise;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getItemSize(catalogEntry, scale) {
    return { w: catalogEntry.w * scale, h: catalogEntry.h * scale };
  }

  // 아이템이 커지거나 옮겨지더라도 소유자 공간 밖으로 나가지 않도록 좌표를 다시 가둔다.
  function clampItemToRoom(instance, room) {
    const catalogEntry = ITEM_CATALOG_BY_ID[instance.itemId];
    const { w, h } = getItemSize(catalogEntry, instance.scale);
    instance.x = clamp(instance.x, room.x + w / 2, room.x + room.w - w / 2);
    instance.y = clamp(instance.y, room.y + h / 2, room.y + room.h - h / 2);
  }

  // instance의 x/y/scale/z 값을 실제 화면(#world 안 요소)에 반영한다.
  function renderPlacedItem(instance) {
    const catalogEntry = ITEM_CATALOG_BY_ID[instance.itemId];
    const { w, h } = getItemSize(catalogEntry, instance.scale);
    instance.el.style.left = `${instance.x}px`;
    instance.el.style.top = `${instance.y}px`;
    instance.el.style.width = `${w}px`;
    instance.el.style.height = `${h}px`;
    instance.el.style.zIndex = String(instance.z);
  }

  function selectItem(instance) {
    if (selectedItem) {
      selectedItem.el.classList.remove("selected");
    }
    selectedItem = instance;
    selectedItem.el.classList.add("selected");

    selectionNameEl.textContent = ITEM_CATALOG_BY_ID[instance.itemId].name;
    selectionHintEl.hidden = true;
    selectionControlsEl.hidden = false;
  }

  function deselectItem() {
    if (selectedItem) {
      selectedItem.el.classList.remove("selected");
    }
    selectedItem = null;
    selectionHintEl.hidden = false;
    selectionControlsEl.hidden = true;
  }

  // 화면 좌표(px) -> 월드 좌표 변환. 꾸미기 모드에서는 camera.scale이 항상 1이지만,
  // 나중에 다른 화면에서도 드래그를 재사용할 수 있도록 배율까지 반영해서 계산해둔다.
  function screenToWorld(clientX, clientY) {
    const stageRect = stageEl.getBoundingClientRect();
    return {
      x: (clientX - stageRect.left) / camera.scale + camera.x,
      y: (clientY - stageRect.top) / camera.scale + camera.y,
    };
  }

  function createPlacedItemEl(instance) {
    const catalogEntry = ITEM_CATALOG_BY_ID[instance.itemId];
    const el = document.createElement("div");
    el.className = "placed-item";
    el.style.backgroundImage = `url("${catalogEntry.thumb}")`;
    el.dataset.instanceId = String(instance.instanceId);

    el.addEventListener("pointerdown", (e) => {
      if (!decorateMode) return; // 꾸미기 모드가 아닐 때는 그냥 마을에 놓인 장식일 뿐, 조작할 수 없다.
      if (instance.ownerCode !== currentAccount.code) return; // 남의 아이템은 잡을 수 없다.

      e.preventDefault();
      e.stopPropagation(); // stageEl의 "빈 곳 클릭 시 선택 해제" 핸들러로 번지지 않게 한다.
      selectItem(instance);

      const startWorld = screenToWorld(e.clientX, e.clientY);
      const grabOffsetX = instance.x - startWorld.x;
      const grabOffsetY = instance.y - startWorld.y;
      let moved = false; // 실제로 드래그했는지 - 그냥 선택만 하려고 눌렀다 뗀 경우엔 DB에 보낼 게 없다

      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 캡처 실패해도 드래그 자체는 계속 동작함 */
      }

      const onMove = (moveEvent) => {
        moved = true;
        const world = screenToWorld(moveEvent.clientX, moveEvent.clientY);
        instance.x = world.x + grabOffsetX;
        instance.y = world.y + grabOffsetY;
        clampItemToRoom(instance, activeRoomForDecorate);
        renderPlacedItem(instance); // 드래그 중에는 화면만 갱신하고 DB 요청은 절대 보내지 않는다
      };

      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);

        // 손을 뗀 순간, 실제로 옮겼을 때만 최종 위치 하나로 Supabase UPDATE 1회를 보낸다.
        if (moved) {
          const { room_x, room_y } = toRoomRelative(instance, activeRoomForDecorate);
          updatePlacedItemRemote(instance, { room_x, room_y });
        }
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    });

    return el;
  }

  // 인벤토리에서 아이템을 눌렀을 때: 지금 꾸미고 있는 내 공간 중앙 근처에 하나 배치한다.
  function placeItem(catalogEntry) {
    if (!decorateMode || !activeRoomForDecorate || !currentAccount) return;

    const room = activeRoomForDecorate;
    const jitterX = (Math.random() - 0.5) * 80;
    const jitterY = (Math.random() - 0.5) * 60;

    const instance = {
      instanceId: nextInstanceId++,
      dbId: null, // Supabase INSERT가 성공하면 여기에 발급된 UUID가 채워진다 (아래 insertPlacedItemRemote)
      itemId: catalogEntry.id,
      ownerCode: currentAccount.code,
      x: room.x + room.w / 2 + jitterX,
      y: room.y + room.h / 2 + jitterY,
      scale: 1,
      z: nextZ++, // 새로 놓은 아이템이 항상 맨 앞에 오도록
    };
    clampItemToRoom(instance, room);

    const el = createPlacedItemEl(instance);
    instance.el = el;
    worldEl.appendChild(el);
    renderPlacedItem(instance);
    placedItems.push(instance); // 로컬 배치는 여기서 이미 끝난다 - DB 왕복을 기다리지 않는다

    selectItem(instance); // 방금 놓은 아이템을 바로 선택해서 크기 조절/삭제를 이어서 할 수 있게 한다.

    insertPlacedItemRemote(instance, room); // 실패해도 로컬 배치엔 영향 없음 (fire-and-forget)
  }

  // 인벤토리 목록을 그린다. ITEMS_PER_PAGE(20)씩 잘라서 그리는 구조라, 아이템이 늘어나도
  // 이 함수 자체는 바꿀 필요 없이 activeItemCatalog만 바뀌면 된다. 계정에 따라 목록 길이가
  // 달라질 수 있어 totalPages도 호출할 때마다 다시 계산한다.
  function renderInventory() {
    totalPages = Math.max(1, Math.ceil(activeItemCatalog.length / ITEMS_PER_PAGE));
    currentPage = clamp(currentPage, 0, totalPages - 1);

    itemPaletteEl.innerHTML = "";

    const start = currentPage * ITEMS_PER_PAGE;
    const pageItems = activeItemCatalog.slice(start, start + ITEMS_PER_PAGE);

    pageItems.forEach((catalogEntry) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item-choice";

      const img = document.createElement("img");
      img.src = catalogEntry.thumb;
      img.alt = catalogEntry.name;

      const label = document.createElement("span");
      label.textContent = catalogEntry.name;

      btn.appendChild(img);
      btn.appendChild(label);
      btn.addEventListener("click", () => placeItem(catalogEntry));

      itemPaletteEl.appendChild(btn);
    });

    pageIndicatorEl.textContent = `${currentPage + 1} / ${totalPages}`;
    btnPagePrevEl.disabled = currentPage === 0;
    btnPageNextEl.disabled = currentPage >= totalPages - 1;
  }

  btnPagePrevEl.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage -= 1;
      renderInventory();
    }
  });

  btnPageNextEl.addEventListener("click", () => {
    if (currentPage < totalPages - 1) {
      currentPage += 1;
      renderInventory();
    }
  });

  function enterDecorateMode() {
    if (isMovementLocked() || !currentAccount) return;

    const room = getCurrentRoomOrNull();
    if (!room || room.isPlaza || room.name !== currentAccount.name) return; // 버튼이 숨겨져 있어 보통은 여기 안 옴 (방어적 처리)

    decorateMode = true;
    activeRoomForDecorate = room;

    // 꾸미기 중에는 이동이 완전히 멈춰야 하므로, 게임 루프도 전체 마을 보기와 같은 방식으로 정지한다.
    keyboardPressed.clear();
    touchPressed.clear();
    stopLoop();

    deselectItem();
    currentPage = 0;

    // 관리자/학생 계정은 공통 아이템에 더해 각자 전용 items.json 아이템도 함께 보여준다.
    // 전용 카탈로그가 없는 계정(코드 형식이 안 맞는 경우 등)은 getPersonalItemsPath가
    // null을 반환하므로 자연히 공통 아이템만 보이는 아래 기본 경로로 빠진다.
    const personalItemsPath = getPersonalItemsPath(currentAccount);

    if (personalItemsPath) {
      const accountAtRequest = currentAccount; // 응답이 오기 전에 로그아웃/다른 계정으로 바뀌었는지 확인용

      activeItemCatalog = BASE_ITEM_CATALOG.concat(getCachedPersonalItems(currentAccount)); // 캐시가 있으면 즉시 반영
      renderInventory();
      sidePanelEl.hidden = false;
      stageEl.classList.add("decorate-active");
      refreshHudControls();

      loadPersonalItemCatalog(currentAccount).then((items) => {
        // 로딩되는 동안 꾸미기 모드를 빠져나갔거나 다른 계정으로 바뀌었으면 화면을 건드리지 않는다.
        if (!decorateMode || currentAccount !== accountAtRequest) return;
        activeItemCatalog = BASE_ITEM_CATALOG.concat(items);
        renderInventory();
      });
      return;
    }

    activeItemCatalog = BASE_ITEM_CATALOG;
    renderInventory();
    sidePanelEl.hidden = false;

    stageEl.classList.add("decorate-active");
    refreshHudControls();
  }

  function exitDecorateMode() {
    if (!decorateMode) return;

    decorateMode = false;
    activeRoomForDecorate = null;
    deselectItem();

    sidePanelEl.hidden = true;
    stageEl.classList.remove("decorate-active");

    refreshHudControls();
    startLoop();
  }

  btnDecorateEl.addEventListener("click", enterDecorateMode);
  btnDecorateDoneEl.addEventListener("click", exitDecorateMode);

  // 크기 조절 버튼은 클릭할 때마다 "최종 결과"가 바로 확정되므로(드래그처럼 중간 단계가 없음)
  // 그때그때 Supabase UPDATE를 보낸다 - 계속 눌러도 버튼 클릭 자체가 이미 "확정된 값" 하나하나다.
  // clampItemToRoom이 커진 아이템을 방 안으로 다시 밀어넣으면서 위치도 같이 바뀔 수 있으므로,
  // scale과 함께 room_x/room_y도 최신 값으로 맞춰 보낸다.
  btnItemBiggerEl.addEventListener("click", () => {
    if (!selectedItem) return;
    selectedItem.scale = clamp(selectedItem.scale + ITEM_SCALE_STEP, ITEM_MIN_SCALE, ITEM_MAX_SCALE);
    clampItemToRoom(selectedItem, activeRoomForDecorate);
    renderPlacedItem(selectedItem);
    syncPositionAndScaleRemote(selectedItem);
  });

  btnItemSmallerEl.addEventListener("click", () => {
    if (!selectedItem) return;
    selectedItem.scale = clamp(selectedItem.scale - ITEM_SCALE_STEP, ITEM_MIN_SCALE, ITEM_MAX_SCALE);
    clampItemToRoom(selectedItem, activeRoomForDecorate);
    renderPlacedItem(selectedItem);
    syncPositionAndScaleRemote(selectedItem);
  });

  // "앞으로"/"뒤로"는 겹쳐 놓인 아이템들 중 맨 앞/맨 뒤로 보낸다 (한 칸씩 순서를 바꾸는 대신,
  // 전체 아이템 중 가장 큰/작은 z값보다 하나 더 크게/작게 만드는 방식이라 항상 확실하게 맨 앞/맨 뒤가 된다).
  btnItemForwardEl.addEventListener("click", () => {
    if (!selectedItem) return;
    nextZ = Math.max(nextZ, ...placedItems.map((item) => item.z)) + 1;
    selectedItem.z = nextZ++;
    renderPlacedItem(selectedItem);
    updatePlacedItemRemote(selectedItem, { z_order: selectedItem.z });
  });

  btnItemBackwardEl.addEventListener("click", () => {
    if (!selectedItem) return;
    const minZ = Math.min(...placedItems.map((item) => item.z));
    selectedItem.z = minZ - 1;
    renderPlacedItem(selectedItem);
    updatePlacedItemRemote(selectedItem, { z_order: selectedItem.z });
  });

  btnItemDeleteEl.addEventListener("click", () => {
    if (!selectedItem) return;
    const instanceToDelete = selectedItem; // deselectItem()이 selectedItem을 null로 만들기 전에 붙잡아둔다
    const index = placedItems.indexOf(instanceToDelete);
    if (index !== -1) placedItems.splice(index, 1);
    instanceToDelete.el.remove();
    deselectItem();
    deletePlacedItemRemote(instanceToDelete);
  });

  // 아이템이 아닌 빈 잔디(#game-stage)를 누르면 선택을 해제한다.
  stageEl.addEventListener("pointerdown", (e) => {
    if (!decorateMode) return;
    if (e.target.closest(".placed-item")) return; // 아이템 위 클릭은 위 핸들러가 이미 처리
    deselectItem();
  });

  // ---------------------------------------------------------
  // 7-3. Supabase 연동 (배치된 아이템 영구 저장 + 실시간 동기화)
  // ---------------------------------------------------------
  // 다루는 것 : placed_items 테이블 CRUD, 방 상대좌표 변환, Realtime 구독,
  //            자기 자신이 보낸 변경이 되돌아왔을 때 중복 처리하지 않기.
  // 다루지 않는 것 : Auth, RLS, 캐릭터 위치 동기화, 드래그 중간값 전송, 이미지 업로드.
  //
  // js/supabase-client.js가 만들어 window.SupabaseClientReady(Promise)에 넣어둔 클라이언트를
  // 쓴다. 그 파일이 CDN 로딩에 실패했거나 아예 로드되지 않았어도 이 섹션의 모든 함수는 조용히
  // 아무 일도 하지 않고 넘어가도록 만들어서, Supabase 관련 문제가 게임 자체를 막지 않게 한다.
  const PLACED_ITEMS_TABLE = "placed_items";

  let supabaseClientPromise = null;
  function getSupabaseClient() {
    if (!supabaseClientPromise) {
      // window.SupabaseClientReady 자체가 이미 "실패하면 null로 풀리는" Promise지만(supabase-client.js
      // 참고), 그 스크립트가 아예 로드되지 않은 경우(예: CSP, 광고 차단기)까지 대비해 한 번 더 감싼다.
      supabaseClientPromise = Promise.resolve(window.SupabaseClientReady).catch(() => null);
    }
    return supabaseClientPromise;
  }

  // 접속 코드로 그 학생/관리자의 "방"을 찾는다. Supabase 행에는 좌표만 있고 계정 이름이 없으므로,
  // js/accounts.js가 전역으로 노출하는 ACCOUNTS_BY_CODE로 이름을 알아낸 다음 LAYOUT 기반의
  // rooms에서 같은 이름의 방을 찾는다 (placePlayerForAccount가 하는 것과 같은 방식).
  function getRoomForOwnerCode(ownerCode) {
    const account = ACCOUNTS_BY_CODE[String(ownerCode || "").toUpperCase()];
    if (!account) return null;
    return rooms.find((r) => r.name === account.name) || null;
  }

  // 월드 절대좌표 -> 소유자 방 기준 상대좌표 (DB에 저장할 때). 나중에 방 크기/배치가 바뀌어도
  // 저장된 좌표가 안전하도록, 절대좌표 대신 항상 이 상대좌표를 저장한다.
  function toRoomRelative(instance, room) {
    return { room_x: instance.x - room.x, room_y: instance.y - room.y };
  }

  // 방 기준 상대좌표 -> 월드 절대좌표 (DB에서 불러와 그릴 때).
  function fromRoomRelative(room, roomX, roomY) {
    return { x: room.x + roomX, y: room.y + roomY };
  }

  // Supabase 행(row) 하나를 로컬 instance 객체로 만든다. 방을 못 찾거나(owner_code가 이상함)
  // 카탈로그에 없는 item_id(호출하는 쪽에서 미리 불러와야 함)면 null을 돌려주고 건너뛴다 -
  // 아이템 하나가 이상해도 나머지 렌더링 전체가 죽으면 안 되기 때문이다.
  function buildInstanceFromRow(row) {
    const room = getRoomForOwnerCode(row.owner_code);
    if (!room) {
      console.error(`배치된 아이템(id=${row.id})의 owner_code(${row.owner_code})에 해당하는 방이 없어 건너뜁니다.`);
      return null;
    }

    const catalogEntry = ITEM_CATALOG_BY_ID[row.item_id];
    if (!catalogEntry) {
      console.error(`배치된 아이템(id=${row.id})의 item_id(${row.item_id})를 카탈로그에서 찾을 수 없어 건너뜁니다.`);
      return null;
    }

    const { x, y } = fromRoomRelative(room, row.room_x, row.room_y);

    const instance = {
      instanceId: nextInstanceId++,
      dbId: row.id,
      itemId: row.item_id,
      ownerCode: row.owner_code,
      x,
      y,
      scale: row.scale,
      z: row.z_order,
    };
    instance.el = createPlacedItemEl(instance);

    return instance;
  }

  // placeItem()에서 로컬에 막 놓았지만 아직 INSERT 응답(dbId)을 못 받은 아이템 중에, 지금 막
  // Realtime으로 도착한 행과 내용이 완전히 같은 게 있는지 찾는다. INSERT의 REST 응답보다
  // Realtime 이벤트가 먼저 도착하는 드문 경우, 이 아이템이 바로 "그 이벤트"이므로 새로 만들지
  // 않고 dbId만 붙여준다 (자기 자신의 INSERT가 중복 DOM을 만들지 않게 하는 방어의 일부).
  function findPendingLocalInsertMatch(row) {
    const EPSILON = 0.01; // px 단위 - 부동소수점 오차만 흡수하면 되므로 아주 작게 잡는다
    const room = getRoomForOwnerCode(row.owner_code);
    if (!room) return null;

    return (
      placedItems.find((item) => {
        if (item.dbId) return false; // dbId가 이미 있으면 "확정 대기 중"이 아니다
        if (item.ownerCode !== row.owner_code || item.itemId !== row.item_id) return false;
        if (item.scale !== row.scale || item.z !== row.z_order) return false;

        const { room_x, room_y } = toRoomRelative(item, room);
        return Math.abs(room_x - row.room_x) < EPSILON && Math.abs(room_y - row.room_y) < EPSILON;
      }) || null
    );
  }

  // ---- 쓰기 (로컬에서 확정된 결과를 Supabase로) ----------------------------------

  // 새 아이템을 Supabase에 1행 추가한다. placeItem()이 이미 로컬 배치를 끝낸 뒤 fire-and-forget로
  // 호출하므로, 실패해도 화면에는 영향이 없다 (다만 새로고침하면 사라짐 - 콘솔에 오류를 남긴다).
  async function insertPlacedItemRemote(instance, room) {
    const client = await getSupabaseClient();
    if (!client) return; // Supabase 연결 자체가 없음 -> 이번 세션은 로컬 전용으로 계속 진행

    const { room_x, room_y } = toRoomRelative(instance, room);

    const { data, error } = await client
      .from(PLACED_ITEMS_TABLE)
      .insert({
        owner_code: instance.ownerCode,
        item_id: instance.itemId,
        room_x,
        room_y,
        scale: instance.scale,
        z_order: instance.z,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase에 아이템 저장 실패 (로컬에는 남아있지만 새로고침하면 사라집니다):", error);
      return;
    }

    // Realtime 이벤트가 이 응답보다 먼저 도착해서 findPendingLocalInsertMatch가 이미 dbId를
    // 붙여줬을 수도 있으니, 아직 비어 있을 때만 채운다.
    if (!instance.dbId) {
      instance.dbId = data.id;
    }
  }

  // instance의 필드 일부(fields)만 Supabase에 UPDATE한다. dbId가 아직 없으면(INSERT가 아직
  // 안 끝났거나 실패한 상태) 업데이트할 행 자체가 없으므로 조용히 건너뛴다.
  async function updatePlacedItemRemote(instance, fields) {
    if (!instance.dbId) return;

    const client = await getSupabaseClient();
    if (!client) return;

    const { error } = await client.from(PLACED_ITEMS_TABLE).update(fields).eq("id", instance.dbId);
    if (error) {
      console.error(`Supabase 아이템 업데이트 실패 (id=${instance.dbId}, fields=${JSON.stringify(fields)}):`, error);
    }
  }

  // 크기 조절 버튼 전용: clampItemToRoom이 커진/작아진 아이템을 방 안으로 다시 밀어넣으면서
  // 위치도 같이 바뀔 수 있으므로, scale과 최신 room_x/room_y를 함께 보낸다.
  function syncPositionAndScaleRemote(instance) {
    const { room_x, room_y } = toRoomRelative(instance, activeRoomForDecorate);
    updatePlacedItemRemote(instance, { room_x, room_y, scale: instance.scale });
  }

  // 삭제 버튼 전용: dbId가 없으면(DB에 애초에 없던 아이템) 지울 행도 없으므로 조용히 건너뛴다.
  async function deletePlacedItemRemote(instance) {
    if (!instance.dbId) return;

    const client = await getSupabaseClient();
    if (!client) return;

    const { error } = await client.from(PLACED_ITEMS_TABLE).delete().eq("id", instance.dbId);
    if (error) {
      console.error(`Supabase 아이템 삭제 실패 (id=${instance.dbId}):`, error);
    }
  }

  // ---- 읽기 (Supabase의 변경을 로컬 화면으로) ------------------------------------

  // 다른 접속자가 아이템을 새로 놓았을 때. 이미 로컬에 있는(dbId가 같은) 아이템이면 - 그게
  // 나 자신이 방금 놓은 것이 확정된 경우든, 이미 다른 경로로 반영된 경우든 - 다시 만들지 않는다.
  async function handleRemoteInsert(row) {
    if (!row) return;

    if (placedItems.some((item) => item.dbId === row.id)) return; // 이미 로컬에 있음 -> 중복 방지

    const pendingMatch = findPendingLocalInsertMatch(row);
    if (pendingMatch) {
      pendingMatch.dbId = row.id; // 내가 막 놓은 그 아이템이었다 - dbId만 붙이고 새로 그리지 않는다
      return;
    }

    // 다른 학생/관리자 계정의 아이템이라 이 세션이 그 카탈로그를 한 번도 안 불러왔을 수 있다.
    if (!ITEM_CATALOG_BY_ID[row.item_id]) {
      await loadPersonalItemCatalog({ code: row.owner_code });
    }

    const instance = buildInstanceFromRow(row);
    if (!instance) return;

    placedItems.push(instance);
    worldEl.appendChild(instance.el);
    renderPlacedItem(instance);

    if (row.z_order >= nextZ) nextZ = row.z_order + 1;
  }

  // 다른 접속자가 위치/크기/순서를 바꿨을 때(혹은 내가 보낸 UPDATE가 되돌아왔을 때 - 같은 값을
  // 다시 적용할 뿐이라 무해하다). 로컬에 없는 dbId면(아직 초기 로드 전이거나 이미 삭제됨) 무시한다.
  function handleRemoteUpdate(row) {
    if (!row) return;

    const instance = placedItems.find((item) => item.dbId === row.id);
    if (!instance) return;

    const room = getRoomForOwnerCode(row.owner_code);
    if (!room) return;

    const { x, y } = fromRoomRelative(room, row.room_x, row.room_y);
    instance.x = x;
    instance.y = y;
    instance.scale = row.scale;
    instance.z = row.z_order;

    // 지금 이 아이템을 내가 드래그/선택하고 있는 도중에 다른 곳에서 온 업데이트로 room 밖으로
    // 나가버리는 일이 없도록, 소유자 방 기준으로 한 번 더 가둔다.
    clampItemToRoom(instance, room);
    renderPlacedItem(instance);

    if (row.z_order >= nextZ) nextZ = row.z_order + 1;
  }

  // 다른 접속자가 삭제했을 때(혹은 내가 보낸 DELETE가 되돌아왔을 때 - 이미 로컬에서 지워져 있어
  // findIndex가 -1이 되므로 자연히 아무 일도 안 한다).
  function handleRemoteDelete(row) {
    if (!row || !row.id) return;

    const index = placedItems.findIndex((item) => item.dbId === row.id);
    if (index === -1) return;

    const [removed] = placedItems.splice(index, 1);
    if (selectedItem === removed) {
      deselectItem();
    }
    removed.el.remove();
  }

  // placed_items 테이블의 INSERT/UPDATE/DELETE를 구독한다. 로그인 여부와 무관하게 페이지를 여는
  // 동안 계속 켜져 있다 (마을 전체가 항상 화면에 존재하고, 누구나 돌아다니며 다른 방을 볼 수
  // 있으므로 로그인/로그아웃 시마다 다시 구독할 필요가 없다).
  function subscribeToPlacedItemsRealtime(client) {
    client
      .channel("placed-items-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: PLACED_ITEMS_TABLE }, (payload) =>
        handleRemoteInsert(payload.new)
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: PLACED_ITEMS_TABLE }, (payload) =>
        handleRemoteUpdate(payload.new)
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: PLACED_ITEMS_TABLE }, (payload) =>
        handleRemoteDelete(payload.old)
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Supabase Realtime 구독에 문제가 생겼습니다 (로컬 조작은 계속 정상 동작합니다):", err || status);
        }
      });
  }

  // 게임 최초 진입(페이지를 연 시점, 로그인 여부와 무관)에 placed_items 전체를 한 번 불러와
  // 렌더링하고, nextZ를 복원하고, Realtime 구독을 시작한다. 아래에서 한 번만 호출된다.
  //
  // "아직 개인 catalog가 로드되지 않아 item_id를 못 찾는" 문제를 피하기 위해, 불러온 행들에
  // 등장하는 모든 owner_code의 개인 카탈로그를 먼저 전부 불러온 다음에(Promise.all) 그려야
  // 한다 - 로그인 전이라 currentAccount가 없어도, 방문 중인 계정이 아직 로그인 안 했어도 상관없다.
  async function initPlacedItemsFromSupabase() {
    try {
      const client = await getSupabaseClient();
      if (!client) {
        console.error("Supabase 클라이언트가 준비되지 않아 배치된 아이템을 불러오지 못했습니다 (로컬 전용으로 시작합니다).");
        return;
      }

      const { data, error } = await client.from(PLACED_ITEMS_TABLE).select("*");
      if (error) {
        console.error("Supabase에서 배치된 아이템을 불러오지 못했습니다 (로컬 전용으로 시작합니다):", error);
        return;
      }

      const rows = data || [];
      const ownerCodes = Array.from(new Set(rows.map((row) => row.owner_code)));
      await Promise.all(ownerCodes.map((code) => loadPersonalItemCatalog({ code })));

      let maxZ = 0;
      rows.forEach((row) => {
        const instance = buildInstanceFromRow(row);
        if (!instance) return;

        placedItems.push(instance);
        worldEl.appendChild(instance.el);
        renderPlacedItem(instance);

        if (row.z_order > maxZ) maxZ = row.z_order;
      });
      nextZ = maxZ + 1; // 이후 "앞으로" 버튼 등이 항상 불러온 최댓값보다 크게 매겨지도록 복원

      subscribeToPlacedItemsRealtime(client);
    } catch (err) {
      console.error("배치된 아이템을 초기화하는 중 예상치 못한 오류가 발생했습니다 (로컬 전용으로 계속 진행합니다):", err);
    }
  }

  // ---------------------------------------------------------
  // 8. 로그인 흐름 (임시 프론트엔드 계정 - js/accounts.js)
  // ---------------------------------------------------------
  function placePlayerForAccount(account) {
    const room = rooms.find((r) => r.name === account.name);
    // LAYOUT과 accounts.js의 이름이 어긋나면 방을 못 찾을 수 있으니 방어적으로 처리
    const startRoom = room || rooms[0];

    player.x = startRoom.x + startRoom.w / 2;
    player.y = startRoom.y + startRoom.h - 100; // 표지판 바로 위, 입구 근처
    player.facingLeft = false;
    player.moving = false;

    const initialCam = getClampedCamera(player.x, player.y);
    camera.x = initialCam.x;
    camera.y = initialCam.y;

    lastLocationLabel = ""; // 위치 라벨을 강제로 다시 계산해서 즉시 반영되게 함
  }

  function showLoginError(message) {
    loginErrorEl.textContent = message;
  }

  function clearLoginError() {
    loginErrorEl.textContent = "";
  }

  function enterGame(account) {
    currentAccount = account;
    hudNameEl.textContent = `👤 ${account.name}`;

    loginScreenEl.hidden = true;
    gameScreenEl.hidden = false;

    // game-screen이 화면에 보여야 game-stage의 실제 크기를 잴 수 있으므로,
    // hidden을 푼 다음에 플레이어 시작 위치/카메라를 계산한다.
    placePlayerForAccount(account);
    updateLocationLabel();
    render();

    startLoop();
  }

  function exitToLogin() {
    // 전체 마을 보기 중에 로그아웃하는 경우를 대비해, 관람 모드 관련 화면 상태도 확실히 되돌린다.
    if (overviewMode) {
      overviewMode = false;
      savedCamera = null;
      camera.scale = 1;
      playerEl.style.display = "";
      overviewLabelsEl.hidden = true;
      stageEl.classList.remove("overview-active");
      overviewBtnEl.textContent = "전체 마을 보기";
    }

    // 꾸미기 중에 로그아웃하는 경우도 마찬가지로 화면 상태를 되돌린다.
    // (배치해둔 아이템 자체는 지우지 않는다 - 같은 브라우저 세션에서 다시 로그인하면 그대로 보인다.
    //  전부 사라지는 건 "새로고침했을 때"뿐이라는 요구사항에 맞춘 것.)
    if (decorateMode) {
      decorateMode = false;
      activeRoomForDecorate = null;
      deselectItem();
      sidePanelEl.hidden = true;
      stageEl.classList.remove("decorate-active");
    }

    stopLoop();

    keyboardPressed.clear();
    touchPressed.clear();

    currentAccount = null;
    gameScreenEl.hidden = true;
    loginScreenEl.hidden = false;

    // 공용 PC 사용을 고려해 로그인 정보를 남기지 않고 완전히 비운다.
    loginFormEl.reset();
    clearLoginError();
    loginCodeEl.focus();
  }

  loginFormEl.addEventListener("submit", (e) => {
    e.preventDefault();

    const code = loginCodeEl.value;
    const pin = loginPinEl.value;

    if (!code.trim() || !pin.trim()) {
      showLoginError("접속 코드와 PIN을 모두 입력해주세요.");
      return;
    }

    const account = findAccount(code, pin);
    if (!account) {
      showLoginError("접속 코드 또는 PIN이 올바르지 않습니다.");
      loginPinEl.value = "";
      loginPinEl.focus();
      return;
    }

    clearLoginError();
    enterGame(account);
  });

  logoutBtnEl.addEventListener("click", exitToLogin);

  // 페이지를 열면 로그인 화면이 먼저 보이는 상태이므로, 접속 코드 입력창에 포커스를 맞춰준다.
  loginCodeEl.focus();

  // 로그인 여부와 무관하게, 페이지를 연 시점에 Supabase에 저장된 배치 아이템을 전부 불러와
  // 마을에 그려 넣는다 (7-3절). 비동기로 진행되며 실패해도 위 로그인 화면 등에는 영향이 없다.
  initPlacedItemsFromSupabase();
});
