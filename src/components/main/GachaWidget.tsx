'use client';
// 캡슐토이 위젯 — 레버를 돌리면 통 안 캡슐이 들썩이고, 배출구로 캡슐이 떨어진다.
// 캡슐을 누르면 반으로 열리며 뽑은 그림이 나온다. 뽑은 기록(도감)은 이 브라우저에만 남는다.
import React, { useEffect, useRef, useState } from 'react';
import { useMainStore } from '@/lib/mainStore';

interface Prize { id: string; img: string; name: string; rare: number; weight: number }
const PRIZES: Prize[] = [
  { id: 'c1', img: '/deco/shaker/charm1.png', name: '나란히 투샷', rare: 1, weight: 45 },
  { id: 'c2', img: '/deco/shaker/charm2.png', name: '냥냥 업어주기', rare: 2, weight: 40 },
  { id: 'px', img: '/deco/pachirisu-dot.png', name: '파치리스', rare: 3, weight: 15 },
];
const CAP_COLORS = ['#7cc4f2', '#ffd84d', '#ff9fc6', '#a8e6a1', '#c7b3ff', '#7cc4f2', '#ffd84d'];
// 통 안 캡슐 자리 (% 좌표) — 아래부터 쌓인 모양
const SLOTS = [
  [8, 66], [28, 70], [48, 68], [68, 70], [86, 66],
  [16, 44], [37, 46], [58, 44], [78, 46],
  [26, 22], [48, 24], [70, 22],
];
const DEX_KEY = 'ohome.gacha.dex';

/* 효과음 — 파일 없이 짧게 합성 */
let actx: AudioContext | null = null;
function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide?: number) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur);
}

function pick(): Prize {
  const total = PRIZES.reduce((a, p) => a + p.weight, 0);
  let n = Math.random() * total;
  for (const p of PRIZES) { n -= p.weight; if (n < 0) return p; }
  return PRIZES[0];
}

type Phase = 'idle' | 'turning' | 'ready' | 'open';

export function GachaWidget() {
  const { editOn } = useMainStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [prize, setPrize] = useState<Prize | null>(null);
  const [capColor, setCapColor] = useState(CAP_COLORS[0]);
  const [dex, setDex] = useState<string[]>([]);
  const [mute, setMute] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    try {
      setDex(JSON.parse(localStorage.getItem(DEX_KEY) ?? '[]'));
      setMute(localStorage.getItem('ohome.shaker.mute') === '1');   // 쉐이커와 소리 설정 공유
    } catch { /* 무시 */ }
    const ts = timers.current;
    return () => ts.forEach(clearTimeout);
  }, []);

  const sfx = (fn: () => void) => { if (!mute) fn(); };
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  const turn = () => {
    if (editOn || phase === 'turning') return;
    if (!actx) { try { actx = new AudioContext(); } catch { /* 소리 없이 */ } }
    else if (actx.state === 'suspended') void actx.resume();
    setPhase('turning');
    setPrize(null);
    // 드르륵 — 레버 톱니
    for (let i = 0; i < 6; i++) later(i * 110, () => sfx(() => tone(900 + Math.random() * 300, 0.04, 'square', 0.05)));
    later(900, () => {
      setCapColor(CAP_COLORS[Math.floor(Math.random() * CAP_COLORS.length)]);
      setPrize(pick());
      setPhase('ready');
      sfx(() => tone(220, 0.18, 'triangle', 0.25, 90));   // 통 — 떨어지는 소리
    });
  };

  const open = () => {
    if (editOn || phase !== 'ready' || !prize) return;
    setPhase('open');
    sfx(() => { tone(600, 0.08, 'square', 0.08, 1200); later(90, () => tone(1300, 0.25, 'sine', 0.1, 1800)); });
    if (!dex.includes(prize.id)) {
      const next = [...dex, prize.id];
      setDex(next);
      try { localStorage.setItem(DEX_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
    }
  };

  const close = () => setPhase('idle');

  return (
    <div className="panel widget gacha-wgt">
      <h4>CAPSULE TOY <span className="more" data-tip="이 브라우저에서 모은 그림">도감 {dex.length}/{PRIZES.length}</span></h4>
      <div className="gacha-m">
        <div className="gacha-top" />
        <div className={`gacha-tank${phase === 'turning' ? ' shaking' : ''}`}>
          {SLOTS.map(([x, y], i) => (
            <i key={i} className="gacha-cap" style={{
              left: `${x}%`, top: `${y}%`,
              ['--cc' as string]: CAP_COLORS[i % CAP_COLORS.length],
              ['--d' as string]: `${(i % 4) * 0.05}s`,
            }} />
          ))}
          <i className="gacha-glass" />
        </div>
        <div className="gacha-base">
          <span className="gacha-coin" aria-hidden />
          <button type="button" className={`gacha-lever${phase === 'turning' ? ' turning' : ''}`}
            aria-label="레버 돌리기" data-tip="레버를 돌려요" onClick={turn}>
            <i />
          </button>
          <div className="gacha-door">
            {(phase === 'ready') && (
              <button type="button" className="gacha-drop" style={{ ['--cc' as string]: capColor }}
                aria-label="캡슐 열기" data-tip="눌러서 열기" onClick={open} />
            )}
          </div>
        </div>
      </div>
      <p className="gacha-hint">{phase === 'ready' ? '캡슐을 눌러 열어 보세요!' : phase === 'turning' ? '드르륵…' : '레버를 돌려 보세요'}</p>

      {phase === 'open' && prize && (
        <div className="gacha-reveal" onClick={close}>
          <div className="gacha-halves" style={{ ['--cc' as string]: capColor }}>
            <i className="h-top" /><i className="h-bot" />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={prize.img} alt={prize.name} draggable={false} />
          <b>{'★'.repeat(prize.rare)}<span>{'★'.repeat(3 - prize.rare)}</span></b>
          <strong>{prize.name}</strong>
          <small>누르면 닫혀요</small>
        </div>
      )}
    </div>
  );
}
