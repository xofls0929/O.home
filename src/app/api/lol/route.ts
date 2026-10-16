// 라이엇 Data Dragon 중계 — 직관기록의 챔피언 이름·아이콘.
// 보는 사람 네트워크(광고 차단·회사망 등)에서 ddragon 주소가 막혀도 사진이 뜨게, 우리 서버를 거쳐 받는다.
// 아무 주소나 대신 받아 주는 통로가 되지 않게 버전 목록 · 챔피언 목록 · 챔피언 아이콘만 허용한다.
const ALLOWED = /^(api\/versions\.json|cdn\/[\d.]+\/(data\/ko_KR\/champion\.json|img\/champion\/[A-Za-z0-9]+\.png))$/;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get('p') ?? '';
  if (!ALLOWED.test(p)) return new Response('not allowed', { status: 400 });
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/${p}`, { next: { revalidate: p.startsWith('api/') ? 3600 : 604800 } });
    if (!res.ok) return new Response('fetch failed', { status: res.status });
    return new Response(await res.arrayBuffer(), {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        // 버전 목록은 한 시간, 나머지(버전이 주소에 박힌 파일)는 일주일
        'cache-control': p.startsWith('api/') ? 'public, max-age=3600, s-maxage=3600' : 'public, max-age=604800, s-maxage=604800, immutable',
      },
    });
  } catch {
    return new Response('fetch failed', { status: 502 });
  }
}
