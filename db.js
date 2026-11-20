const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'counseling.db');
const db = new DatabaseSync(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    nickname TEXT NOT NULL,
    broadcast_agree INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'unread',
    streamer_memo TEXT DEFAULT '',
    ip_hash TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
  CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category);
  CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at DESC);
`);

// Seed initial funny & relatable sample stories if table is empty
const countStmt = db.prepare('SELECT COUNT(*) as count FROM stories');
const { count } = countStmt.get();

if (count === 0) {
  const insertStmt = db.prepare(`
    INSERT INTO stories (ticket_code, title, category, content, nickname, broadcast_agree, status, streamer_memo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const samples = [
    {
      ticket: 'ZZAK-8821',
      title: '비둘기랑 눈싸움하다가 버스 놓쳤는데 어떡하죠?',
      category: '하찮은 고민',
      content: '아침 출근길 버스정류장에서 어떤 비둘기 한 마리가 절 너무 빤히 쳐다보는 겁니다.\n자존심이 상해서 눈을 안 깜빡이고 한 3분 동안 서로 째려봤거든요?\n근데 제가 눈물 찔끔 흘리면서 눈 깜빡이는 순간 비둘기가 고개 까딱하고 푸드덕 날아가더니 바로 눈앞에서 704번 버스가 떠나버렸습니다...\n지각 사유에 비둘기와의 패배라고 쓸 수도 없고 너무 자괴감 드는데 이거 제 잘못 맞나요?',
      nickname: '조류공포증생김',
      agree: 1,
      status: 'broadcast_plan',
      memo: '방송 오프닝에서 읽기 딱 좋은 황당 썰 ㅋㅋㅋ 리액션 찰질듯',
      timeDelta: '-3 days'
    },
    {
      ticket: 'ZZAK-8822',
      title: '도서관에서 3달째 마주치는 분에게 쪽지 줘도 될까요?',
      category: '연애',
      content: '매일 퇴근하고 동네 도서관 열람실에서 공무원 시험 준비하고 있는 취준생입니다.\n항상 제 대각선 자리에 앉으시는 분이 계신데, 음료수 마실 때마다 빨대 껍질로 작은 종이학을 접어두시는 모습이 너무 귀여우세요...\n부담스럽지 않게 비타민 음료수랑 "열공하세요 힘내세요!" 정도의 포스트잇을 남겨보고 싶은데 혹시 공부 방해되고 부담스러우실까요?\n스트리머님의 연애 훈수 절실합니다 ㅠㅠ',
      nickname: '도서관종이학',
      agree: 1,
      status: 'unread',
      memo: '',
      timeDelta: '-2 days'
    },
    {
      ticket: 'ZZAK-8823',
      title: '신입사원인데 부장님이 자꾸 제 탕수육을 소스에 담가둡니다...',
      category: '직장',
      content: '저는 강경한 찍먹파입니다.\n근데 점심 회식 때마다 부장님이 "탕수육은 푹 적셔야 부드럽다"면서 제가 집으려는 탕수육 3개를 집게로 푹 집어서 소스 그릇 밑바닥에 강제로 잠수시킵니다.\n눅눅해진 튀김옷을 볼 때마다 눈물이 차오르는데, 이거 직장 내 괴롭힘으로 노조에 찔러도 됩니까? 어떻게 대처해야 평화롭게 바삭함을 지킬 수 있을까요?',
      nickname: '바삭바삭튀김러버',
      agree: 1,
      status: 'checked',
      memo: '부먹 vs 찍먹 시청자 투표 붙여보기',
      timeDelta: '-1 days'
    },
    {
      ticket: 'ZZAK-8824',
      title: '친구가 제 짝태를 먹튀했습니다',
      category: '웃긴 사연',
      content: '어제 집들이에서 제가 아껴둔 통통한 황태포/짝태를 에어프라이어에 정성스럽게 구워서 특제 마요네즈 청양고추 소스까지 만들었는데요.\n잠깐 화장실 다녀온 사이에 친구 녀석이 "어? 과자인 줄 알고 다 먹었는데?" 하면서 뼈다귀만 남겨놨습니다.\n심지어 소스까지 핥아먹었더라고요. 절교각인가요 아니면 다음 주에 그 친구 집 털러 갈까요?',
      nickname: '짝태의복수자',
      agree: 1,
      status: 'broadcast_done',
      memo: '저번 주 방송에서 소개 완료! 반응 엄청 좋았음',
      timeDelta: '-4 hours'
    },
    {
      ticket: 'ZZAK-8825',
      title: '개발자인데 코딩보다 컴퓨터 조립해달라는 부탁이 더 많아요',
      category: '진로',
      content: '컴퓨터공학과 졸업하고 백엔드 개발자로 일하고 있습니다.\n친척들이나 지인들은 제가 컴퓨터 만지는 사람이라고 하면 무조건 롤 잘 돌아가는 본체 견적 짜달라, 프린터 고쳐달라, 윈도우 정품 인증 왜 풀렸냐고 전화가 옵니다.\n저는 DB 쿼리 짜는 사람인데 다들 만능 컴퓨터 수리 기사인 줄 알아요. 어떻게 하면 이 고통에서 벗어날 수 있을까요?',
      nickname: '쿼리짜는인간',
      agree: 0,
      status: 'hold',
      memo: '방송 동의 X - 상담소 보관용',
      timeDelta: '-1 hours'
    }
  ];

  for (const s of samples) {
    insertStmt.run(s.ticket, s.title, s.category, s.content, s.nickname, s.agree, s.status, s.memo, s.timeDelta);
  }
  console.log('Sample stories seeded successfully!');
}

module.exports = db;
