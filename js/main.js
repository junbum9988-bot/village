/**
 * 우리 반 마을 꾸미기 - 프로토타입 1단계
 *
 * 목표: 4x5 마을을 슬라임으로 걸어다니며 크기와 카메라 느낌을 확인한다.
 * 이번 단계에서 다루지 않는 것: Supabase, 로그인, 저장, 인벤토리, 꾸미기 기능.
 *
 * 구성
 *   - buildMap()   : 방/통로/광장 데이터를 만들고 #world에 DOM으로 렌더링
 *   - input        : 방향키 / WASD 입력 수집
 *   - update(dt)    : 플레이어 이동 + 카메라 추적 + HUD 갱신
 *   - render()       : 계산된 좌표를 실제 화면(transform)에 반영
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
  // 2. 맵 데이터 생성
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

  // ---------------------------------------------------------
  // 3. 플레이어 초기 위치 (준범 공간의 입구 근처)
  // ---------------------------------------------------------
  const startRoom = rooms.find((r) => r.name === "준범");

  const player = {
    x: startRoom.x + startRoom.w / 2,
    y: startRoom.y + startRoom.h - 100, // 표지판 바로 위, 입구 근처
    facingLeft: false,
    moving: false,
  };

  const camera = { x: 0, y: 0 };

  // 카메라 초기값도 플레이어 위치 기준으로 즉시 맞춰서 시작 시 튀는 현상을 방지
  const stageEl = document.getElementById("game-stage");
  const playerEl = document.getElementById("player");
  const hudLocationEl = document.getElementById("hud-location");

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

  const initialCam = getClampedCamera(player.x, player.y);
  camera.x = initialCam.x;
  camera.y = initialCam.y;

  // ---------------------------------------------------------
  // 4. 입력 처리 (방향키 + WASD)
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
      keyboardPressed.add(dir);
      e.preventDefault(); // 방향키로 페이지가 스크롤되는 것 방지
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
  // 4-1. 화면 이동키 (모바일 / 태블릿 / 전자칠판용 터치 십자 방향키)
  // ---------------------------------------------------------
  // 키보드와는 별도의 touchPressed Set을 사용한다 (충돌 방지 이유는 위 4번 주석 참고).
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
  // 5. 현재 위치(구역) 판별 -> HUD 문구
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
  // 6. 메인 루프
  // ---------------------------------------------------------
  let lastTime = null;

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
    worldEl.style.transform = `translate3d(${-camera.x}px, ${-camera.y}px, 0)`;

    playerEl.style.left = `${player.x - camera.x}px`;
    playerEl.style.top = `${player.y - camera.y}px`;
    playerEl.classList.toggle("facing-left", player.facingLeft);
    playerEl.classList.toggle("moving", player.moving);
  }

  function loop(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 1 / 20); // dt 상한을 둬서 탭 전환 후 튐 방지
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  render(); // 첫 프레임을 즉시 그려서 로딩 중 빈 화면이 보이지 않도록 함
  requestAnimationFrame(loop);
});
