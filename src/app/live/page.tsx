'use client';
// 직관기록 — 자리만 먼저 만들어 둔 페이지 (사용자 요청: 내용은 차차 만든다)
import React from 'react';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

export default function LivePage() {
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href="/live">LIVE</PageTitle>
        <EditableDesc k="live-desc" def="경기장에서 직접 본 경기 기록" />
      </div>
      <div className="panel" style={{ padding: 48, textAlign: 'center', fontSize: 13, color: 'var(--faint)' }}>
        🏟️ 직관기록은 준비 중이에요
      </div>
    </section>
  );
}
