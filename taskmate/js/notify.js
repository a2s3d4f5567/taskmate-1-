// notify.js — 浏览器通知 + 智能提醒

const Notify = {
  _lastNotified: {},

  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  send(title, body, icon = '📋') {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="%234F6EF7"/><text x="16" y="22" text-anchor="middle" font-size="18" fill="white">✓</text></svg>' });
    setTimeout(() => n.close(), 6000);
  },

  _key(type, id) { return `${type}:${id}`; },

  _shouldNotify(key, cooldownMs = 60 * 60 * 1000) {
    const last = this._lastNotified[key] || 0;
    if (Date.now() - last > cooldownMs) {
      this._lastNotified[key] = Date.now();
      return true;
    }
    return false;
  },

  checkAll(currentUserId) {
    const myTasks = Tasks.forUser(currentUserId);
    const now = Date.now();

    myTasks.forEach(task => {
      if (task.status === 'done') return;
      if (!task.deadline) return;

      const diff = task.deadline - now;
      const hours = diff / (1000 * 60 * 60);

      if (diff < 0) {
        const key = this._key('overdue', task.id);
        if (this._shouldNotify(key, 4 * 60 * 60 * 1000)) {
          this.send('任务已逾期！', `"${task.title}" 已超过截止时间，请尽快完成！`);
          showInAppAlert(`⚠️ 任务"${task.title}"已逾期，请尽快处理！`, 'danger');
        }
      } else if (hours <= 3) {
        const key = this._key('3h', task.id);
        if (this._shouldNotify(key, 2 * 60 * 60 * 1000)) {
          this.send('截止时间紧迫！', `"${task.title}" 还有不到3小时截止！`);
          showInAppAlert(`🔴 距"${task.title}"截止不足3小时！`, 'danger');
        }
      } else if (hours <= 24) {
        const key = this._key('24h', task.id);
        if (this._shouldNotify(key, 6 * 60 * 60 * 1000)) {
          this.send('截止日期提醒', `"${task.title}" 还有 ${Math.ceil(hours)} 小时截止`);
        }
      }
    });

    // 落后催促：小组内其他人都完成了但我还没动
    const myGroups = Groups.forUser(currentUserId);
    myGroups.forEach(group => {
      const groupTasks = Tasks.forGroup(group.id);
      const myGroupTasks = groupTasks.filter(t => t.assigneeId === currentUserId && t.status !== 'done');
      const othersDone = groupTasks.filter(t => t.assigneeId !== currentUserId && t.status === 'done').length;
      const othersTotal = groupTasks.filter(t => t.assigneeId !== currentUserId).length;

      if (myGroupTasks.length > 0 && othersTotal > 0 && othersDone === othersTotal) {
        const key = this._key('behind', group.id);
        if (this._shouldNotify(key, 3 * 60 * 60 * 1000)) {
          this.send('小伙伴们都完成了！', `"${group.name}" 的其他成员已全部完成任务，你也加油！`);
          showInAppAlert(`💪 "${group.name}" 的小伙伴们都完成了，你也加油！`, 'warning');
        }
      }
    });
  },

  // 任务状态变更时通知其他组员
  notifyTaskComplete(task, completedByUser, groupMembers) {
    const others = groupMembers.filter(m => m.userId !== completedByUser.id);
    if (others.length === 0) return;
    this.send('组员完成任务', `${completedByUser.name} 已完成"${task.title}"`);
  },

  startPolling(userId) {
    this.checkAll(userId);
    setInterval(() => this.checkAll(userId), 5 * 60 * 1000);
  }
};

// 页面内提示条（不依赖通知权限）
function showInAppAlert(msg, type = 'info') {
  const container = document.getElementById('alert-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `notify-banner`;
  const icons = { danger: '🔴', warning: '⚠️', info: 'ℹ️', success: '✅' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>
    <button onclick="this.parentElement.remove()" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:16px;color:inherit">×</button>`;
  container.prepend(el);
  setTimeout(() => el.remove(), 8000);
}

// Toast 通知（全局）
function showToast(msg, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// 格式化截止时间
function formatDeadline(ts) {
  if (!ts) return '';
  const diff = ts - Date.now();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (diff < 0) return '已逾期';
  if (hours < 1) return `${Math.floor(diff / 60000)} 分钟后`;
  if (hours < 24) return `${hours} 小时后`;
  if (days < 7) return `${days} 天后`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function isUrgent(ts) {
  if (!ts) return false;
  return ts - Date.now() < 24 * 60 * 60 * 1000;
}

// 头像颜色
const AVATAR_COLORS = ['#4F6EF7','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16'];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function avatarInitial(name) { return name ? name.charAt(0) : '?'; }

function renderAvatar(name, size = 'md') {
  const color = avatarColor(name);
  return `<div class="avatar avatar-${size}" style="background:${color}">${avatarInitial(name)}</div>`;
}

// 文件图标
function fileIcon(type) {
  if (!type) return '📄';
  if (type.includes('pdf')) return '📕';
  if (type.includes('word') || type.includes('document')) return '📘';
  if (type.includes('presentation') || type.includes('powerpoint')) return '📊';
  if (type.includes('spreadsheet') || type.includes('excel')) return '📗';
  if (type.includes('image')) return '🖼️';
  if (type.includes('zip') || type.includes('rar') || type.includes('compressed')) return '🗜️';
  if (type.includes('video')) return '🎬';
  if (type.includes('audio')) return '🎵';
  return '📄';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
