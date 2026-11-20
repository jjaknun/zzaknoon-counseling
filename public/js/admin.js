// ========================================================
// 🐤 짝눈 소장실 (Admin Management Dashboard) Logic
// ========================================================

let currentStatusFilter = 'all';
let currentPage = 1;
let currentStoryInModal = null;
let sseEventSource = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Check auth first
  const authed = await verifyAdminSession();
  if (!authed) {
    alert('관리자 인증이 필요합니다. 메인 화면에서 로그인해 주세요.');
    window.location.href = '/';
    return;
  }

  // Load stats & stories
  loadAdminStats();
  loadStories();

  // Setup real-time SSE listener
  initRealtimeSSE();
});

// 1. Verify Admin Session
async function verifyAdminSession() {
  try {
    const res = await fetch('/api/admin/check');
    const data = await res.json();
    return data.loggedIn === true;
  } catch (err) {
    return false;
  }
}

// 2. Load Stats Overview
async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (!data.success) return;

    const s = data.stats;
    document.getElementById('statTotal').textContent = `${s.total}건`;
    document.getElementById('statUnread').textContent = `${s.unread}건`;
    document.getElementById('statPlan').textContent = `${s.broadcastPlan}건`;
    document.getElementById('statChecked').textContent = `${s.checked}건`;
    document.getElementById('statDone').textContent = `${s.broadcastDone}건`;
    document.getElementById('statAgreeRate').textContent = `${s.agreePercentage}%`;

    // Category distribution pills
    const pillsContainer = document.getElementById('categoryPillsList');
    if (pillsContainer && s.categoryBreakdown) {
      pillsContainer.innerHTML = s.categoryBreakdown.map(c => `
        <span class="pixel-badge bg-white cursor-pointer hover:bg-yellow-100" onclick="quickFilterCategory('${c.category}')">
          ${c.category} <strong class="text-retroOrange ml-1">${c.count}</strong>
        </span>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// 3. Load Stories with Filter & Pagination
async function loadStories() {
  const listContainer = document.getElementById('storiesListContainer');
  listContainer.innerHTML = `
    <div class="pixel-box p-8 text-center text-gray-500 font-retro">
      <span class="animate-spin inline-block mr-2">⏳</span> 사연 목록을 불러오는 중...
    </div>
  `;

  const search = document.getElementById('searchInput').value.trim();
  const category = document.getElementById('filterCategory').value;
  const agree = document.getElementById('filterAgree').value;
  const sort = document.getElementById('filterSort').value;

  const params = new URLSearchParams({
    status: currentStatusFilter,
    category,
    agree,
    search,
    sort,
    page: currentPage,
    limit: 12
  });

  try {
    const res = await fetch(`/api/admin/stories?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message || '사연 목록 조회 실패');
    }

    document.getElementById('storyTotalText').textContent = data.totalCount;
    document.getElementById('paginationSummary').textContent = `페이지 ${data.currentPage} / ${Math.max(1, data.totalPages)}`;

    renderStoriesList(data.stories);
    renderPagination(data.currentPage, data.totalPages);
  } catch (err) {
    listContainer.innerHTML = `
      <div class="pixel-box p-8 text-center text-red-500 font-retro">
        사연을 불러오지 못했습니다: ${err.message}
      </div>
    `;
  }
}

// 4. Render Stories List Cards
function renderStoriesList(stories) {
  const container = document.getElementById('storiesListContainer');

  if (!stories || stories.length === 0) {
    container.innerHTML = `
      <div class="pixel-box p-12 text-center text-gray-400 bg-white">
        <div class="text-4xl mb-2">🐤</div>
        <p class="font-retro text-base text-gray-600">조건에 맞는 사연이 없습니다.</p>
        <p class="text-xs text-gray-400 mt-1">필터를 초기화하거나 다른 검색어로 검색해 보세요.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = stories.map(s => {
    const statusMeta = getStatusBadgeInfo(s.status);
    const agreeBadge = s.broadcast_agree
      ? `<span class="pixel-badge bg-emerald-100 text-emerald-800 text-[11px]">📺 방송 동의</span>`
      : `<span class="pixel-badge bg-gray-100 text-gray-600 text-[11px]">🔒 방송 미동의</span>`;

    const memoBadge = s.streamer_memo
      ? `<span class="pixel-badge bg-amber-100 text-amber-800 text-[10px]" title="${escapeHtml(s.streamer_memo)}">📝 메모있음</span>`
      : '';

    return `
      <div class="pixel-box p-4 bg-white hover:border-retroOrange transition-colors">
        
        <!-- Header Row -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="pixel-badge ${statusMeta.badgeClass} text-xs">${statusMeta.label}</span>
            <span class="pixel-badge bg-yellow-50 text-retroDark text-xs font-bold">${escapeHtml(s.category)}</span>
            ${agreeBadge}
            ${memoBadge}
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-500 font-mono">
            <span class="font-bold text-gray-600">#${s.ticket_code}</span>
            <span>${formatDate(s.created_at)}</span>
          </div>
        </div>

        <!-- Title & Submitter -->
        <div class="mb-2">
          <h3 class="font-retro text-base sm:text-lg text-retroDark hover:text-retroOrange cursor-pointer flex items-center gap-1.5"
              onclick="openStoryDetailModal(${s.id})">
            ${escapeHtml(s.title)}
          </h3>
          <div class="text-xs text-gray-500 mt-0.5">
            작성자: <strong class="text-gray-700">${escapeHtml(s.nickname)}</strong>
          </div>
        </div>

        <!-- Content Preview -->
        <p class="text-xs sm:text-sm text-gray-600 line-clamp-2 leading-relaxed mb-4 cursor-pointer"
           onclick="openStoryDetailModal(${s.id})">
          ${escapeHtml(s.content)}
        </p>

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
          
          <!-- Status Changer Select -->
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-retro text-gray-400">상태:</span>
            <select class="form-select text-xs py-1 px-2 font-retro"
                    onchange="quickChangeStatus(${s.id}, this.value)">
              <option value="unread" ${s.status === 'unread' ? 'selected' : ''}>미확인</option>
              <option value="checked" ${s.status === 'checked' ? 'selected' : ''}>확인 완료</option>
              <option value="broadcast_plan" ${s.status === 'broadcast_plan' ? 'selected' : ''}>방송 예정 ⭐</option>
              <option value="broadcast_done" ${s.status === 'broadcast_done' ? 'selected' : ''}>방송 완료 🎉</option>
              <option value="hold" ${s.status === 'hold' ? 'selected' : ''}>보류</option>
            </select>
          </div>

          <!-- Broadcast / Detail / Delete Buttons -->
          <div class="flex items-center gap-1.5">
            <!-- 1-Click Broadcast Package Copy Button -->
            <button onclick="copyBroadcastPackageById(${s.id})"
                    class="pixel-btn pixel-btn-orange text-xs py-1 px-2.5"
                    title="방송용 전체 포맷 복사">
              <i data-lucide="clapperboard" class="w-3.5 h-3.5"></i>
              <span>방송용 복사</span>
            </button>

            <!-- Detail Modal Button -->
            <button onclick="openStoryDetailModal(${s.id})"
                    class="pixel-btn pixel-btn-cream text-xs py-1 px-2.5">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              <span>상세</span>
            </button>

            <!-- Delete Button -->
            <button onclick="deleteStory(${s.id})"
                    class="pixel-btn bg-gray-100 hover:bg-red-100 text-red-600 text-xs py-1 px-2"
                    title="사연 삭제">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>

        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// 5. Status Badge Metadata Helper
function getStatusBadgeInfo(status) {
  switch (status) {
    case 'unread':
      return { label: '🔴 미확인 (NEW)', badgeClass: 'admin-badge-unread' };
    case 'checked':
      return { label: '👀 확인 완료', badgeClass: 'admin-badge-checked' };
    case 'broadcast_plan':
      return { label: '⭐ 방송 예정 (PICK)', badgeClass: 'admin-badge-broadcast_plan' };
    case 'broadcast_done':
      return { label: '🎉 방송 완료', badgeClass: 'admin-badge-broadcast_done' };
    case 'hold':
      return { label: '⏸️ 보류', badgeClass: 'admin-badge-hold' };
    default:
      return { label: status, badgeClass: 'bg-gray-400 text-white' };
  }
}

// 6. Quick Status Change
async function quickChangeStatus(storyId, newStatus) {
  try {
    const res = await fetch(`/api/admin/stories/${storyId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    showToast(`사연 상태가 [${getStatusBadgeInfo(newStatus).label}]으로 변경되었습니다.`);
    loadAdminStats();
    loadStories();
  } catch (err) {
    alert(`상태 변경 실패: ${err.message}`);
  }
}

// 7. Open Story Detail Modal
async function openStoryDetailModal(storyId) {
  if (window.retroSound) window.retroSound.playClick();
  try {
    const res = await fetch(`/api/admin/stories/${storyId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const s = data.story;
    currentStoryInModal = s;

    // Fill Modal elements
    document.getElementById('modalTitle').textContent = s.title;
    document.getElementById('modalTicketCode').textContent = s.ticket_code;
    document.getElementById('modalCategoryBadge').textContent = s.category;
    document.getElementById('modalNickname').textContent = s.nickname;
    document.getElementById('modalCreatedAt').textContent = formatDate(s.created_at);
    document.getElementById('modalContent').textContent = s.content;
    document.getElementById('modalStreamerMemo').value = s.streamer_memo || '';
    document.getElementById('modalStatusSelect').value = s.status;

    const statusMeta = getStatusBadgeInfo(s.status);
    const statusBadge = document.getElementById('modalStatusBadge');
    statusBadge.textContent = statusMeta.label;
    statusBadge.className = `pixel-badge text-xs ${statusMeta.badgeClass}`;

    const agreeBadge = document.getElementById('modalAgreeBadge');
    if (s.broadcast_agree) {
      agreeBadge.textContent = '📺 방송 소개 동의함';
      agreeBadge.className = 'pixel-badge text-xs bg-emerald-100 text-emerald-800';
    } else {
      agreeBadge.textContent = '🔒 방송 미동의 (보관 전용)';
      agreeBadge.className = 'pixel-badge text-xs bg-gray-100 text-gray-700';
    }

    // Auto mark 'unread' as 'checked' if first time viewing
    if (s.status === 'unread') {
      quickChangeStatus(s.id, 'checked');
    }

    document.getElementById('storyDetailModal').classList.add('active');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    alert(`상세 정보 로드 실패: ${err.message}`);
  }
}

function closeDetailModal() {
  document.getElementById('storyDetailModal').classList.remove('active');
  currentStoryInModal = null;
}

// Change status from inside detail modal
async function changeModalStatus(newStatus) {
  if (!currentStoryInModal) return;
  await quickChangeStatus(currentStoryInModal.id, newStatus);
  const statusMeta = getStatusBadgeInfo(newStatus);
  const statusBadge = document.getElementById('modalStatusBadge');
  statusBadge.textContent = statusMeta.label;
  statusBadge.className = `pixel-badge text-xs ${statusMeta.badgeClass}`;
}

// Save Memo
async function saveModalMemo() {
  if (!currentStoryInModal) return;
  const memo = document.getElementById('modalStreamerMemo').value.trim();

  try {
    const res = await fetch(`/api/admin/stories/${currentStoryInModal.id}/memo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    showToast('비밀 메모가 저장되었습니다! 💾');
    loadStories();
  } catch (err) {
    alert(`메모 저장 실패: ${err.message}`);
  }
}

// Delete Story with confirmation
async function deleteStory(storyId) {
  if (!confirm('정말 이 사연을 삭제하시겠습니까?\n삭제된 사연은 복구할 수 없습니다.')) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/stories/${storyId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    showToast('사연이 안전하게 삭제되었습니다. 🗑️');
    loadAdminStats();
    loadStories();
  } catch (err) {
    alert(`삭제 실패: ${err.message}`);
  }
}

function deleteCurrentModalStory() {
  if (!currentStoryInModal) return;
  deleteStory(currentStoryInModal.id);
  closeDetailModal();
}

// 8. Streamer Broadcast 1-Click Copy Package
function generateBroadcastText(story) {
  return `[🐤 짝눈의 고민상담소 사연 접수 #${story.ticket_code}]
■ 카테고리: ${story.category}
■ 닉네임: ${story.nickname}
■ 제목: ${story.title}
----------------------------------------
${story.content}
----------------------------------------
(방송 동의: ${story.broadcast_agree ? '동의함' : '미동의'})`;
}

async function copyBroadcastPackageById(storyId) {
  try {
    const res = await fetch(`/api/admin/stories/${storyId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const text = generateBroadcastText(data.story);
    await navigator.clipboard.writeText(text);

    if (window.retroSound) window.retroSound.playSelect();
    showToast(`방송용 전체 사연이 클립보드에 복사되었습니다! 📋`);
  } catch (err) {
    alert('복사 실패: ' + err.message);
  }
}

async function copyModalBroadcastPackage() {
  if (!currentStoryInModal) return;
  const text = generateBroadcastText(currentStoryInModal);
  await navigator.clipboard.writeText(text);
  if (window.retroSound) window.retroSound.playSelect();
  showToast('방송용 사연 패키지가 복사되었습니다! 📋');
}

async function copyModalContentOnly() {
  if (!currentStoryInModal) return;
  await navigator.clipboard.writeText(currentStoryInModal.content);
  if (window.retroSound) window.retroSound.playSelect();
  showToast('사연 본문이 복사되었습니다! 📋');
}

// 9. Status Filter Tabs
function setStatusTab(status) {
  if (window.retroSound) window.retroSound.playClick();
  currentStatusFilter = status;
  currentPage = 1;

  const tabs = document.querySelectorAll('.status-tab-btn');
  tabs.forEach(tab => {
    if (tab.getAttribute('data-status') === status) {
      tab.classList.remove('pixel-btn-cream');
      tab.classList.add('pixel-btn-dark');
    } else {
      tab.classList.remove('pixel-btn-dark');
      tab.classList.add('pixel-btn-cream');
    }
  });

  loadStories();
}

function quickFilterCategory(categoryName) {
  document.getElementById('filterCategory').value = categoryName;
  applyFilters();
}

function applyFilters() {
  currentPage = 1;
  loadStories();
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterCategory').value = 'all';
  document.getElementById('filterAgree').value = 'all';
  document.getElementById('filterSort').value = 'newest';
  setStatusTab('all');
}

// 10. Pagination Renderer
function renderPagination(current, total) {
  const container = document.getElementById('paginationControls');
  if (total <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Prev button
  html += `
    <button onclick="goToPage(${current - 1})" class="pixel-btn pixel-btn-cream text-xs py-1 px-2.5" ${current === 1 ? 'disabled' : ''}>
      ◀ 이전
    </button>
  `;

  // Page Numbers
  for (let i = 1; i <= total; i++) {
    if (i === current) {
      html += `<button class="pixel-btn pixel-btn-orange text-xs py-1 px-3">${i}</button>`;
    } else if (i === 1 || i === total || Math.abs(i - current) <= 2) {
      html += `<button onclick="goToPage(${i})" class="pixel-btn pixel-btn-cream text-xs py-1 px-3">${i}</button>`;
    } else if (Math.abs(i - current) === 3) {
      html += `<span class="px-1 text-gray-400">...</span>`;
    }
  }

  // Next button
  html += `
    <button onclick="goToPage(${current + 1})" class="pixel-btn pixel-btn-cream text-xs py-1 px-2.5" ${current === total ? 'disabled' : ''}>
      다음 ▶
    </button>
  `;

  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  loadStories();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 11. Realtime SSE Listener for New Stories
function initRealtimeSSE() {
  if (!!window.EventSource) {
    sseEventSource = new EventSource('/api/admin/stream-events');

    sseEventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'NEW_STORY') {
          handleIncomingNewStory(payload.data);
        }
      } catch (err) {}
    };

    sseEventSource.onerror = () => {
      // Reconnect automatically handled by browser
    };
  }
}

function handleIncomingNewStory(story) {
  // Play 8-bit notify chime
  if (window.retroSound) window.retroSound.playNotify();

  // Show Toast
  showToast(`🔔 [새 고민 도착!] ${escapeHtml(story.category)} - ${escapeHtml(story.title)}`);

  // Refresh counts and list
  loadAdminStats();
  if (currentPage === 1) {
    loadStories();
  }
}

// 12. Toast Notification
function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'pixel-box-sm bg-white p-3 shadow-pixel-lg border-2 border-retroOrange text-xs text-retroDark animate-fade-in pointer-events-auto flex items-center justify-between gap-3';
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-base">🐤</span>
      <span class="font-retro">${message}</span>
    </div>
    <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-black font-bold">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// 13. CSV Export
function exportCsv() {
  window.location.href = '/api/admin/export';
}

// 14. Password Change Modal
function openChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.add('active');
}
function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.remove('active');
  document.getElementById('currentPasswordInput').value = '';
  document.getElementById('newPasswordInput').value = '';
  document.getElementById('changePwdError').classList.add('hidden');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPasswordInput').value;
  const newPassword = document.getElementById('newPasswordInput').value;
  const errEl = document.getElementById('changePwdError');

  try {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || '변경 실패');
    }

    alert('비밀번호가 성공적으로 변경되었습니다. 다음 로그인부터 적용됩니다.');
    closeChangePasswordModal();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

// 15. Logout
async function handleLogout() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  try {
    await fetch('/api/admin/logout', { method: 'POST' });
  } catch (err) {}
  localStorage.removeItem('zzaknoon_admin_token');
  window.location.href = '/';
}

// Utility: Format Date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
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
