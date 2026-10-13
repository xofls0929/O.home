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
  const layerRef = useRef<HTMLDivElement>(null);
  const engine = useRef<{ kick: () => void; shake: (ax: number, ay: number) => void } | null>(null);
  const drag = useRef<{ px: number; py: number; t: number; vx: number; vy: number; ox: number; oy: number } | null>(null);
  const [mute, setMute] = useState(false);
  const muteRef = useRef(false);

  useEffect(() => {
    try { const m = localStorage.getItem(MUTE_KEY) === '1'; setMute(m); muteRef.current = m; } catch { /* 무시 */ }
  }, []);

  /* 물리 엔진 — 마운트 때 한 번 만들고 참 <img>도 여기서 직접 붙인다(매 프레임 React를 거치지 않게) */
  useEffect(() => {
    const box = boxRef.current, layer = layerRef.current;
    if (!box || !layer) return;
    let w = 0, h = 0, s = 56, raf = 0, last = 0, soundAt = 0;
    let toks: Tok[] = [];
    const sound = (impact: number) => {
      if (muteRef.current || impact < 160) return;
      const now = performance.now();
      if (now - soundAt < 35) return;
      soundAt = now;
      clack(impact / 2200);
    };
    const draw = (k: Tok) => {
      if (k.el) k.el.style.transform = `translate(${k.x - s / 2}px,${k.y - s / 2}px) rotate(${k.a}deg)`;
    };
    const step = (t: number) => {
      const dt = last ? Math.min(0.033, (t - last) / 1000) : 0.016;
      last = t;
      const r = s * 0.44;
      let moving = !!drag.current;
      for (const k of toks) {
        k.vy += GRAVITY * dt;
        k.x += k.vx * dt; k.y += k.vy * dt;
        k.vx *= 0.995; k.va *= 0.97;
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
      for (let it = 0; it < 4; it++) {
        for (let i = 0; i < toks.length; i++) for (let j = i + 1; j < toks.length; j++) {
          const A = toks[i], B = toks[j];
          let dx = B.x - A.x, dy = B.y - A.y;
          let d2 = dx * dx + dy * dy;
          const min = r * 2;
          if (d2 >= min * min) continue;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = -0.5; d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - Math.min(d, min)) / 2;
          A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
          const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
          if (rv < 0) {
            if (it === 0) sound(-rv);
            const imp = -(1 + BOUNCE) * rv / 2;
            A.vx -= imp * nx; A.vy -= imp * ny; B.vx += imp * nx; B.vy += imp * ny;
            A.va -= imp * 0.04; B.va += imp * 0.04;
          }
        }
        // 밀어내다 벽 밖으로 나간 참은 다시 안으로
        for (const k of toks) { k.x = Math.min(w - r, Math.max(r, k.x)); k.y = Math.min(h - r, Math.max(r, k.y)); }
      }
      for (const k of toks) {
        k.a += k.va * dt * 6;
        if (Math.abs(k.vx) + Math.abs(k.vy) > 18 || Math.abs(k.va) > 4) moving = true;
        draw(k);
      }
      raf = moving ? requestAnimationFrame(step) : 0;
    };
    const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(step); } };

    // 상자 크기에 맞춰 참 크기를 정하고, 처음엔 상자 위쪽에서 우르르 떨어뜨린다
    const fit = () => {
      const nw = box.clientWidth, nh = box.clientHeight;
      if (!nw || !nh) return;
      w = nw; h = nh;
      s = Math.max(38, Math.min(96, Math.sqrt((w * h) / COUNT) * 0.8));
      if (toks.length === 0) {
        const cols = Math.max(1, Math.floor(w / s));
        toks = Array.from({ length: COUNT }, (_, i) => {
          const el = document.createElement('img');
          el.src = CHARMS[i % CHARMS.length];
          el.alt = '';
          el.draggable = false;
          layer.appendChild(el);
          return {
            x: s / 2 + (i % cols) * s + Math.random() * 4,
            y: s / 2 + Math.floor(i / cols) * s * 0.7,
            vx: (Math.random() - 0.5) * 240, vy: 0,
            a: (Math.random() - 0.5) * 60, va: (Math.random() - 0.5) * 20, el,
          };
        });
      }
      for (const k of toks) { if (k.el) { k.el.style.width = `${s}px`; k.el.style.height = `${s}px`; } draw(k); }
      wake();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    engine.current = {
      // 톡 누르면 한 번 튀어 오른다
      kick: () => {
        for (const k of toks) { k.vy -= 350 + Math.random() * 350; k.vx += (Math.random() - 0.5) * 300; k.va += (Math.random() - 0.5) * 40; }
        wake();
      },
      // 상자가 가속하면 참은 반대로 밀린다(관성)
      shake: (ax, ay) => { for (const k of toks) { k.vx -= ax; k.vy -= ay; } wake(); },
    };
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      for (const k of toks) k.el?.remove();
      engine.current = null;
    };
  }, []);

  /* 흔들기 — 상자도 살짝 따라 움직여 손맛을 준다 */
  const onDown = (e: React.PointerEvent) => {
    if (editOn || e.button !== 0) return;
    e.preventDefault();
    if (!actx) { try { actx = new AudioContext(); } catch { /* 소리 없이 */ } }
    else if (actx.state === 'suspended') void actx.resume();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, t: performance.now(), vx: 0, vy: 0, ox: e.clientX, oy: e.clientY };
    engine.current?.kick();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(8, now - d.t) / 1000;
    const vx = (e.clientX - d.px) / dt, vy = (e.clientY - d.py) / dt;
    engine.current?.shake((vx - d.vx) * 0.55, (vy - d.vy) * 0.55);
    Object.assign(d, { px: e.clientX, py: e.clientY, t: now, vx, vy });
    const box = boxRef.current;
    if (box) {
      const ox = Math.max(-10, Math.min(10, (e.clientX - d.ox) * 0.15));
      const oy = Math.max(-10, Math.min(10, (e.clientY - d.oy) * 0.15));
      box.style.transform = `translate(${ox}px,${oy}px) rotate(${ox * 0.3}deg)`;
    }
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
        <div ref={layerRef} className="shaker-layer" />
        <i className="shaker-gloss" />
      </div>
    </div>
  );
}
