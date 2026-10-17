// 오버워치 영웅 목록·초상화 중계 — 직관기록(OWCS)의 영웅 밴·영웅 아이콘.
// 보는 사람 네트워크에서 외부 주소가 막혀도 뜨게 우리 서버를 거친다.
// 아무 주소나 대신 받아 주지 않게 영웅 목록(OverFast API)과 블리자드 초상화 파일만 허용한다.
const IMG = /^[a-f0-9]{64}\.png$/;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const img = sp.get('img');
  const url = img
    ? (IMG.test(img) ? `https://d15f34w2p8l1cc.cloudfront.net/overwatch/${img}` : null)
    : sp.get('p') === 'heroes' ? 'https://overfast-api.tekrop.fr/heroes?locale=ko-kr' : null;
  if (!url) return new Response('not allowed', { status: 400 });
  try {
    const res = await fetch(url, { next: { revalidate: img ? 604800 : 86400 } });
    if (!res.ok) return new Response('fetch failed', { status: res.status });
    return new Response(await res.arrayBuffer(), {
      headers: {
        'content-type': res.headers.get('content-type') ?? (img ? 'image/png' : 'application/json'),
        'cache-control': img ? 'public, max-age=604800, s-maxage=604800, immutable' : 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return new Response('fetch failed', { status: 502 });
  }
}
