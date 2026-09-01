# 꾸미기 아이템 (테스트용)

꾸미기 기능 1차 프로토타입에서 쓰는 테스트용 아이템 이미지입니다. 전부 간단한 SVG로 직접 그린 임시
그림이며, 나중에 실제 아이템 그림으로 교체될 예정입니다.

- tree.svg (나무)
- flower.svg (꽃)
- bench.svg (벤치)
- lamp.svg (가로등)
- fence.svg (울타리)

카탈로그 정의는 [js/main.js](../../../js/main.js)의 `ITEM_CATALOG`에 있습니다. 이미지를 교체하거나
추가할 때는 이 폴더에 파일을 넣고 `ITEM_CATALOG`에 항목만 추가하면 됩니다.

학생별 전용 아이템은 이 폴더가 아니라 `assets/students/<번호>/`에 넣고, `ITEM_CATALOG` 항목에
`ownerCode`처럼 소유자를 구분하는 필드를 추가하는 방식으로 확장하면 됩니다 (아직 미구현).
