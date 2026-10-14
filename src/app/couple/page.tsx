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
  { v: 5, date: "2025-12-25", author: 1, read: true, title: "오늘부터 1일 ♡♡♡",
    body: "크리스마스에 고백하는 거 유치하다고 했던 사람 누구?\n현준이형이 먼저 했음 ㅋㅋㅋㅋ\n\n나는 그냥 케이크 먹으러 간 건데\n형이 포크 내려놓더니 진지하게 '지훈아' 하길래\n혼나는 줄 알았잖아;;\n\n대답 너무 빨리 해서 쪽팔림..\n그래도 오늘부터 1일 ♡\n현준상 사랑해~ 이건 평생 박제다 -_-v\n\n◆ 오늘의 BGM : 성시경 - 거리에서" },
  { v: 5, date: "2025-12-25", author: 0, read: true, title: "1일",
    body: "지훈이가 다이어리를 같이 쓰자고 했다. 싸이월드 감성이라나.\n\n오늘 고백은 사실 한 달 전부터 정해둔 거였는데\n막상 마주 앉으니까 준비한 말이 하나도 생각나지 않았다.\n이름만 부르고 한참 가만히 있었는데\n지훈이가 먼저 '응' 해줬다.\n\n고마워. 잘할게." },
  { v: 5, date: "2026-01-01", author: 1, read: true, title: "새해 첫 일기 ★彡",
    body: "♥ 2026 소원 ♥\n1. 현준이형이랑 안 싸우기\n2. 형이 까주는 귤 받아먹기\n3. 형 나보다 먼저 자지 않기 (맨날 먼저 잠 ㅡㅡ)\n\n형한테 소원 뭐 빌었냐니까 비밀이래\n치사해!!!\n근데 웃는 거 보니까 내 얘기인 듯 ㅋ" },
  { v: 5, date: "2026-01-02", author: 0, read: false, title: "비밀이라고 한 소원",
    body: "지훈이가 계속 물어봐서 여기에만 적어둔다.\n\n지훈이가 올해는 덜 아팠으면.\n밥 거르지 않았으면.\n그리고 이 다이어리가 오래 이어졌으면.\n\n…읽고 나서 놀리지 마." },
  { v: 5, date: "2026-02-14", author: 1, read: true, title: "발렌타인인데요?",
    body: "초콜릿 만들다가 냄비 태움\n현준이형이 와서 조용히 창문 열고 같이 다시 만들어줌 ㅋㅋㅋ\n형 손이 나보다 훨씬 야무짐.. 배신감..\n\n결국 형이 만든 거 형한테 줌\n'이거 내가 만든 거잖아' 하길래\n'내 사랑은 들어갔잖아~' 함 ㅋ\n형 귀 빨개진 거 다 봤다 ^^*" },
  { v: 5, date: "2026-03-09", author: 0, read: true, title: "감기",
    body: "지훈이 열이 38도까지 올랐다.\n괜찮다고 연습 나가겠다는 걸 겨우 눕혔다.\n\n죽을 끓여줬더니 싱겁다고 투덜대면서 두 그릇을 먹었다.\n자기 전에는 '형 옮으면 안 되니까 저리 가' 하면서\n내 소매는 끝까지 놓지 않더라.\n\n빨리 나아라." },
  { v: 5, date: "2026-04-11", author: 1, read: false, title: "서운해",
    body: "요즘 형 너무 바쁨\n연락도 '응' '그래' '자라'\n세 글자 넘는 답장 본 지가 언제인지 모르겠음\n\n나만 좋아하는 것 같다\n\n…이렇게 쓰면 형이 보겠지\n보고 연락해 ㅡㅡ" },
  { v: 5, date: "2026-04-12", author: 0, read: true, title: "미안해",
    body: "읽었어.\n바빴다는 건 핑계가 안 되는 거 알아.\n지훈이는 투정처럼 말해도, 진짜 서운할 때는 꼭 이렇게 글로 남기더라.\n\n오늘 저녁에 얼굴 보고 다시 말할게." },
  { v: 5, date: "2026-05-03", author: 1, read: false, title: "그만하자",
    body: "오늘 싸웠다\n누가 먼저 그만하자고 했는지 기억 안 남\n아니 사실 나임\n\n형은 끝까지 화를 안 냈다\n그게 더 화났음\n'지훈이가 그게 맞다고 생각하면' 이러는데\n왜 안 잡아\n\n잡아주길 바랐던 건 나만 아는 걸로." },
  { v: 5, date: "2026-05-04", author: 0, read: false, title: ".",
    body: "지훈이가 원하는 걸 들어주는 게 맞다고 생각했다.\n\n그런데 집에 와서 보니 칫솔이 두 개다.\n\n당분간은 이 다이어리를 열지 않으려고 한다." },
  { v: 5, date: "2026-05-20", author: 1, read: false, title: "ㄴr는 ㄱr끔..",
    body: "ㄴr는 ㄱr끔 눈물을 흘린ㄷr...\n웃기려고 쓰던 말인데 지금은 하나도 안 웃김\n\n다이어리 비번 아직 안 바꿨네 형\n\n◆ 오늘의 BGM : 버즈 - 가시" },
  { v: 5, date: "2026-06-08", author: 1, read: false, title: "형 생일",
    body: "생일 축하해 현준이형\n\n선물 샀는데 못 줬음\n문 앞까지 갔다가 그냥 돌아옴\n형이 좋아하는 그 향수\n\n미역국은 챙겨 먹었으려나\n안 먹었겠지 맨날 까먹으니까" },
  { v: 5, date: "2026-06-09", author: 0, read: true, title: "문 앞에 있던 쇼핑백",
    body: "아침에 문 앞에 쇼핑백이 놓여 있었다.\n카드는 없었지만 누군지 바로 알았다.\n지훈이는 리본을 꼭 두 번 묶는다.\n\n미역국은 먹었어.\n네가 끓여주던 것보다는 맛없었지만.\n\n…다이어리를 다시 열었다." },
  { v: 5, date: "2026-06-14", author: 1, read: true, title: "다시 1일 !!!",
    body: "형한테 전화 옴\n'향수 고마워. 근데 이거 같이 쓰자고 산 거잖아'\n\n나 울었음 그냥 다 울었음 ㅠㅠㅠ\n한 시간 통화하면서 둘 다 미안하다는 말만 백 번 함\n\n다시 1일!!!!!!!\n이번엔 내가 먼저 그만하자는 말 절대 안 함\n약속 ★ 새끼손가락 걸었음 (전화로)\n\n현준아 사랑해~ 많이 많이\n\n◆ 오늘의 BGM : 김동률 - 다시 사랑한다 말할까" },
  { v: 5, date: "2026-06-15", author: 0, read: true, title: "다시",
    body: "어제 지훈이가 전화로 새끼손가락을 걸자고 했다.\n어떻게 거냐고 물었더니 '마음으로' 란다.\n\n이번에는 내가 먼저 잡을게.\n네가 서운하다고 쓰기 전에 먼저 물어볼게.\n\n돌아와줘서 고마워, 지훈아." },
  { v: 5, date: "2026-07-21", author: 1, read: true, title: "날짜 어떻게 세?",
    body: "재결합하면 날짜 새로 세야 하나 고민함\n형이 그냥 처음부터 이어서 세재\n떨어져 있던 날들도 우리 거라고\n\n…형 이런 말 어디서 배워옴? ㅡ_ㅡ\n심쿵사 하는 줄\n그래서 만남 날짜 안 바꿈 ♡" },
  { v: 5, date: "2026-08-15", author: 0, read: true, title: "바다",
    body: "공지에 적어뒀던 바다를 드디어 갔다.\n지훈이는 발만 담근다더니 결국 허리까지 젖었다.\n수건이 하나뿐이라 둘이 나눠 썼다.\n\n돌아오는 차에서 지훈이가 내 어깨에 기대 잠들었다.\n휴게소를 두 군데나 그냥 지나쳤다." },
  { v: 5, date: "2026-09-20", author: 1, read: true, title: "손장난 금지 (근데 내가 함)", photoSrc: "/deco/couple/p1.jpg",
    body: "현준이형 손이 너무 작아서 자꾸 만지게 됨 ㅋㅋ\n형은 핸드크림 바르는 중이었는데\n내가 옆에서 다 뺏어 바름 -_-v\n\n같은 맨투맨 입으니까 커플티 같다고 다들 놀림..\n싫진 않음 ♡\n\n현준상 손 차가우면 말해 내가 녹여줌" },
  { v: 5, date: "2026-09-20", author: 0, read: true, title: "핸드크림 반 통",
    body: "지훈이가 내 핸드크림을 반 통이나 썼다.\n그러고는 손이 차다고 내 손을 계속 붙잡고 있었다.\n\n크림은 또 사면 된다.\n대신 내일도 손 시리면 말해." },
  { v: 5, date: "2026-09-27", author: 0, read: true, title: "기다리는 동안", photoSrc: "/deco/couple/p2.jpg",
    body: "대기실 앞에서 지훈이를 기다렸다.\n팔을 벌렸더니 한참 웃기만 하고 오지 않더라.\n결국 와서 안기면서 '형 이런 거 어디서 배웠어' 한다.\n\n너한테 배웠지.\n\n◆ 오늘의 BGM : SG워너비 - 내사람" },
  { v: 5, date: "2026-09-27", author: 1, read: false, title: "일부러 버틴거임 ㅋ",
    body: "현준이형 팔 벌리고 서있는 거 너무 귀여워서\n일부러 안 감 ㅋㅋㅋ\n\n표정 점점 시무룩해지는 거 보고 바로 감..\n현준상 삐지면 안 됨 ♡\n\n근데 옆에 마스코트가 형 보고 웃는 것 같았음.. 질투남 -_-" },
  { v: 5, date: "2026-10-01", author: 0, read: true, title: "바나나우유",
    body: "지훈이가 편의점에서 바나나우유를 사 왔다.\n빨대까지 꽂아서 건네주더라.\n\n내가 좋아하는 걸 나보다 더 잘 기억하는 사람.\n\n◆ 오늘의 BGM : 이적 - 다행이다" },
  { v: 5, date: "2026-10-03", author: 1, read: true, title: "안전벨트는 내가 매준다 -_-+",
    body: "차 타자마자 현준이형 벨트 안 매고 딴짓하길래\n내가 직접 매줬다\n\n싫다고 버둥대는 거 완전 웃김 ㅋㅋㅋㅋ\n그래도 안전이 최고니까~\n\n현준상 앞으로도 쭉 내가 매줄거임 ㅡ_ㅡv" },
  { v: 5, date: "2026-10-05", author: 0, read: false, title: "대문사진",
    body: "안전벨트를 매준다면서 간지럼을 태워서 표정이 저렇게 찍혔다.\n지훈이가 그 사진을 대문에 걸겠다고 해서 그러라고 했다.\n\n사진 속 지훈이가 너무 즐거워 보여서 말릴 수가 없었다." },
  { v: 5, date: "2026-10-07", author: 0, read: true, title: "공항", photoSrc: "/deco/couple/p3.jpg",
    body: "공항에서 기다리다 졸려서 지훈이 어깨에 기댔다.\n지훈이는 꼼짝도 안 하고 천장만 보고 있었다고 한다.\n\n빨간 후드는 지훈이가 맞춰 입자고 했다.\n이 사진은 오래 간직하고 싶다." },
  { v: 5, date: "2026-10-07", author: 1, read: true, title: "천장 본 이유",
    body: "현준이형이 어깨에 턱 올리고 자길래\n움직이면 깰까봐 천장만 봤다 ㅋㅋ\n목 아파 죽는 줄..\n\n그래도 형 숨소리 들려서 좋았음 ♡\n\n다음엔 내가 기댈 차례임 ㅡ_ㅡv" },
  { v: 5, date: "2026-10-08", author: 1, read: true, title: "[스크랩] 사랑은... 버스정류장 같은거래",
    body: "사랑은 버스 같은 거래\n놓쳐도 기다리면 또 온대\n\n근데 나는 안 기다릴래\n한 번 놓쳐봐서 앎\n이번엔 꽉 붙잡고 탔으니까 ^^*\n그치 현준아?\n\n- 퍼가실 때 꼭 꼬릿말 남겨주세요 -" },
  { v: 5, date: "2026-10-10", author: 0, read: true, title: "도토리",
    body: "지훈이 홈피 스킨이 마음에 안 든다길래 도토리를 털어서 새로 바꿔줬다.\n고맙다는 말 대신 '형 센스 구려~' 하더니\n하루에 다섯 번씩 들어가서 보고 있는 거 안다." },
  { v: 5, date: "2026-10-12", author: 1, read: false, title: "오늘도 수고했어",
    body: "끝나고 지쳐서 차에서 바로 잠든 현준이형..\n어깨 빌려준 거 기억 안 나지?\n\n형 나 없으면 어떡할래~\n현준상 내일도 옆자리는 내가 찜 ♡\n사랑해 사랑해 사랑해\n\n◆ 오늘의 BGM : 프리스타일 - Y" },
  { v: 5, date: "2026-10-13", author: 0, read: false, title: "사실은",
    body: "어깨 빌려준 거 기억해.\n깨어 있었는데 자는 척했어.\n\n나도 사랑해, 지훈아." },
];
/** 첫 글 묶음 판 — 5: 두 사람 말투(연상 온화 / 연하 투정)에 맞춘 전체 개정 + 헤어졌다 다시 만난 이야기 */
const STARTER_V = 5;
/** 예전 판들이 넣은 글 제목 — 이 제목의 글은 새 판으로 통째로 바꾼다(직접 쓴 글은 그대로) */
const PREV_TITLES = new Set(["[스크랩] 사랑은... 버스정류장 같은거래", "ㅇr..오늘은 쫌 우울한날..★", "내 핸드크림 돌려줘 ㅡㅡ", "도토리 다 써버렸다..", "손장난 금지 (근데 내가 함)", "안아줘..★", "안전벨트는 내가 매준다 -_-+", "어깨 좀 빌릴게 (_ _)zZ", "오늘도 수고했어", "일부러 버틴거임 ㅋ", "지훈이 이 나쁜넘아 ㅠ_ㅠ", "천장 본 이유", "킬러 이 나쁜넘아 ㅠ_ㅠ"]);

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

/** 이미 넣은 다이어리를 새 판으로 — 예전 첫 글 묶음은 빼고 새 묶음으로 바꾼다(직접 쓴 글은 그대로) */
async function upgradeStarter(d: Diary): Promise<Diary> {
  if ((d.starterV ?? 1) >= STARTER_V) return d;
  const mine = d.entries.filter(e => !PREV_TITLES.has(e.title));
  return { ...d, entries: [...mine, ...await Promise.all(STARTER.map(seedEntry))], starterV: STARTER_V };
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
