'use client';
// 캡슐토이 위젯 — 기계를 누르면 다이얼이 돌고 몬스터볼이 굴러 나온 뒤
// 「짜잔! 오늘의 포켓몬」 창이 뜬다. 뽑은 기록(도감)은 이 브라우저에만 남는다.
import React, { useEffect, useRef, useState } from 'react';
import { useMainStore } from '@/lib/mainStore';

interface Prize { id: string; img: string; name: string; weight: number; shiny?: boolean }
// 포켓몬을 늘리려면 public/deco/gacha/ 에 GIF를 넣고 여기에 한 줄 추가
// 이브이 진화체 · 1~7세대 스타팅은 pokestats.gg의 5세대(블랙·화이트) 움직이는 스프라이트
const PRIZES: Prize[] = [
  { id: 'pachirisu', img: '/deco/gacha/pachirisu.gif', name: '파치리스', weight: 1 },
  { id: 'skitty', img: '/deco/gacha/skitty.gif', name: '에나비', weight: 1 },
  { id: 'pikachu', img: '/deco/gacha/pikachu.gif', name: '피카츄', weight: 1 },
  { id: 'eevee', img: '/deco/gacha/eevee.gif', name: '이브이', weight: 1 },
  { id: 'vaporeon', img: '/deco/gacha/vaporeon.gif', name: '샤미드', weight: 1 },
  { id: 'jolteon', img: '/deco/gacha/jolteon.gif', name: '쥬피썬더', weight: 1 },
  { id: 'flareon', img: '/deco/gacha/flareon.gif', name: '부스터', weight: 1 },
  { id: 'espeon', img: '/deco/gacha/espeon.gif', name: '에브이', weight: 1 },
  { id: 'umbreon', img: '/deco/gacha/umbreon.gif', name: '블래키', weight: 1 },
  { id: 'leafeon', img: '/deco/gacha/leafeon.gif', name: '리피아', weight: 1 },
  { id: 'glaceon', img: '/deco/gacha/glaceon.gif', name: '글레이시아', weight: 1 },
  { id: 'sylveon', img: '/deco/gacha/sylveon.gif', name: '님피아', weight: 1 },
  { id: 'bulbasaur', img: '/deco/gacha/bulbasaur.gif', name: '이상해씨', weight: 1 },
  { id: 'charmander', img: '/deco/gacha/charmander.gif', name: '파이리', weight: 1 },
  { id: 'squirtle', img: '/deco/gacha/squirtle.gif', name: '꼬부기', weight: 1 },
  { id: 'chikorita', img: '/deco/gacha/chikorita.gif', name: '치코리타', weight: 1 },
  { id: 'cyndaquil', img: '/deco/gacha/cyndaquil.gif', name: '브케인', weight: 1 },
  { id: 'totodile', img: '/deco/gacha/totodile.gif', name: '리아코', weight: 1 },
  { id: 'treecko', img: '/deco/gacha/treecko.gif', name: '나무지기', weight: 1 },
  { id: 'torchic', img: '/deco/gacha/torchic.gif', name: '아차모', weight: 1 },
  { id: 'mudkip', img: '/deco/gacha/mudkip.gif', name: '물짱이', weight: 1 },
  { id: 'turtwig', img: '/deco/gacha/turtwig.gif', name: '모부기', weight: 1 },
  { id: 'chimchar', img: '/deco/gacha/chimchar.gif', name: '불꽃숭이', weight: 1 },
  { id: 'piplup', img: '/deco/gacha/piplup.gif', name: '팽도리', weight: 1 },
  { id: 'snivy', img: '/deco/gacha/snivy.gif', name: '주리비얀', weight: 1 },
  { id: 'tepig', img: '/deco/gacha/tepig.gif', name: '뚜꾸리', weight: 1 },
  { id: 'oshawott', img: '/deco/gacha/oshawott.gif', name: '수댕이', weight: 1 },
  { id: 'chespin', img: '/deco/gacha/chespin.gif', name: '도치마론', weight: 1 },
  { id: 'fennekin', img: '/deco/gacha/fennekin.gif', name: '푸호꼬', weight: 1 },
  { id: 'froakie', img: '/deco/gacha/froakie.gif', name: '개구마르', weight: 1 },
  { id: 'rowlet', img: '/deco/gacha/rowlet.gif', name: '나몰빼', weight: 1 },
  { id: 'litten', img: '/deco/gacha/litten.gif', name: '냐오불', weight: 1 },
  { id: 'popplio', img: '/deco/gacha/popplio.gif', name: '누리공', weight: 1 },
  { id: 'emolga', img: '/deco/gacha/emolga.gif', name: '에몽가', weight: 1 },
  { id: 'buneary', img: '/deco/gacha/buneary.gif', name: '이어롤', weight: 1 },
  { id: 'lopunny', img: '/deco/gacha/lopunny.gif', name: '이어롭', weight: 1 },
  { id: 'pichu', img: '/deco/gacha/pichu.gif', name: '피츄', weight: 1 },
  { id: 'jigglypuff', img: '/deco/gacha/jigglypuff.gif', name: '푸린', weight: 1 },
  { id: 'psyduck', img: '/deco/gacha/psyduck.gif', name: '고라파덕', weight: 1 },
  { id: 'togepi', img: '/deco/gacha/togepi.gif', name: '토게피', weight: 1 },
  { id: 'marill', img: '/deco/gacha/marill.gif', name: '마릴', weight: 1 },
  { id: 'wooper', img: '/deco/gacha/wooper.gif', name: '우파', weight: 1 },
  { id: 'plusle', img: '/deco/gacha/plusle.gif', name: '플러시', weight: 1 },
  { id: 'minun', img: '/deco/gacha/minun.gif', name: '마이농', weight: 1 },
  { id: 'riolu', img: '/deco/gacha/riolu.gif', name: '리오르', weight: 1 },
  // 이로치 — 일반의 1/4 확률
  { id: 'eevee-shiny', img: '/deco/gacha/eevee-shiny.gif', name: '이브이', weight: 0.25, shiny: true },
  { id: 'pachirisu-shiny', img: '/deco/gacha/pachirisu-shiny.gif', name: '파치리스', weight: 0.25, shiny: true },
  { id: 'skitty-shiny', img: '/deco/gacha/skitty-shiny.gif', name: '에나비', weight: 0.25, shiny: true },
];
const MACHINE = '/deco/gacha/machine.png';
const TURN_GIF = '/deco/gacha/machine-turn.gif';   // 한 번만 재생 — 다이얼이 돌고 볼이 오른쪽 아래로 굴러 나온다
const TURN_MS = 4900;   // 다이얼(0.6~2.3초) → 볼 배출(2.5초) → 굴러 나가 사라짐(4.8초)
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

type Phase = 'idle' | 'turning' | 'open';

export function GachaWidget() {
  const { editOn } = useMainStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [prize, setPrize] = useState<Prize | null>(null);
  const [turnSrc, setTurnSrc] = useState<string | null>(null);
  const [dex, setDex] = useState<string[]>([]);
  const [mute, setMute] = useState(false);
  const timers = useRef<number[]>([]);
  const gifBlob = useRef<Blob | null>(null);

  useEffect(() => {
    try {
      setDex(JSON.parse(localStorage.getItem(DEX_KEY) ?? '[]'));
      setMute(localStorage.getItem('ohome.shaker.mute') === '1');   // 쉐이커와 소리 설정 공유
    } catch { /* 무시 */ }
    // 돌리는 GIF를 미리 받아 둔다 — 매번 새 blob 주소로 띄워야 GIF가 처음부터 다시 재생된다
    fetch(TURN_GIF).then(r => r.blob()).then(b => { gifBlob.current = b; }).catch(() => { /* 받으면 그때 */ });
    const ts = timers.current;
    return () => ts.forEach(clearTimeout);
  }, []);
  useEffect(() => () => { if (turnSrc?.startsWith('blob:')) URL.revokeObjectURL(turnSrc); }, [turnSrc]);

  const sfx = (fn: () => void) => { if (!mute) fn(); };
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  const turn = () => {
    if (editOn || phase !== 'idle') return;
    if (!actx) { try { actx = new AudioContext(); } catch { /* 소리 없이 */ } }
    else if (actx.state === 'suspended') void actx.resume();
    setTurnSrc(gifBlob.current ? URL.createObjectURL(gifBlob.current) : `${TURN_GIF}?t=${Date.now()}`);
    setPhase('turning');
    const p = pick();
    setPrize(p);
    // 드르륵 — 다이얼 톱니, 볼이 떨어지고 굴러 나오는 소리
    for (let i = 0; i < 13; i++) later(650 + i * 130, () => sfx(() => tone(900 + Math.random() * 300, 0.04, 'square', 0.05)));
    later(2550, () => sfx(() => tone(260, 0.16, 'triangle', 0.25, 110)));
    later(3050, () => sfx(() => tone(200, 0.12, 'triangle', 0.18, 90)));
    later(3550, () => sfx(() => tone(180, 0.1, 'triangle', 0.12, 80)));
    later(TURN_MS, () => open(p));
  };

  const open = (prize: Prize) => {
    setPhase('open');
    sfx(() => { tone(600, 0.08, 'square', 0.08, 1200); later(90, () => tone(1300, 0.25, 'sine', 0.1, 1800)); });
    if (!dex.includes(prize.id)) {
      const next = [...dex, prize.id];
      setDex(next);
      try { localStorage.setItem(DEX_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
    }
  };

  const close = () => { setPhase('idle'); setTurnSrc(null); };

  return (
    <div className="panel widget gacha-wgt">
      <h4>CAPSULE TOY <span className="more" data-tip="이 브라우저에서 모은 그림">도감 {dex.length}/{PRIZES.length}</span></h4>
      <div className={`gacha-stage${phase === 'idle' ? ' can' : ''}`} onClick={turn}
        role="button" aria-label="다이얼 돌리기">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={phase === 'idle' || !turnSrc ? MACHINE : turnSrc} alt="" draggable={false} />
      </div>
      <p className="gacha-hint">{phase === 'turning' ? '드르륵…' : '기계를 눌러 오늘의 포켓몬을 뽑아 보세요'}</p>

      {phase === 'open' && prize && (
        <div className={`gacha-reveal${prize.shiny ? ' shiny' : ''}`} onClick={close}>
          <div className="gacha-halves">
            <i className="h-top" /><i className="h-bot" />
          </div>
          <p className="gacha-tada">짜잔!<br /><span>오늘의 포켓몬</span></p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={prize.img} alt={prize.name} draggable={false} />
          {prize.shiny && <span className="gacha-shiny">✨ 이로치 ✨</span>}
          <strong>{prize.name}</strong>
          <small>누르면 닫혀요</small>
        </div>
      )}
    </div>
  );
}
