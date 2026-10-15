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
const STARTER_SINCE = '2020-04-18';   // 처음 사귄 날 — 재결합해도 이어서 센다
// 모찌피치는 상대를 「지훈이」, 모찌피치킬러는 「현준이 / 현준이형 / 현준상」이라고 부른다
// v: 이 글이 처음 들어간 판 — 그 판보다 오래된 다이어리에만 새로 더한다
type Seed = Omit<Entry, 'id' | 'photos'> & { v: number; photoSrc?: string };
const STARTER: Seed[] = [
  { v: 12, date: "2020-04-18", author: 1, read: true, title: "오늘부터 1일",
    body: "작년 겨울에 처음 봤을 때 안경 쓴 형이 제일 무서워 보였는데\n그 형이 오늘 나한테 고백했다 ㅋㅋㅋㅋ\n\n벚꽃 다 떨어진 길에서 '지훈아' 하길래\n혼나는 줄 알았잖아;;\n대답을 너무 빨리 해버려서 쪽팔려...\n\n그래도 오늘부터 1일 ♡\n현준상 사랑해~ 이건 평생 박제다" },
  { v: 12, date: "2020-04-18", author: 0, read: true, title: "1일",
    body: "지훈이가 다이어리를 같이 쓰자고 했다. 싸이월드 감성이라나\n\n작년 겨울 처음 인사하던 날부터 눈에 밟혔다.\n오늘 하려던 말은 한 달 전부터 정해뒀는데\n막상 마주 서니까 이름밖에 안 나왔다.\n한참 가만히 있었더니 지훈이가 먼저 '응' 해줬다.\n\n고마워. 잘할게" },
  { v: 12, date: "2020-05-02", author: 0, read: true, title: "공항", photoSrc: "/deco/couple/p3.jpg",
    body: "공항에서 기다리다 졸려서 지훈이 어깨에 기댔다.\n지훈이는 꼼짝도 안 하고 천장만 보고 있었다고 한다.\n\n빨간 후드는 지훈이가 맞춰 입자고 했다.\n사귀고 처음 찍힌 사진이라 오래 간직하고 싶다." },
  { v: 12, date: "2020-05-02", author: 1, read: true, title: "천장 본 이유",
    body: "현준이형이 어깨에 턱 올리고 자길래\n움직이면 깰까봐 천장만 봤다 ㅋㅋ\n목 아파 죽는 줄..\n\n그래도 형 숨소리 들려서 좋았어 ♡\n다음엔 내가 기댈 차례야" },
  { v: 12, date: "2020-07-22", author: 1, read: true, title: "현준이형 생일",
    body: "현준이형 생일 축하해.\n\n미역국 끓이다가 간 못 맞춰서 소금국이 됐는데\n형이 '맛있다' 하면서 다 먹었다\n거짓말쟁이 ㅋㅋㅋㅋ\n\n형 태어나줘서 고마워\n앞으로 형 생일은 다 내가 챙길 거야\n사랑해~ 많이 많이" },
  { v: 12, date: "2020-07-23", author: 0, read: true, title: "생일",
    body: "어제 지훈이가 끓여준 미역국은 짰다\n그래도 내 생일에 누군가 부엌에서 그렇게 오래 서 있던 건 처음이었다.\n\n맛있었어. 진심으로\n\n지훈이가 준 편지는 다이어리 맨 뒷장에 끼워뒀다." },
  { v: 12, date: "2020-12-24", author: 1, read: false, title: "첫 크리스마스인데요?",
    body: "크리스마스 이브인데 형 연습이 늦게 끝났다\n케이크 혼자 반 먹었잖아 ㅡㅡ\n\n12시 5분 전에 형이 헐레벌떡 왔다\n손에 붕어빵 들고 ㅋㅋㅋ\n케이크 대신 붕어빵 먹은 크리스마스\n\n…근데 왜 이게 제일 행복했냐" },
  { v: 12, date: "2021-03-03", author: 0, read: true, title: "지훈이 생일",
    body: "지훈이 생일.\n갖고 싶은 게 뭐냐니까 '형이 하루종일 내 말 다 들어주기' 란다.\n\n하루종일 들어줬다.\n떡볶이 세 번 먹었다\n\n생일 축하해, 지훈아" },
  { v: 12, date: "2021-03-04", author: 1, read: true, title: "생일 다음날",
    body: "어제 형이 진짜 하루종일 내 말 다 들어줬다\n떡볶이 세 번 먹자는 것까지 ㅋㅋㅋ\n\n형은 매운 거 못 먹는데\n물 다섯 컵 마시면서 끝까지 먹더라..\n\n나 형 없으면 어떡하지" },
  { v: 12, date: "2021-06-10", author: 1, read: false, title: "서운해",
    body: "요즘 형 너무 바빠\n연락도 '응' '그래' '자라'\n세 글자 넘는 답장 본 지가 언제인지 모르겠어\n\n나만 좋아하는 것 같다\n\n…이렇게 쓰면 형이 보겠지\n보고 연락해 ㅡㅡ" },
  { v: 12, date: "2021-06-11", author: 0, read: true, title: "미안해",
    body: "읽었어.\n바빴다는 건 핑계가 안 되는 거 알아.\n지훈이는 투정처럼 말해도, 진짜 서운할 때는 꼭 이렇게 글로 남기더라.\n\n오늘 저녁에 얼굴 보고 다시 말할게." },
  { v: 12, date: "2021-08-21", author: 1, read: false, title: "그만하자",
    body: "오늘 싸웠다\n누가 먼저 그만하자고 했는지 기억 안 난다\n아니 사실 나야\n\n형은 끝까지 화를 안 냈다\n그게 더 화났어\n'지훈이가 그게 맞다고 생각하면' 이러는데\n왜 안 잡아\n\n잡아주길 바랐던 건 나만 아는 걸로." },
  { v: 12, date: "2021-08-22", author: 0, read: false, title: ".",
    body: "지훈이가 원하는 걸 들어주는 게 맞다고 생각했다.\n\n그런데 집에 와서 보니 칫솔이 두 개다.\n\n당분간은 이 다이어리를 열지 않으려고 한다." },
  { v: 12, date: "2021-11-30", author: 1, read: false, title: "11월",
    body: "요즘 자꾸 눈물이 난다.\n같이 있을 때 웃기려고 하던 말들이 생각나서 더 그렇다.\n\n다이어리 비번 아직 안 바꿨네 형\n형 생일이잖아 이거" },
  { v: 12, date: "2022-03-03", author: 0, read: true, title: "생일 축하해",
    body: "지훈아 생일 축하해.\n\n메시지를 몇 번이나 썼다 지웠는지 모르겠다.\n결국 이 한 줄만 보냈다.\n\n보내고 나서 이 다이어리를 반년 만에 열었다.\n네가 11월에 쓴 글을 이제야 읽었어.\n미안해. 그때 잡았어야 했는데." },
  { v: 12, date: "2022-03-03", author: 1, read: true, title: "다시 1일 !!",
    body: "12시 땡 하자마자 형한테 문자가 왔다\n'지훈아 생일 축하해'\n\n그거 보고 바로 전화했어\n울었다 그냥 다 울었다 ㅠㅠ\n한 시간 통화하면서 둘 다 미안하다는 말만 백 번 했다\n\n다시 1일!!\n생일 선물 중에 최고야\n이번엔 내가 먼저 그만하자는 말 절대 안 해\n약속  새끼손가락 걸었다 (전화로)" },
  { v: 12, date: "2022-03-04", author: 0, read: true, title: "다시",
    body: "어제 지훈이가 전화로 새끼손가락을 걸자고 했다.\n어떻게 거냐고 물었더니 '마음으로' 란다.\n\n이번에는 내가 먼저 잡을게.\n네가 서운하다고 쓰기 전에 먼저 물어볼게.\n\n돌아와줘서 고마워, 지훈아." },
  { v: 12, date: "2022-07-22", author: 1, read: true, title: "현준상 생일 (재결합 버전)",
    body: "올해 미역국은 안 짜게 성공\n형이 이번엔 진짜 맛있대\n작년엔 거짓말이었던 거 인정했다 ㅋㅋㅋ\n\n케이크에 초 꽂으면서 형이\n'작년 생일엔 네 생각만 했어' 하는데\n…그런 말 하지 마 울 거 같으니까\n\n사랑해 현준아 ♡" },
  { v: 12, date: "2022-09-17", author: 1, read: true, title: "손장난 금지 (근데 내가 함)", photoSrc: "/deco/couple/p1.jpg",
    body: "현준이형 손이 너무 작아서 자꾸 만지게 된다 ㅋㅋ\n형은 핸드크림 바르는 중이었는데\n내가 옆에서 다 뺏어 발랐다\n\n같은 맨투맨 입으니까 커플티 같다고 다들 놀린다..\n싫진 않아 ♡\n\n현준상 손 차가우면 말해 내가 녹여줌" },
  { v: 12, date: "2022-09-17", author: 0, read: true, title: "핸드크림 반 통",
    body: "지훈이가 내 핸드크림을 반 통이나 썼다.\n그러고는 손이 차다고 내 손을 계속 붙잡고 있었다.\n\n크림은 또 사면 된다.\n대신 내일도 손 시리면 말해." },
  { v: 12, date: "2022-11-05", author: 0, read: true, title: "기다리는 동안", photoSrc: "/deco/couple/p2.jpg",
    body: "대기실 앞에서 지훈이를 기다렸다.\n팔을 벌렸더니 한참 웃기만 하고 오지 않더라.\n결국 와서 안기면서 '형 이런 거 어디서 배웠어' 한다.\n\n너한테 배웠지." },
  { v: 12, date: "2022-11-05", author: 1, read: false, title: "일부러 버틴 거야",
    body: "현준이형 팔 벌리고 서있는 거 너무 귀여워서\n일부러 안 갔다 ㅋㅋㅋ\n\n표정 점점 시무룩해지는 거 보고 바로 갔어..\n현준상 삐지면 안 됨 ♡\n\n근데 옆에 마스코트가 형 보고 웃는 것 같았다.. 질투나" },
  { v: 12, date: "2023-03-03", author: 0, read: true, title: "지훈이 생일",
    body: "올해도 하루종일 지훈이 말을 다 들어줬다.\n떡볶이는 두 번으로 줄었다.\n내가 매운 거 못 먹는다고 지훈이가 하나는 짜장떡볶이로 시켜줬다.\n\n그런 걸 기억해주는 사람이다." },
  { v: 12, date: "2023-08-29", author: 0, read: true, title: "바다",
    body: "우승 기념으로 미루고 미루던 바다를 드디어 갔다.\n지훈이는 발만 담근다더니 결국 허리까지 젖었다.\n수건이 하나뿐이라 둘이 나눠 썼다.\n\n돌아오는 차에서 지훈이가 내 어깨에 기대 잠들었다.\n휴게소를 두 군데나 그냥 지나쳤다." },
  { v: 12, date: "2023-12-31", author: 1, read: true, title: "2023 현준이형 어워드",
    body: "- 올해의 잔소리 : '밥 먹었어?' (365회)\n- 올해의 명장면 : 바다에서 넘어진 형\n- 올해의 반성 : 형 핸드크림 또 다 씀\n- 올해의 남친 : 최현준 아니고 그냥 현준이형\n\n내년에도 잘 부탁해 현준상~\n사랑해 ♡ 이건 연말이라 특별히 크게 쓴다\n\n사 랑 해" },
  { v: 12, date: "2024-04-20", author: 1, read: false, title: "요즘 우리",
    body: "요즘 우리 얼굴 본 지 3주 됐다\n전화하면 둘 다 피곤해서 10분 만에 끊어\n\n형이 '괜찮아?' 물어보면\n괜찮다고 한다\n안 괜찮은데" },
  { v: 12, date: "2024-06-02", author: 0, read: false, title: "이번엔 내가",
    body: "이번엔 내가 먼저 말했다.\n\n지금은 서로 지쳐 있고,\n이대로면 지훈이를 미워하게 될까 봐 무섭다고.\n\n지훈이는 한참 아무 말도 안 하다가\n'형이 그렇게 말하는 거면 진짜 힘든 거네' 했다.\n\n미안해. 이번에도 너를 울렸다." },
  { v: 12, date: "2024-06-03", author: 1, read: false, title: "형이 먼저 그만하자고 함",
    body: "3년 전엔 내가 그랬는데\n이번엔 형이 그랬다\n\n그때 형 기분이 이랬구나\n\n미워하지도 못하겠다\n형 얼굴이 나보다 더 아파 보여서" },
  { v: 12, date: "2024-07-22", author: 1, read: false, title: "(보내지 못한 문자)",
    body: "현준이형 생일 축하해\n\n이 한 줄 보낼까 말까 하다가 12시가 지났다\n\n미역국은 먹었으려나\n안 먹었겠지 맨날 까먹으니까\n\n…생일 축하해 형" },
  { v: 12, date: "2024-12-25", author: 0, read: false, title: "크리스마스",
    body: "혼자 붕어빵을 사 먹었다.\n2020년 크리스마스에 지훈이가 케이크 반을 혼자 먹었다고 투덜대던 게 생각났다.\n\n이 다이어리를 오랜만에 열었다.\n7월에 네가 쓴 글이 있더라.\n\n나도 보고 싶어." },
  { v: 12, date: "2025-03-03", author: 0, read: true, title: "생일 축하해, 지훈아",
    body: "이번엔 메시지를 쓰지 않았다.\n케이크를 사서 지훈이 집 앞으로 갔다.\n\n문을 연 지훈이가 케이크보다 나를 먼저 봤다.\n그리고 울었다. 나도 울었다.\n\n다시 시작하자는 말은 내가 했다.\n이번엔 끝까지 내가 잡을게." },
  { v: 12, date: "2025-03-03", author: 1, read: true, title: "생일 선물",
    body: "문을 열었더니 형이 케이크를 들고 서 있었다.\n3년 전에도 생일에 다시 시작했는데, 이번에도 생일이다.\n형은 우연이라는데 아닌 거 다 안다.\n울게 만들어 놓고 웃는 건 반칙이야.\n\n이제 1일은 새로 안 만들 거다.\n이번엔 진짜 끝까지 가자, 형." },
  { v: 12, date: "2025-03-04", author: 0, read: true, title: "약속",
    body: "지훈이가 이번에는 날짜를 새로 세지 말자고 했다.\n떨어져 있던 날들도 결국 서로를 생각한 날들이었으니까\n2020년 4월 18일부터 그대로 이어서 세자고.\n\n그래서 만남 날짜는 그대로 두었다." },
  { v: 12, date: "2025-05-10", author: 1, read: true, title: "퇴근길",
    body: "형 팀 연습실 앞에서 기다렸다.\n나오자마자 내 손부터 잡는 사람.\n\n오늘 하루 별로였는데 그걸로 다 괜찮아졌다." },
  { v: 12, date: "2025-07-22", author: 1, read: true, title: "형 생일",
    body: "2년 만에 형 생일을 같이 보냈다.\n미역국은 이제 제법 한다. 형도 인정했다.\n\n소원을 비밀이라길래 여기 꼭 쓰라고 했다.\n안 쓰면 삐질 거라고." },
  { v: 12, date: "2025-07-23", author: 0, read: true, title: "비밀이라고 한 소원",
    body: "지훈이가 계속 물어봐서 여기에만 적어둔다.\n\n지훈이가 덜 아팠으면.\n밥 거르지 않았으면.\n그리고 이 다이어리가 이번엔 끊기지 않았으면.\n\n…읽고 나서 놀리지 마." },
  { v: 12, date: "2025-09-14", author: 0, read: true, title: "장보기",
    body: "주말에 같이 장을 봤다.\n지훈이는 카트를 밀고 나는 목록을 지웠다.\n과자는 목록에 없었는데 세 봉지가 들어 있었다.\n\n이런 날이 오래 계속됐으면 좋겠다." },
  { v: 12, date: "2025-12-31", author: 1, read: true, title: "올해",
    body: "올해 제일 잘한 일: 형 집 앞에서 문 연 거.\n\n내년에도 형이랑.\n그거면 됐다." },
  { v: 12, date: "2026-03-03", author: 0, read: true, title: "지훈이 생일",
    body: "올해는 아무 일도 일어나지 않은 평범한 생일이었다.\n떡볶이를 먹고, 케이크를 자르고, 같이 잠들었다.\n\n평범한 생일을 같이 보낼 수 있어서 다행이다." },
  { v: 12, date: "2026-05-20", author: 0, read: true, title: "아무 날",
    body: "특별한 날은 아니었다.\n같이 저녁을 먹고 동네를 한 바퀴 걸었다.\n\n지훈이가 '우리 늙어서도 이러자' 해서\n그러자고 했다." },
  { v: 12, date: "2026-07-22", author: 1, read: true, title: "형 생일인데 내가 선물 받음",
    body: "형 생일인데 내가 반지를 받았다.\n'네 생일엔 늘 다시 시작했으니까, 내 생일엔 약속하고 싶었어.'\n\n형은 이런 말을 대체 어디서 배워 오는 걸까.\n하루종일 손가락만 봤다.\n\n사랑해, 현준아." },
  { v: 12, date: "2026-10-01", author: 0, read: true, title: "바나나우유",
    body: "지훈이가 편의점에서 바나나우유를 사 왔다.\n빨대까지 꽂아서 건네주더라.\n\n내가 좋아하는 걸 나보다 더 잘 기억하는 사람." },
  { v: 12, date: "2026-10-03", author: 1, read: true, title: "안전벨트",
    body: "차에 타자마자 형이 벨트도 안 매고 휴대폰만 보길래 내가 매줬다.\n간지럽다고 몸을 비트는 게 웃겨서 조금 더 괴롭혔다.\n그 표정이 그대로 사진에 찍혔다.\n\n벨트는 앞으로도 내가 매줄 거다.\n형은 맨날 까먹으니까." },
  { v: 12, date: "2026-10-05", author: 0, read: false, title: "대문사진",
    body: "안전벨트를 매준다면서 간지럼을 태워서 표정이 저렇게 찍혔다.\n지훈이가 그 사진을 대문에 걸겠다고 해서 그러라고 했다.\n\n사진 속 지훈이가 너무 즐거워 보여서 말릴 수가 없었다." },
  { v: 12, date: "2026-10-08", author: 1, read: true, title: "버스",
    body: "정류장에서 형을 기다리다가\n예전에 이 다이어리에 스크랩해뒀던 글이 생각났다.\n사랑은 버스 같아서 놓쳐도 또 온다던 거.\n\n우리는 두 번 놓쳤고, 두 번 다시 탔다.\n이제는 안 내릴 거다." },
  { v: 12, date: "2026-10-10", author: 0, read: true, title: "다이어리",
    body: "지훈이가 오래된 이 다이어리를 다시 꾸미자고 했다.\n하나하나 고르면서 '형 센스는 여전하네' 하고 놀리더니\n완성된 화면을 하루에도 몇 번씩 열어 본다.\n\n나도 그렇다." },
  { v: 12, date: "2026-10-12", author: 1, read: false, title: "오늘도 수고했어",
    body: "일 끝나고 차에서 바로 잠든 형.\n어깨 빌려준 거 기억 안 나지?\n\n형은 나 없으면 어떡하려고 그래.\n내일도 옆자리는 내 거야. 사랑해." },
  { v: 12, date: "2026-10-13", author: 0, read: false, title: "사실은",
    body: "어깨 빌려준 거 기억해.\n깨어 있었는데 자는 척했어.\n\n나도 사랑해, 지훈아." },
  { v: 12, date: "2020-05-20", author: 1, read: true, title: "첫 싸움",
    body: "게임 지고 나서 형이 '거기서 왜 들어갔어?' 이러는데\n아니 그걸 지금 말해야 돼??\n삐져서 방문 잠갔다\n\n30분 뒤에 문 밑으로 쪽지가 들어왔다\n'미안해. 아이스크림 사 왔어 (그림)'\n\n문 열었다\n아이스크림 때문 아님\n…반은 아이스크림 때문" },
  { v: 12, date: "2020-05-21", author: 0, read: true, title: "쪽지",
    body: "어제 처음으로 싸웠다.\n지훈이는 화나면 문을 잠근다. 기억해두기\n\n쪽지에 아이스크림 그림까지 그려 넣었는데\n그 얘기는 아무도 안 해줬다.\n…잘 그렸는데." },
  { v: 12, date: "2020-07-26", author: 1, read: true, title: "우리 100일",
    body: "벌써 100일이다.\n\n형이 커플 폰케이스 사 왔다\n형 건 파치리스, 내 건 에나비 ㅋㅋㅋㅋ\n'너 닮아서' 래\n나 에나비 닮았어?? 고양이 같아서??\n형은 파치리스 닮은 거 인정. 볼 빵빵한 거 똑같아\n\n…근데 맘에 들어 평생 쓸 거야\n\n100일 동안 고마워 현준상 ♡\n200일 300일 1000일도 같이 하자" },
  { v: 12, date: "2020-07-26", author: 0, read: true, title: "100일",
    body: "지훈이가 100일 동안 쓴 다이어리를 처음부터 다시 읽었다고 한다.\n나도 읽었다.\n\n1일에 '잘할게'라고 써둔 게 있었다.\n잘하고 있는지 모르겠다.\n더 잘할게" },
  { v: 12, date: "2020-09-05", author: 1, read: true, title: "형 폰 비번",
    body: "형 핸드폰 비번 뭔지 알아냈다\n0303\n내 생일이잖아 ㅋㅋㅋㅋㅋ\n\n들킨 형 표정 진짜 웃겼어\n'외우기 쉬워서' 래\n거짓말 못 하는 거 다 티 나 형" },
  { v: 12, date: "2020-12-13", author: 1, read: true, title: "첫눈",
    body: "첫눈 오는 날 만나면 사랑이 이루어진대\n이미 이루어졌는데 또 만났다 ㅋㅋ\n그럼 두 배로 이루어지는 거지?\n\n형 장갑 한 짝씩 나눠 끼고\n남은 손은 형 주머니에 넣었다" },
  { v: 12, date: "2021-01-15", author: 0, read: true, title: "아무것도 아니야",
    body: "지훈이가 하루종일 말이 없었다.\n이유를 물어도 '아무것도 아니야.'\n\n밤에야 알았다.\n내가 다른 사람한테 웃어준 게 싫었단다.\n\n내 웃음은 지훈이한테 제일 많이 쓴다고 말해줬다.\n진짜로 그렇다." },
  { v: 12, date: "2021-01-16", author: 1, read: true, title: "아무것도 아니야 (아님)",
    body: "어제 질투한 거 들켰다\n쪽팔려 ㅠ_ㅠ\n\n형이 '웃음은 너한테 제일 많이 써' 하는데\n그 말 하면서 또 웃고 있었다\n…인정. 나한테 제일 많이 웃는다" },
  { v: 12, date: "2021-04-18", author: 1, read: true, title: "1주년",
    body: "1년 전 오늘\n벚꽃 다 떨어진 길에서 형이 '지훈아' 했지\n\n올해는 벚꽃 필 때 같이 보러 갔다\n작년에 못 본 거 보상받음 아니 받았어\n\n형한테 편지 썼다\n세 장 썼는데 형이 다섯 번 읽었대\n\n1년 동안 사랑해줘서 고마워\n2년째도 잘 부탁해 현준상 ♡" },
  { v: 12, date: "2021-04-18", author: 0, read: true, title: "365일",
    body: "1년이 지났다.\n지훈이 편지는 세 장이었는데 다섯 번 읽었다.\n여섯 번째는 지금 읽고 있다.\n\n같이 본 벚꽃이 예뻤다.\n내년에도 같이 보자" },
  { v: 12, date: "2022-05-28", author: 1, read: true, title: "비 오는 날",
    body: "우산 하나로 같이 썼는데\n집에 와서 보니까 형 어깨만 다 젖어 있었다\n\n바보야 왜 우산을 나한테만 기울여\n감기 걸리면 내가 간호해야 되잖아 ㅡㅡ\n\n…간호해줄게 ♡" },
  { v: 12, date: "2022-08-09", author: 1, read: false, title: "또 싸웠다 (이번엔 형 잘못)",
    body: "형 열 나는데 말 안 했다\n내가 이마 짚어보고 알았어\n\n왜 말 안 했냐니까 내가 걱정할까봐래\n그게 더 걱정되거든??\n\n화내다가 울어버렸다\n형은 아픈데 내가 울어서 형이 나를 달래줬다\n바보같이 ㅠㅠ" },
  { v: 12, date: "2022-08-10", author: 0, read: true, title: "숨기지 않기",
    body: "지훈이랑 약속을 하나 더 했다.\n아프면 말하기.\n\n어제 지훈이가 울면서 화를 냈다.\n걱정시키기 싫어서 숨긴 건데\n숨긴 게 더 걱정이었다는 걸 몰랐다.\n\n미안해. 이제 말할게." },
  { v: 12, date: "2022-12-24", author: 0, read: true, title: "크리스마스",
    body: "올해는 케이크도 붕어빵도 다 샀다.\n2020년 크리스마스 얘기를 꺼냈더니\n지훈이가 '그때 형 늦게 와서 케이크 반 혼자 먹었잖아' 하고 또 투덜거렸다.\n\n올해는 케이크 반을 내가 먹었다." },
  { v: 12, date: "2023-02-11", author: 1, read: true, title: "형 몰래 이벤트 대작전",
    body: "발렌타인에 형 놀래켜주려고 풍선 100개 샀다\n불다가 어지러워서 쓰러질 뻔\n\n형한테 들키면 안 되니까 여기 써두는 건\n…형 이 다이어리 보잖아 ㅋㅋㅋ 망했다\n형 이 글 못 본 척해줘" },
  { v: 12, date: "2023-02-14", author: 0, read: true, title: "발렌타인",
    body: "집에 들어갔더니 풍선이 천장까지 차 있었다.\n지훈이가 숨어 있다가 튀어나왔는데\n그때 풍선 하나가 터져서 둘 다 소리를 질렀다.\n\n사흘 전 글은 못 본 척했다.\n그래도 많이 놀랐다. 진짜로." },
  { v: 12, date: "2023-04-18", author: 1, read: true, title: "3주년",
    body: "헤어졌던 반년까지 다 세면 3년\n형이 그 반년도 우리 거라고 했잖아\n\n3년 동안 형한테 들은 말 중에 제일 좋았던 거:\n'지훈아 밥 먹었어?'\n제일 많이 들어서 그런가\n\n사랑해 현준이형" },
  { v: 12, date: "2023-06-03", author: 1, read: false, title: "기념일 까먹은 사람",
    body: "오늘 우리 처음 손 잡은 날인데\n형 하루종일 아무 말도 안 했다\n\n저녁에 '오늘 무슨 날인지 알아?' 물어보니까\n형이 멈칫하더라\n\n됐어 몰라 ㅡㅡ" },
  { v: 12, date: "2023-06-04", author: 0, read: true, title: "손 잡은 날",
    body: "사실 기억하고 있었다.\n저녁 먹으면서 말하려고 아껴둔 건데\n지훈이가 먼저 서운해하는 바람에 타이밍을 놓쳤다.\n\n변명처럼 들릴 것 같아서 오늘 아침에 꽃을 사다 놨다.\n다음엔 아침에 먼저 말할게." },
  { v: 12, date: "2023-12-09", author: 0, read: true, title: "제주도",
    body: "제주도에 다녀왔다.\n지훈이는 렌트카 조수석에서 노래를 크게 불렀고\n나는 운전하면서 몰래 녹음했다.\n\n귤 따기 체험에서 지훈이가 귤을 열 개 넘게 먹었다.\n가져온 귤은 세 개였다." },
  { v: 12, date: "2024-01-01", author: 0, read: true, title: "새해",
    body: "올해는 지훈이랑 좀 더 많이 웃었으면 좋겠다.\n요즘 둘 다 너무 바빠서\n같이 있어도 각자 휴대폰만 볼 때가 많다." },
  { v: 12, date: "2024-03-03", author: 0, read: false, title: "지훈이 생일",
    body: "연습이 늦게 끝나서 생일을 밤 11시가 넘어서야 챙겼다.\n지훈이는 괜찮다고 했다.\n\n'괜찮아'라는 말이 요즘 자주 들린다." },
  { v: 12, date: "2024-05-12", author: 1, read: false, title: "말다툼",
    body: "별것도 아닌 걸로 또 다퉜다\n저녁 메뉴 때문에\n\n사실 메뉴 때문 아닌 거 둘 다 알아\n근데 둘 다 진짜 이유는 말 안 했다" },
  { v: 12, date: "2024-09-08", author: 0, read: false, title: "가을",
    body: "지훈이가 좋아하던 붕어빵 가게가 다시 문을 열었다.\n줄을 서 있다가 그냥 돌아왔다.\n\n혼자 먹으면 맛이 없을 것 같아서." },
  { v: 12, date: "2025-04-18", author: 1, read: true, title: "5주년",
    body: "헤어졌던 시간까지 다 세면 5년.\n형이 꽃을 사 왔다.\n꽃은 시드는 게 싫다던 사람이.\n\n'시들면 또 사 오면 되지' 하는데\n그 말이 이상하게 오래 남는다." },
  { v: 12, date: "2025-06-21", author: 0, read: true, title: "설거지",
    body: "설거지 때문에 다퉜다.\n지훈이는 모아뒀다가 한 번에, 나는 바로바로.\n\n결국 요일을 나누기로 했다.\n월수금은 나, 화목토는 지훈이, 일요일은 같이.\n\n다투고 나서도 같이 밥을 먹을 수 있는 게 좋다." },
  { v: 12, date: "2025-06-21", author: 1, read: true, title: "설거지 협정",
    body: "형이랑 설거지 요일 정했다.\n근데 일요일에 같이 하자는 건 형 아이디어였어.\n그냥 같이 있고 싶은 거잖아 형.\n다 티 나." },
  { v: 12, date: "2025-08-30", author: 0, read: true, title: "이사",
    body: "같이 살 집으로 짐을 옮겼다.\n짐을 합쳤더니 머그컵이 열두 개였다.\n둘 다 머그컵을 버리지 못하는 사람이었다.\n\n100일 때 맞춘 폰케이스도 나왔다.\n내 파치리스, 지훈이 에나비. 둘 다 아직 가지고 있었다." },
  { v: 12, date: "2025-11-11", author: 1, read: true, title: "빼빼로데이",
    body: "월즈 끝나고 돌아온 형이 빼빼로를 상자째 사 왔다.\n편의점 행사 문구를 그대로 믿는 사람.\n\n둘이서 다 못 먹어서 아직 반 상자 남았다.\n내일도 먹으면 되지 뭐." },
  { v: 12, date: "2026-02-14", author: 0, read: true, title: "발렌타인",
    body: "올해는 조용히 보냈다.\n지훈이가 만든 초콜릿은 여전히 모양이 엉망이었고\n맛은 많이 늘었다.\n\n풍선이 없어도 충분히 좋았다." },
  { v: 12, date: "2026-04-18", author: 1, read: true, title: "6주년",
    body: "6년.\n형이랑 산 날이 형 없이 산 날보다 길어졌다.\n\n오늘은 처음 고백받은 길을 다시 걸었다.\n벚꽃은 이번에도 다 떨어져 있었다.\n그래도 좋았다." },
  { v: 12, date: "2026-08-20", author: 1, read: true, title: "사소한 싸움",
    body: "형이 내 게임 기록 보고 또 '거기서 왜 들어갔어?' 했다.\n6년째 똑같아.\n\n이번엔 방문 안 잠갔다.\n대신 형 아이스크림을 내가 먹었다.\n어른의 복수." },
  { v: 12, date: "2026-09-01", author: 0, read: true, title: "첫 싸움 기억나?",
    body: "지훈이가 아이스크림을 먹어버린 뒤로 냉동실에 하나를 더 넣어두기로 했다.\n\n2020년 5월, 처음 싸운 날 쪽지에 그렸던 아이스크림이 생각났다.\n그때 그림 얘기는 아무도 안 해줬는데\n어제 지훈이가 '그 그림 아직 갖고 있어' 했다." },
  { v: 12, date: "2020-06-13", author: 1, read: true, title: "같은 팀이라 좋은 점 & 나쁜 점",
    body: "좋은 점\n- 출근하면 형이 있다\n- 밥 먹을 때 형 옆자리 찜 가능\n- 형 자는 얼굴 볼 수 있음 (버스에서)\n\n나쁜 점\n- 피드백도 형이 한다\n- 스크림 지면 형 표정 다 보인다\n- 다른 팀원들이 우리 놀린다 (이건 좋은 점인가)" },
  { v: 12, date: "2020-11-20", author: 1, read: false, title: "내년엔 다른 팀",
    body: "내년에 형이랑 다른 팀이 됐다\n\n같은 숙소 아니라서 아침에 형 못 본다 ㅠ_ㅠ\n형은 '경기장에서 보면 되지' 하는데\n그건 적으로 보는 거잖아!!\n\n이적 기사 보면서 괜히 울컥했다." },
  { v: 12, date: "2020-11-21", author: 0, read: true, title: "다른 팀",
    body: "내년부터 지훈이랑 다른 팀이다.\n지훈이가 많이 서운해한다.\n\n떨어져 있어도 연락은 내가 먼저 할게.\n경기장에서 만나면 봐주지는 않을 거고\n대신 끝나고 제일 먼저 악수하러 갈게" },
  { v: 12, date: "2021-02-06", author: 1, read: true, title: "형이랑 첫 맞대결",
    body: "졌다\n형네 팀한테 졌다\n\n악수할 때 형이 손 꽉 잡아줬다\n카메라 있어서 웃지도 못하고\n형만 혼자 몰래 웃더라\n얄미워!!\n\n…그래도 형 잘하더라 멋있었어 ♡" },
  { v: 12, date: "2021-02-06", author: 0, read: true, title: "맞대결",
    body: "처음으로 지훈이와 다른 편에서 경기했다.\n이겼는데 생각보다 기쁘지 않았다.\n\n악수하면서 손을 꽉 잡았더니 지훈이가 입술을 깨물었다.\n웃음 참는 얼굴이었다.\n오늘 경기에서 그게 제일 좋았다." },
  { v: 12, date: "2021-11-25", author: 1, read: false, title: "내년 팀",
    body: "내년에 형이랑 다시 같은 팀이래\n\n…우리 헤어졌는데\n\n어떡해\n매일 형 얼굴 보면서 연습해야 돼" },
  { v: 12, date: "2022-01-10", author: 0, read: false, title: "같은 연습실",
    body: "헤어진 사람과 같은 연습실에 앉는다는 게 어떤 건지 알게 됐다.\n\n지훈이는 내 옆자리를 피하지 않았다.\n나도 피하지 않았다.\n게임 얘기만 했다. 그것도 생각보다 괜찮았다.\n\n…괜찮은 척이었지만." },
  { v: 12, date: "2022-04-02", author: 1, read: true, title: "준우승",
    body: "스프링 결승 졌다\n준우승..\n\n무대 내려와서 형 얼굴 보자마자 울었다 ㅠㅠ\n형이 아무 말 없이 등 두드려줬다\n\n다음엔 꼭 같이 트로피 들자\n형이랑 꼭 같이" },
  { v: 12, date: "2022-04-02", author: 0, read: true, title: "준우승",
    body: "결승에서 졌다.\n지훈이가 무대 뒤에서 울었다.\n\n위로하는 말은 아무것도 생각나지 않아서\n등만 계속 두드렸다.\n\n다음엔 꼭 같이 웃자.\n그 다음이 오래 걸리지 않았으면 좋겠다" },
  { v: 12, date: "2022-08-28", author: 1, read: true, title: "우리 우승했다",
    body: "우승!!\n써머 우승!!\n형이랑 둘 다 처음!!\n\n꽃가루 떨어지는데 형이 제일 먼저 나한테 달려왔다\n안경 벗겨질 뻔한 거 봤어 ㅋㅋㅋㅋ\n\n4월에 약속한 거 지켰다\n형이랑 같이 트로피 들었어\n\n사랑해 현준상 세상에서 제일 ♡" },
  { v: 12, date: "2022-08-28", author: 0, read: true, title: "처음",
    body: "처음으로 우승했다.\n지훈이도 처음이다.\n\n꽃가루가 쏟아지는데 다른 건 하나도 안 보였다.\n지훈이한테 달려가다가 안경이 벗겨질 뻔했다.\n\n4월에 등만 두드리던 날이 생각났다.\n같이 웃자고 했던 거, 지켰다" },
  { v: 12, date: "2023-04-09", author: 1, read: true, title: "또 우승",
    body: "스프링 우승!!\n작년 4월엔 준우승해서 울었는데\n올해 4월엔 우승해서 울었다 ㅋㅋ\n\n형이 '울 거면 이기고 울어' 하더니\n자기도 울었다\n\n두 번째 트로피도 형이랑 ♡" },
  { v: 12, date: "2023-04-09", author: 0, read: true, title: "두 번째 트로피",
    body: "스프링에서 우승했다.\n작년 이맘때 무대 뒤에서 울던 지훈이가\n오늘은 트로피를 안고 울었다.\n\n같은 눈물인데 하나도 안 같았다." },
  { v: 12, date: "2023-08-20", author: 0, read: true, title: "세 번째",
    body: "써머도 우승했다.\n지훈이와 같은 팀에서 드는 세 번째 트로피.\n\n시상식 끝나고 지훈이가 '형 우리 진짜 잘 맞는다' 했다.\n게임 얘기인지 다른 얘기인지 묻지 않았다.\n둘 다였으면 좋겠다." },
  { v: 12, date: "2023-08-20", author: 1, read: true, title: "써머 우승",
    body: "써머도 우승했다\n형이랑 같은 팀에서 세 번째\n\n이제 우승하면 형이 안경부터 벗는다\n뛰어올 때 안 떨어지게 ㅋㅋ\n그거 보면 웃겨서 감동이 깨져\n그래서 좋아" },
  { v: 12, date: "2023-11-22", author: 1, read: false, title: "또 다른 팀",
    body: "내년엔 형이랑 다시 다른 팀이다.\n형은 괜찮다고 했다.\n\n괜찮을 거야.\n2021년에도 괜찮았잖아.\n…그때 우리 헤어졌었지." },
  { v: 12, date: "2024-04-14", author: 1, read: false, title: "우승했는데",
    body: "나만 우승했다.\n형 팀은 결승에 못 왔다.\n\n형이 제일 먼저 문자를 보냈다.\n'축하해.'\n그게 전부였다.\n\n기뻐야 하는데 그 세 글자가 계속 걸린다." },
  { v: 12, date: "2024-04-14", author: 0, read: false, title: "축하해",
    body: "지훈이 우승을 화면으로 봤다.\n기뻤다. 진심으로.\n\n그런데 축하한다는 말 말고는 아무것도 쓸 수가 없었다.\n같은 무대에 서 있지 않은 게 처음으로 이렇게 멀게 느껴졌다.\n\n지훈아, 축하해.\n이 말을 여기에라도 한 번 더 적어둔다." },
  { v: 12, date: "2024-09-08", author: 0, read: false, title: "결승",
    body: "써머 결승 상대가 지훈이네 팀이었다.\n이겼다.\n\n트로피를 들면서 반대편을 봤는데 지훈이가 고개를 숙이고 있었다.\n악수할 때 '축하해 형' 하고 웃어주더라.\n\n헤어지고 처음 잡은 손이었다.\n웃는 얼굴이 더 아팠다." },
  { v: 12, date: "2024-09-08", author: 1, read: false, title: "준우승",
    body: "형이랑 결승에서 만났다.\n졌다.\n\n형 우승 축하해. 진짜로.\n\n악수하는데 형 손이 떨렸다.\n헤어지고 처음 잡은 손.\n놓기 싫어서 한 박자 늦게 놨다.\n형은 알았을까." },
  { v: 12, date: "2025-11-09", author: 0, read: true, title: "월즈",
    body: "세계대회에서 우승했다.\n\n무대에서 내려오자마자 휴대폰을 봤다.\n지훈이 메시지가 제일 위에 있었다.\n'형 세계 최고야. 사랑해.'\n\n트로피보다 그 한 줄이 더 무거웠다." },
  { v: 12, date: "2025-11-09", author: 1, read: true, title: "형 월즈 우승",
    body: "형이 세계 최고가 됐다.\n나는 관중석에서 봤다.\n\n다른 팀이라 무대에 같이 올라가진 못하지만\n제일 크게 소리 지른 건 나였을 거다.\n\n형이 세계 최고인 거, 나는 진작부터 알았어." },
  { v: 12, date: "2020-08-22", author: 1, read: true, title: "플레이오프",
    body: "플레이오프에서 떨어졌다.\n\n버스 맨 뒷자리에서 형이 아무 말 없이 이어폰 한쪽을 줬다.\n노래 다 끝날 때까지 둘 다 창밖만 봤다.\n\n내년엔 꼭 더 높이 가자." },
  { v: 12, date: "2020-12-19", author: 0, read: true, title: "비시즌",
    body: "시즌이 끝나고 처음으로 알람 없이 잤다.\n깨보니 지훈이가 내 휴대폰으로 셀카를 서른 장 찍어놨다.\n\n지우지 않았다." },
  { v: 12, date: "2021-01-13", author: 1, read: true, title: "개막",
    body: "스프링 개막.\n이제 형이랑 다른 팀이라 경기 끝나고 같은 버스를 못 탄다.\n\n대신 형이 경기 끝나자마자 '잘했어' 문자 보냈다.\n졌는데 잘했대.\n형 거짓말 못 하는 거 다 아는데\n이번 건 믿기로 했다." },
  { v: 12, date: "2021-07-03", author: 1, read: false, title: "두 번째 맞대결",
    body: "이번엔 이겼다.\n\n근데 하나도 안 기뻤다.\n형이 악수하고 바로 돌아섰다.\n원래는 내 손 꽉 잡고 몰래 웃었는데.\n\n요즘 우리 왜 이래." },
  { v: 12, date: "2022-01-12", author: 1, read: false, title: "개막전",
    body: "헤어진 형이랑 같은 팀으로 개막전을 치렀다.\n\n헤드셋 너머로 형 목소리가 들렸다.\n'지훈아 들어가' 하는데\n그 이름 부르는 목소리가 너무 그대로라서\n손이 좀 떨렸다.\n\n이겼다. 다행이다." },
  { v: 12, date: "2022-05-14", author: 0, read: true, title: "휴가",
    body: "스프링이 끝나고 짧은 휴가를 받았다.\n준우승한 지 한 달이 지났다.\n\n지훈이가 바다 말고 산에 가자고 했다.\n정상에서 '다음엔 우승하고 바다 가자' 하길래 그러자고 했다.\n약속이 하나 더 생겼다." },
  { v: 12, date: "2022-10-08", author: 1, read: true, title: "첫 월즈",
    body: "처음으로 롤드컵에 왔다.\n시차 때문에 새벽 4시에 깼는데 형도 깨 있었다.\n\n호텔 창밖으로 해 뜨는 거 같이 봤다.\n형이 '긴장돼?' 물어서 아니라고 했다.\n형이 내 손을 잡았는데 형 손이 더 차가웠다.\n형이 긴장한 거였어." },
  { v: 12, date: "2022-11-01", author: 0, read: true, title: "돌아오는 비행기",
    body: "월즈는 4강에서 끝났다.\n\n돌아오는 비행기에서 지훈이가 내 어깨에 기대 잤다.\n공항 사진 이후로 처음이었다.\n이번엔 내가 천장을 봤다." },
  { v: 12, date: "2023-05-13", author: 1, read: true, title: "런던",
    body: "MSI 때문에 런던에 왔다.\n하루종일 비가 온다.\n\n형이 우산을 또 나한테만 기울였다.\n작년에 그러지 말라고 했잖아.\n결국 내가 형 쪽으로 다시 기울였다.\n둘 다 반씩 젖었다.\n그게 맞는 것 같다." },
  { v: 12, date: "2023-05-14", author: 0, read: true, title: "시차",
    body: "런던은 한국보다 여덟 시간 늦다.\n지훈이는 낮에 졸리고 밤에 말이 많아진다.\n\n어젯밤엔 새벽 세 시까지\n우리가 처음 만난 2019년 겨울 얘기를 했다.\n지훈이는 그때 내가 무서웠다고 했다.\n나는 그때 지훈이가 귀여웠다고 했다." },
  { v: 12, date: "2023-11-12", author: 0, read: true, title: "한국에서 열린 월즈",
    body: "이번 월즈는 한국에서 열렸다.\n작년처럼 4강에서 멈췄다.\n\n부산에서 서울로 올라오는 기차에서 지훈이가 내 손을 놓지 않았다.\n집이 가까워서 오히려 더 허전했다.\n\n두 번 연속 4강.\n지훈이가 '형 다음엔 꼭 끝까지 가' 했다." },
  { v: 12, date: "2024-01-17", author: 1, read: false, title: "다시 다른 팀",
    body: "스프링 개막.\n형이랑 다른 팀으로 맞는 두 번째 시즌.\n\n2021년엔 경기 끝나면 형이 바로 '잘했어' 보냈는데\n오늘은 내가 먼저 보냈다.\n답장은 한 시간 뒤에 왔다." },
  { v: 12, date: "2024-05-04", author: 1, read: false, title: "MSI",
    body: "MSI 때문에 해외에 와 있다.\n형한테 영상통화가 왔는데 연습 중이라 못 받았다.\n다시 걸었더니 이번엔 형이 자고 있었다.\n\n요즘 우리는 계속 이렇게 엇갈린다." },
  { v: 12, date: "2024-10-05", author: 0, read: false, title: "베를린",
    body: "월즈 때문에 베를린에 왔다.\n같은 대회, 다른 팀, 다른 호텔.\n\n대회장 엘리베이터에서 지훈이와 마주쳤다.\n문이 닫히고 열릴 때까지 둘 다 아무 말도 못 했다.\n내리면서 지훈이가 작게 '형 감기 조심해' 했다.\n\n나는 대답을 못 했다." },
  { v: 12, date: "2024-10-05", author: 1, read: false, title: "엘리베이터",
    body: "엘리베이터에 형이 있었다.\n\n13층까지 30초.\n그동안 하고 싶은 말이 백 개쯤 생각났는데\n나온 건 '감기 조심해'였다.\n\n형 목에 그 목도리, 내가 사준 거였다." },
  { v: 12, date: "2025-01-15", author: 1, read: false, title: "LCK컵",
    body: "올해는 LCK컵으로 시즌이 시작한다.\n형네 팀 경기를 몰래 봤다.\n\n형은 여전히 잘한다.\n이기고 나서 안경 고쳐 쓰는 버릇도 그대로다.\n\n그게 보고 싶었다." },
  { v: 12, date: "2025-04-02", author: 0, read: true, title: "정규시즌",
    body: "정규시즌이 시작됐다.\n지훈이와 서로 경기가 끝나면 피드백을 해주기로 했다.\n\n오늘 내 경기를 보고 지훈이가 첫마디로\n'형 거기서 왜 들어갔어?' 했다.\n\n5년 전 내가 했던 말이다.\n둘 다 한참 웃었다." },
  { v: 12, date: "2025-11-02", author: 1, read: true, title: "먼저 떨어졌다",
    body: "우리 팀은 4강에서 끝났다.\n결승까지 한 판 남기고.\n\n짐 싸서 한국 가려다가 그냥 남았다.\n형 경기 보려고.\n\n형이 '돌아가서 쉬어' 했는데\n쉬는 건 형 우승하고 같이 하면 된다." },
  { v: 12, date: "2025-11-08", author: 0, read: true, title: "결승 전날",
    body: "내일이 결승이다.\n지훈이가 호텔 방 앞에 바나나우유를 두고 갔다.\n쪽지에는 아이스크림 그림이 그려져 있었다.\n2020년의 내 그림보다 잘 그렸다.\n\n이길게." },
  { v: 12, date: "2026-01-14", author: 0, read: true, title: "새 시즌",
    body: "새 시즌이 시작됐다.\n지훈이와 사귄 지 일곱 번째 시즌이다.\n\n다른 팀 유니폼을 입고 같은 집에서 나간다.\n현관에서 서로 넥타이 대신 마우스 챙겼냐고 묻는다." },
  { v: 12, date: "2026-09-12", author: 1, read: true, title: "플레이오프에서 만났다",
    body: "플레이오프에서 형네 팀이랑 만났다.\n이번엔 내가 이겼다.\n\n악수할 때 형이 손을 꽉 잡고 몰래 웃었다.\n2021년 첫 맞대결 때랑 똑같이.\n\n집에 왔더니 형이 미역국을 끓여놨다.\n내 생일 아닌데.\n'이긴 날이니까 생일 같은 거지' 래.\n이 사람 진짜." },
];
/** 첫 글 묶음 판 — 6: 2019 첫 만남 · 2020 연애 · 2021 이별 · 2022 재회 · 2024 이별 · 2025 재회 / 5: 두 사람 말투(연상 온화 / 연하 투정)에 맞춘 전체 개정 + 헤어졌다 다시 만난 이야기 */
const STARTER_V = 12;
/** 예전 판들이 넣은 글 제목 — 이 제목의 글은 새 판으로 통째로 바꾼다(직접 쓴 글은 그대로) */
const PREV_TITLES = new Set(["(보내지 못한 문자)", ".", "100일", "11월", "1일", "1주년", "2023 현준이형 어워드", "365일", "3주년", "5주년", "6주년", "LCK컵", "MSI", "[스크랩] 사랑은... 버스정류장 같은거래", "★ 현준이형 생일 ★", "★2023 현준이형 어워드★", "★☆★ 우리 우승했다 ★☆★", "♥ 1주년 ♥", "♥♡ 우리 100일 ♡♥", "ㄴr는 ㄱr끔..", "ㅇr..오늘은 쫌 우울한날..★", "가을", "감기", "같은 연습실", "같은 팀이라 좋은 점 & 나쁜 점", "개막", "개막전", "결승", "결승 전날", "공항", "그만하자", "기념일 까먹은 사람", "기다리는 동안", "날짜 어떻게 세?", "내 핸드크림 돌려줘 ㅡㅡ", "내년 팀", "내년엔 다른 팀", "다른 팀", "다시", "다시 1일 !!", "다시 1일 !!!", "다시 다른 팀", "다이어리", "대문사진", "도토리", "도토리 다 써버렸다..", "돌아오는 비행기", "두 번째 맞대결", "두 번째 트로피", "또 다른 팀", "또 싸웠다 (이번엔 형 잘못)", "또 우승", "또 우승 ^^v", "런던", "말다툼", "맞대결", "먼저 떨어졌다", "문 앞에 있던 쇼핑백", "미안해", "바나나우유", "바다", "발렌타인", "발렌타인인데요?", "버스", "베를린", "비 오는 날", "비밀이라고 한 소원", "비시즌", "빼빼로데이", "사소한 싸움", "사실은", "새 시즌", "새해", "새해 첫 일기 ★彡", "생일", "생일 다음날", "생일 선물", "생일 축하해", "생일 축하해, 지훈아", "서운해", "설거지", "설거지 협정", "세 번째", "손 잡은 날", "손장난 금지 (근데 내가 함)", "숨기지 않기", "시차", "써머 우승", "아무 날", "아무것도 아니야", "아무것도 아니야 (아님)", "안아줘..★", "안전벨트", "안전벨트는 내가 매준다 -_-+", "약속", "어깨 좀 빌릴게 (_ _)zZ", "엘리베이터", "오늘도 수고했어", "오늘부터 1일", "오늘부터 1일 ♡♡♡", "올해", "요즘 우리", "우리 100일", "우리 우승했다", "우승했는데", "월즈", "이번엔 내가", "이사", "일부러 버틴 거야", "일부러 버틴거임 ㅋ", "장보기", "정규시즌", "제주도", "준우승", "준우승 ㅠ_ㅠ", "지훈이 생일", "지훈이 이 나쁜넘아 ㅠ_ㅠ", "쪽지", "처음", "천장 본 이유", "첫 싸움", "첫 싸움 ㅡㅡ+", "첫 싸움 기억나?", "첫 월즈", "첫 크리스마스인데요?", "첫눈", "첫눈 ★彡", "축하해", "크리스마스", "크리스마스 ~*", "킬러 이 나쁜넘아 ㅠ_ㅠ", "퇴근길", "플레이오프", "플레이오프에서 만났다", "한국에서 열린 월즈", "핸드크림 반 통", "현준상 생일 (재결합 버전)", "현준이형 생일", "형 몰래 이벤트 대작전", "형 생일", "형 생일인데 내가 선물 받음", "형 월즈 우승", "형 폰 비번", "형이 먼저 그만하자고 함", "형이랑 첫 맞대결", "휴가"]);

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
  return { ...d, since: STARTER_SINCE, entries: [...mine, ...await Promise.all(STARTER.map(seedEntry))], starterV: STARTER_V };
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
  const [all, setAll] = useState(false);   // 전체보기 — 달 상관없이 모든 글
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
      .filter(e => (day ? e.date === day : all || e.date.startsWith(monthKey)))
      .filter(e => who == null || e.author === who)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    const dayCell = (n: number) => {
      const ds = `${monthKey}-${pad(n)}`;
      const dow = new Date(y, m, n).getDay();
      return (
        <button key={n} type="button"
          className={`cy-d${days.has(ds) ? ' has' : ''}${dow === 0 ? ' sun' : ''}${day === ds ? ' on' : ''}${ds === ymd(today) ? ' today' : ''}`}
          onClick={() => { setDay(day === ds ? null : ds); setAll(false); }}>{n}</button>
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
              <button className={`cy-fold${all && who == null && !day ? ' on' : ''}`} onClick={() => { setWho(null); setDay(null); setAll(true); }}>📒 전체보기</button>
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
                    <button type="button" data-tip="작년" onClick={() => { setMonth(new Date(y - 1, m, 1)); setDay(null); setAll(false); }}>«</button>
                    <button type="button" onClick={() => { setMonth(new Date(y, m - 1, 1)); setDay(null); setAll(false); }}>◀</button>
                    <b>{y}.{pad(m + 1)}</b>
                    <button type="button" onClick={() => { setMonth(new Date(y, m + 1, 1)); setDay(null); setAll(false); }}>▶</button>
                    <button type="button" data-tip="내년" onClick={() => { setMonth(new Date(y + 1, m, 1)); setDay(null); setAll(false); }}>»</button>
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
                {list.length === 0 && <p className="cy-empty">{day ? `${fmt(day)}에는 쓴 글이 없어요` : all ? '아직 쓴 글이 없어요' : '이 달에는 쓴 글이 없어요'}</p>}
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
