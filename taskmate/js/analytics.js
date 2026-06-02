// analytics.js — 数据面板逻辑

// Chart.js 全局默认
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#6B7280';
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 16;

const COLORS = ['#4F6EF7','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#EC4899'];

let _user = null;
let _period = 'today';
let _dateFrom = null;
let _dateTo = null;
let _taskFilter = 'all';

let _chartLine = null;
let _chartDonut = null;
let _chartBar = null;
let _chartEfficiency = null;

function initAnalytics() {
  seedDemoData();
  _user = Session.require();
  if (!_user) return;

  renderProfile();
  bindPeriodButtons();
  bindStatusTabs();
  refresh();
}

// ── 用户信息卡 ──
function renderProfile() {
  const u = Users.findById(_user.id) || _user;
  const initials = u.name ? u.name.slice(0, 2) : '?';
  document.getElementById('an-avatar').textContent = initials;
  document.getElementById('an-name').textContent = u.name;
  document.getElementById('navbar-avatar').innerHTML = renderAvatar(u.name, 'sm');
  document.getElementById('navbar-name').textContent = u.name;

  // 角色 & 小组信息
  const groups = Groups.forUser(u.id);
  const leaderCount = groups.filter(g => g.members.find(m => m.userId === u.id)?.role === 'leader').length;
  const memberCount = groups.length - leaderCount;
  const roleText = leaderCount > 0 ? `组长 × ${leaderCount}` : '';
  const memberText = memberCount > 0 ? `组员 × ${memberCount}` : '';
  const parts = [roleText, memberText].filter(Boolean);
  document.getElementById('an-meta').textContent =
    `${groups.length} 个小组${parts.length ? '（' + parts.join('、') + '）' : ''}`;

  const skills = u.skills || [];
  document.getElementById('an-skills').innerHTML = skills.length
    ? skills.map(s => `<span class="an-skill-tag">${escHtml(s)}</span>`).join('')
    : '<span class="an-skill-tag">暂未设置技能</span>';
}

// ── 时间范围 ──
function bindPeriodButtons() {
  document.querySelectorAll('.an-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.an-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _period = btn.dataset.period;
      const rangeEl = document.getElementById('an-date-range');
      if (_period === 'custom') {
        rangeEl.classList.add('show');
        const today = fmtDate(new Date());
        document.getElementById('date-from').value = today;
        document.getElementById('date-to').value = today;
      } else {
        rangeEl.classList.remove('show');
        refresh();
      }
    });
  });
}

function applyCustomRange() {
  _dateFrom = document.getElementById('date-from').value;
  _dateTo = document.getElementById('date-to').value;
  if (!_dateFrom || !_dateTo) { showToast('请选择完整日期范围', 'warning'); return; }
  if (_dateFrom > _dateTo) { showToast('开始日期不能晚于结束日期', 'warning'); return; }
  refresh();
}

function getPeriodRange() {
  const now = new Date();
  if (_period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end: start + 86400000 - 1 };
  }
  if (_period === 'week') {
    const day = now.getDay() || 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).getTime();
    return { start, end: start + 7 * 86400000 - 1 };
  }
  if (_period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
    return { start, end };
  }
  if (_period === 'custom' && _dateFrom && _dateTo) {
    return {
      start: new Date(_dateFrom).getTime(),
      end: new Date(_dateTo).getTime() + 86400000 - 1
    };
  }
  // fallback: all time
  return { start: 0, end: Date.now() + 86400000 };
}

// ── 主刷新 ──
function refresh() {
  const range = getPeriodRange();
  const allTasks = Tasks.forUser(_user.id);
  const tasks = filterByRange(allTasks, range);

  animateKPIs(tasks);
  renderSummary(tasks, allTasks);
  renderLineChart(allTasks);
  renderDonutChart(allTasks);
  renderBarChart();
  renderEfficiencyChart(allTasks);
  renderHeatmap(allTasks);
  renderTaskList(allTasks);
}

function filterByRange(tasks, range) {
  return tasks.filter(t => t.createdAt >= range.start && t.createdAt <= range.end);
}

// ── KPI 动态数字 ──
function animateKPIs(tasks) {
  const now = Date.now();
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const doing = tasks.filter(t => t.status === 'doing').length;
  const overdue = tasks.filter(t => t.status !== 'done' && t.deadline && t.deadline < now).length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  countUp('kpi-total', total);
  countUp('kpi-done', done);
  countUp('kpi-doing', doing);
  countUpPct('kpi-rate', rate);
  countUp('kpi-overdue', overdue);
}

function countUp(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / duration, 1);
    el.textContent = Math.round(start + (target - start) * easeOut(p));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function countUpPct(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / duration, 1);
    el.textContent = Math.round(start + (target - start) * easeOut(p)) + '%';
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ── 智能小结 ──
function renderSummary(tasks, allTasks) {
  const now = Date.now();
  const done = tasks.filter(t => t.status === 'done').length;
  const overdue = tasks.filter(t => t.status !== 'done' && t.deadline && t.deadline < now).length;
  const rate = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const upcoming = allTasks.filter(t => t.status !== 'done' && t.deadline && t.deadline - now < 3 * 86400000 && t.deadline > now);

  const items = [];
  if (tasks.length === 0) {
    items.push({ icon: '📭', text: '当前时间段内暂无任务记录' });
  } else {
    if (rate >= 80) items.push({ icon: '🏆', text: `完成率 ${rate}%，表现优秀！继续保持` });
    else if (rate >= 50) items.push({ icon: '📈', text: `完成率 ${rate}%，还有提升空间，加油！` });
    else items.push({ icon: '💪', text: `完成率 ${rate}%，建议优先处理进行中的任务` });

    if (overdue > 0) items.push({ icon: '⚠️', text: `有 ${overdue} 个任务已逾期，需要尽快处理` });
    else items.push({ icon: '✅', text: '当前无逾期任务，时间管理良好' });
  }

  if (upcoming.length > 0) {
    items.push({ icon: '⏰', text: `未来 3 天内有 ${upcoming.length} 个任务即将截止，请注意安排` });
  }

  const groups = Groups.forUser(_user.id);
  const leaderGroups = groups.filter(g => g.members.find(m => m.userId === _user.id)?.role === 'leader');
  if (leaderGroups.length > 0) {
    items.push({ icon: '👥', text: `你是 ${leaderGroups.length} 个小组的组长，记得跟进组员进度` });
  }

  document.getElementById('an-summary-items').innerHTML = items.map(i =>
    `<div class="an-summary-item"><span class="bullet">${i.icon}</span><span>${i.text}</span></div>`
  ).join('');
}

// ── 折线图 ──
function renderLineChart(allTasks) {
  const labels = getLast7Labels();
  const created = getLast7DayCounts(allTasks, 'createdAt');
  const completed = getLast7DayCounts(allTasks.filter(t => t.status === 'done'), 'createdAt');

  const ctx = document.getElementById('chart-line').getContext('2d');
  if (_chartLine) _chartLine.destroy();
  _chartLine = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '新增任务',
          data: created,
          borderColor: '#4F6EF7',
          backgroundColor: 'rgba(79,110,247,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#4F6EF7',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: '完成任务',
          data: completed,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#10B981',
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}：${ctx.parsed.y} 个` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { grid: { display: false } }
      },
      animation: { duration: 600, easing: 'easeOutQuart' }
    }
  });
}

// ── 环形图 ──
function renderDonutChart(allTasks) {
  const user = Users.findById(_user.id) || _user;
  const skills = user.skills || ['其他'];
  const counts = skills.map(() => 0);
  let otherCount = 0;

  allTasks.forEach(t => {
    const group = Groups.findById(t.groupId);
    if (!group) { otherCount++; return; }
    // 用小组课程名匹配技能（简单映射）
    const matched = skills.findIndex(s => (group.course || '').includes(s) || (t.title || '').includes(s));
    if (matched >= 0) counts[matched]++;
    else otherCount++;
  });

  const labels = [...skills];
  const data = [...counts];
  if (otherCount > 0) { labels.push('其他'); data.push(otherCount); }

  const ctx = document.getElementById('chart-donut').getContext('2d');
  if (_chartDonut) _chartDonut.destroy();
  _chartDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: COLORS.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}：${ctx.parsed} 个 (${Math.round(ctx.parsed / (ctx.dataset.data.reduce((a,b)=>a+b,0)||1)*100)}%)` } }
      },
      animation: { animateRotate: true, duration: 700 }
    }
  });
}

// ── 柱状图 ──
function renderBarChart() {
  const groups = Groups.forUser(_user.id);
  const leaderGroups = groups.filter(g => g.members.find(m => m.userId === _user.id)?.role === 'leader');
  const memberGroups = groups.filter(g => g.members.find(m => m.userId === _user.id)?.role !== 'leader');

  const leaderTaskCounts = leaderGroups.map(g => Tasks.forGroup(g.id).length);
  const memberTaskCounts = memberGroups.map(g => Tasks.forUser(_user.id).filter(t => t.groupId === g.id).length);

  const leaderLabels = leaderGroups.map(g => g.name.length > 8 ? g.name.slice(0, 8) + '…' : g.name);
  const memberLabels = memberGroups.map(g => g.name.length > 8 ? g.name.slice(0, 8) + '…' : g.name);

  const allLabels = [...new Set([...leaderLabels, ...memberLabels])];
  if (allLabels.length === 0) allLabels.push('暂无数据');

  const leaderData = allLabels.map((l, i) => leaderLabels[i] !== undefined ? leaderTaskCounts[i] || 0 : 0);
  const memberData = allLabels.map((l, i) => {
    const mi = memberLabels.indexOf(l);
    return mi >= 0 ? memberTaskCounts[mi] : 0;
  });

  const ctx = document.getElementById('chart-bar').getContext('2d');
  if (_chartBar) _chartBar.destroy();
  _chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: '组长（全组任务）',
          data: leaderData,
          backgroundColor: 'rgba(79,110,247,0.75)',
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: '组员（我的任务）',
          data: memberData,
          backgroundColor: 'rgba(16,185,129,0.75)',
          borderRadius: 4,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}：${ctx.parsed.y} 个` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { grid: { display: false } }
      },
      animation: { duration: 600 }
    }
  });
}

// ── 效率曲线 ──
function renderEfficiencyChart(allTasks) {
  const labels = getLast7Labels();
  const onTimeRates = [];
  const avgDays = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = getDayStart(i);
    const dayEnd = dayStart + 86400000;
    const dayTasks = allTasks.filter(t => t.createdAt >= dayStart && t.createdAt < dayEnd);
    const doneTasks = dayTasks.filter(t => t.status === 'done');
    const onTime = doneTasks.filter(t => !t.deadline || t.createdAt <= t.deadline).length;
    onTimeRates.push(doneTasks.length > 0 ? Math.round((onTime / doneTasks.length) * 100) : 0);

    const durations = doneTasks
      .filter(t => t.deadline)
      .map(t => Math.max(0, (t.deadline - t.createdAt) / 86400000));
    avgDays.push(durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 10) / 10 : 0);
  }

  const ctx = document.getElementById('chart-efficiency').getContext('2d');
  if (_chartEfficiency) _chartEfficiency.destroy();
  _chartEfficiency = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '按时完成率 (%)',
          data: onTimeRates,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.06)',
          tension: 0.4,
          fill: true,
          yAxisID: 'y',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: '平均耗时 (天)',
          data: avgDays,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245,158,11,0.06)',
          tension: 0.4,
          fill: false,
          yAxisID: 'y1',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderDash: [4, 3],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 100, position: 'left', grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => v + '%' } },
        y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { callback: v => v + 'd' } },
        x: { grid: { display: false } }
      },
      animation: { duration: 600 }
    }
  });
}

// ── 热力图 ──
function renderHeatmap(allTasks) {
  const grid = document.getElementById('heatmap-grid');
  const tooltip = document.getElementById('heatmap-tooltip');
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  // 统计每天任务数
  const dayMap = {};
  allTasks.forEach(t => {
    const d = fmtDate(new Date(t.createdAt));
    dayMap[d] = (dayMap[d] || 0) + 1;
  });

  // 生成 53 周 × 7 天格子
  const cells = [];
  const startDay = new Date(oneYearAgo);
  // 对齐到周日
  startDay.setDate(startDay.getDate() - startDay.getDay());

  const months = [];
  let lastMonth = -1;

  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDay);
      date.setDate(startDay.getDate() + w * 7 + d);
      const key = fmtDate(date);
      const count = dayMap[key] || 0;
      const level = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
      cells.push({ key, count, level, date });

      if (d === 0 && date.getMonth() !== lastMonth && date >= oneYearAgo) {
        months.push({ week: w, label: (date.getMonth() + 1) + '月' });
        lastMonth = date.getMonth();
      }
    }
  }

  grid.innerHTML = cells.map(c => `
    <div class="heatmap-cell" data-level="${c.level}" data-date="${c.key}" data-count="${c.count}"></div>
  `).join('');

  // 月份标签
  const monthsEl = document.getElementById('heatmap-months');
  monthsEl.innerHTML = months.map(m => `<span>${m.label}</span>`).join('');

  // Tooltip
  grid.querySelectorAll('.heatmap-cell').forEach(cell => {
    cell.addEventListener('mousemove', e => {
      const date = cell.dataset.date;
      const count = cell.dataset.count;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 28) + 'px';
      tooltip.textContent = `${date}：${count} 个任务`;
    });
    cell.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

// ── 任务明细列表 ──
function bindStatusTabs() {
  document.querySelectorAll('.an-status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.an-status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _taskFilter = tab.dataset.status;
      renderTaskList(Tasks.forUser(_user.id));
    });
  });
}

function renderTaskList(allTasks) {
  const now = Date.now();
  let tasks = allTasks;

  if (_taskFilter === 'overdue') {
    tasks = allTasks.filter(t => t.status !== 'done' && t.deadline && t.deadline < now);
  } else if (_taskFilter !== 'all') {
    tasks = allTasks.filter(t => t.status === _taskFilter);
  }

  tasks = [...tasks].sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity));

  const list = document.getElementById('an-task-list');
  if (tasks.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px">暂无相关任务</div>`;
    return;
  }

  list.innerHTML = tasks.map(t => {
    const group = Groups.findById(t.groupId);
    const isOverdue = t.status !== 'done' && t.deadline && t.deadline < now;
    const dotClass = isOverdue ? 'dot-overdue' : `dot-${t.status}`;
    const pct = t.status === 'done' ? 100 : t.status === 'doing' ? 50 : 0;
    const fillColor = t.status === 'done' ? '#10B981' : t.status === 'doing' ? '#F59E0B' : '#D1D5DB';
    const deadlineText = t.deadline ? formatDeadline(t.deadline) : '无截止日期';
    const deadlineClass = isOverdue ? 'overdue' : '';

    return `
      <div class="an-task-item">
        <div class="an-task-status-dot ${dotClass}"></div>
        <div class="an-task-info">
          <div class="an-task-name">${escHtml(t.title)}</div>
          <div class="an-task-group">${escHtml(group?.name || '未知小组')}</div>
        </div>
        <div class="an-task-progress-wrap">
          <div class="an-task-progress-bar">
            <div class="an-task-progress-fill" style="width:${pct}%;background:${fillColor}"></div>
          </div>
          <div class="an-task-pct">${pct}%</div>
        </div>
        <div class="an-task-deadline ${deadlineClass}">${deadlineText}</div>
      </div>`;
  }).join('');
}

// ── 工具函数 ──
function getLast7Labels() {
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return labels;
}

function getLast7DayCounts(tasks, field) {
  const counts = [];
  for (let i = 6; i >= 0; i--) {
    const start = getDayStart(i);
    const end = start + 86400000;
    counts.push(tasks.filter(t => t[field] >= start && t[field] < end).length);
  }
  return counts;
}

function getDayStart(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderAvatar(name, size) {
  const colors = ['#4F6EF7','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4'];
  const color = colors[(name || '').charCodeAt(0) % colors.length] || '#4F6EF7';
  const initials = (name || '?').slice(0, 2);
  return `<div class="avatar avatar-${size}" style="background:${color}">${initials}</div>`;
}

function formatDeadline(ts) {
  const now = Date.now();
  const diff = ts - now;
  const absDiff = Math.abs(diff);
  if (absDiff < 86400000) {
    if (diff < 0) return '已逾期';
    const h = Math.floor(diff / 3600000);
    return h > 0 ? `${h}小时后` : '今天截止';
  }
  const days = Math.floor(absDiff / 86400000);
  if (diff < 0) return `逾期 ${days} 天`;
  if (days <= 7) return `${days} 天后`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isUrgent(deadline) {
  return deadline - Date.now() < 24 * 3600000 && deadline > Date.now();
}
