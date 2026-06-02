// lottery.js — 抽签模块（选组长 + 任务分工）
// 依赖：storage.js (Groups, Tasks, Users, Session), notify.js (showToast, renderAvatar)
// 由 group.js 提供 _groupId, _currentUser, _isLeader, openModal, closeModal, renderKanban, updateProgress

// ── 工具 ──────────────────────────────────────────────────────────────────

function lotteryEscHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 滚动鼓动画：在 nameEl 上快速切换名字，最终停在 winner
function runDrum(nameEl, resultEl, confettiEl, names, winner, onDone) {
  nameEl.classList.add('rolling');
  resultEl.textContent = '';
  confettiEl.classList.remove('show');

  const totalMs = 2200;
  const startInterval = 60;
  const endInterval = 220;
  let elapsed = 0;
  let idx = 0;

  function tick() {
    const progress = elapsed / totalMs;
    const interval = startInterval + (endInterval - startInterval) * Math.pow(progress, 2);
    nameEl.textContent = names[idx % names.length];
    idx++;
    elapsed += interval;
    if (elapsed < totalMs) {
      setTimeout(tick, interval);
    } else {
      nameEl.classList.remove('rolling');
      nameEl.textContent = winner;
      resultEl.textContent = '🎉 抽签完成！';
      confettiEl.classList.add('show');
      setTimeout(() => { confettiEl.classList.remove('show'); onDone(); }, 1800);
    }
  }
  tick();
}

// ── 抽签菜单 ──────────────────────────────────────────────────────────────

function openLotteryMenu() {
  openModal('lottery-menu-modal');
}

// ── 选组长抽签 ────────────────────────────────────────────────────────────

let _leaderParticipants = new Set(); // 参与者 userId

function openLeaderLottery() {
  closeModal('lottery-menu-modal');

  const group = Groups.findById(_groupId);
  if (!group) return;

  // 初始化参与者（全员默认参与）
  _leaderParticipants = new Set(group.members.map(m => m.userId));

  // 渲染步骤1
  _leaderShowStep(1);
  _renderLeaderParticipants(group);

  // 重置按钮
  const startBtn = document.getElementById('leader-start-btn');
  startBtn.textContent = '开始抽签';
  startBtn.disabled = false;
  startBtn.onclick = startLeaderLottery;

  openModal('leader-lottery-modal');
}

function _renderLeaderParticipants(group) {
  const excludeCurrent = document.getElementById('leader-exclude-current').checked;
  const currentLeader = group.members.find(m => m.role === 'leader');

  const container = document.getElementById('leader-participants');
  container.innerHTML = group.members.map(m => {
    const u = Users.findById(m.userId);
    if (!u) return '';
    const isCurrentLeader = currentLeader && m.userId === currentLeader.userId;
    const excluded = excludeCurrent && isCurrentLeader;
    const active = _leaderParticipants.has(m.userId) && !excluded;

    // 显示评分等级
    var levelInfo = Ratings.levelForUserInGroup(u.id, _groupId);
    var canBeLeader = Ratings.canBeLeader(u.id, _groupId);
    var levelBadge = '<span style="font-size:10px;margin-left:3px;color:var(--' + levelInfo.color + ')">[' + levelInfo.level + ']</span>';
    var restrictedTag = !canBeLeader ? ' ⚠️无权' : '';

    return '<span class="lottery-participant-tag ' + (active ? 'active' : '') + ' ' + (excluded ? 'excluded' : '') + ' ' + (!canBeLeader ? 'excluded' : '') + '"' +
      ' data-uid="' + u.id + '"' +
      ' onclick="' + (excluded || !canBeLeader ? '' : 'toggleLeaderParticipant(\'' + u.id + '\')') + '"' +
      ' title="' + (lotteryEscHtml(u.name)) + ' 等级：' + levelInfo.label + ' (' + levelInfo.level + ')' + (!canBeLeader ? ' - D级无权担任组长' : '') + '">' +
      lotteryEscHtml(u.name) + levelBadge +
      (isCurrentLeader ? ' 👑' : '') + restrictedTag +
      '</span>';
  }).join('');

  // 显示评分说明
  var dLevelCount = group.members.filter(function(m) { return !Ratings.canBeLeader(m.userId, _groupId); }).length;
  if (dLevelCount > 0) {
    var hintEl = document.getElementById('leader-rating-hint');
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.id = 'leader-rating-hint';
      hintEl.style.cssText = 'font-size:12px;color:var(--danger);margin-top:6px;';
      container.parentNode.appendChild(hintEl);
    }
    hintEl.textContent = '⚠️ 有 ' + dLevelCount + ' 名成员评级为D（待提升），无权担任组长';
  }
}

function toggleLeaderParticipant(uid) {
  if (_leaderParticipants.has(uid)) {
    if (_leaderParticipants.size <= 2) { showToast('至少需要2位参与者', 'warning'); return; }
    _leaderParticipants.delete(uid);
  } else {
    _leaderParticipants.add(uid);
  }
  const group = Groups.findById(_groupId);
  _renderLeaderParticipants(group);
}

function startLeaderLottery() {
  const group = Groups.findById(_groupId);
  const excludeCurrent = document.getElementById('leader-exclude-current').checked;
  const currentLeader = group.members.find(m => m.role === 'leader');

  let pool = [..._leaderParticipants];
  if (excludeCurrent && currentLeader) {
    pool = pool.filter(uid => uid !== currentLeader.userId);
  }

  if (pool.length < 1) { showToast('没有可参与抽签的成员', 'error'); return; }

  const names = pool.map(uid => Users.findById(uid)?.name || '?');
  const winnerIdx = Math.floor(Math.random() * pool.length);
  const winnerId = pool[winnerIdx];
  const winnerName = names[winnerIdx];

  _leaderShowStep(2);
  document.getElementById('leader-start-btn').disabled = true;

  runDrum(
    document.getElementById('leader-drum-name'),
    document.getElementById('leader-drum-result'),
    document.getElementById('leader-confetti'),
    names,
    winnerName,
    () => _leaderShowResult(group, winnerId, winnerName)
  );
}

function _leaderShowResult(group, winnerId, winnerName) {
  // 更新小组组长
  const updatedMembers = group.members.map(m => ({
    ...m,
    role: m.userId === winnerId ? 'leader' : (m.role === 'leader' ? 'member' : m.role)
  }));
  Groups.update(group.id, { members: updatedMembers });

  // 通知
  Notify.send('抽签结果', `${winnerName} 被抽选为新组长！`);
  showToast(`🎉 ${winnerName} 成为新组长！`, 'success', 4000);

  // 渲染结果卡
  const winner = Users.findById(winnerId);
  document.getElementById('leader-result-card').innerHTML = `
    <div class="lottery-result-title">🏆 抽签结果</div>
    <div style="display:flex;align-items:center;gap:12px;padding:8px 0">
      ${renderAvatar(winnerName, 'lg')}
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--gray-900)">${lotteryEscHtml(winnerName)}</div>
        <div style="font-size:13px;color:var(--success);margin-top:2px">✓ 新任组长</div>
      </div>
    </div>
    ${winner?.skills?.length ? `<div style="font-size:12px;color:var(--gray-500);margin-top:4px">擅长：${lotteryEscHtml(winner.skills.join('、'))}</div>` : ''}
  `;

  // 导出文本
  const now = new Date().toLocaleString('zh-CN');
  document.getElementById('leader-export').textContent =
    `【TaskMate 抽签结果】\n小组：${group.name}\n时间：${now}\n\n组长抽签结果：${winnerName}\n\n参与成员：${[..._leaderParticipants].map(uid => Users.findById(uid)?.name || '?').join('、')}`;

  _leaderShowStep(3);

  // 更新底部按钮
  document.getElementById('leader-lottery-footer').innerHTML = `
    <button type="button" class="btn btn-secondary" onclick="closeModal('leader-lottery-modal');location.reload()">完成</button>
    <button type="button" class="btn btn-lottery" onclick="openLeaderLottery()">重新抽签</button>
  `;
}

function _leaderShowStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`leader-step-${i}`);
    if (el) el.classList.toggle('hidden', i !== n);
  });
}

// ── 任务分工抽签 ──────────────────────────────────────────────────────────

let _taskParticipants = new Set();
let _taskSelected = new Set();     // 选中参与抽签的 taskId
let _taskResults = [];             // [{taskId, taskTitle, userId, userName}]
let _taskQueue = [];               // 待抽任务队列
let _taskQueueIdx = 0;

function openTaskLottery() {
  closeModal('lottery-menu-modal');

  const group = Groups.findById(_groupId);
  if (!group) return;

  // 初始化
  _taskParticipants = new Set(group.members.map(m => m.userId));
  _taskResults = [];
  _taskQueue = [];
  _taskQueueIdx = 0;

  // 候选任务：未分配或待开始的任务
  const tasks = Tasks.forGroup(_groupId).filter(t => t.status === 'todo' || !t.assigneeId);
  _taskSelected = new Set(tasks.map(t => t.id));

  _taskShowStep(1);
  _renderTaskParticipants(group);
  _renderTaskLotteryList(tasks);

  const startBtn = document.getElementById('task-start-btn');
  startBtn.textContent = '开始抽签';
  startBtn.disabled = false;
  startBtn.onclick = startTaskLottery;

  openModal('task-lottery-modal');
}

function _renderTaskParticipants(group) {
  const container = document.getElementById('task-participants');
  container.innerHTML = group.members.map(m => {
    const u = Users.findById(m.userId);
    if (!u) return '';
    const active = _taskParticipants.has(m.userId);
    return `<span class="lottery-participant-tag ${active ? 'active' : ''}"
      onclick="toggleTaskParticipant('${u.id}')">
      ${lotteryEscHtml(u.name)}
    </span>`;
  }).join('');
}

function toggleTaskParticipant(uid) {
  if (_taskParticipants.has(uid)) {
    if (_taskParticipants.size <= 1) { showToast('至少需要1位参与者', 'warning'); return; }
    _taskParticipants.delete(uid);
  } else {
    _taskParticipants.add(uid);
  }
  const group = Groups.findById(_groupId);
  _renderTaskParticipants(group);
}

function _renderTaskLotteryList(tasks) {
  const container = document.getElementById('task-lottery-list');
  if (tasks.length === 0) {
    container.innerHTML = '<div class="loading-hint">没有可参与抽签的任务（需要状态为"待开始"的任务）</div>';
    return;
  }
  container.innerHTML = tasks.map(t => `
    <div class="lottery-task-item" id="lottery-task-item-${t.id}">
      <label class="checkbox-label" style="flex:1;cursor:pointer">
        <input type="checkbox" ${_taskSelected.has(t.id) ? 'checked' : ''}
          onchange="toggleTaskSelected('${t.id}')">
        <span class="lottery-task-title">${lotteryEscHtml(t.title)}</span>
      </label>
    </div>
  `).join('');
}

function toggleTaskSelected(taskId) {
  if (_taskSelected.has(taskId)) {
    _taskSelected.delete(taskId);
  } else {
    _taskSelected.add(taskId);
  }
}

function startTaskLottery() {
  const errEl = document.getElementById('task-lottery-error');
  errEl.classList.add('hidden');

  if (_taskParticipants.size === 0) {
    errEl.textContent = '请至少选择1位参与者';
    errEl.classList.remove('hidden');
    return;
  }
  if (_taskSelected.size === 0) {
    errEl.textContent = '请至少选择1个任务参与抽签';
    errEl.classList.remove('hidden');
    return;
  }

  // 构建抽签队列：打乱任务顺序
  _taskQueue = shuffle([..._taskSelected]);
  _taskQueueIdx = 0;
  _taskResults = [];

  // 渲染步骤进度点
  const dots = document.getElementById('task-step-dots');
  dots.innerHTML = _taskQueue.map((_, i) =>
    `<div class="lottery-step" id="task-dot-${i}"></div>`
  ).join('');

  // 初始化进度列表
  const progressList = document.getElementById('task-progress-list');
  progressList.innerHTML = _taskQueue.map(tid => {
    const t = Tasks.findById(tid);
    return `<div class="lottery-task-item" id="task-progress-${tid}">
      <span class="lottery-task-title">${lotteryEscHtml(t?.title || '')}</span>
      <span class="lottery-task-assignee" id="task-assignee-${tid}">待抽签</span>
    </div>`;
  }).join('');

  document.getElementById('task-start-btn').disabled = true;
  _taskShowStep(2);
  _runNextTaskDraw();
}

function _runNextTaskDraw() {
  if (_taskQueueIdx >= _taskQueue.length) {
    _taskShowFinalResult();
    return;
  }

  const taskId = _taskQueue[_taskQueueIdx];
  const task = Tasks.findById(taskId);
  const participants = [..._taskParticipants];
  const names = participants.map(uid => Users.findById(uid)?.name || '?');

  // 更新步骤点
  document.getElementById(`task-dot-${_taskQueueIdx}`)?.classList.add('active');

  // 更新鼓标题
  document.getElementById('task-drum-label').textContent =
    `正在为「${task?.title || ''}」抽取负责人`;
  document.getElementById('task-drum-name').textContent = '—';
  document.getElementById('task-drum-result').textContent = '';
  document.getElementById('task-confetti').classList.remove('show');

  // 随机选一个
  const winnerIdx = Math.floor(Math.random() * participants.length);
  const winnerId = participants[winnerIdx];
  const winnerName = names[winnerIdx];

  runDrum(
    document.getElementById('task-drum-name'),
    document.getElementById('task-drum-result'),
    document.getElementById('task-confetti'),
    names,
    winnerName,
    () => {
      // 记录结果
      _taskResults.push({ taskId, taskTitle: task?.title || '', userId: winnerId, userName: winnerName });

      // 更新进度列表
      const assigneeEl = document.getElementById(`task-assignee-${taskId}`);
      if (assigneeEl) assigneeEl.textContent = winnerName;
      const itemEl = document.getElementById(`task-progress-${taskId}`);
      if (itemEl) itemEl.classList.add('assigned');

      // 标记步骤点完成
      document.getElementById(`task-dot-${_taskQueueIdx}`)?.classList.replace('active', 'done');

      _taskQueueIdx++;
      // 短暂停顿后继续下一个
      setTimeout(_runNextTaskDraw, 600);
    }
  );
}

function _taskShowFinalResult() {
  // 将结果写入任务
  _taskResults.forEach(r => {
    Tasks.update(r.taskId, { assigneeId: r.userId, status: 'todo' });
  });

  // 通知
  Notify.send('抽签分工完成', `${_taskResults.length} 个任务已完成随机分配`);
  showToast(`🎉 ${_taskResults.length} 个任务分工完成！`, 'success', 4000);

  // 渲染结果卡
  const group = Groups.findById(_groupId);
  const resultCard = document.getElementById('task-result-card');
  resultCard.innerHTML = `
    <div class="lottery-result-title">🏆 分工结果</div>
    ${_taskResults.map(r => `
      <div class="lottery-result-row">
        ${renderAvatar(r.userName, 'sm')}
        <span class="lottery-result-name">${lotteryEscHtml(r.userName)}</span>
        <span class="lottery-result-task">→ ${lotteryEscHtml(r.taskTitle)}</span>
      </div>`).join('')}
  `;

  // 导出文本
  const now = new Date().toLocaleString('zh-CN');
  const lines = _taskResults.map(r => `  ${r.userName} → ${r.taskTitle}`).join('\n');
  document.getElementById('task-export').textContent =
    `【TaskMate 抽签分工结果】\n小组：${group?.name || ''}\n时间：${now}\n\n${lines}`;

  _taskShowStep(3);

  // 更新底部按钮
  document.getElementById('task-lottery-footer').innerHTML = `
    <button type="button" class="btn btn-secondary" onclick="_applyTaskLotteryAndClose()">应用并关闭</button>
    <button type="button" class="btn btn-lottery" onclick="openTaskLottery()">重新抽签</button>
  `;
}

function _applyTaskLotteryAndClose() {
  closeModal('task-lottery-modal');
  // 刷新看板
  const group = Groups.findById(_groupId);
  if (group) {
    renderKanban(group);
    updateProgress(group);
  }
}

function _taskShowStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`task-step-${i}`);
    if (el) el.classList.toggle('hidden', i !== n);
  });
}
