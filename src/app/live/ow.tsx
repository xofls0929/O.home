'use client';
/**
 * 직관기록 — OWCS(오버워치) 양식.
 * 한 경기 = 맵 여러 개. 맵마다 모드 · 맵 이름(국기) · 점수 · 선밴/후밴 영웅 · 기준 선수가 한 영웅.
 * 영웅 이름·초상화는 OverFast API(한국어) → /api/ow 중계를 거친다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { KInput, KTextarea } from '@/components/ui/Kit';

type Side = 'A' | 'B';
type N = number | '';
export interface OwMap {
  mode: string; map: string;
  a: N; b: N;                 // 팀 A · 팀 B 점수
  banFirst: Side;             // 선밴 팀
  ban1: string; ban2: string; // 선밴 영웅 · 후밴 영웅(상대 팀)
  hero: string;               // 기준 선수가 한 영웅
  note: string;
}
export interface OwRec {
  title: string; date: string; teamA: string; teamB: string;
  focus: string; focusTeam?: Side; pom: string; maps?: OwMap[];
}

export const emptyOwMap = (): OwMap => ({ mode: '', map: '', a: '', b: '', banFirst: 'A', ban1: '', ban2: '', hero: '', note: '' });
const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');
const tName = (r: OwRec, s: Side) => (s === 'A' ? r.teamA : r.teamB) || (s === 'A' ? 'A팀' : 'B팀');
const mapWinner = (m: OwMap): Side | '' => (m.a === '' || m.b === '' || m.a === m.b ? '' : Number(m.a) > Number(m.b) ? 'A' : 'B');
export const owWins = (r: OwRec, side: Side) => (r.maps ?? []).filter(m => mapWinner(m) === side).length;
export function owResult(r: OwRec): 'WIN' | 'LOSS' | '' {
  const f = r.focusTeam;
  if (!f) return '';
  const a = owWins(r, f), b = owWins(r, other(f));
  return a === b ? '' : a > b ? 'WIN' : 'LOSS';
}
export const owFocusHeroes = (r: OwRec) => (r.maps ?? []).map(m => m.hero).filter(Boolean);

/* ---------- 모드 · 맵 ---------- */
export const MODES = ['쟁탈', '호위', '혼합', '밀기', '플래시포인트', '격돌'];
const MAPS: [string, string, string][] = [   // 이름 · 모드 · 나라
  ['부산', '쟁탈', 'KR'], ['일리오스', '쟁탈', 'GR'], ['리장 타워', '쟁탈', 'CN'], ['네팔', '쟁탈', 'NP'],
  ['오아시스', '쟁탈', 'IQ'], ['남극 반도', '쟁탈', 'AQ'], ['사모아', '쟁탈', 'WS'],
  ['서킷 로얄', '호위', 'MC'], ['도라도', '호위', 'MX'], ['하바나', '호위', 'CU'], ['정크타운', '호위', 'AU'],
  ['리알토', '호위', 'IT'], ['66번 국도', '호위', 'US'], ['감시 기지: 지브롤터', '호위', 'GI'], ['샴발리 수도원', '호위', 'NP'],
  ['블리자드 월드', '혼합', 'US'], ['아이헨발데', '혼합', 'DE'], ['할리우드', '혼합', 'US'], ['왕의 길', '혼합', 'GB'],
  ['미드타운', '혼합', 'US'], ['눔바니', '혼합', 'NG'], ['파라이수', '혼합', 'BR'],
  ['콜로세오', '밀기', 'IT'], ['이스페란사', '밀기', 'PT'], ['뉴 퀸 스트리트', '밀기', 'CA'], ['루나사피', '밀기', 'PE'],
  ['뉴 정크 시티', '플래시포인트', 'AU'], ['수라바사', '플래시포인트', 'IN'], ['아틀리스', '플래시포인트', 'MA'],
  ['하나오카', '격돌', 'JP'], ['아누비스의 왕좌', '격돌', 'EG'],
];
const mapInfo = (name: string) => MAPS.find(m => m[0].replace(/\s/g, '') === name.replace(/\s/g, ''));
/** 나라 코드 → 국기 이모지 */
const flag = (cc?: string) => (cc ? String.fromCodePoint(...Array.from(cc.toUpperCase()).map(c => 0x1f1a5 + c.charCodeAt(0))) : '');

/* ---------- 영웅 ---------- */
export interface Hero { key: string; name: string; img: string; norm: string }
let heroesP: Promise<Hero[]> | null = null;
const norm = (t: string) => t.replace(/[\s.:'-]/g, '').toLowerCase();
function loadHeroes(): Promise<Hero[]> {
  if (!heroesP) {
    heroesP = fetch('/api/ow?p=heroes').then(r => r.json()).then((list: { key: string; name: string; portrait: string }[]) =>
      list.map(h => ({
        key: h.key, name: h.name, norm: norm(h.name),
        img: `/api/ow?img=${h.portrait.split('/').pop()}`,
      })).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    ).catch(() => { heroesP = null; return []; });
  }
  return heroesP;
}
export function useHeroes() {
  const [h, setH] = useState<Hero[]>([]);
  useEffect(() => { void loadHeroes().then(setH); }, []);
  return h;
}
const matchHeroes = (hs: Hero[], q: string) => {
  const n = norm(q);
  if (!n) return [];
  return [...hs.filter(h => h.norm === n || h.key === n), ...hs.filter(h => h.norm !== n && h.key !== n && (h.norm.startsWith(n) || h.key.startsWith(n))),
    ...hs.filter(h => !h.norm.startsWith(n) && !h.key.startsWith(n) && h.norm.includes(n))];
};
const resolveHero = (hs: Hero[], q: string) => matchHeroes(hs, q)[0] ?? null;

export function HeroIcon({ name, size = 40, heroes }: { name: string; size?: number; heroes: Hero[] }) {
  const h = name ? resolveHero(heroes, name) : null;
  // eslint-disable-next-line @next/next/no-img-element
  if (h) return <img className="ow-hero" src={h.img} alt={h.name} title={h.name} style={{ width: size, height: size }} />;
  return <span className="ow-hero ph" style={{ width: size, height: size }}>{name.slice(0, 1)}</span>;
}

function HeroInput({ value, onChange, heroes, placeholder = '영웅' }: {
  value: string; onChange: (v: string) => void; heroes: Hero[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const cands = useMemo(() => matchHeroes(heroes, value).slice(0, 8), [heroes, value]);
  const cur = value ? resolveHero(heroes, value) : null;
  const pick = (h: Hero) => { onChange(h.name); setOpen(false); };
  return (
    <div className="lv-ci">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cur ? <img className="lv-ci-ic" src={cur.img} alt="" style={{ borderRadius: '50%' }} /> : <span className="lv-ci-ic ph" />}
      <input className="k-input" value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          const h = value ? resolveHero(heroes, value) : null;
          if (h && h.name !== value) onChange(h.name);
        }, 150)}
        onKeyDown={e => {
          if (!open || !cands.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(x => Math.min(cands.length - 1, x + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(x => Math.max(0, x - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(cands[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && value && cands.length > 0 && (
        <ul className="lv-ci-list">
          {cands.map((h, i) => (
            <li key={h.key} className={i === hi ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(h); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={h.img} alt="" style={{ borderRadius: '50%' }} /> {h.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- 경기 표 ---------- */
export function OwBoard({ r, heroes }: { r: OwRec; heroes: Hero[] }) {
  const maps = r.maps ?? [];
  const ta = owWins(r, 'A'), tb = owWins(r, 'B');
  const total = (side: Side) => (ta === tb ? '' : (side === 'A' ? ta > tb : tb > ta) ? 'win' : 'lose');
  const cols = `120px repeat(${Math.max(1, maps.length)}, 1fr) 90px`;
  return (
    <div className="ow-wrap">
      <div className="ow-board">
        <div className="ow-title">{r.title}{r.date && ` (${r.date.replace(/-/g, '. ')}.)`}</div>
        <div className="ow-grid" style={{ gridTemplateColumns: cols }}>
          <div className="ow-corner" />
          {maps.map((m, i) => <div key={i} className="ow-mode">{m.mode || '-'}</div>)}
          <div className="ow-corner" />
          <div className="ow-corner2" />
          {maps.map((m, i) => (
            <div key={i} className="ow-map"><span>{flag(mapInfo(m.map)?.[2])}</span><b>{m.map || '-'}</b></div>
          ))}
          <div className="ow-corner2" />
          {(['A', 'B'] as Side[]).map(side => (
            <React.Fragment key={side}>
              <div className={`ow-team${r.focusTeam === side ? ' me' : ''}`}>{tName(r, side)}</div>
              {maps.map((m, i) => (
                <div key={i} className={`ow-score${mapWinner(m) === side ? ' win' : ''}`}>{side === 'A' ? m.a : m.b}</div>
              ))}
              <div className={`ow-total ${total(side)}`}>{side === 'A' ? ta : tb}</div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {maps.some(m => m.ban1 || m.ban2) && (
        <div className="ow-bans">
          <p className="ow-sub">영웅 밴</p>
          <div className="ow-ban-grid" style={{ gridTemplateColumns: `70px repeat(${maps.length}, 1fr)` }}>
            <span />
            {maps.map((_, i) => <b key={i} className="ow-setchip">{i + 1}세트</b>)}
            {(['선밴', '후밴'] as const).map((label, row) => (
              <React.Fragment key={label}>
                <span className="ow-ban-label">{label}</span>
                {maps.map((m, i) => {
                  const team = row === 0 ? m.banFirst : other(m.banFirst);
                  const hero = row === 0 ? m.ban1 : m.ban2;
                  return (
                    <div key={i} className="ow-ban">
                      {hero ? <HeroIcon name={hero} size={72} heroes={heroes} /> : <span className="ow-hero ph" style={{ width: 72, height: 72 }} />}
                      <i className={`ow-tag ${team === r.focusTeam ? 'me' : ''}`}>{tName(r, team)}</i>
                      <small>{hero ? resolveHero(heroes, hero)?.name ?? hero : '-'}</small>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {maps.some(m => m.hero) && (
        <div className="ow-bans">
          <p className="ow-sub">{r.focus || '기준 선수'}가 한 영웅</p>
          <div className="ow-ban-grid" style={{ gridTemplateColumns: `70px repeat(${maps.length}, 1fr)` }}>
            <span />
            {maps.map((m, i) => (
              <div key={i} className="ow-ban">
                {m.hero ? <HeroIcon name={m.hero} size={60} heroes={heroes} /> : <span className="ow-hero ph" style={{ width: 60, height: 60 }} />}
                <small>{m.hero ? resolveHero(heroes, m.hero)?.name ?? m.hero : '-'}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {maps.some(m => m.note) && (
        <div className="ow-notes">
          {maps.map((m, i) => m.note && <p key={i}><b>{i + 1}세트 · {m.map}</b>{m.note}</p>)}
        </div>
      )}
    </div>
  );
}

/* ---------- 입력 ---------- */
export function OwForm<T extends OwRec>({ r, up, heroes }: { r: T; up: (p: Partial<T>) => void; heroes: Hero[] }) {
  const maps = r.maps ?? [];
  const setMap = (i: number, p: Partial<OwMap>) => up({ maps: maps.map((m, j) => (j === i ? { ...m, ...p } : m)) } as Partial<T>);
  const num = (v: string): N => (v === '' ? '' : Number(v));
  return (
    <div className="lv-form">
      <div className="lv-f-grid">
        <label>팀 A<KInput value={r.teamA} placeholder="예: 크레이지 라쿤" onChange={e => up({ teamA: e.target.value } as Partial<T>)} /></label>
        <label>팀 B<KInput value={r.teamB} placeholder="예: 팀 팔콘스" onChange={e => up({ teamB: e.target.value } as Partial<T>)} /></label>
        <label>기준 선수 팀<select className="k-input" value={r.focusTeam ?? ''} onChange={e => up({ focusTeam: (e.target.value || undefined) as Side | undefined } as Partial<T>)}>
          <option value="">-</option><option value="A">{tName(r, 'A')}</option><option value="B">{tName(r, 'B')}</option></select></label>
      </div>
      <datalist id="ow-maps">{MAPS.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}</datalist>
      {maps.map((m, i) => (
        <div key={i} className="lv-f-set">
          <div className="lv-f-row">
            <b>{i + 1}세트</b>
            <label>모드<select className="k-input" value={m.mode} onChange={e => setMap(i, { mode: e.target.value })}>
              <option value="">-</option>{MODES.map(x => <option key={x}>{x}</option>)}</select></label>
            <label>맵<KInput list="ow-maps" value={m.map} placeholder="부산"
              onChange={e => { const info = mapInfo(e.target.value); setMap(i, { map: e.target.value, ...(info && !m.mode ? { mode: info[1] } : {}) }); }} /></label>
            <button className="btn btn-ghost" onClick={() => up({ maps: maps.filter((_, j) => j !== i) } as Partial<T>)}>이 세트 삭제</button>
          </div>
          <div className="lv-f-row ow-f-score">
            <label>{tName(r, 'A')} 점수<KInput type="number" min={0} value={m.a} onChange={e => setMap(i, { a: num(e.target.value) })} /></label>
            <label>{tName(r, 'B')} 점수<KInput type="number" min={0} value={m.b} onChange={e => setMap(i, { b: num(e.target.value) })} /></label>
            <label>선밴 팀<select className="k-input" value={m.banFirst} onChange={e => setMap(i, { banFirst: e.target.value as Side })}>
              <option value="A">{tName(r, 'A')}</option><option value="B">{tName(r, 'B')}</option></select></label>
          </div>
          <div className="lv-f-row ow-f-score">
            <label>선밴 ({tName(r, m.banFirst)})<HeroInput value={m.ban1} heroes={heroes} onChange={v => setMap(i, { ban1: v })} /></label>
            <label>후밴 ({tName(r, other(m.banFirst))})<HeroInput value={m.ban2} heroes={heroes} onChange={v => setMap(i, { ban2: v })} /></label>
            <label>{r.focus || '기준 선수'}가 한 영웅<HeroInput value={m.hero} heroes={heroes} onChange={v => setMap(i, { hero: v })} /></label>
          </div>
          <label className="lv-f-note">이 세트 메모<KTextarea value={m.note} onChange={e => setMap(i, { note: e.target.value })} /></label>
        </div>
      ))}
      <div className="lv-f-sets"><button onClick={() => up({ maps: [...maps, emptyOwMap()] } as Partial<T>)}>＋ 세트(맵)</button></div>
    </div>
  );
}
