/**
 * 우리 반 마을 꾸미기 - 프로토타입
 *
 * 이번 단계 목표: 로그인 화면(임시 프론트엔드 계정)을 통과해야 마을에 들어갈 수 있게 하고,
 * 로그인한 학생의 이름/공간에서 게임이 시작되도록 한다.
 * 계정 데이터는 js/accounts.js 에서만 관리한다 (이 파일은 로그인 "흐름"만 다룬다).
 *
 * 다루지 않는 것: Supabase 연동, 실제 인증/DB, 저장, 인벤토리, 꾸미기 기능.
 *
 * 구성
 *   - 맵 데이터 생성   : 방/통로/광장 데이터를 만들고 #world에 DOM으로 렌더링 (로그인과 무관, 한 번만 수행)
 *   - 입력 처리        : 방향키 / WASD / 화면 터치 방향키 입력 수집 (로그인 여부와 무관하게 항상 리스닝)
 *   - 게임 루프        : 로그인에 성공했을 때만 실행 (update → 이동/카메라, render → 화면 반영)
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

  // ---------------------------------------------------------
  // 4. 플레이어 / 카메라 상태
  // ---------------------------------------------------------
  // 실제 시작 좌표는 로그인에 성공했을 때 placePlayerForAccount()가 채워 넣는다.
  const player = { x: 0, y: 0, facingLeft: false, moving: false };
  const camera = { x: 0, y: 0, scale: 1 }; // scale은 평소 1, 전체 마을 보기에서만 줄어든다.

  // 전체 마을 보기(관람 전용) 상태. 켜져 있는 동안은 이동 입력을 전부 무시한다.
  let overviewMode = false;
  let savedCamera = null; // 돌아가기를 눌렀을 때 복원할, 전체 마을 보기 이전의 카메라 상태

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

  window.addEventListener("keydown", (e) => {
    const dir = resolveDirection(e);
    if (dir) {
      e.preventDefault(); // 방향키로 페이지가 스크롤되는 것 방지 (전체 마을 보기 중에도 동일)
      if (!overviewMode) {
        keyboardPressed.add(dir);
      }
    }
  });

  window.addEventListener("keyup", (e) => {
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
        if (overviewMode) return; // 전체 마을 보기(관람 전용) 중에는 화면 이동키도 무시한다.

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
  // 6. 현재 위치(구역) 판별 -> HUD 문구
  // ---------------------------------------------------------
  let lastLocationLabel = "";

  function updateLocationLabel() {
    const inside = rooms.find(
      (r) =>
        player.x >= r.x &&
        player.x <= r.x + r.w &&
        player.y >= r.y &&
        player.y <= r.y + r.h
    );

    const label = inside
      ? inside.isPlaza
        ? "우리 반 마을 광장"
        : `${inside.name}의 공간`
      : "마을 길";

    if (label !== lastLocationLabel) {
      lastLocationLabel = label;
      hudLocationEl.textContent = `📍 ${label}`;
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
    if (overviewMode) return;
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

    stopLoop();

    keyboardPressed.clear();
    touchPressed.clear();

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
});
