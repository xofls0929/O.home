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

interface Entry { id: string; date: string; title: string; body: string; author: 0 | 1; read: boolean }
interface Diary { names: [string, string]; notice: string; since: string; entries: Entry[] }

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (s: string) => s.replace(/-/g, '.');

const EMPTY: Diary = { names: ['모찌피치', '모찌피치킬러'], notice: '', since: ymd(new Date()), entries: [] };

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
  const [draft, setDraft] = useState({ notice: '', since: '', n0: '', n1: '', pw: '' });

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
      setData({ ...EMPTY, ...JSON.parse(plain) });
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
        <div className="cy-frame"><div className="cy-gate">
          <p className="cy-gate-t">💞 커플다이어리</p>
          {isAdmin ? (
            <>
              <p className="cy-gate-d">처음 쓸 비밀번호를 정해 주세요. 이 비밀번호를 아는 사람만 다이어리를 볼 수 있어요.</p>
              <form onSubmit={async e => {
                e.preventDefault();
                if (pwIn.length < 4) { toast('비밀번호는 4자 이상으로 해 주세요'); return; }
                await save(EMPTY, pwIn); setPw(pwIn);
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
        <div className="cy-frame">
          <div className="cy-book">
            {/* 왼쪽 — 폴더 */}
            <aside className="cy-side">
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
                      <span className="tt">{e.title}</span>
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
            </div>
          )}
        </Modal>

        {/* 관리 */}
        <Modal open={mngOpen} onClose={() => setMngOpen(false)} small title="다이어리 관리"
          actions={<>
            <button className="btn btn-ghost" onClick={() => setMngOpen(false)}>CANCEL</button>
            <button className="btn btn-dark" onClick={async () => {
              const next: Diary = {
                ...d, notice: draft.notice.trim(), since: draft.since || d.since,
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
            <label className="k-label">비밀번호 바꾸기 (비우면 그대로)</label>
            <KInput type="password" value={draft.pw} onChange={e => setDraft({ ...draft, pw: e.target.value })} />
          </div>
        </Modal>
        {del.element}
      </section>
    );
  }
}
