# 두 번째 마을(village-2) 에셋 폴더

`js/accounts.js`의 두 번째 마을 임시 계정(`B00` ~ `B18`, `village: "village-2"`)이 쓰는 이미지를
모아두는 곳입니다. 구조는 첫 번째 마을(`assets/admin/`, `assets/students/`)과 똑같고, 다만 전부
이 `village2/` 폴더 안에 들어있어서 **첫 번째 마을 에셋과 절대 섞이지 않습니다.**

```
assets/village2/
  admin/              # B00(관리자) 전용
    original/           # 원본 이미지
    items/              # 실제로 쓰는 아이템 이미지 (원본을 다듬거나 변환한 결과물)
  students/
    01/ ~ 18/           # B01~B18(학생1~학생18) 전용, 각각 admin과 동일한 original/items 구조
```

- `original/`: 업로드된 원본 이미지를 그대로 보관하는 곳.
- `items/`: 게임에서 실제로 아이템으로 사용하는 이미지. `items.json`을 이 폴더에 넣으면
  `js/main.js`의 `getPersonalItemsPath()`가 자동으로 찾아서 불러옵니다 (아래 경로 규칙 참고).
- 두 폴더 모두 이미지가 채워지기 전까지는 비어 있으므로 `.gitkeep`으로 Git에 폴더 자체가
  유지되게 해뒀습니다. `original/`은 `.gitignore`에서 제외되어 있어(용량이 크고 개인 원본
  자료라 GitHub에 올리지 않음) `.gitkeep`만 추적됩니다.

## 계정 코드 ↔ 폴더 경로 규칙

| 접속 코드 | 이름 | 폴더 |
|---|---|---|
| B00 | 관리자 | `assets/village2/admin/` |
| B01 | 학생1 | `assets/village2/students/01/` |
| B02 | 학생2 | `assets/village2/students/02/` |
| ... | ... | ... |
| B18 | 학생18 | `assets/village2/students/18/` |

`js/main.js`의 `getPersonalItemsPath()`가 접속 코드에서 이 경로를 자동으로 계산합니다
(코드가 늘어나도 이 파일을 손댈 필요 없음). 첫 번째 마을은 `assets/students/README.md`를
참고하세요.

## 아직 안 되어 있는 것

이미지를 원본(`original/`)에서 실제 사용 크기(`items/`)로 자동 변환하는 기능과, `items.json`을
자동으로 만들어주는 기능은 아직 없습니다 (첫 번째 마을과 동일). 지금은 폴더 구조만 준비된
상태이며, 실제 아이템을 쓰려면 `items/` 폴더에 이미지와 `items.json`을 직접 넣어야 합니다.
