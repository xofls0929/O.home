// 아이클라우드 공개 캘린더(.ics) 중계 — 스케줄러가 아이클라우드 일정을 겹쳐 보일 때 쓴다.
//
// 아이클라우드 캘린더 서버는 CORS 허용 헤더를 주지 않아 브라우저에서 바로 받을 수 없다.
// 이 라우트가 서버에서 대신 받아 같은 출처로 내준다.
// 아무 주소나 대신 받아 주는 통로가 되지 않게 아이클라우드 호스트만 허용한다.
const ALLOWED = [/(^|\.)icloud\.com$/];

export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get('u') ?? '').trim().replace(/^webcals?:\/\//i, 'https://');
  let target: URL;
  try { target = new URL(raw); } catch { return new Response('bad url', { status: 400 }); }
  if (target.protocol !== 'https:' || !ALLOWED.some(r => r.test(target.hostname))) {
    return new Response('host not allowed', { status: 400 });
  }
  try {
    const res = await fetch(target, { cache: 'no-store' });
    if (!res.ok) return new Response('fetch failed', { status: 502 });
    return new Response(await res.text(), {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        // 캘린더는 자주 바뀌지 않는다 — 5분 캐시로 아이클라우드 호출을 줄인다
        'cache-control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response('fetch failed', { status: 502 });
  }
}
