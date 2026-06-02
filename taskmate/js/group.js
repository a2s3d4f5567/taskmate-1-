// group.js

var _groupId = null;
var _currentUser = null;
var _isLeader = false;
var _activeTaskId = null;

function initGroupPage() {
  seedDemoData();
  _currentUser = Session.require();
  if (!_currentUser) return;

  var params = new URLSearchParams(location.search);
  _groupId = params.get('id');
  if (!_groupId) { window.location.href = 'dashboard.html'; return; }

  var group = Groups.findById(_groupId);
  if (!group) { showToast('小组不存在', 'error'); setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500); return; }

  var myMember = group.members.find(function(m) { return m.userId === _currentUser.id; });
  if (!myMember) { showToast('你不在这个小组', 'error'); setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500); return; }

  _isLeader = myMember.role === 'leader';

  document.getElementById('navbar-avatar').innerHTML = renderAvatar(_currentUser.name, 'sm');
  document.getElementById('navbar-name').textContent = _currentUser.name;

  Notify.requestPermission().then(function(granted) { if (granted) Notify.startPolling(_currentUser.id); });

  renderGroupHeader(group);
  renderKanban(group);
}

function renderGroupHeader(group) {
  document.title = group.name + ' — TaskMate';
  document.getElementById('group-name').textContent = group.name;
  document.getElementById('group-course').textContent = group.course || '未设置课程';
  document.getElementById('group-member-count').textContent = group.members.length + ' 位成员';

  document.getElementById('invite-code').textContent = group.inviteCode;
  document.getElementById('invite-box').classList.remove('hidden');

  if (_isLeader) document.getElementById('add-task-btn').classList.remove('hidden');

  updateProgress(group);
}

function updateProgress(group) {
  var tasks = Tasks.forGroup(group.id);
  var done = tasks.filter(function(t) { return t.status === 'done'; }).length;
  var total = tasks.length;
  var pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progress-text').textContent = done + ' / ' + total + ' 任务完成';
  var bar = document.getElementById('progress-bar');
  bar.style.width = pct + '%';
  bar.className = 'progress-bar' + (pct === 100 ? ' success' : '');
}

function renderKanban(group) {
  var tasks = Tasks.forGroup(group.id);
  var todo = tasks.filter(function(t) { return t.status === 'todo'; });
  var doing = tasks.filter(function(t) { return t.status === 'doing'; });
  var done = tasks.filter(function(t) { return t.status === 'done'; });

  document.getElementById('count-todo').textContent = todo.length;
  document.getElementById('count-doing').textContent = doing.length;
  document.getElementById('count-done').textContent = done.length;

  document.getElementById('col-todo').innerHTML = renderTaskCards(todo) || emptyCol('还没有任务');
  document.getElementById('col-doing').innerHTML = renderTaskCards(doing) || emptyCol('没有进行中的任务');
  document.getElementById('col-done').innerHTML = renderTaskCards(done) || emptyCol('还没有完成的任务');
}

function renderTaskCards(tasks) {
  if (!tasks.length) return '';
  return tasks.map(function(task) {
    var assignee = Users.findById(task.assigneeId);
    var files = FileMeta.forTask(task.id);
    var urgent = isUrgent(task.deadline);
    var overdue = task.deadline && task.deadline < Date.now() && task.status !== 'done';
    var isMe = task.assigneeId === _currentUser.id;

    return (
      '<div class="task-card ' + (isMe ? 'my-task' : '') + '" onclick="openTaskDrawer(\'' + task.id + '\')" style="' + (isMe ? 'border-left:3px solid var(--primary)' : '') + '">' +
      '<div class="task-card-title">' + escHtml(task.title) + '</div>' +
      '<div class="task-card-meta">' +
      '<div style="display:flex;align-items:center;gap:6px">' +
      (assignee ? renderAvatar(assignee.name, 'sm') : '') +
      '<span style="font-size:12px;color:var(--gray-500)">' + escHtml(assignee ? assignee.name : '未分配') + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
      (files.length > 0 ? '<span class="task-card-files">📎 ' + files.length + '</span>' : '') +
      (task.deadline ? '<span class="task-card-deadline ' + (overdue ? 'urgent' : (urgent ? 'urgent' : '')) + '">' + formatDeadline(task.deadline) + '</span>' : '') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }).join('');
}

function emptyCol(text) {
  return '<div style="text-align:center;padding:24px 12px;color:var(--gray-400);font-size:13px">' + text + '</div>';
}

function openTaskDrawer(taskId) {
  _activeTaskId = taskId;
  var task = Tasks.findById(taskId);
  if (!task) return;

  var assignee = Users.findById(task.assigneeId);
  var isMyTask = task.assigneeId === _currentUser.id;

  document.getElementById('drawer-title').textContent = task.title;
  document.getElementById('drawer-meta').innerHTML =
    (assignee ? '负责人：' + escHtml(assignee.name) : '未分配') +
    (task.deadline ? ' · 截止：' + formatDate(task.deadline) : '');

  var statusLabels = { todo: '待开始', doing: '进行中', done: '已完成' };
  var statusColors = { todo: 'badge-gray', doing: 'badge-yellow', done: 'badge-green' };
  document.getElementById('drawer-status-bar').innerHTML =
    '<span class="badge ' + statusColors[task.status] + '">' + statusLabels[task.status] + '</span>' +
    (task.deadline && task.deadline < Date.now() && task.status !== 'done' ? '<span class="badge badge-red" style="margin-left:6px">已逾期</span>' : '');

  document.getElementById('drawer-desc').textContent = task.desc || '暂无描述';

  renderDrawerFiles(task);

  var footer = document.getElementById('drawer-footer');
  var btns = '';

  var subCount = Submissions.forTask(task.id).length;
  var pendingCount = Comments.pendingForTask(task.id).length;
  btns += '<button type="button" class="btn btn-secondary btn-sm" onclick="window.location.href=\'review.html?taskId=' + task.id + '&groupId=' + _groupId + '\'">' +
    '💬 互评' + (subCount ? ' (' + subCount + '版本)' : '') +
    (pendingCount ? '<span class="badge badge-red" style="margin-left:4px">' + pendingCount + '</span>' : '') +
    '</button>';

  if (isMyTask && task.status !== 'done') {
    if (task.status === 'todo') btns += '<button type="button" class="btn btn-secondary btn-sm" onclick="updateTaskStatus(\'' + task.id + '\',\'doing\')">开始任务</button>';
    btns += '<button type="button" class="btn btn-primary btn-sm" onclick="updateTaskStatus(\'' + task.id + '\',\'done\')">标记完成</button>';
  }
  if (isMyTask && task.status === 'done') {
    btns += '<button type="button" class="btn btn-secondary btn-sm" onclick="updateTaskStatus(\'' + task.id + '\',\'doing\')">撤回完成</button>';
  }
  if (_isLeader) {
    btns += '<button type="button" class="btn btn-danger btn-sm" style="margin-left:auto" onclick="deleteTask(\'' + task.id + '\')">删除任务</button>';
  }
  footer.innerHTML = btns;

  document.getElementById('drawer-overlay').classList.add('active');
  document.getElementById('task-drawer').classList.add('active');
}

function renderDrawerFiles(task) {
  var files = FileMeta.forTask(task.id);
  var isMyTask = task.assigneeId === _currentUser.id;

  var filesHtml = files.length ? files.map(function(f) {
    var isImage = f.type && (f.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name));
    return (
      '<div class="file-item">' +
      '<div class="file-icon">' + fileIcon(f.type) + '</div>' +
      '<div class="file-info">' +
      '<div class="file-name">' + escHtml(f.name) + '</div>' +
      '<div class="file-meta">' + formatFileSize(f.size) + ' · ' + formatDate(f.uploadedAt) + '</div>' +
      '</div>' +
      '<div class="file-actions">' +
      (isImage ? '<button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();window.location.href=\'annotation.html?taskId=' + task.id + '&groupId=' + _groupId + '&fileId=' + f.id + '\'" title="批注此图片">🖍</button>' : '') +
      '<button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();downloadFile(\'' + f.id + '\')" title="下载">⬇</button>' +
      (isMyTask || _isLeader ? '<button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();deleteFile(\'' + f.id + '\')" title="删除">🗑</button>' : '') +
      '</div>' +
      '</div>'
    );
  }).join('') : '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">暂无文件</div>';

  document.getElementById('drawer-files').innerHTML = filesHtml;

  var uploadContainer = document.getElementById('upload-zone-container');
  if (isMyTask || _isLeader) {
    uploadContainer.innerHTML =
      '<div class="upload-zone" id="upload-zone" onclick="document.getElementById(\'file-input\').click()">' +
      '<div class="upload-zone-icon">📤</div>' +
      '<div class="upload-zone-text">点击或拖拽上传文件</div>' +
      '<div class="upload-zone-hint">支持 Word/PPT/PDF/Excel/图片/视频/压缩包，最大 200MB</div>' +
      '</div>' +
      '<input type="file" id="file-input" style="display:none" multiple accept=".doc,.docx,.ppt,.pptx,.pdf,.jpg,.jpeg,.png,.gif,.zip,.rar,.xlsx,.xls,.txt,.mp4,.mov,.avi,.mkv,.webm,.m4v">';

    document.getElementById('file-input').addEventListener('change', function(e) { handleFileUpload(e.target.files, task.id); });

    var zone = document.getElementById('upload-zone');
    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function(e) { e.preventDefault(); zone.classList.remove('dragover'); handleFileUpload(e.dataTransfer.files, task.id); });
  } else {
    uploadContainer.innerHTML = '';
  }
}

async function handleFileUpload(fileList, taskId) {
  var MAX_SIZE = 200 * 1024 * 1024;
  for (var i = 0; i < fileList.length; i++) {
    var file = fileList[i];
    if (file.size > MAX_SIZE) { showToast('文件"' + file.name + '"超过200MB限制', 'error'); continue; }
    try {
      showToast('正在上传"' + file.name + '"...', 'info', 2000);
      var blob = await readFileAsBlob(file);
      await FileMeta.create({
        taskId: taskId,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedBy: _currentUser.id
      }, blob);
      showToast('"' + file.name + '"上传成功', 'success');

      var task = Tasks.findById(taskId);
      var group = Groups.findById(_groupId);
      if (group) Notify.notifyTaskComplete({ title: '上传了文件到"' + (task ? task.title : '') + '"' }, _currentUser, group.members);

      var updatedTask = Tasks.findById(taskId);
      if (updatedTask) renderDrawerFiles(updatedTask);
    } catch (err) {
      showToast('上传失败：' + err.message, 'error');
    }
  }
}

function readFileAsBlob(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) { resolve(new Blob([e.target.result], { type: file.type })); };
    reader.onerror = function() { reject(new Error('读取文件失败')); };
    reader.readAsArrayBuffer(file);
  });
}

async function downloadFile(fileId) {
  var meta = FileMeta.findById(fileId);
  if (!meta) { showToast('文件不存在', 'error'); return; }
  try {
    var blob = await FileDB.get(fileId);
    if (!blob) { showToast('文件数据丢失', 'error'); return; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = meta.name;
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  } catch (err) {
    showToast('下载失败', 'error');
  }
}

async function deleteFile(fileId) {
  if (!confirm('确定删除这个文件吗？')) return;
  await FileMeta.delete(fileId);
  showToast('文件已删除', 'success');
  var task = Tasks.findById(_activeTaskId);
  if (task) renderDrawerFiles(task);
}

var _ratingTaskId = null;
var _ratingData = null;
var _ratingCallbacks = null;

function updateTaskStatus(taskId, newStatus) {
  var task = Tasks.findById(taskId);
  if (!task) return;

  // 标记完成时，先弹评分框
  if (newStatus === 'done') {
    _ratingTaskId = taskId;
    _ratingCallbacks = { newStatus: newStatus };
    openRatingModal(taskId);
    return;
  }

  Tasks.update(taskId, { status: newStatus });
  var group = Groups.findById(_groupId);
  if (group) {
    if (newStatus === 'doing') {
      Notify.notifyTaskComplete(task, _currentUser, group.members);
    }
    showToast('任务状态已更新', 'success');
    closeDrawer();
    renderKanban(group);
    updateProgress(group);
  }
}

// ==================== 评分系统 ====================

async function openRatingModal(taskId) {
  try {
    var task = Tasks.findById(taskId);
    if (!task) { showToast('任务不存在', 'error'); return; }

    var assignee = Users.findById(task.assigneeId);
    if (!assignee) { showToast('负责人不存在', 'error'); return; }

    var nameEl = document.getElementById('rating-assignee-name');
    var bannerEl = document.getElementById('rating-banner');
    var leaderEl = document.getElementById('rating-leader');
    var leaderValEl = document.getElementById('rating-leader-value');
    var aiEl = document.getElementById('rating-ai-display');
    var compEl = document.getElementById('rating-completion-display');
    var errEl = document.getElementById('rating-error');
    var btnEl = document.getElementById('rating-confirm-btn');

    if (!nameEl || !bannerEl) { showToast('评分界面加载失败，请刷新页面', 'error'); return; }

    nameEl.textContent = assignee.name;
    bannerEl.textContent = '正在为任务「' + task.title + '」评分（任务完成后方可提交）';

    if (leaderEl) leaderEl.value = 75;
    if (leaderValEl) leaderValEl.textContent = '75';

    renderMemberRatingList(task);

    if (aiEl) aiEl.textContent = '计算中...';
    if (compEl) compEl.textContent = '计算中...';

    if (errEl) errEl.classList.add('hidden');
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = '提交评分';
    }

    _ratingData = { task: task, assignee: assignee, leaderScore: 75, memberRatings: {}, aiScore: 0, completion: 0 };
    _ratingTaskId = taskId;

    openModal('rating-modal');
  } catch (e) {
    console.error('openRatingModal error:', e);
    showToast('打开评分失败：' + e.message, 'error');
  }

  // 异步计算AI评分和完成度
  setTimeout(async function() {
    try {
      var submissions = Submissions.forTask(taskId);
      var comments = Comments.forTask(taskId);

      // 完成度：基于是否有提交 + 评论处理率
      var hasSub = submissions.length > 0;
      var hasComments = comments.length > 0;
      var resolvedRate = hasComments ? comments.filter(function(c) { return c.status === 'resolved'; }).length / comments.length : 1;
      var completion = 50;
      if (hasSub) completion += 25;
      if (hasComments) completion += Math.round(resolvedRate * 25);
      _ratingData.completion = Math.min(100, completion);
      document.getElementById('rating-completion-display').textContent = _ratingData.completion + ' 分';

      // AI评分
      var aiResult = await evaluateTaskWithAI(task, submissions, comments);
      _ratingData.aiScore = aiResult.score;
      document.getElementById('rating-ai-display').textContent = aiResult.score + ' 分 — ' + aiResult.comment;
    } catch (e) {
      _ratingData.completion = 60;
      _ratingData.aiScore = 70;
      document.getElementById('rating-completion-display').textContent = '60 分';
      document.getElementById('rating-ai-display').textContent = '70 分（AI不可用）';
    }
  }, 200);
}

function renderMemberRatingList(task) {
  var group = Groups.findById(_groupId);
  if (!group) return;

  var otherMembers = group.members.filter(function(m) {
    return m.userId !== task.assigneeId && m.userId !== _currentUser.id;
  });

  var html = '';
  if (otherMembers.length === 0) {
    html = '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">暂无其他组员可评分</div>';
  } else {
    html = otherMembers.map(function(m) {
      var u = Users.findById(m.userId);
      var name = u ? u.name : '未知';
      return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
        '<span style="font-size:13px;min-width:50px;color:var(--gray-700)">' + escHtml(name) + '</span>' +
        '<input type="range" style="flex:1" min="0" max="100" value="75" oninput="this.nextElementSibling.textContent=this.value;_ratingData.memberRatings[\'' + m.userId + '\']=parseInt(this.value)">' +
        '<span style="font-size:14px;font-weight:600;min-width:30px">75</span>' +
        '</div>';
    }).join('');
    _ratingData.memberRatings = {};
    otherMembers.forEach(function(m) { _ratingData.memberRatings[m.userId] = 75; });
  }

  document.getElementById('rating-member-list').innerHTML = html;
}

function submitRating() {
  if (!_ratingData || !_ratingTaskId) return;
  var errorEl = document.getElementById('rating-error');
  errorEl.classList.add('hidden');

  // 收集组长评分
  _ratingData.leaderScore = parseInt(document.getElementById('rating-leader').value) || 75;

  // 计算组员平均分
  var memberScores = [];
  for (var uid in _ratingData.memberRatings) {
    if (_ratingData.memberRatings.hasOwnProperty(uid)) {
      memberScores.push(_ratingData.memberRatings[uid]);
    }
  }
  var memberAvg = memberScores.length > 0 ? Math.round(memberScores.reduce(function(a, b) { return a + b; }, 0) / memberScores.length) : 0;
  _ratingData.memberAvg = memberAvg;

  // 保存评分
  var task = Tasks.findById(_ratingTaskId);
  var rating = Ratings.create({
    taskId: _ratingTaskId,
    groupId: _groupId,
    assigneeId: task.assigneeId,
    leaderScore: _ratingData.leaderScore,
    memberAvg: _ratingData.memberAvg,
    aiScore: _ratingData.aiScore || 0,
    completion: _ratingData.completion || 0,
    ratedBy: _currentUser.id
  });

  // 计算综合得分
  var totalScore = _ratingData.leaderScore * 0.35 + memberAvg * 0.30 + _ratingData.aiScore * 0.20 + _ratingData.completion * 0.15;
  totalScore = Math.round(totalScore);
  var levelInfo = Ratings.levelForUserInGroup(task.assigneeId, _groupId);
  var canLead = Ratings.canBeLeader(task.assigneeId, _groupId);

  // 完成任务
  if (_ratingCallbacks && _ratingCallbacks.newStatus) {
    Tasks.update(_ratingTaskId, { status: _ratingCallbacks.newStatus });
  }

  closeModal('rating-modal');

  var group = Groups.findById(_groupId);
  if (group) {
    Notify.notifyTaskComplete(task, _currentUser, group.members);
  }

  closeDrawer();
  if (group) {
    renderKanban(group);
    updateProgress(group);
  }

  showToast(
    '任务完成！综合评分：' + totalScore + ' 分（' + levelInfo.label + '）' +
    (canLead ? '' : ' ⚠️该成员当前等级为D，无权担任组长'),
    canLead ? 'success' : 'warning'
  );

  _ratingTaskId = null;
  _ratingData = null;
  _ratingCallbacks = null;
}

function deleteTask(taskId) {
  if (!confirm('确定删除这个任务吗？此操作不可撤销。')) return;
  Tasks.delete(taskId);
  closeDrawer();
  var group = Groups.findById(_groupId);
  renderKanban(group);
  updateProgress(group);
  showToast('任务已删除', 'success');
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('active');
  document.getElementById('task-drawer').classList.remove('active');
  _activeTaskId = null;
}

function openTaskModal() {
  var group = Groups.findById(_groupId);
  if (!group) return;

  var select = document.getElementById('task-assignee');
  select.innerHTML = '<option value="">请选择负责人</option>' +
    group.members.map(function(m) {
      var u = Users.findById(m.userId);
      return u ? '<option value="' + u.id + '">' + escHtml(u.name) + (m.role === 'leader' ? '（组长）' : '') + '</option>' : '';
    }).join('');

  var now = new Date();
  now.setDate(now.getDate() + 7);
  document.getElementById('task-deadline').value = now.toISOString().slice(0, 16);

  openModal('task-modal');
}

function handleCreateTask() {
  var title = document.getElementById('task-title').value.trim();
  var desc = document.getElementById('task-desc').value.trim();
  var assigneeId = document.getElementById('task-assignee').value;
  var deadlineStr = document.getElementById('task-deadline').value;

  var titleErr = document.getElementById('task-title-error');
  var assigneeErr = document.getElementById('task-assignee-error');
  titleErr.classList.add('hidden');
  assigneeErr.classList.add('hidden');

  if (!title) { titleErr.textContent = '请输入任务标题'; titleErr.classList.remove('hidden'); return; }
  if (!assigneeId) { assigneeErr.textContent = '请选择负责人'; assigneeErr.classList.remove('hidden'); return; }

  var deadline = deadlineStr ? new Date(deadlineStr).getTime() : null;
  Tasks.create({ groupId: _groupId, title: title, desc: desc, assigneeId: assigneeId, deadline: deadline, createdBy: _currentUser.id });

  closeModal('task-modal');
  document.getElementById('task-title').value = '';
  document.getElementById('task-desc').value = '';
  document.getElementById('task-assignee').value = '';

  var group = Groups.findById(_groupId);
  renderKanban(group);
  updateProgress(group);
  showToast('任务发布成功！', 'success');
}

function openMembersModal() {
  var group = Groups.findById(_groupId);
  if (!group) return;

  var html = group.members.map(function(m) {
    var u = Users.findById(m.userId);
    if (!u) return '';
    var tasks = Tasks.forGroup(_groupId).filter(function(t) { return t.assigneeId === u.id; });
    var done = tasks.filter(function(t) { return t.status === 'done'; }).length;
    return (
      '<div class="member-item">' +
      renderAvatar(u.name, 'md') +
      '<div class="member-info">' +
      '<div class="member-name">' + escHtml(u.name) + ' ' + (u.id === _currentUser.id ? '<span style="color:var(--primary);font-size:12px">（我）</span>' : '') + '</div>' +
      '<div class="member-skills">' + (u.skills ? u.skills.join('、') : '未设置擅长领域') + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
      '<div class="member-role">' +
      (m.role === 'leader' ? '<span class="badge badge-blue">组长</span>' : '<span class="badge badge-gray">成员</span>') +
      '</div>' +
      (function() {
        var info = Ratings.levelForUserInGroup(u.id, _groupId);
        var score = Ratings.totalScoreForUserInGroup(u.id, _groupId);
        if (score > 0) {
          return '<div style="font-size:11px;margin-top:2px;color:var(--' + info.color + ');font-weight:500">' + info.level + '级 · ' + score + '分</div>';
        }
        return '<div style="font-size:11px;margin-top:2px;color:var(--gray-400)">暂无评分</div>';
      }()) +
      '<div style="font-size:12px;color:var(--gray-400);margin-top:4px">' + done + '/' + tasks.length + ' 完成</div>' +
      '</div>' +
      '</div>'
    );
  }).join('');

  document.getElementById('members-list').innerHTML = html || '<div style="color:var(--gray-400);font-size:14px">暂无成员</div>';
  openModal('members-modal');
}

function copyInviteCode() {
  var code = document.getElementById('invite-code').textContent;
  navigator.clipboard.writeText(code).then(function() { showToast('邀请码已复制！', 'success'); }).catch(function() {
    var el = document.createElement('textarea');
    el.value = code;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('邀请码已复制！', 'success');
  });
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});

function escHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}