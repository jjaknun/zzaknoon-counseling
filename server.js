const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zzaknoon1234';
const VALID_CATEGORIES = [
  '연애',
  '학업',
  '진로',
  '인간관계',
  '가족',
  '직장',
  '일상',
  '웃긴 사연',
  '하찮은 고민',
  '기타'
];

// In-memory sessions & rate limiter
const activeSessions = new Map(); // token -> { createdAt }
const ipSubmissionTimers = new Map(); // ip -> timestamp
const sseClients = new Set(); // Set of res objects for real-time notifications

// Middlewares
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Hash IP for privacy & rate limiting
function hashIp(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  return crypto.createHash('sha256').update(ip.toString()).digest('hex').substring(0, 16);
}

// Helper: Broadcast to SSE clients
function broadcastNewStory(story) {
  const payload = JSON.stringify({
    type: 'NEW_STORY',
    data: {
      id: story.id,
      ticket_code: story.ticket_code,
      title: story.title,
      category: story.category,
      nickname: story.nickname,
      created_at: story.created_at
    }
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Admin Auth Middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.admin_token) {
    token = req.cookies.admin_token;
  }

  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ success: false, message: '관리자 인증이 필요합니다.' });
  }

  // Token expiration check (24 hours)
  const session = activeSessions.get(token);
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, message: '세션이 만료되었습니다. 다시 로그인해주세요.' });
  }

  req.adminSession = session;
  next();
}

// ==========================================
// PUBLIC API
// ==========================================

// 1. Submit a story
app.post('/api/stories', (req, res) => {
  try {
    const { title, category, content, nickname, broadcast_agree } = req.body;
    const ip = hashIp(req);

    // Spam rate limit: 1 submission per 20 seconds per IP
    const now = Date.now();
    const lastTime = ipSubmissionTimers.get(ip) || 0;
    if (now - lastTime < 20000) {
      const waitSec = Math.ceil((20000 - (now - lastTime)) / 1000);
      return res.status(429).json({
        success: false,
        message: `사연이 너무 빠르게 연속 제출되었습니다. ${waitSec}초 후 다시 시도해 주세요.`
      });
    }

    // Validation
    if (!title || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 60) {
      return res.status(400).json({ success: false, message: '사연 제목을 2~60자 사이로 입력해 주세요.' });
    }

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: '올바른 카테고리를 선택해 주세요.' });
    }

    if (!content || typeof content !== 'string' || content.trim().length < 10 || content.trim().length > 3000) {
      return res.status(400).json({ success: false, message: '사연 내용은 10자 이상 3,000자 이하로 작성해 주세요.' });
    }

    // Process Nickname
    let finalNickname = (nickname && typeof nickname === 'string' && nickname.trim().length > 0)
      ? nickname.trim().substring(0, 20)
      : `익명의 짝눈친구 #${Math.floor(1000 + Math.random() * 9000)}`;

    const agreeVal = broadcast_agree === true || broadcast_agree === 'true' || broadcast_agree === 1 ? 1 : 0;

    // Generate unique ticket code: ZZAK-XXXX
    const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    const ticketCode = `ZZAK-${randomHex}`;

    // Insert into DB
    const insertStmt = db.prepare(`
      INSERT INTO stories (ticket_code, title, category, content, nickname, broadcast_agree, status, streamer_memo, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, 'unread', '', ?)
    `);

    insertStmt.run(ticketCode, title.trim(), category, content.trim(), finalNickname, agreeVal, ip);

    // Update IP timer
    ipSubmissionTimers.set(ip, now);

    // Get newly created story
    const getStmt = db.prepare('SELECT * FROM stories WHERE ticket_code = ?');
    const newStory = getStmt.get(ticketCode);

    // Notify Admin SSE clients
    broadcastNewStory(newStory);

    res.status(201).json({
      success: true,
      message: '사연이 성공적으로 접수되었습니다!',
      story: {
        ticket_code: newStory.ticket_code,
        title: newStory.title,
        category: newStory.category,
        nickname: newStory.nickname,
        broadcast_agree: Boolean(newStory.broadcast_agree),
        created_at: newStory.created_at
      }
    });
  } catch (err) {
    console.error('Error submitting story:', err);
    res.status(500).json({ success: false, message: '서버 오류로 인해 사연 접수에 실패했습니다.' });
  }
});

// 2. Public stats
app.get('/api/stats/public', (req, res) => {
  try {
    const totalStmt = db.prepare('SELECT COUNT(*) as total FROM stories');
    const total = totalStmt.get().total;

    const todayStmt = db.prepare("SELECT COUNT(*) as today FROM stories WHERE date(created_at) = date('now')");
    const today = todayStmt.get().today;

    const catStmt = db.prepare('SELECT category, COUNT(*) as count FROM stories GROUP BY category ORDER BY count DESC');
    const categories = catStmt.all();

    res.json({
      success: true,
      total,
      today,
      categories
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '통계 조회 오류' });
  }
});

// 3. Recent preview ticker (only titles & nicknames, no content)
app.get('/api/stories/recent-preview', (req, res) => {
  try {
    const previewStmt = db.prepare(`
      SELECT ticket_code, category, title, nickname, created_at
      FROM stories
      ORDER BY created_at DESC
      LIMIT 6
    `);
    const recent = previewStmt.all();
    res.json({ success: true, recent });
  } catch (err) {
    res.status(500).json({ success: false, message: '최근 사연 조회 오류' });
  }
});

// ==========================================
// ADMIN AUTH API
// ==========================================

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: '관리자 비밀번호가 일치하지 않습니다.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, { createdAt: Date.now() });

  res.cookie('admin_token', token, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  });

  res.json({
    success: true,
    message: '관리자 로그인 성공',
    token
  });
});

// Admin Check Session
app.get('/api/admin/check', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.admin_token) {
    token = req.cookies.admin_token;
  }

  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token);
    if (Date.now() - session.createdAt < 24 * 60 * 60 * 1000) {
      return res.json({ success: true, loggedIn: true });
    }
  }

  res.json({ success: true, loggedIn: false });
});

// Admin Logout
app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies?.admin_token || req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    activeSessions.delete(token);
  }
  res.clearCookie('admin_token');
  res.json({ success: true, message: '로그아웃되었습니다.' });
});

// Admin Change Password
app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (currentPassword !== ADMIN_PASSWORD) {
    return res.status(400).json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: '새 비밀번호는 최소 6자 이상이어야 합니다.' });
  }

  ADMIN_PASSWORD = newPassword;
  res.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' });
});

// ==========================================
// ADMIN MANAGEMENT API
// ==========================================

// Get stories list with filters & search
app.get('/api/admin/stories', requireAdmin, (req, res) => {
  try {
    const { status, category, agree, search, sort = 'newest', page = 1, limit = 15 } = req.query;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (category && category !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }

    if (agree !== undefined && agree !== 'all') {
      conditions.push('broadcast_agree = ?');
      params.push(agree === '1' ? 1 : 0);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(title LIKE ? OR content LIKE ? OR nickname LIKE ? OR ticket_code LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = sort === 'oldest' ? 'ORDER BY created_at ASC' : 'ORDER BY created_at DESC';

    // Count query
    const countSql = `SELECT COUNT(*) as count FROM stories ${whereClause}`;
    const totalCount = db.prepare(countSql).get(...params).count;

    // Data query with pagination
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const dataSql = `SELECT * FROM stories ${whereClause} ${orderBy} LIMIT ? OFFSET ?`;
    const stories = db.prepare(dataSql).all(...params, parseInt(limit), offset);

    res.json({
      success: true,
      stories,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  } catch (err) {
    console.error('Admin get stories error:', err);
    res.status(500).json({ success: false, message: '사연 목록 조회 중 오류 발생' });
  }
});

// Get single story detail
app.get('/api/admin/stories/:id', requireAdmin, (req, res) => {
  try {
    const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: '사연을 찾을 수 없습니다.' });
    }
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: '사연 상세 조회 오류' });
  }
});

// Update story status
app.patch('/api/admin/stories/:id/status', requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['unread', 'checked', 'broadcast_plan', 'broadcast_done', 'hold'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 상태값입니다.' });
    }

    const stmt = db.prepare(`
      UPDATE stories 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    const info = stmt.run(status, req.params.id);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, message: '사연을 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '사연 상태가 변경되었습니다.', status });
  } catch (err) {
    res.status(500).json({ success: false, message: '상태 변경 중 오류' });
  }
});

// Update streamer memo
app.patch('/api/admin/stories/:id/memo', requireAdmin, (req, res) => {
  try {
    const { memo } = req.body;
    const stmt = db.prepare(`
      UPDATE stories 
      SET streamer_memo = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    const info = stmt.run(memo || '', req.params.id);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, message: '사연을 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '메모가 저장되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: '메모 저장 중 오류' });
  }
});

// Delete story
app.delete('/api/admin/stories/:id', requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM stories WHERE id = ?');
    const info = stmt.run(req.params.id);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, message: '삭제할 사연을 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '사연이 안전하게 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: '삭제 중 오류 발생' });
  }
});

// Admin Dashboard Full Stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM stories').get().count;
    const unread = db.prepare("SELECT COUNT(*) as count FROM stories WHERE status = 'unread'").get().count;
    const checked = db.prepare("SELECT COUNT(*) as count FROM stories WHERE status = 'checked'").get().count;
    const broadcastPlan = db.prepare("SELECT COUNT(*) as count FROM stories WHERE status = 'broadcast_plan'").get().count;
    const broadcastDone = db.prepare("SELECT COUNT(*) as count FROM stories WHERE status = 'broadcast_done'").get().count;
    const hold = db.prepare("SELECT COUNT(*) as count FROM stories WHERE status = 'hold'").get().count;
    const agreedCount = db.prepare('SELECT COUNT(*) as count FROM stories WHERE broadcast_agree = 1').get().count;

    const categoryBreakdown = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM stories 
      GROUP BY category 
      ORDER BY count DESC
    `).all();

    const recentDaily = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count 
      FROM stories 
      WHERE created_at >= date('now', '-7 days')
      GROUP BY date(created_at) 
      ORDER BY date ASC
    `).all();

    res.json({
      success: true,
      stats: {
        total,
        unread,
        checked,
        broadcastPlan,
        broadcastDone,
        hold,
        agreedCount,
        disagreedCount: total - agreedCount,
        agreePercentage: total > 0 ? Math.round((agreedCount / total) * 100) : 0,
        categoryBreakdown,
        recentDaily
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '통계 집계 오류' });
  }
});

// Export CSV
app.get('/api/admin/export', requireAdmin, (req, res) => {
  try {
    const stories = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all();

    const header = ['접수번호', '카테고리', '제목', '닉네임', '방송동의', '상태', '스트리머메모', '접수일시', '내용'];
    const rows = stories.map(s => [
      `"${s.ticket_code}"`,
      `"${s.category}"`,
      `"${s.title.replace(/"/g, '""')}"`,
      `"${s.nickname.replace(/"/g, '""')}"`,
      s.broadcast_agree ? '동의' : '미동의',
      `"${s.status}"`,
      `"${(s.streamer_memo || '').replace(/"/g, '""')}"`,
      `"${s.created_at}"`,
      `"${s.content.replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zzaknoon_stories_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('CSV 내보내기 실패');
  }
});

// SSE Endpoint for real-time notification
app.get('/api/admin/stream-events', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial ping
  res.write('data: {"type":"CONNECTED"}\n\n');

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🐤 짝눈의 고민상담소 서버 가동 완료!`);
  console.log(`🌐 서비스 URL: http://localhost:${PORT}`);
  console.log(`🔒 관리자 페이지: http://localhost:${PORT}/admin.html`);
  console.log(`🔑 기본 관리자 비밀번호: ${ADMIN_PASSWORD}`);
  console.log(`===============================================`);
});
