// 아이클라우드 공개 캘린더(.ics) 읽기 — 스케줄러에 읽기 전용으로 겹쳐 보일 일정만 뽑는다.
// 날짜 단위만 다룬다(달력 칸이 날짜 단위다). 반복은 매년(FREQ=YEARLY)만 살리고,
// 매주·매일 반복은 첫 번째 날짜에만 표시한다.

export interface IcsEvent {
  uid: string;
  title: string;
  start: string;           // YYYY-MM-DD
  end?: string;            // 여러 날 일정의 마지막 날 (포함)
  yearly: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** DTSTART/DTEND 값 → 이 브라우저 기준 날짜. 종일 일정이면 allDay=true */
function parseDate(prop: string, value: string): { date: string; allDay: boolean } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  if (!hh || /VALUE=DATE(?!-)/i.test(prop)) return { date: `${y}-${mo}-${d}`, allDay: true };
  // UTC 시각이면 이 브라우저 시간대로 바꾼다. TZID 붙은 시각은 그 지역 날짜를 그대로 쓴다
  if (z) return { date: ymd(new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss))), allDay: false };
  return { date: `${y}-${mo}-${d}`, allDay: false };
}

const dayBefore = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(y, m - 1, d - 1));
};

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

export function parseIcs(text: string): IcsEvent[] {
  // 줄 이어 붙이기 — 공백·탭으로 시작하는 줄은 앞 줄의 계속이다 (RFC 5545)
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: Record<string, { prop: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.DTSTART) {
        const s = parseDate(cur.DTSTART.prop, cur.DTSTART.value);
        if (s) {
          let end: string | undefined;
          if (cur.DTEND) {
            const e = parseDate(cur.DTEND.prop, cur.DTEND.value);
            // 종일 일정의 DTEND는 「다음 날」이라 하루 빼야 마지막 날이 된다
            if (e) end = e.allDay ? dayBefore(e.date) : e.date;
          }
          out.push({
            uid: cur.UID?.value ?? `${s.date}-${out.length}`,
            title: unescape(cur.SUMMARY?.value ?? '(제목 없음)'),
            start: s.date,
            end: end && end > s.date ? end : undefined,
            yearly: /FREQ=YEARLY/i.test(cur.RRULE?.value ?? ''),
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const prop = line.slice(0, i);
    const name = prop.split(';')[0].toUpperCase();
    if (!(name in cur)) cur[name] = { prop, value: line.slice(i + 1) };
  }
  return out;
}
