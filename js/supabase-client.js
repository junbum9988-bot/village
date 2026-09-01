/**
 * Supabase 클라이언트 초기화.
 *
 * 이 프로젝트는 빌드 과정이 없는 순수 정적 사이트라 번들러/프레임워크(Vite, Next.js 등)를
 * 전제로 하는 방식 대신, 브라우저가 그대로 실행할 수 있는 ES 모듈 + CDN import를 쓴다
 * (Supabase 공식 문서의 "번들러 없이 쓰기" 방식과 동일: https://esm.sh 에서 ESM 빌드를 받아온다).
 * index.html에서 이 파일을 <script type="module">로 불러온다.
 *
 * 중요: 이 파일의 최상위 코드는 CDN import를 기다리지 않고(top-level await 없이) 곧바로
 * 끝난다. 대신 "클라이언트가 준비되면(혹은 실패하면) 풀리는 Promise"를
 * window.SupabaseClientReady 에 담아 둔다. CDN이 느리거나 오프라인이어서 import가 오래
 * 걸리거나 실패해도, 모듈 스크립트는 DOMContentLoaded 이전에 실행이 끝나야 하므로
 * (그렇지 않으면 로그인 화면 자체가 뜨는 게 늦어진다) - 실제로 기다리는 지점은
 * js/main.js가 배치된 아이템을 최초로 불러오는 시점 하나뿐이다.
 */
window.SupabaseClientReady = (async () => {
  try {
    const config = window.SUPABASE_CONFIG;
    if (!config || !config.url || !config.publishableKey) {
      throw new Error("SUPABASE_CONFIG(js/supabase-config.js)가 없거나 값이 비어 있습니다.");
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    return createClient(config.url, config.publishableKey);
  } catch (err) {
    // 여기서 실패해도 게임 자체는 계속 동작해야 한다 - 배치된 아이템 저장/동기화만 못 할 뿐,
    // 로그인/이동/꾸미기(로컬)는 그대로 쓸 수 있다. js/main.js는 이 값이 null이면 그렇게 처리한다.
    console.error(
      "Supabase 클라이언트를 초기화하지 못했습니다 (배치된 아이템 저장/실시간 동기화 없이 로컬 전용으로 계속 동작합니다):",
      err
    );
    return null;
  }
})();
