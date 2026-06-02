// review.js — 作业互评模块逻辑

var _taskId = null;
var _groupId = null;
var _currentUser = null;
var _isLeader = false;
var _isAssignee = false;
var _activeSubId = null;
var _commentFilter = 'all';
var _submitFile = null;

function initReviewPage() {
  seedDemoData();
  _currentUser = Session.require();
  if (!_currentUser) return;

  var params = new URLSearchParams(location.search);
  _taskId = params.get('taskId');
  _groupId = params.get('groupId');

  if (!_taskId || !_groupId) { window.location.href = 'dashboard.html'; return; }

  var task = Tasks.findById(_taskId);
  var group = Groups.findById(_groupId);
  if (!task || !group) { showToast('任务不存在', 'error'); setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500); return; }

  var myMember = group.members.find(function(m) { return m.userId === _currentUser.id; });
  if (!myMember) { showToast('你不在这个小组', 'error'); setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500); return; }

  _isLeader = myMember.role === 'leader';
  _isAssignee = task.assigneeId === _currentUser.id;

  document.getElementById('navbar-avatar').innerHTML = renderAvatar(_currentUser.name, 'sm');
  document.getElementById('navbar-name').textContent = _currentUser.name;
  document.getElementById('back-to-group').href = 'group.html?id=' + _groupId;

  document.title = '互评：' + task.title + ' — TaskMate';
  document.getElementById('review-task-title').textContent = task.title;
  var assignee = Users.findById(task.assigneeId);
  document.getElementById('review-task-meta').textContent =
    '负责人：' + (assignee ? assignee.name : '未分配') + ' · ' + group.name;

  if (!_isAssignee && !_isLeader) {
    document.getElementById('submit-version-btn').classList.add('hidden');
  }
  if (!_isLeader) {
    document.getElementById('set-deadline-btn').classList.add('hidden');
  }

  document.getElementById('submit-file-input').addEventListener('change', function(e) {
    _submitFile = e.target.files[0] || null;
    document.getElementById('submit-file-name').textContent = _submitFile ? _submitFile.name : '点击选择文件';
  });

  renderAll();
}

function renderAll() {
  renderDeadlineBanner();
  renderVersionList();
  renderComments();
  renderPendingSummary();
}

function getDeadlines() {
  return lsGet('deadlines_' + _taskId) || {};
}
function saveDeadlinesData(data) {
  lsSet('deadlines_' + _taskId, data);
}

function renderDeadlineBanner() {
  var dl = getDeadlines();
  var banner = document.getElementById('deadline-banner');
  var now = Date.now();
  var parts = [];

  if (dl.submitDeadline) {
    var diff = dl.submitDeadline - now;
    var label = diff < 0 ? '提交已截止' : '提交截止：' + formatDeadline(dl.submitDeadline);
    parts.push('📝 ' + label);
  }
  if (dl.reviewDeadline) {
    var diff2 = dl.reviewDeadline - now;
    var label2 = diff2 < 0 ? '互评已截止' : '互评截止：' + formatDeadline(dl.reviewDeadline);
    parts.push('💬 ' + label2);
  }

  if (parts.length) {
    banner.className = 'notify-banner';
    banner.textContent = parts.join('　　');
  } else {
    banner.className = 'hidden';
  }
}

function openDeadlineModal() {
  var dl = getDeadlines();
  if (dl.submitDeadline) {
    document.getElementById('submit-deadline-input').value = new Date(dl.submitDeadline).toISOString().slice(0, 16);
  }
  if (dl.reviewDeadline) {
    document.getElementById('review-deadline-input').value = new Date(dl.reviewDeadline).toISOString().slice(0, 16);
  }
  openModal('deadline-modal');
}

function saveDeadlines() {
  var submitVal = document.getElementById('submit-deadline-input').value;
  var reviewVal = document.getElementById('review-deadline-input').value;
  saveDeadlinesData({
    submitDeadline: submitVal ? new Date(submitVal).getTime() : null,
    reviewDeadline: reviewVal ? new Date(reviewVal).getTime() : null
  });
  closeModal('deadline-modal');
  renderDeadlineBanner();
  showToast('截止时间已保存', 'success');
}

function renderVersionList() {
  var versions = Submissions.forTask(_taskId);
  var list = document.getElementById('version-list');
  var countEl = document.getElementById('version-count');
  countEl.textContent = versions.length + ' 个版本';

  if (versions.length === 0) {
    list.innerHTML = '<div class="loading-hint">暂无提交记录</div>';
    document.getElementById('current-version-body').innerHTML =
      '<div class="empty-state" style="padding:24px"><div class="empty-state-icon">📭</div><div class="empty-state-text">还没有提交任何版本</div></div>';
    return;
  }

  list.innerHTML = versions.map(function(v, i) {
    var uploader = Users.findById(v.uploadedBy);
    var isLatest = i === 0;
    var isActive = v.id === _activeSubId;
    var commentCount = Comments.forSubmission(v.id).length;
    return (
      '<div class="version-item ' + (isActive ? 'active' : '') + '" onclick="selectVersion(\'' + v.id + '\')">' +
      '<span class="version-badge ' + (isLatest ? 'latest' : '') + '">V' + v.version + '</span>' +
      '<div class="version-info">' +
      '<div class="version-title">' + revEscHtml(v.title) + '</div>' +
      '<div class="version-meta">' + (uploader ? uploader.name : '?') + ' · ' + formatDate(v.createdAt) + (commentCount ? ' · ' + commentCount + ' 条评论' : '') + '</div>' +
      '</div>' +
      '<div class="version-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();downloadVersion(\'' + v.id + '\')" title="下载">⬇️</button>' +
      '</div>' +
      '</div>'
    );
  }).join('');

  if (!_activeSubId && versions.length) {
    selectVersion(versions[0].id);
  }
}

function selectVersion(subId) {
  _activeSubId = subId;
  renderVersionList();
  renderCurrentVersion();
  renderComments();
}

function renderCurrentVersion() {
  var sub = Submissions.findById(_activeSubId);
  if (!sub) return;

  var uploader = Users.findById(sub.uploadedBy);
  var versions = Submissions.forTask(_taskId);
  var isLatest = versions.length && versions[0].id === sub.id;
  var commentCount = Comments.forSubmission(sub.id).length;
  var pendingCount = Comments.forSubmission(sub.id).filter(function(c) { return c.status === 'pending'; }).length;
  var isImage = sub.fileType && (sub.fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(sub.fileName));

  document.getElementById('current-version-heading').textContent = 'V' + sub.version + ' — ' + sub.title;

  document.getElementById('current-version-body').innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">' +
    '<div style="flex:1">' +
    (sub.desc ? '<div style="font-size:14px;color:var(--gray-600);margin-bottom:10px;line-height:1.6">' + revEscHtml(sub.desc) + '</div>' : '') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
    (isLatest ? '<span class="badge badge-green">最新版本</span>' : '') +
    '<span class="badge badge-gray">V' + sub.version + '</span>' +
    (pendingCount > 0 ? '<span class="badge badge-red">' + pendingCount + ' 待处理</span>' : '') +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="file-item">' +
    '<div class="file-icon">' + fileIcon(sub.fileType) + '</div>' +
    '<div class="file-info">' +
    '<div class="file-name">' + revEscHtml(sub.fileName) + '</div>' +
    '<div class="file-meta">' + formatFileSize(sub.fileSize) + ' · 上传于 ' + formatDate(sub.createdAt) + ' · ' + (uploader ? uploader.name : '?') + '</div>' +
    '</div>' +
    '<div class="file-actions">' +
    (isImage ? '<button type="button" class="btn btn-ghost btn-sm btn-icon" onclick="window.location.href=\'annotation.html?taskId=' + _taskId + '&groupId=' + _groupId + '&submissionId=' + sub.id + '\'" title="批注此图片">🖍️</button>' : '') +
    '<button type="button" class="btn btn-ghost btn-sm btn-icon" onclick="downloadVersion(\'' + sub.id + '\')" title="下载">⬇️</button>' +
    '</div>' +
    '</div>' +
    (versions.length > 1 ? (
      '<div style="margin-top:12px">' +
      '<label class="form-label">与其他版本对比</label>' +
      '<select class="form-input" onchange="openDiff(\'' + sub.id + '\', this.value)" style="max-width:240px">' +
      '<option value="">选择对比版本...</option>' +
      versions.filter(function(v) { return v.id !== sub.id; }).map(function(v) {
        return '<option value="' + v.id + '">V' + v.version + ' — ' + revEscHtml(v.title) + '</option>';
      }).join('') +
      '</select>' +
      '</div>'
    ) : '');
}

async function downloadVersion(subId) {
  var sub = Submissions.findById(subId);
  if (!sub) { showToast('版本不存在', 'error'); return; }
  try {
    var blob = await FileDB.get(subId);
    if (!blob) { showToast('文件数据丢失', 'error'); return; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = sub.fileName;
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  } catch (e) { showToast('下载失败', 'error'); }
}

function openDiff(subIdA, subIdB) {
  if (!subIdB) return;
  var a = Submissions.findById(subIdA);
  var b = Submissions.findById(subIdB);
  if (!a || !b) return;

  var diffCard = document.getElementById('diff-card');
  diffCard.classList.remove('hidden');

  var commentsA = Comments.forSubmission(a.id);
  var commentsB = Comments.forSubmission(b.id);

  document.getElementById('diff-panel').innerHTML =
    '<div class="diff-col">' +
    '<div class="diff-col-header">' +
    '<span class="version-badge">V' + a.version + '</span>' +
    revEscHtml(a.title) +
    '</div>' +
    '<div class="diff-col-body">' +
    '<div class="file-item" style="margin-bottom:10px">' +
    '<div class="file-icon">' + fileIcon(a.fileType) + '</div>' +
    '<div class="file-info">' +
    '<div class="file-name">' + revEscHtml(a.fileName) + '</div>' +
    '<div class="file-meta">' + formatFileSize(a.fileSize) + ' · ' + formatDate(a.createdAt) + '</div>' +
    '</div>' +
    '<button type="button" class="btn btn-ghost btn-sm btn-icon" onclick="downloadVersion(\'' + a.id + '\')">⬇️</button>' +
    '</div>' +
    (a.desc ? '<div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">' + revEscHtml(a.desc) + '</div>' : '') +
    '<div style="font-size:12px;color:var(--gray-500)">' + commentsA.length + ' 条评论，' + commentsA.filter(function(c) { return c.status === 'pending'; }).length + ' 待处理</div>' +
    '</div>' +
    '</div>' +
    '<div class="diff-col">' +
    '<div class="diff-col-header">' +
    '<span class="version-badge">V' + b.version + '</span>' +
    revEscHtml(b.title) +
    '</div>' +
    '<div class="diff-col-body">' +
    '<div class="file-item" style="margin-bottom:10px">' +
    '<div class="file-icon">' + fileIcon(b.fileType) + '</div>' +
    '<div class="file-info">' +
    '<div class="file-name">' + revEscHtml(b.fileName) + '</div>' +
    '<div class="file-meta">' + formatFileSize(b.fileSize) + ' · ' + formatDate(b.createdAt) + '</div>' +
    '</div>' +
    '<button type="button" class="btn btn-ghost btn-sm btn-icon" onclick="downloadVersion(\'' + b.id + '\')">⬇️</button>' +
    '</div>' +
    (b.desc ? '<div style="font-size:13px;color:var(--gray-600);margin-bottom:8px">' + revEscHtml(b.desc) + '</div>' : '') +
    '<div style="font-size:12px;color:var(--gray-500)">' + commentsB.length + ' 条评论，' + commentsB.filter(function(c) { return c.status === 'pending'; }).length + ' 待处理</div>' +
    '</div>' +
    '</div>';

  diffCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeDiff() {
  document.getElementById('diff-card').classList.add('hidden');
}

function openSubmitModal() {
  document.getElementById('submit-title').value = '';
  document.getElementById('submit-desc').value = '';
  document.getElementById('submit-file-name').textContent = '点击选择文件';
  document.getElementById('submit-title-error').classList.add('hidden');
  document.getElementById('submit-file-error').classList.add('hidden');
  _submitFile = null;
  openModal('submit-modal');
}

async function handleSubmitVersion() {
  var title = document.getElementById('submit-title').value.trim();
  var desc = document.getElementById('submit-desc').value.trim();
  var titleErr = document.getElementById('submit-title-error');
  var fileErr = document.getElementById('submit-file-error');
  titleErr.classList.add('hidden');
  fileErr.classList.add('hidden');

  if (!title) { titleErr.textContent = '请填写版本说明'; titleErr.classList.remove('hidden'); return; }
  if (!_submitFile) { fileErr.textContent = '请选择要上传的文件'; fileErr.classList.remove('hidden'); return; }

  var MAX = 200 * 1024 * 1024;
  if (_submitFile.size > MAX) { fileErr.textContent = '文件超过200MB限制'; fileErr.classList.remove('hidden'); return; }

  var btn = document.getElementById('submit-confirm-btn');
  btn.disabled = true;
  btn.textContent = '上传中...';

  try {
    var blob = await readFileAsBlob(_submitFile);
    var sub = await Submissions.create({
      taskId: _taskId,
      groupId: _groupId,
      title: title,
      desc: desc,
      uploadedBy: _currentUser.id,
      fileName: _submitFile.name,
      fileSize: _submitFile.size,
      fileType: _submitFile.type
    }, blob);

    var group = Groups.findById(_groupId);
    var task = Tasks.findById(_taskId);
    Notify.send('新版本提交', _currentUser.name + ' 提交了"' + (task ? task.title : '') + '"的 V' + sub.version);
    showToast('V' + sub.version + ' 提交成功！', 'success');

    closeModal('submit-modal');
    _activeSubId = sub.id;
    renderAll();
  } catch (e) {
    showToast('上传失败：' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '提交版本';
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

function updateCharCount() {
  var len = document.getElementById('comment-text').value.length;
  document.getElementById('char-count').textContent = len;
}

function filterComments(type) {
  _commentFilter = type;
  ['all', 'pending', 'resolved'].forEach(function(t) {
    document.getElementById('filter-' + t + '-btn').classList.toggle('btn-primary', t === type);
    document.getElementById('filter-' + t + '-btn').classList.toggle('btn-ghost', t !== type);
  });
  renderComments();
}

function renderComments() {
  if (!_activeSubId) return;

  var comments = Comments.forSubmission(_activeSubId);
  if (_commentFilter === 'pending') comments = comments.filter(function(c) { return c.status === 'pending'; });
  if (_commentFilter === 'resolved') comments = comments.filter(function(c) { return c.status === 'resolved'; });

  var allComments = Comments.forSubmission(_activeSubId);
  document.getElementById('comment-count').textContent = allComments.length;

  var list = document.getElementById('comment-list');
  if (comments.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:24px">' +
      '<div class="empty-state-icon">💬</div>' +
      '<div class="empty-state-text">' + (_commentFilter === 'all' ? '还没有评论' : '没有' + (_commentFilter === 'pending' ? '待处理' : '已处理') + '的评论') + '</div>' +
      '</div>';
    return;
  }

  list.innerHTML = comments.map(function(c) {
    var author = Users.findById(c.authorId);
    var isPending = c.status === 'pending';
    var canResolve = (_isAssignee || _isLeader) && isPending;
    var canDelete = c.authorId === _currentUser.id || _isLeader;
    var resolver = c.resolvedBy ? Users.findById(c.resolvedBy) : null;

    return (
      '<div class="comment-item ' + (isPending ? '' : 'resolved') + '" id="comment-' + c.id + '">' +
      renderAvatar(author ? author.name : '?', 'sm') +
      '<div class="comment-body">' +
      '<div class="comment-header">' +
      '<span class="comment-author">' + revEscHtml(author ? author.name : '?') + '</span>' +
      '<span class="comment-time">' + formatDate(c.createdAt) + '</span>' +
      (isPending
        ? '<span class="comment-status-pending">⏳ 待处理</span>'
        : '<span class="comment-status-resolved">✓ 已处理' + (resolver ? ' · ' + revEscHtml(resolver.name) : '') + '</span>') +
      '</div>' +
      '<div class="comment-text">' + revEscHtml(c.content) + '</div>' +
      '<div class="comment-footer">' +
      (canResolve ? '<button type="button" class="btn btn-ghost btn-sm" onclick="resolveComment(\'' + c.id + '\')">✓ 标记已处理</button>' : '') +
      (!isPending && canResolve ? '<button type="button" class="btn btn-ghost btn-sm" onclick="reopenComment(\'' + c.id + '\')">↩ 重新打开</button>' : '') +
      (canDelete ? '<button type="button" class="btn btn-ghost btn-sm" onclick="deleteComment(\'' + c.id + '\')">🗑️ 删除</button>' : '') +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }).join('');
}

function submitComment() {
  if (!_activeSubId) { showToast('请先选择一个版本', 'warning'); return; }
  var text = document.getElementById('comment-text').value.trim();
  if (!text) { showToast('评论内容不能为空', 'warning'); return; }

  var task = Tasks.findById(_taskId);
  Comments.create({
    submissionId: _activeSubId,
    taskId: _taskId,
    authorId: _currentUser.id,
    content: text
  });

  if (task && task.assigneeId && task.assigneeId !== _currentUser.id) {
    Notify.send('收到新评论', _currentUser.name + ' 对你的作业提出了建议');
  }

  document.getElementById('comment-text').value = '';
  document.getElementById('char-count').textContent = '0';
  showToast('评论已发布', 'success');
  renderComments();
  renderPendingSummary();
  renderVersionList();
}

function resolveComment(commentId) {
  Comments.update(commentId, { status: 'resolved', resolvedAt: Date.now(), resolvedBy: _currentUser.id });
  showToast('已标记为处理完成', 'success');
  renderComments();
  renderPendingSummary();
  renderVersionList();
  renderCurrentVersion();
}

function reopenComment(commentId) {
  Comments.update(commentId, { status: 'pending', resolvedAt: null, resolvedBy: null });
  showToast('已重新打开', 'success');
  renderComments();
  renderPendingSummary();
}

function deleteComment(commentId) {
  if (!confirm('确定删除这条评论吗？')) return;
  Comments.delete(commentId);
  showToast('评论已删除', 'success');
  renderComments();
  renderPendingSummary();
  renderVersionList();
}

function renderPendingSummary() {
  var allPending = Comments.pendingForTask(_taskId);
  var badge = document.getElementById('pending-count-badge');
  var summary = document.getElementById('pending-summary');

  if (allPending.length === 0) {
    badge.classList.add('hidden');
    summary.innerHTML = '<div class="loading-hint">暂无待处理建议</div>';
    return;
  }

  badge.textContent = allPending.length;
  badge.classList.remove('hidden');

  summary.innerHTML = allPending.slice(0, 5).map(function(c) {
    var author = Users.findById(c.authorId);
    var sub = Submissions.findById(c.submissionId);
    return (
      '<div style="padding:8px 0;border-bottom:1px solid var(--gray-100);cursor:pointer" onclick="selectVersion(\'' + c.submissionId + '\');filterComments(\'pending\')">' +
      '<div style="font-size:13px;font-weight:500;color:var(--gray-800)">' + revEscHtml(c.content.slice(0, 40)) + (c.content.length > 40 ? '...' : '') + '</div>' +
      '<div style="font-size:12px;color:var(--gray-400);margin-top:2px">' + (author ? author.name : '?') + ' · V' + (sub ? sub.version : '?') + '</div>' +
      '</div>'
    );
  }).join('') + (allPending.length > 5 ? '<div style="font-size:12px;color:var(--gray-400);padding-top:6px">还有 ' + (allPending.length - 5) + ' 条...</div>' : '');
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});

function revEscHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}