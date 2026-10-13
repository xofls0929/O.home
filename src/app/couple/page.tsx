'use client';
/**
 * 커플다이어리 — 싸이월드 커플 다이어리 느낌. 자캐 둘(모찌피치 / 모찌피치킬러)이 번갈아 쓴다.
 *
 * 비밀번호를 알아야 열린다. 화면에서만 가리면 설정 API로 내용이 보이므로
 * 다이어리 전체(공지·만난 날·글)를 비밀번호로 **암호화해서** 사이트 설정 한 칸에 둔다.
 * 비밀번호를 모르면 관리자도 서버에서 내용을 읽을 수 없다. 글쓰기·수정은 관리자만.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getSetting, setSetting, onSettingChange } from '@/lib/settingStore';
import { lockBody, unlockBody, PostLock } from '@/lib/postLock';
import { newId } from '@/lib/postStore';
import { KInput, KTextarea, KDate } from '@/components/ui/Kit';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const KEY = 'ohome.couple.v1';
const PW_KEY = 'ohome.couple.pw';   // 이 탭에서만 기억 — 창을 닫으면 다시 묻는다
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Entry { id: string; date: string; title: string; body: string; author: 0 | 1; read: boolean; photos?: string[] }
interface Diary {
  names: [string, string]; notice: string; since: string; entries: Entry[];
  photo?: string;      // 대문 사진 — data URL로 암호문 안에 같이 들어간다
  seeded?: boolean;    // 첫 글 묶음을 넣었는지
  starterV?: number;   // 첫 글 묶음 판
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (s: string) => s.replace(/-/g, '.');

const EMPTY: Diary = { names: ['모찌피치', '모찌피치킬러'], notice: '', since: ymd(new Date()), entries: [] };

/* 첫 글 묶음 — 관리자가 처음 열 때 한 번만 암호문 안으로 옮긴다(seeded).
   사진 원본(public/deco/couple)은 옮겨진 뒤 저장소에서 지운다 */
const STARTER_PHOTO = '/deco/couple/main.jpg';
const STARTER_NOTICE = '이번주말 바다보러 가기 ♡';
const STARTER_SINCE = '2025-12-25';
// 모찌피치는 상대를 「지훈이」, 모찌피치킬러는 「현준이 / 현준이형 / 현준상」이라고 부른다
// v: 이 글이 처음 들어간 판 — 그 판보다 오래된 다이어리에만 새로 더한다
type Seed = Omit<Entry, 'id' | 'photos'> & { v: number; photoSrc?: string };
const STARTER: Seed[] = [
  { v: 1, date: '2026-10-01', author: 0, read: true, title: 'ㅇr..오늘은 쫌 우울한날..★',
    body: 'ㄴr는 ㄱr끔 눈물을 흘린ㄷr...\n\n그치만 오늘은 아니야 ㅋㅋㅋ\n지훈이가 편의점에서 내가 좋아하는 바나나우유 사왔다 ♡\n빨대까지 꽂아서 줌.. 감동 ㅠ_ㅠ\n\n◆ 오늘의 BGM : 버즈 - 겁쟁이' },
  { v: 1, date: '2026-10-03', author: 1, read: true, title: '안전벨트는 내가 매준다 -_-+',
    body: '차 타자마자 현준이형 벨트 안 매고 딴짓하길래\n내가 직접 매줬다\n\n싫다고 버둥대는거 완전 웃김 ㅋㅋㅋㅋ\n그래도 안전이 최고니까~\n\n현준상 앞으로도 쭉 내가 매줄거임 ㅡ_ㅡv' },
  { v: 1, date: '2026-10-05', author: 0, read: false, title: '지훈이 이 나쁜넘아 ㅠ_ㅠ',
    body: '지훈이 너 벨트 매주는척 하면서 간지럼 태우는거 다 알거든?!\n\n사진 찍힌거 보니까 내 표정 진짜 웃기다...\n이거 대문사진 할까 말까..★\n\n...한다 ㅋㅋ 이미 함 ^^v' },
  { v: 1, date: '2026-10-08', author: 1, read: true, title: '[스크랩] 사랑은... 버스정류장 같은거래',
    body: '사랑은 버스 같은 거래\n놓쳐도 기다리면 또 온대\n\n근데 나는 안 기다릴래\n이미 왔으니까 ^^*\n그치 현준아?\n\n- 퍼가실때 꼭 꼬릿말 남겨주세요 -' },
  { v: 1, date: '2026-10-10', author: 0, read: true, title: '도토리 다 써버렸다..',
    body: '새 배경음악 사려고 도토리 충전했는데\n지훈이 홈피 스킨 바꿔주느라 다 썼다 ㅋㅋ\n\n지훈아 고맙다는 말 한마디 안 하면 일촌 끊음 ㅡㅡ+\n\n…농담이야 ♡' },
  { v: 1, date: '2026-10-12', author: 1, read: false, title: '오늘도 수고했어',
    body: '끝나고 지쳐서 차에서 바로 잠든 현준이형..\n어깨 빌려준 거 기억 안 나지?\n\n현준상 내일도 옆자리는 내가 찜 ♡\n\n◆ 오늘의 BGM : 프리스타일 - Y' },
  // v3 — 사진 글
  { v: 3, date: '2026-09-20', author: 1, read: true, title: '손장난 금지 (근데 내가 함)', photoSrc: '/deco/couple/p1.jpg',
    body: '현준이형 손이 너무 작아서 자꾸 만지게 됨 ㅋㅋ\n형은 핸드크림 바르는 중이었는데\n내가 옆에서 다 뺏어 바름 -_-v\n\n같은 맨투맨 입으니까 커플티 같다고 다들 놀림..\n싫진 않음 ♡\n\n현준상 손 차가우면 말해 내가 녹여줌' },
  { v: 3, date: '2026-09-27', author: 0, read: true, title: '안아줘..★', photoSrc: '/deco/couple/p2.jpg',
    body: '대기실 나가는데 지훈이가 문 앞에 서있길래\n팔 쫙 벌렸더니 웃기만 하고 안 옴 ㅡㅡ\n\n끝까지 버티다가 결국 안겨줌 ㅋㅋㅋ\n옆에서 마스코트도 다 봤다.. 부끄럽ㄷr..\n\n지훈아 다음엔 바로 와라 -_-+\n\n◆ 오늘의 BGM : SG워너비 - 내사람' },
  { v: 3, date: '2026-10-07', author: 0, read: false, title: '어깨 좀 빌릴게 (_ _)zZ', photoSrc: '/deco/couple/p3.jpg',
    body: '공항에서 기다리는데 너무 졸려서\n지훈이 어깨에 턱 올려놓음 ㅋㅋ\n지훈이는 천장만 보고 있음.. 뭐 생각했냐 너\n\n빨간 후드 맞춰입은거 우리 진짜 쌍둥이같다~\n\n사진 찍어주신 분 감사합니다 ^^*\n이 사진 평생 간직할거임 ♡' },
  // v4 — 사진 글에 상대가 남긴 답 일기 (사진 없음)
  { v: 4, date: '2026-09-20', author: 0, read: true, title: '내 핸드크림 돌려줘 ㅡㅡ',
    body: '지훈이가 내 핸드크림 반 통을 혼자 다 씀..\n새로 사놔라 ㅡㅡ+\n\n근데 손 잡고 있으니까 따뜻하긴 하더라..\n그래서 내일도 크림 바를 예정 ^^;\n\n맨투맨 맞춰입은거 아니라고 몇 번 말했냐 ㅋㅋ' },
  { v: 4, date: '2026-09-27', author: 1, read: false, title: '일부러 버틴거임 ㅋ',
    body: '현준이형 팔 벌리고 서있는거 너무 귀여워서\n일부러 안 감 ㅋㅋㅋ\n\n표정 점점 시무룩해지는거 보고 바로 감..\n현준상 삐지면 안 됨 ♡\n\n근데 마스코트가 형 보고 웃는거 같았음.. 질투남 -_-' },
  { v: 4, date: '2026-10-07', author: 1, read: true, title: '천장 본 이유',
    body: '현준이가 어깨에 턱 올리고 자길래\n움직이면 깰까봐 천장만 봤다 ㅋㅋ\n목 아파 죽는줄..\n\n그래도 현준이형 숨소리 들려서 좋았음 ♡\n\n다음엔 내가 기댈 차례임 ㅡ_ㅡv' },
];
/** 첫 글 묶음 판 — 2: 서로 부르는 이름 반영 / 3: 사진 글 3개 / 4: 사진 글에 상대가 쓴 답 일기 */
const STARTER_V = 4;
const OLD_TITLES: Record<string, string> = { '2026-10-05': '킬러 이 나쁜넘아 ㅠ_ㅠ' };

async function toDataUrl(src: string): Promise<string | undefined> {
  try {
    const b = await (await fetch(src)).blob();
    if (!b.type.startsWith('image/')) return undefined;
    return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b); });
  } catch { return undefined; }
}

async function seedEntry(x: Seed): Promise<Entry> {
  const { v: _v, photoSrc, ...rest } = x;
  const photo = photoSrc ? await toDataUrl(photoSrc) : undefined;
  return { ...rest, id: newId(), ...(photo ? { photos: [photo] } : {}) };
}

/** 이미 넣은 다이어리를 새 판으로 — 고친 문장은 바꾸고, 새 글은 더한다(직접 쓴 글은 그대로) */
async function upgradeStarter(d: Diary): Promise<Diary> {
  const from = d.starterV ?? 1;
  if (from >= STARTER_V) return d;
  let entries = d.entries;
  if (from < 2) {
    entries = entries.map(e => {
      const st = STARTER.find(x => x.v === 1 && x.date === e.date && x.author === e.author
        && (x.title === e.title || OLD_TITLES[x.date] === e.title));
      return st ? { ...e, title: st.title, body: st.body } : e;
    });
  }
  const add = STARTER.filter(x => x.v > from
    && !entries.some(e => e.date === x.date && e.author === x.author && e.title === x.title));
  return { ...d, entries: [...entries, ...await Promise.all(add.map(seedEntry))], starterV: STARTER_V };
}

/** 첫 글 묶음·사진·공지를 채운다 — 이미 쓴 글은 그대로 두고 뒤에 더한다 */
async function withStarter(d: Diary): Promise<Diary> {
  if (d.seeded) return upgradeStarter(d);
  return {
    ...d,
    seeded: true,
    starterV: STARTER_V,
    notice: d.notice || STARTER_NOTICE,
    since: d.entries.length ? d.since : STARTER_SINCE,
    photo: d.photo ?? await toDataUrl(STARTER_PHOTO),
    entries: [...d.entries, ...await Promise.all(STARTER.map(seedEntry))],
  };
}

/** 글에 붙일 사진 — 긴 변 720px JPEG로 줄여 암호문이 너무 커지지 않게 */
async function shrink(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export default function CouplePage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const [vault, setVault] = useState<PostLock | null | undefined>(undefined);
  const [pw, setPw] = useState<string | null>(null);
  const [data, setData] = useState<Diary | null>(null);
  const [pwIn, setPwIn] = useState('');
  const [busy, setBusy] = useState(false);

  // 화면 상태
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState<string | null>(null);
  const [who, setWho] = useState<0 | 1 | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Entry | null>(null);
  const [mngOpen, setMngOpen] = useState(false);
  const [draft, setDraft] = useState<{ notice: string; since: string; n0: string; n1: string; pw: string; photo?: string }>({ notice: '', since: '', n0: '', n1: '', pw: '' });

  /* 저장된 금고 읽기 + 이 탭에서 이미 열었으면 바로 연다 */
  useEffect(() => {
    const load = () => setVault(getSetting<PostLock | null>(KEY, null));
    load();
    return onSettingChange(k => { if (k === KEY) load(); });
  }, []);
  useEffect(() => {
    if (!vault || pw) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(PW_KEY); } catch { /* 무시 */ }
    if (saved) void open(saved, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault]);

  const open = async (p: string, silent = false) => {
    if (!vault) return;
    setBusy(true);
    const plain = await unlockBody(vault, p);
    setBusy(false);
    if (plain == null) {
      if (!silent) toast('비밀번호가 맞지 않아요');
      try { sessionStorage.removeItem(PW_KEY); } catch { /* 무시 */ }
      return;
    }
    try {
      let d: Diary = { ...EMPTY, ...JSON.parse(plain) };
      if (isAdmin && (!d.seeded || (d.starterV ?? 1) < STARTER_V)) {
        d = await withStarter(d);
        setSetting(KEY, await lockBody(JSON.stringify(d), p));
      }
      setData(d);
      setPw(p);
      try { sessionStorage.setItem(PW_KEY, p); } catch { /* 무시 */ }
    } catch { toast('다이어리를 읽지 못했어요'); }
  };

  /** 바꾼 내용을 같은 비밀번호(또는 새 비밀번호)로 다시 잠가 저장 */
  const save = async (next: Diary, withPw = pw) => {
    if (!withPw) return;
    setData(next);
    const v = await lockBody(JSON.stringify(next), withPw);
    setSetting(KEY, v);
  };

  const lock = () => {
    setPw(null); setData(null); setPwIn('');
    try { sessionStorage.removeItem(PW_KEY); } catch { /* 무시 */ }
  };

  /* ---------- 처음: 금고가 없을 때 ---------- */
  if (vault === undefined) return <section className="page" />;
  if (!vault) {
    return (
      <section className="page">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@latest/dist/galmuri.css" />
        <div className="cy-frame"><div className="cy-gate">
          <p className="cy-gate-t">💞 커플다이어리</p>
          {isAdmin ? (
            <>
              <p className="cy-gate-d">처음 쓸 비밀번호를 정해 주세요. 이 비밀번호를 아는 사람만 다이어리를 볼 수 있어요.</p>
              <form onSubmit={async e => {
                e.preventDefault();
                if (pwIn.length < 4) { toast('비밀번호는 4자 이상으로 해 주세요'); return; }
                await save(await withStarter(EMPTY), pwIn); setPw(pwIn);
                try { sessionStorage.setItem(PW_KEY, pwIn); } catch { /* 무시 */ }
              }}>
                <KInput type="password" placeholder="새 비밀번호" value={pwIn} onChange={e => setPwIn(e.target.value)} />
                <button className="btn btn-accent">만들기</button>
              </form>
            </>
          ) : <p className="cy-gate-d">아직 준비 중이에요</p>}
        </div></div>
      </section>
    );
  }

  /* ---------- 잠겨 있을 때 ---------- */
  if (!data || !pw) {
    return (
      <section className="page">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@latest/dist/galmuri.css" />
        <div className="cy-frame"><div className="cy-gate">
          <p className="cy-gate-t">🔒 커플다이어리</p>
          <p className="cy-gate-d">비밀번호를 입력해야 볼 수 있어요</p>
          <form onSubmit={e => { e.preventDefault(); void open(pwIn); }}>
            <KInput type="password" placeholder="비밀번호" value={pwIn} onChange={e => setPwIn(e.target.value)} autoFocus />
            <button className="btn btn-accent" disabled={busy}>{busy ? '여는 중…' : '열기'}</button>
          </form>
        </div></div>
      </section>
    );
  }

  // 함수로 바로 부른다 — <DiaryView />로 쓰면 렌더마다 새 컴포넌트가 돼 입력 중 포커스가 날아간다
  return DiaryView();

  /* ---------- 열린 다이어리 ---------- */
  function DiaryView() {
    const d = data!;
    const y = month.getFullYear(), m = month.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const monthKey = `${y}-${pad(m + 1)}`;
    const days = new Set(d.entries.filter(e => e.date.startsWith(monthKey)).map(e => e.date));
    const sel = day ? new Date(day) : today;
    const met = Math.floor((Date.parse(ymd(today)) - Date.parse(d.since)) / 86400000) + 1;
    const recent = (a: 0 | 1) => d.entries.some(e => e.author === a && Date.parse(ymd(today)) - Date.parse(e.date) < 3 * 86400000);

    const list = d.entries
      .filter(e => (day ? e.date === day : e.date.startsWith(monthKey)))
      .filter(e => who == null || e.author === who)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    const dayCell = (n: number) => {
      const ds = `${monthKey}-${pad(n)}`;
      const dow = new Date(y, m, n).getDay();
      return (
        <button key={n} type="button"
          className={`cy-d${days.has(ds) ? ' has' : ''}${dow === 0 ? ' sun' : ''}${day === ds ? ' on' : ''}${ds === ymd(today) ? ' today' : ''}`}
          onClick={() => setDay(day === ds ? null : ds)}>{n}</button>
      );
    };

    return (
      <section className="page">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@latest/dist/galmuri.css" />
        <div className="cy-frame">
          <div className="cy-book">
            {/* 왼쪽 — 폴더 */}
            <aside className="cy-side">
              <p className="cy-count">TODAY <b>{d.entries.filter(e => e.date === ymd(today)).length}</b> | TOTAL <b>{d.entries.length}</b></p>
              {d.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cy-photo" src={d.photo} alt="" />
              )}
              <p className="cy-brand">DIARY</p>
              <button className={`cy-fold${who == null && !day ? ' on' : ''}`} onClick={() => { setWho(null); setDay(null); }}>📒 전체보기</button>
              <p className="cy-our">우리다이어리</p>
              {([0, 1] as const).map(a => (
                <button key={a} className={`cy-fold cy-who${who === a ? ' on' : ''}`} onClick={() => setWho(who === a ? null : a)}>
                  <span className={`cy-heart a${a}`}>♥</span> {d.names[a]}
                  {recent(a) && <i className="cy-new">N</i>}
                </button>
              ))}
              <div className="cy-side-foot">
                {isAdmin && (
                  <button className="cy-mng" onClick={() => {
                    setDraft({ notice: d.notice, since: d.since, n0: d.names[0], n1: d.names[1], pw: '' });
                    setMngOpen(true);
                  }}>⚙ 다이어리 관리하기</button>
                )}
                <button className="cy-mng" onClick={lock}>🔒 잠그기</button>
              </div>
            </aside>
            <div className="cy-rings" aria-hidden><i /><i /></div>

            {/* 오른쪽 — 달력 · 공지 · 목록 */}
            <div className="cy-main">
              <div className="cy-cal">
                <div className="cy-big">
                  <b>{pad(sel.getMonth() + 1)}.{pad(sel.getDate())}</b>
                  <span>{WEEK[sel.getDay()]}</span>
                </div>
                <div className="cy-days">
                  <div className="cy-mon">
                    <button type="button" onClick={() => { setMonth(new Date(y, m - 1, 1)); setDay(null); }}>◀</button>
                    <b>{y}.{pad(m + 1)}</b>
                    <button type="button" onClick={() => { setMonth(new Date(y, m + 1, 1)); setDay(null); }}>▶</button>
                    {Array.from({ length: 13 }, (_, i) => dayCell(i + 1))}
                  </div>
                  <div className="cy-row2">{Array.from({ length: last - 13 }, (_, i) => dayCell(i + 14))}</div>
                </div>
              </div>
              <div className="cy-notice">
                <span><b>공지사항</b> {d.notice || '—'}</span>
                <span>만남 <em>{met > 0 ? met : 0}</em>일째</span>
              </div>

              <div className="cy-list">
                <div className="cy-th">
                  <span>작성일</span><span>제목</span><span>작성자</span><span>읽음</span>
                </div>
                {list.map(e => (
                  <React.Fragment key={e.id}>
                    <div className={`cy-tr${openId === e.id ? ' open' : ''}`} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                      <span className="dt">{fmt(e.date)}</span>
                      <span className="tt">{e.title}{(e.photos ?? []).length > 0 && <i className="cy-cam">📷</i>}</span>
                      <span className={`au a${e.author}`}>{d.names[e.author]}<i>♥</i></span>
                      <span className="rd">
                        {isAdmin
                          ? <button type="button" data-tip="눌러서 읽음 바꾸기" onClick={ev => {
                            ev.stopPropagation();
                            void save({ ...d, entries: d.entries.map(x => (x.id === e.id ? { ...x, read: !x.read } : x)) });
                          }}>{e.read ? 'O' : 'X'}</button>
                          : (e.read ? 'O' : 'X')}
                      </span>
                    </div>
                    {openId === e.id && (
                      <div className="cy-body">
                        {(e.photos ?? []).map((ph, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} className="cy-pic" src={ph} alt="" />
                        ))}
                        <p>{e.body}</p>
                        {isAdmin && (
                          <div className="cy-acts">
                            <button className="btn btn-ghost" onClick={() => setForm({ ...e })}>수정</button>
                            <button className="btn btn-ghost" onClick={() => del.ask('이 글을 지울까요?', () => {
                              void save({ ...d, entries: d.entries.filter(x => x.id !== e.id) });
                              setOpenId(null);
                            })}>삭제</button>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
                {list.length === 0 && <p className="cy-empty">{day ? `${fmt(day)}에는 쓴 글이 없어요` : '이 달에는 쓴 글이 없어요'}</p>}
              </div>
              {isAdmin && (
                <div className="cy-write">
                  <button className="btn btn-accent" onClick={() => setForm({
                    id: '', date: day ?? ymd(today), title: '', body: '', author: who ?? 0, read: false,
                  })}>✎ 글쓰기</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 글쓰기 / 수정 */}
        <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? '글 수정' : '다이어리 쓰기'}
          actions={<>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>CANCEL</button>
            <button className="btn btn-dark" onClick={() => {
              if (!form) return;
              if (!form.title.trim()) { toast('제목을 입력해 주세요'); return; }
              const e: Entry = { ...form, id: form.id || newId(), title: form.title.trim() };
              const entries = form.id ? d.entries.map(x => (x.id === e.id ? e : x)) : [...d.entries, e];
              void save({ ...d, entries });
              setForm(null); setOpenId(e.id);
              const [ey, em] = e.date.split('-').map(Number);
              setMonth(new Date(ey, em - 1, 1));
            }}>SAVE</button>
          </>}>
          {form && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="cy-pick">
                {([0, 1] as const).map(a => (
                  <button key={a} type="button" className={form.author === a ? `on a${a}` : ''}
                    onClick={() => setForm({ ...form, author: a })}>♥ {d.names[a]}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <KInput placeholder="제목" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ flex: 1 }} />
                <KDate value={form.date} onChange={v => setForm({ ...form, date: v })} style={{ maxWidth: 130 }} />
              </div>
              <KTextarea placeholder="오늘 있었던 일" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} style={{ minHeight: 200 }} />
              <div className="cy-thumbs">
                {(form.photos ?? []).map((ph, i) => (
                  <span key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph} alt="" />
                    <button type="button" onClick={() => setForm({ ...form, photos: (form.photos ?? []).filter((_, j) => j !== i) })}>✕</button>
                  </span>
                ))}
                <label className="cy-add">📷 사진 넣기
                  <input type="file" accept="image/*" multiple hidden onChange={async e => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    const add = await Promise.all(files.map(shrink));
                    setForm(f => (f ? { ...f, photos: [...(f.photos ?? []), ...add] } : f));
                  }} />
                </label>
              </div>
            </div>
          )}
        </Modal>

        {/* 관리 */}
        <Modal open={mngOpen} onClose={() => setMngOpen(false)} small title="다이어리 관리"
          actions={<>
            <button className="btn btn-ghost" onClick={() => setMngOpen(false)}>CANCEL</button>
            <button className="btn btn-dark" onClick={async () => {
              const next: Diary = {
                ...d, notice: draft.notice.trim(), since: draft.since || d.since, photo: draft.photo ?? d.photo,
                names: [draft.n0.trim() || d.names[0], draft.n1.trim() || d.names[1]],
              };
              if (draft.pw && draft.pw.length < 4) { toast('비밀번호는 4자 이상으로 해 주세요'); return; }
              const p = draft.pw || pw;
              await save(next, p);
              if (draft.pw) {
                setPw(draft.pw);
                try { sessionStorage.setItem(PW_KEY, draft.pw); } catch { /* 무시 */ }
                toast('비밀번호를 바꿨어요');
              }
              setMngOpen(false);
            }}>SAVE</button>
          </>}>
          <div style={{ display: 'grid', gap: 10 }}>
            <label className="k-label">공지사항</label>
            <KInput value={draft.notice} onChange={e => setDraft({ ...draft, notice: e.target.value })} placeholder="이번 주말 바다 보러 가기" />
            <label className="k-label">처음 만난 날 (만남 N일째)</label>
            <KDate value={draft.since} onChange={v => setDraft({ ...draft, since: v })} />
            <label className="k-label">쓰는 사람 이름</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput value={draft.n0} onChange={e => setDraft({ ...draft, n0: e.target.value })} />
              <KInput value={draft.n1} onChange={e => setDraft({ ...draft, n1: e.target.value })} />
            </div>
            <label className="k-label">대문 사진</label>
            <input type="file" accept="image/*" onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const url = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
              setDraft({ ...draft, photo: url });
            }} />
            <label className="k-label">비밀번호 바꾸기 (비우면 그대로)</label>
            <KInput type="password" value={draft.pw} onChange={e => setDraft({ ...draft, pw: e.target.value })} />
          </div>
        </Modal>
        {del.element}
      </section>
    );
  }
}
