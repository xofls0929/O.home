'use client';
// 아크릴 쉐이커 위젯 — 상자를 잡고 흔들면 안의 아크릴 참이 튀고 쌓인다.
// 물리는 원 충돌만 쓴다(참 모양이 둥글둥글해서 충분하다). 매 프레임 리렌더하지 않고
// requestAnimationFrame에서 DOM transform을 직접 바꾸고, 다 멈추면 루프도 잠든다.
import React, { useEffect, useRef, useState } from 'react';
import { useMainStore } from '@/lib/mainStore';

const CHARMS = ['/deco/shaker/charm1.png', '/deco/shaker/charm2.png'];
const COUNT = 10;
const GRAVITY = 1500;      // px/s²
const BOUNCE = 0.38;       // 벽·참 반발
const MUTE_KEY = 'ohome.shaker.mute';

interface Tok { x: number; y: number; vx: number; vy: number; a: number; va: number; el: HTMLImageElement | null }

/* 달그락 소리 — 파일 없이 짧은 노이즈를 걸러 아크릴 부딪는 소리를 낸다 */
let actx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
function clack(vol: number) {
  if (!actx) return;
  if (!noise) {
    noise = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.05), actx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  const src = actx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.6;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200 + Math.random() * 2600;
  bp.Q.value = 4;
  const g = actx.createGain();
  g.gain.value = Math.min(0.5, vol);
  src.connect(bp).connect(g).connect(actx.destination);
  src.start();
}

export function ShakerWidget() {
  const { editOn } = useMainStore();
  const boxRef = useRef<HTMLDivElement>(null);
  const toks = useRef<Tok[]>([]);
  const size = useRef(56);
  const dim = useRef({ w: 0, h: 0 });
  const raf = useRef(0);
  const last = useRef(0);
  const drag = useRef<{ px: number; py: number; t: number; vx: number; vy: number; ox: number; oy: number } | null>(null);
  const soundAt = useRef(0);
  const [mute, setMute] = useState(false);
  const muteRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { const m = localStorage.getItem(MUTE_KEY) === '1'; setMute(m); muteRef.current = m; } catch { /* 무시 */ }
  }, []);

  const sound = (impact: number) => {
    if (muteRef.current || impact < 160) return;
    const now = performance.now();
    if (now - soundAt.current < 35) return;
    soundAt.current = now;
    clack(impact / 2200);
  };

  const step = (t: number) => {
    const dt = Math.min(0.033, (t - (last.current || t)) / 1000) || 0.016;
    last.current = t;
    const { w, h } = dim.current;
    const s = size.current, r = s * 0.42;
    const list = toks.current;
    let moving = !!drag.current;
    for (const k of list) {
      k.vy += GRAVITY * dt;
      k.x += k.vx * dt; k.y += k.vy * dt;
      k.vx *= 0.995; k.va *= 0.97;
      // 벽
      if (k.x < r) { sound(Math.abs(k.vx)); k.x = r; k.vx = Math.abs(k.vx) * BOUNCE; k.va += k.vy * 0.05; }
      if (k.x > w - r) { sound(Math.abs(k.vx)); k.x = w - r; k.vx = -Math.abs(k.vx) * BOUNCE; k.va -= k.vy * 0.05; }
      if (k.y < r) { sound(Math.abs(k.vy)); k.y = r; k.vy = Math.abs(k.vy) * BOUNCE; }
      if (k.y > h - r) {
        sound(Math.abs(k.vy));
        k.y = h - r; k.vy = -Math.abs(k.vy) * BOUNCE;
        k.vx *= 0.86;                       // 바닥 마찰
        k.va = k.va * 0.8 + k.vx * 0.15;    // 굴러가며 기운다
      }
    }
    // 참끼리 — 몇 번 반복해야 쌓인 더미가 덜 파고든다
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d2 = dx * dx + dy * dy, min = r * 2;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
        A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
        const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (rv < 0) {
          if (it === 0) sound(-rv);
          const imp = -(1 + BOUNCE) * rv / 2;
          A.vx -= imp * nx; A.vy -= imp * ny; B.vx += imp * nx; B.vy += imp * ny;
          A.va -= imp * 0.04; B.va += imp * 0.04;
        }
      }
    }
    for (const k of list) {
      k.a += k.va * dt * 6;
      if (Math.abs(k.vx) + Math.abs(k.vy) > 18 || Math.abs(k.va) > 4) moving = true;
      if (k.el) k.el.style.transform = `translate(${k.x - s / 2}px,${k.y - s / 2}px) rotate(${k.a}deg)`;
    }
    raf.current = moving ? requestAnimationFrame(step) : 0;
  };
  const wake = () => {
    if (!raf.current) { last.current = 0; raf.current = requestAnimationFrame(step); }
  };

  // 상자 크기에 맞춰 참 크기를 정하고, 처음엔 위에서 우르르 떨어뜨린다
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const w = box.clientWidth, h = box.clientHeight;
      if (!w || !h) return;
      const first = dim.current.w === 0;
      dim.current = { w, h };
      size.current = Math.max(38, Math.min(96, Math.sqrt((w * h) / COUNT) * 0.8));
      if (first) {
        toks.current = Array.from({ length: COUNT }, (_, i) => ({
          x: size.current / 2 + Math.random() * Math.max(1, w - size.current),
          y: -i * size.current * 0.5,
          vx: (Math.random() - 0.5) * 200, vy: 0,
          a: (Math.random() - 0.5) * 60, va: 0, el: null,
        }));
        setReady(true);
      }
      wake();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); raf.current = 0; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (ready) wake(); });   // 참 DOM이 붙은 뒤 첫 프레임

  /* 흔들기 — 상자가 움직이면 안의 참은 반대로 밀린다(관성). 상자도 살짝 따라 움직여 손맛을 준다 */
  const onDown = (e: React.PointerEvent) => {
    if (editOn || e.button !== 0) return;
    e.preventDefault();
    if (!actx) { try { actx = new AudioContext(); } catch { /* 소리 없이 */ } }
    else if (actx.state === 'suspended') void actx.resume();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, t: performance.now(), vx: 0, vy: 0, ox: e.clientX, oy: e.clientY };
    // 그냥 톡 눌러도 한 번 튀어 오른다
    for (const k of toks.current) { k.vy -= 350 + Math.random() * 350; k.vx += (Math.random() - 0.5) * 300; k.va += (Math.random() - 0.5) * 40; }
    wake();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(8, now - d.t) / 1000;
    const vx = (e.clientX - d.px) / dt, vy = (e.clientY - d.py) / dt;
    const ax = vx - d.vx, ay = vy - d.vy;
    const k = 0.55;
    for (const t of toks.current) { t.vx -= ax * k; t.vy -= ay * k; }
    Object.assign(d, { px: e.clientX, py: e.clientY, t: now, vx, vy });
    const box = boxRef.current;
    if (box) {
      const ox = Math.max(-10, Math.min(10, (e.clientX - d.ox) * 0.15));
      const oy = Math.max(-10, Math.min(10, (e.clientY - d.oy) * 0.15));
      box.style.transform = `translate(${ox}px,${oy}px) rotate(${ox * 0.3}deg)`;
    }
    wake();
  };
  const onUp = () => {
    drag.current = null;
    if (boxRef.current) boxRef.current.style.transform = '';
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const m = !mute;
    setMute(m); muteRef.current = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* 무시 */ }
  };

  return (
    <div className="panel widget shaker-wgt">
      <h4>SHAKER <span className="more" onClick={toggleMute} data-tip={mute ? '소리 켜기' : '소리 끄기'}>{mute ? '🔇' : '🔊'}</span></h4>
      <div ref={boxRef} className="shaker-box"
        style={{ touchAction: editOn ? undefined : 'none' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {ready && toks.current.map((k, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={CHARMS[i % CHARMS.length]} alt="" draggable={false}
            ref={el => { k.el = el; }}
            style={{ width: size.current, height: size.current, transform: `translate(${k.x - size.current / 2}px,${k.y - size.current / 2}px) rotate(${k.a}deg)` }} />
        ))}
        <i className="shaker-gloss" />
      </div>
    </div>
  );
}
