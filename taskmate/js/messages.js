// messages.js — 消息中心页面逻辑

function initMessagesPage() {
  renderUserInfo();
  loadMessages();
}

function renderUserInfo() {
  const user = Session.get();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  const avatar = document.getElementById('navbar-avatar');
  const name = document.getElementById('navbar-name');
  if (avatar) {
    avatar.style.background = user.avatarColor || 'var(--primary)';
    avatar.textContent = (user.name || user.email || '?')[0].toUpperCase();
  }
  if (name) {
    name.textContent = user.name || user.email || '用户';
  }
}

function loadMessages() {
  const user = Session.get();
  if (!user) return;

  const db = DB.get();
  const allMessages = (db.messages || []).filter(m => m.userId === user.id);
  const unreadCount = allMessages.filter(m => !m.read).length;

  // 更新未读 badge
  const badge = document.getElementById('unread-badge');
  if (badge) {
    badge.textContent = unreadCount;
  }

  renderMessageList(allMessages);
}

function renderMessageList(messages, filter = 'all') {
  const list = document.getElementById('msg-list');
  if (!list) return;

  let filtered = messages;
  if (filter === 'unread') {
    filtered = messages.filter(m => !m.read);
  } else if (filter === 'system') {
    filtered = messages.filter(m => m.type === 'system');
  }

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="msg-empty">
        <div class="msg-empty-icon">📭</div>
        <div class="msg-empty-title">暂无消息</div>
        <div class="msg-empty-desc">当有新任务分配、评论回复或系统通知时，消息会显示在这里</div>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(m => `
    <div class="msg-item ${m.read ? '' : 'unread'}" onclick="markAsRead('${m.id}')">
      <div class="msg-avatar">${(m.fromName || '系')[0]}</div>
      <div class="msg-body">
        <div class="msg-title">${m.title || '新消息'}</div>
        <div class="msg-preview">${m.content || ''}</div>
      </div>
      <div class="msg-meta">
        <div class="msg-time">${formatMsgTime(m.time)}</div>
        ${m.read ? '' : '<span class="msg-dot"></span>'}
      </div>
    </div>
  `).join('');
}

function formatMsgTime(time) {
  if (!time) return '';
  const d = new Date(time);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
  return d.toLocaleDateString('zh-CN');
}

function markAsRead(msgId) {
  const db = DB.get();
  const msg = (db.messages || []).find(m => m.id === msgId);
  if (msg && !msg.read) {
    msg.read = true;
    DB.set(db);
    loadMessages();
  }
}

function filterMessages(filter, tabEl) {
  // 切换 tab 样式
  document.querySelectorAll('.msg-tab').forEach(t => t.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');

  const user = Session.get();
  if (!user) return;
  const db = DB.get();
  const allMessages = (db.messages || []).filter(m => m.userId === user.id);
  renderMessageList(allMessages, filter);
}