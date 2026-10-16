'use client';
/**
 * 직관기록 — 경기장에서 본 롤 경기를 경기(시리즈) 단위로 남긴다.
 *
 * 목록 카드: 경기명 · POM · 승패 · 도란(기준 선수)이 한 챔피언
 * 상세: 1세트 · 2세트 · … 스코어보드 + 총평
 *
 * 관리자만 쓰는 기록이라 사이트 설정 한 칸(ohome.live.v1)에 통째로 둔다 — 테이블을 새로 만들 필요가 없다.
 * 챔피언 아이콘은 라이엇 Data Dragon(한국어 이름 → 아이콘)을 쓴다 — /api/lol 중계를 거친다.
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getSetting, setSetting, onSettingChange } from '@/lib/settingStore';
import { newId } from '@/lib/postStore';
import { KInput, KTextarea, KDate } from '@/components/ui/Kit';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const KEY = 'ohome.live.v1';
const CATS = ['LCK', 'KBO', 'OWCS'];
/** 양식이 준비된 분류 — 지금은 롤(LCK) 스코어보드만. KBO·OWCS 양식은 같이 정한 뒤에 연다 */
const READY = ['LCK'];

type Side = 'A' | 'B';
interface P { name: string; champ: string; k: number; d: number; a: number; gold: number }   // gold: 천 단위(13.2 = 13.2K)
interface Obj { towers: number; grubs: number; dragons: number; barons: number }
interface LSet {
  blue: Side;                 // 블루 진영 팀
  winner: Side | '';
  time: string;               // 34:23
  bans: Record<Side, string[]>;
  players: Record<Side, P[]>;
  obj: Record<Side, Obj>;
  note: string;
}
interface Rec {
  id: string; cat: string;
  title: string;              // 경기명 — 2026 LCK Road to MSI 1라운드
  date: string; venue: string; seat: string;
  teamA: string; teamB: string;
  rosterA: string[]; rosterB: string[];
  focus: string;              // 기준 선수 (카드에 이 선수의 챔피언이 뜬다)
  pom: string;
  sets: LSet[];
  review: string;
}

const emptyObj = (): Obj => ({ towers: 0, grubs: 0, dragons: 0, barons: 0 });
const emptyP = (name = ''): P => ({ name, champ: '', k: 0, d: 0, a: 0, gold: 0 });
const newSet = (r: Rec): LSet => ({
  blue: 'A', winner: '', time: '',
  bans: { A: ['', '', '', '', ''], B: ['', '', '', '', ''] },
  players: { A: r.rosterA.map(n => emptyP(n)), B: r.rosterB.map(n => emptyP(n)) },
  obj: { A: emptyObj(), B: emptyObj() }, note: '',
});
const ROLES = ['탑', '정글', '미드', '원딜', '서폿'];
const emptyRec = (): Rec => ({
  id: '', cat: 'LCK', title: '', date: '', venue: '', seat: '',
  teamA: '', teamB: '', rosterA: ['', '', '', '', ''], rosterB: ['', '', '', '', ''],
  focus: 'Doran', pom: '', sets: [], review: '',
});

const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');
const same = (a: string, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
const teamName = (r: Rec, s: Side) => (s === 'A' ? r.teamA : r.teamB) || (s === 'A' ? 'A팀' : 'B팀');

function focusSide(r: Rec): Side | null {
  if (r.rosterA.some(n => same(n, r.focus))) return 'A';
  if (r.rosterB.some(n => same(n, r.focus))) return 'B';
  for (const s of r.sets) {
    if (s.players.A.some(p => same(p.name, r.focus))) return 'A';
    if (s.players.B.some(p => same(p.name, r.focus))) return 'B';
  }
  return null;
}
const wins = (r: Rec, side: Side) => r.sets.filter(s => s.winner === side).length;
function result(r: Rec): 'WIN' | 'LOSS' | '' {
  const f = focusSide(r);
  if (!f) return '';
  const a = wins(r, f), b = wins(r, other(f));
  return a === b ? '' : a > b ? 'WIN' : 'LOSS';
}
const focusChamps = (r: Rec) => {
  const f = focusSide(r);
  if (!f) return [];
  return r.sets.map(s => s.players[f].find(p => same(p.name, r.focus))?.champ ?? '').filter(Boolean);
};

/* ---------- 챔피언 아이콘 (Data Dragon) ---------- */
interface Champ { id: string; name: string; key: string; cho: string }   // key: 공백 뺀 이름, cho: 초성
interface Champs { ver: string; list: Champ[] }
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const choOf = (t: string) => Array.from(t).map(ch => {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
}).join('');
const norm = (t: string) => t.replace(/[\s'.]/g, '').toLowerCase();

let champsP: Promise<Champs> | null = null;
function loadChamps(): Promise<Champs> {
  if (!champsP) {
    champsP = (async () => {
      const ver = ((await (await fetch('/api/lol?p=api/versions.json')).json()) as string[])[0];
      const data = (await (await fetch(`/api/lol?p=cdn/${ver}/data/ko_KR/champion.json`)).json())
        .data as Record<string, { id: string; name: string }>;
      const list = Object.values(data)
        .map(c => ({ id: c.id, name: c.name, key: norm(c.name), cho: choOf(norm(c.name)) }))
        .sort((x, y) => x.name.localeCompare(y.name, 'ko'));
      return { ver, list };
    })().catch(() => { champsP = null; return { ver: '', list: [] }; });
  }
  return champsP;
}
function useChamps() {
  const [c, setC] = useState<Champs | null>(null);
  useEffect(() => { void loadChamps().then(setC); }, []);
  return c;
}
/** 입력한 글자에 맞는 챔피언들 — 한글 이름 · 영어 이름 · 초성(ㄹㅂㄹ) 모두 */
function matchChamps(c: Champs | null, q: string): Champ[] {
  const n = norm(q);
  if (!c || !n) return [];
  const exact = c.list.filter(x => x.key === n || x.id.toLowerCase() === n);
  const starts = c.list.filter(x => !exact.includes(x)
    && (x.key.startsWith(n) || x.id.toLowerCase().startsWith(n) || x.cho.startsWith(n)));
  const has = c.list.filter(x => !exact.includes(x) && !starts.includes(x)
    && (x.key.includes(n) || x.cho.includes(n)));
  return [...exact, ...starts, ...has];
}
/** 이름 하나를 챔피언 하나로 — 딱 맞거나, 후보가 하나뿐이면 그걸로 */
function resolveChamp(c: Champs | null, q: string): Champ | null {
  const m = matchChamps(c, q);
  if (!m.length) return null;
  const n = norm(q);
  if (m[0].key === n || m[0].id.toLowerCase() === n) return m[0];
  return m.length === 1 || n.length >= 2 ? m[0] : null;
}
const iconUrl = (c: Champs, x: Champ) => `/api/lol?p=cdn/${c.ver}/img/champion/${x.id}.png`;   // 우리 서버를 거쳐 받는다

function ChampIcon({ name, size = 40, champs }: { name: string; size?: number; champs: Champs | null }) {
  const x = name ? resolveChamp(champs, name) : null;
  if (x && champs?.ver) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="lv-ch" src={iconUrl(champs, x)} alt={x.name} title={x.name} style={{ width: size, height: size }} />;
  }
  return <span className="lv-ch lv-ch-ph" style={{ width: size, height: size }} title={name}>{name ? name.slice(0, 1) : ''}</span>;
}

/** 챔피언 입력칸 — 치는 대로 아이콘이 붙고, 아래에 후보가 사진과 함께 뜬다. 칸을 벗어나면 정식 이름으로 맞춰 준다 */
function ChampInput({ value, onChange, champs, placeholder = '챔피언' }: {
  value: string; onChange: (v: string) => void; champs: Champs | null; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const cands = useMemo(() => matchChamps(champs, value).slice(0, 8), [champs, value]);
  const cur = resolveChamp(champs, value);
  const pick = (x: Champ) => { onChange(x.name); setOpen(false); };
  return (
    <div className="lv-ci">
      {cur && champs
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="lv-ci-ic" src={iconUrl(champs, cur)} alt="" />
        : <span className="lv-ci-ic ph" />}
      <input className="k-input" value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          const x = resolveChamp(champs, value);
          if (x && x.name !== value) onChange(x.name);
        }, 150)}
        onKeyDown={e => {
          if (!open || !cands.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(cands.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(cands[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && value && cands.length > 0 && champs && (
        <ul className="lv-ci-list">
          {cands.map((x, i) => (
            <li key={x.id} className={i === hi ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(x); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconUrl(champs, x)} alt="" /> {x.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- 페이지 ---------- */
function LiveInner() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get('r');
  const champs = useChamps();
  const [list, setList] = useState<Rec[]>([]);
  const [cat, setCat] = useState('LCK');
  const [form, setForm] = useState<Rec | null>(null);

  useEffect(() => {
    const load = () => setList(getSetting<Rec[]>(KEY, []));
    load();
    return onSettingChange(k => { if (k === KEY) load(); });
  }, []);

  const save = (next: Rec[]) => { setList(next); setSetting(KEY, next); };
  const shown = list.filter(r => r.cat === cat).sort((a, b) => b.date.localeCompare(a.date));
  const open = list.find(r => r.id === openId);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href="/live">LIVE</PageTitle>
        <EditableDesc k="live-desc" def="경기장에서 직접 본 경기 기록" />
      </div>

      {open ? (
        <LiveDetail r={open} champs={champs} onBack={() => router.push('/live')}
          onEdit={isAdmin ? () => setForm(structuredClone(open)) : undefined}
          onDelete={isAdmin ? () => { save(list.filter(x => x.id !== open.id)); router.push('/live'); } : undefined} />
      ) : (
        <>
          <div className="toolrow">
            <div className="seg">
              {CATS.map(c => (
                <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
                  {c} <small>{list.filter(r => r.cat === c).length}</small>
                </button>
              ))}
            </div>
            {isAdmin && READY.includes(cat) && (
              <button className="btn btn-dark" onClick={() => setForm({ ...emptyRec(), cat })}>＋ 직관 기록</button>
            )}
          </div>
          <div className="lv-cards">
            {shown.map(r => {
              const res = result(r);
              const f = focusSide(r);
              return (
                <button key={r.id} type="button" className={`lv-card ${res.toLowerCase()}`} onClick={() => router.push(`/live?r=${r.id}`)}>
                  <div className="lv-card-top">
                    <span>{r.date.replace(/-/g, '.')}{r.venue && ` · ${r.venue}`}</span>
                    {res && <b className={`lv-res ${res.toLowerCase()}`}>{res}</b>}
                  </div>
                  <p className="lv-card-title">{r.title || '경기명 없음'}</p>
                  <p className="lv-card-vs">
                    <span className={f === 'A' ? 'me' : ''}>{teamName(r, 'A')}</span>
                    <b>{wins(r, 'A')} : {wins(r, 'B')}</b>
                    <span className={f === 'B' ? 'me' : ''}>{teamName(r, 'B')}</span>
                  </p>
                  <div className="lv-card-foot">
                    <span className="lv-pom">POM <b>{r.pom || '—'}</b></span>
                    <span className="lv-focus">
                      <small>{r.focus}</small>
                      {focusChamps(r).map((c, i) => <ChampIcon key={i} name={c} size={26} champs={champs} />)}
                    </span>
                  </div>
                </button>
              );
            })}
            {shown.length === 0 && (
              <div className="panel lv-empty">
                {READY.includes(cat) ? `아직 ${cat} 직관 기록이 없어요` : `${cat} 직관 기록 양식은 준비 중이에요`}
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} dirty title={form?.id ? '직관 기록 수정' : '직관 기록 추가'}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setForm(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            if (!form) return;
            const r = { ...form, id: form.id || newId() };
            save(form.id ? list.map(x => (x.id === r.id ? r : x)) : [...list, r]);
            setForm(null);
            router.push(`/live?r=${r.id}`);
          }}>SAVE</button>
        </>}>
        {form && <LiveForm r={form} set={setForm} champs={champs} />}
      </Modal>
    </section>
  );
}

/* ---------- 상세 ---------- */
function LiveDetail({ r, champs, onBack, onEdit, onDelete }: {
  r: Rec; champs: Champs | null; onBack: () => void; onEdit?: () => void; onDelete?: () => void;
}) {
  const [tab, setTab] = useState(0);   // 0..sets-1 = 세트, sets.length = 총평
  const del = useConfirmDelete();
  const res = result(r);
  const f = focusSide(r);
  useEffect(() => { setTab(0); }, [r.id]);
  return (
    <div className="lv-detail">
      <div className="lv-head panel">
        <button className="lv-back" onClick={onBack}>‹ 목록</button>
        <p className="lv-head-meta">{r.cat} · {r.date.replace(/-/g, '.')}{r.venue && ` · ${r.venue}`}{r.seat && ` · ${r.seat}`}</p>
        <h2 className="lv-head-title">{r.title}</h2>
        <div className="lv-head-vs">
          <span className={f === 'A' ? 'me' : ''}>{teamName(r, 'A')}</span>
          <b>{wins(r, 'A')} : {wins(r, 'B')}</b>
          <span className={f === 'B' ? 'me' : ''}>{teamName(r, 'B')}</span>
          {res && <b className={`lv-res ${res.toLowerCase()}`}>{res}</b>}
        </div>
        <div className="lv-head-foot">
          <span className="lv-pom">POM <b>{r.pom || '—'}</b></span>
          <span className="lv-focus"><small>{r.focus}</small>{focusChamps(r).map((c, i) => <ChampIcon key={i} name={c} size={30} champs={champs} />)}</span>
        </div>
        {(onEdit || onDelete) && (
          <div className="lv-head-acts">
            {onEdit && <button className="btn btn-ghost" onClick={onEdit}>수정</button>}
            {onDelete && <button className="btn btn-ghost" onClick={() => del.ask('이 직관 기록을 지울까요?', onDelete)}>삭제</button>}
          </div>
        )}
      </div>

      <div className="lv-tabs">
        {r.sets.map((s, i) => (
          <button key={i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
            {i + 1}세트 {s.winner && <i className={s.winner === f ? 'w' : 'l'}>●</i>}
          </button>
        ))}
        <button className={tab === r.sets.length ? 'on' : ''} onClick={() => setTab(r.sets.length)}>총평</button>
      </div>

      {tab < r.sets.length
        ? <SetBoard r={r} s={r.sets[tab]} no={tab + 1} champs={champs} />
        : (
          <div className="panel lv-review">
            <p className="lv-review-pom">오늘의 POM · <b>{r.pom || '—'}</b></p>
            <p className="lv-review-body">{r.review || '총평이 아직 없어요'}</p>
          </div>
        )}
      {del.element}
    </div>
  );
}

function SetBoard({ r, s, no, champs }: { r: Rec; s: LSet; no: number; champs: Champs | null }) {
  const B = s.blue, R = other(s.blue);
  const sum = (side: Side, k: keyof P) => s.players[side].reduce((t, p) => t + (Number(p[k]) || 0), 0);
  const maxGold = Math.max(1, ...s.players.A.map(p => p.gold || 0), ...s.players.B.map(p => p.gold || 0));
  const kda = (side: Side) => `${sum(side, 'k')} / ${sum(side, 'd')} / ${sum(side, 'a')}`;
  const gold = (side: Side) => `${sum(side, 'gold').toFixed(1)}K`;
  const row = (p: P | undefined, side: 'b' | 'r') => (
    <div className={`lv-p ${side}${p && same(p.name, r.focus) ? ' focus' : ''}`}>
      <div className="lv-p-info">
        <b>{p?.name || '-'}</b>
        <span>{p ? `${p.gold ? `${p.gold}K ` : ''}(${p.k}/${p.d}/${p.a})` : ''}</span>
        <i style={{ width: `${((p?.gold || 0) / maxGold) * 100}%` }} />
      </div>
      <ChampIcon name={p?.champ ?? ''} size={44} champs={champs} />
    </div>
  );
  return (
    <div className="lv-board">
      <div className="lv-b-top">
        <span className="blue">블루</span>
        <p>{r.title} {no}세트<small>{r.date && `(${r.date.replace(/-/g, '. ')}.)`}</small></p>
        <span className="red">레드</span>
      </div>
      <div className="lv-b-teams"><b className="blue">{teamName(r, B)}</b><b className="red">{teamName(r, R)}</b></div>
      <div className="lv-b-bans">
        <div>{s.bans[B].map((c, i) => <ChampIcon key={i} name={c} size={34} champs={champs} />)}</div>
        <span>밴</span>
        <div>{s.bans[R].map((c, i) => <ChampIcon key={i} name={c} size={34} champs={champs} />)}</div>
      </div>
      <div className="lv-b-sum">
        <span>{kda(B)}</span><b>{s.time || '--:--'}</b><span>{kda(R)}</span>
        <span>{gold(B)}</span>
        <em className={s.winner === B ? 'win' : s.winner ? 'loss' : ''}>{s.winner === B ? 'WIN' : s.winner ? 'LOSS' : '-'}</em>
        <em className={s.winner === R ? 'win r' : s.winner ? 'loss r' : ''}>{s.winner === R ? 'WIN' : s.winner ? 'LOSS' : '-'}</em>
        <span>{gold(R)}</span>
      </div>
      {[0, 1, 2, 3, 4].map(i => (
        <div className="lv-b-row" key={i}>
          {row(s.players[B][i], 'b')}
          {row(s.players[R][i], 'r')}
        </div>
      ))}
      <div className="lv-b-obj">
        {(['towers', 'grubs', 'dragons', 'barons'] as (keyof Obj)[]).map(k => (
          <div key={k}>
            <b>{s.obj[B][k]}</b><span>{{ towers: '포탑', grubs: '유충', dragons: '드래곤', barons: '바론' }[k]}</span><b>{s.obj[R][k]}</b>
          </div>
        ))}
      </div>
      {s.note && <p className="lv-b-note">{s.note}</p>}
    </div>
  );
}

/* ---------- 입력 폼 ---------- */
function LiveForm({ r, set, champs }: { r: Rec; set: (r: Rec) => void; champs: Champs | null }) {
  const [si, setSi] = useState(0);
  const up = (p: Partial<Rec>) => set({ ...r, ...p });
  const upSet = (i: number, fn: (s: LSet) => LSet) => up({ sets: r.sets.map((s, j) => (j === i ? fn(structuredClone(s)) : s)) });
  const s = r.sets[si];
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const champList = champs?.list.length ?? 0;

  return (
    <div className="lv-form">
      <div className="lv-f-grid">
        <label>분류<select className="k-input" value={r.cat} onChange={e => up({ cat: e.target.value })}>{CATS.filter(c => READY.includes(c) || c === r.cat).map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="wide">경기명<KInput value={r.title} placeholder="2026 LCK Road to MSI 1라운드" onChange={e => up({ title: e.target.value })} /></label>
        <label>날짜<KDate value={r.date} onChange={v => up({ date: v })} /></label>
        <label>경기장<KInput value={r.venue} placeholder="LoL PARK" onChange={e => up({ venue: e.target.value })} /></label>
        <label>좌석<KInput value={r.seat} placeholder="B구역 5열" onChange={e => up({ seat: e.target.value })} /></label>
        <label>POM<KInput value={r.pom} onChange={e => up({ pom: e.target.value })} /></label>
        <label>기준 선수<KInput value={r.focus} onChange={e => up({ focus: e.target.value })} /></label>
      </div>

      <div className="lv-f-teams">
        {(['A', 'B'] as Side[]).map(side => (
          <div key={side}>
            <KInput value={side === 'A' ? r.teamA : r.teamB} placeholder={side === 'A' ? '팀 A (예: Dplus Kia)' : '팀 B (예: HANJIN BRION)'}
              onChange={e => up(side === 'A' ? { teamA: e.target.value } : { teamB: e.target.value })} />
            {ROLES.map((role, i) => (
              <KInput key={i} placeholder={`${role} 선수`} value={(side === 'A' ? r.rosterA : r.rosterB)[i]}
                onChange={e => {
                  const k = side === 'A' ? 'rosterA' : 'rosterB';
                  const arr = [...r[k]]; arr[i] = e.target.value; up({ [k]: arr } as Partial<Rec>);
                }} />
            ))}
          </div>
        ))}
      </div>

      <div className="lv-f-sets">
        {r.sets.map((_, i) => <button key={i} className={si === i ? 'on' : ''} onClick={() => setSi(i)}>{i + 1}세트</button>)}
        <button onClick={() => { up({ sets: [...r.sets, newSet(r)] }); setSi(r.sets.length); }}>＋ 세트</button>
      </div>

      {s && (
        <div className="lv-f-set">
          <div className="lv-f-row">
            <label>블루 진영<select className="k-input" value={s.blue} onChange={e => upSet(si, x => ({ ...x, blue: e.target.value as Side }))}>
              <option value="A">{teamName(r, 'A')}</option><option value="B">{teamName(r, 'B')}</option></select></label>
            <label>승리<select className="k-input" value={s.winner} onChange={e => upSet(si, x => ({ ...x, winner: e.target.value as Side | '' }))}>
              <option value="">-</option><option value="A">{teamName(r, 'A')}</option><option value="B">{teamName(r, 'B')}</option></select></label>
            <label>경기 시간<KInput value={s.time} placeholder="34:23" onChange={e => upSet(si, x => ({ ...x, time: e.target.value }))} /></label>
            <button className="btn btn-ghost" onClick={() => { up({ sets: r.sets.filter((_, j) => j !== si) }); setSi(Math.max(0, si - 1)); }}>이 세트 삭제</button>
          </div>

          {(['A', 'B'] as Side[]).map(side => (
            <div key={side} className="lv-f-team">
              <p className="lv-f-tname">{teamName(r, side)} <small>{s.blue === side ? '블루' : '레드'}</small></p>
              <div className="lv-f-bans">
                <span>밴</span>
                {s.bans[side].map((c, i) => (
                  <ChampInput key={i} value={c} champs={champs}
                    onChange={v => upSet(si, x => { x.bans[side][i] = v; return x; })} />
                ))}
              </div>
              <div className="lv-f-ph"><span>선수</span><span>챔피언</span><span>K</span><span>D</span><span>A</span><span>골드(K)</span></div>
              {s.players[side].map((p, i) => (
                <div className="lv-f-p" key={i}>
                  <KInput value={p.name} placeholder={ROLES[i]} onChange={e => upSet(si, x => { x.players[side][i].name = e.target.value; return x; })} />
                  <ChampInput value={p.champ} champs={champs} onChange={v => upSet(si, x => { x.players[side][i].champ = v; return x; })} />
                  {(['k', 'd', 'a'] as const).map(k => (
                    <KInput key={k} type="number" min={0} value={p[k] || ''} onChange={e => upSet(si, x => { x.players[side][i][k] = num(e.target.value); return x; })} />
                  ))}
                  <KInput type="number" step="0.1" min={0} value={p.gold || ''} onChange={e => upSet(si, x => { x.players[side][i].gold = num(e.target.value); return x; })} />
                </div>
              ))}
              <div className="lv-f-obj">
                {(['towers', 'grubs', 'dragons', 'barons'] as (keyof Obj)[]).map(k => (
                  <label key={k}>{{ towers: '포탑', grubs: '유충', dragons: '드래곤', barons: '바론' }[k]}
                    <KInput type="number" min={0} value={s.obj[side][k] || ''} onChange={e => upSet(si, x => { x.obj[side][k] = num(e.target.value); return x; })} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="lv-f-note">이 세트 메모<KTextarea value={s.note} onChange={e => upSet(si, x => ({ ...x, note: e.target.value }))} /></label>
        </div>
      )}
      {r.sets.length === 0 && <p className="hint">＋ 세트를 눌러 1세트부터 추가하세요 — 위에 적은 로스터가 선수 칸에 미리 들어가요</p>}

      <label className="lv-f-note">총평<KTextarea value={r.review} placeholder="오늘 경기 한 줄 평, 현장 분위기, 좋았던 순간…" onChange={e => up({ review: e.target.value })} /></label>
      {champList === 0 && <p className="hint">챔피언 목록을 불러오는 중이에요</p>}
    </div>
  );
}

export default function LivePage() {
  return <Suspense fallback={<section className="page" />}><LiveInner /></Suspense>;
}
