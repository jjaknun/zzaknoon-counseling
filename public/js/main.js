// ========================================================
// 🐤 짝눈의 고민상담소 - Main Client Logic
// ========================================================

// Mascot cute speech lines
const MASCOT_QUOTES = [
  "어서 오세요! 짝눈의 고민상담소입니다! 편하게 털어놓으세요!",
  "짹! 세상에 쓸데없는 고민은 없어요! 하찮을수록 더 환영!",
  "비밀은 무덤까지 가져갈게요! 100% 익명 보장이니까 안심해요!",
  "오늘 무슨 일 있었어요? 짝눈이 귀는 언제나 활짝 열려있어요!",
  "누가 괴롭혔나요? 짝눈이가 부리로 콕 찔러줄까요?",
  "밤에 라면 먹을까 말까... 이런 고민도 당장 보내보세요!",
  "방송에서 스트리머님이 속 시원하게 같이 훈수 둬줄 거예요!",
  "짝눈이는 짝눈이지만 당신의 고민은 두 눈 똑바로 뜨고 봐요!"
];

let currentQuoteIndex = 0;
let soundEnabled = true;

document.addEventListener('DOMContentLoaded', () => {
  // Update sound toggle icon
  updateSoundIcon();

  // Load public stats and recent ticker
  loadPublicStats();
  loadRecentTicker();

  // Initialize Category Chip State
  setFormCategory('하찮은 고민');
});

// Sound Toggle
function toggleSound() {
  soundEnabled = window.retroSound.toggle();
  updateSoundIcon();
}

function updateSoundIcon() {
  const icon = document.getElementById('soundIcon');
  if (icon) {
    icon.textContent = window.retroSound.enabled ? '🔊' : '🔇';
  }
}

// Interactive Mascot Click
function interactMascot() {
  if (window.retroSound) window.retroSound.playBeep();
  currentQuoteIndex = (currentQuoteIndex + 1) % MASCOT_QUOTES.length;
  const bubble = document.getElementById('mascotBubble');
  if (bubble) {
    bubble.innerHTML = `"${MASCOT_QUOTES[currentQuoteIndex]}"`;
    bubble.classList.remove('animate-bounce');
    void bubble.offsetWidth; // Trigger reflow
    bubble.classList.add('animate-bounce');
  }
}

// Category Selection in Form
function setFormCategory(categoryName) {
  if (window.retroSound) window.retroSound.playSelect();
  const catInput = document.getElementById('categoryInput');
  if (catInput) catInput.value = categoryName;

  // Update chips styling
  const chips = document.querySelectorAll('.category-chip');
  chips.forEach(chip => {
    if (chip.getAttribute('data-category') === categoryName) {
      chip.classList.remove('pixel-btn-cream');
      chip.classList.add('pixel-btn-yellow');
    } else {
      chip.classList.remove('pixel-btn-yellow');
      chip.classList.add('pixel-btn-cream');
    }
  });
}

// Quick Select from Category Card grid
function selectCategoryQuick(categoryName) {
  setFormCategory(categoryName);
  const submitSection = document.getElementById('submit-section');
  if (submitSection) {
    submitSection.scrollIntoView({ behavior: 'smooth' });
  }
  // Focus title input
  setTimeout(() => {
    const titleInput = document.getElementById('titleInput');
    if (titleInput) titleInput.focus();
  }, 400);
}

// Word Count Handlers
function updateTitleCount() {
  const titleInput = document.getElementById('titleInput');
  const countEl = document.getElementById('titleCount');
  if (titleInput && countEl) {
    countEl.textContent = titleInput.value.length;
  }
}

function updateContentCount() {
  const contentInput = document.getElementById('contentInput');
  const countEl = document.getElementById('contentCount');
  if (contentInput && countEl) {
    countEl.textContent = contentInput.value.length;
  }
}

// Load Public Stats
async function loadPublicStats() {
  try {
    const res = await fetch('/api/stats/public');
    const data = await res.json();
    if (data.success) {
      const totalEl = document.getElementById('statTotalCount');
      const todayEl = document.getElementById('statTodayCount');
      if (totalEl) totalEl.textContent = `${data.total} 건`;
      if (todayEl) todayEl.textContent = `${data.today} 건`;
    }
  } catch (err) {
    console.error('Stats load failed:', err);
  }
}

// Load Recent Ticker
async function loadRecentTicker() {
  try {
    const res = await fetch('/api/stories/recent-preview');
    const data = await res.json();
    if (data.success && data.recent.length > 0) {
      const tickerText = document.getElementById('tickerText');
      if (tickerText) {
        const items = data.recent.map(r => `[${r.category}] ${escapeHtml(r.title)} (${escapeHtml(r.nickname)})`);
        tickerText.innerHTML = `💡 최근 접수: ${items.slice(0, 3).join('  |  ')}`;
      }
    }
  } catch (err) {
    console.error('Ticker load failed:', err);
  }
}

// Form Submission Handler
async function handleFormSubmit(e) {
  e.preventDefault();

  const titleInput = document.getElementById('titleInput');
  const categoryInput = document.getElementById('categoryInput');
  const contentInput = document.getElementById('contentInput');
  const nicknameInput = document.getElementById('nicknameInput');
  const broadcastAgree = document.getElementById('broadcastAgree');
  const privacyAgree = document.getElementById('privacyAgree');
  const submitBtn = document.getElementById('submitBtn');

  if (!privacyAgree.checked) {
    alert('개인정보 보호 및 유의사항에 동의해 주세요.');
    return;
  }

  const title = titleInput.value.trim();
  const category = categoryInput.value;
  const content = contentInput.value.trim();
  const nickname = nicknameInput.value.trim();
  const broadcast_agree = broadcastAgree.checked;

  if (title.length < 2) {
    alert('제목을 2글자 이상 입력해 주세요.');
    titleInput.focus();
    return;
  }

  if (content.length < 10) {
    alert('사연 내용을 최소 10글자 이상 정성껏 적어주세요.');
    contentInput.focus();
    return;
  }

  // Disable button to prevent double-submit
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="animate-spin mr-2">⏳</span> 짝눈이에게 전달 중...`;

  try {
    const response = await fetch('/api/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        category,
        content,
        nickname,
        broadcast_agree
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || '접수에 실패했습니다.');
    }

    // Success Sound & Confetti
    if (window.retroSound) window.retroSound.playSuccess();
    triggerConfetti();

    // Fill Receipt
    const story = result.story;
    document.getElementById('receiptTicketCode').textContent = story.ticket_code;
    document.getElementById('receiptCategory').textContent = story.category;
    document.getElementById('receiptNickname').textContent = story.nickname;
    document.getElementById('receiptTitle').textContent = story.title;
    document.getElementById('receiptTime').textContent = new Date().toLocaleString('ko-KR');

    const agreeBadge = document.getElementById('receiptBroadcastAgree');
    if (story.broadcast_agree) {
      agreeBadge.textContent = '방송 소개 동의함 ✔';
      agreeBadge.className = 'pixel-badge bg-emerald-100 text-emerald-800';
    } else {
      agreeBadge.textContent = '방송 소개 미동의 (보관 전용)';
      agreeBadge.className = 'pixel-badge bg-gray-100 text-gray-700';
    }

    // Show Completion View
    document.getElementById('formContainer').classList.add('hidden');
    const successView = document.getElementById('successContainer');
    successView.classList.remove('hidden');
    successView.scrollIntoView({ behavior: 'smooth' });

    // Refresh public stats
    loadPublicStats();
    loadRecentTicker();

  } catch (err) {
    alert(`오류: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i> 짝눈에게 고민 보내기!`;
    if (window.lucide) lucide.createIcons();
  }
}

// Reset form for another story
function writeAnotherStory() {
  if (window.retroSound) window.retroSound.playClick();
  document.getElementById('storyForm').reset();
  setFormCategory('하찮은 고민');
  updateTitleCount();
  updateContentCount();

  document.getElementById('successContainer').classList.add('hidden');
  const formContainer = document.getElementById('formContainer');
  formContainer.classList.remove('hidden');
  formContainer.scrollIntoView({ behavior: 'smooth' });
}

function resetToHome() {
  if (window.retroSound) window.retroSound.playClick();
  document.getElementById('hero').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => {
    writeAnotherStory();
  }, 500);
}

// Confetti Blast Effect
function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FF6B35', '#FFD166', '#FFEFE8', '#2B2523']
    });
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });
    }, 250);
  }
}

// Modal controls: Guide
function openGuideModal() {
  document.getElementById('guideModal').classList.add('active');
}
function closeGuideModal() {
  document.getElementById('guideModal').classList.remove('active');
}

// Modal controls: 360 Viewer
function openViewerModal() {
  document.getElementById('viewerModal').classList.add('active');
}
function closeViewerModal() {
  document.getElementById('viewerModal').classList.remove('active');
}

function changeViewerAngle(angleKey, label) {
  if (window.retroSound) window.retroSound.playClick();
  const imgEl = document.getElementById('viewerImage');
  const labelEl = document.getElementById('viewerLabel');
  if (imgEl) imgEl.src = `assets/images/mascot_${angleKey}.jpg`;
  if (labelEl) labelEl.textContent = label;
}

// Modal controls: Admin Login
function checkOrOpenAdminModal() {
  if (window.retroSound) window.retroSound.playClick();
  // Check if already logged in
  fetch('/api/admin/check')
    .then(r => r.json())
    .then(data => {
      if (data.loggedIn) {
        window.location.href = '/admin.html';
      } else {
        document.getElementById('adminLoginModal').classList.add('active');
        setTimeout(() => {
          document.getElementById('adminPasswordInput').focus();
        }, 100);
      }
    })
    .catch(() => {
      document.getElementById('adminLoginModal').classList.add('active');
    });
}

function closeAdminModal() {
  document.getElementById('adminLoginModal').classList.remove('active');
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const pwdInput = document.getElementById('adminPasswordInput');
  const errEl = document.getElementById('adminLoginError');
  const btn = document.getElementById('adminLoginBtn');

  errEl.classList.add('hidden');
  btn.disabled = true;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwdInput.value })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || '로그인 실패');
    }
    // Store token if needed
    localStorage.setItem('zzaknoon_admin_token', data.token);
    window.location.href = '/admin.html';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    pwdInput.select();
  } finally {
    btn.disabled = false;
  }
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}
