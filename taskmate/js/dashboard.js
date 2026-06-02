// dashboard.js

var _pickerClassId = null;
var _pickerSelected = new Set();
var _currentClassId = null;

function initDashboard() {
  seedDemoData();
  var user = Session.require();
  if (!user) return;

  document.getElementById('navbar-avatar').innerHTML = renderAvatar(user.name, 'sm');
  document.getElementById('navbar-name').textContent = user.name;
  document.getElementById('welcome-text').textContent = '你好，' + user.name + ' 👋';
  updateWelcomeBanner();

  Notify.requestPermission().then(function(granted) {
    if (granted) Notify.startPolling(user.id);
  });

  initUserMenu();
  renderDashboard(user);
}

function updateWelcomeBanner() {
  var h2 = document.querySelector('.welcome-banner-left h2');
  if (!h2) return;
  var hour = new Date().getHours();
  if (hour < 6) h2.textContent = '🌙 夜深了，请注意休息！';
  else if (hour < 12) h2.textContent = '👋 早上好！今天有什么需要协作的任务？';
  else if (hour < 14) h2.textContent = '☀️ 中午好！别忘了吃午饭哦~';
  else if (hour < 18) h2.textContent = '☕ 下午好！今天进度如何了？';
  else if (hour < 22) h2.textContent = '🌇 傍晚好！记得复盘今日工作';
  else h2.textContent = '🌙 夜深了，请注意休息！';
}

function renderDashboard(user) {
  renderClasses(user);
  renderGroups(user);
  renderUpcoming(user);
  renderStats(user);
  renderActivityFeed(user);
}

function renderClasses(user) {
  var classes = Classes.forUser(user.id);
  document.getElementById('class-count').textContent = classes.length + ' 个';
  var list = document.getElementById('classes-list');
  if (classes.length === 0) {
    list.innerHTML = '<div style="font-size:13px;color:var(--gray-400);padding:8px 0">还没有加入任何班级群，点击右侧"创建班级"或顶部"加入班级群"</div>';
    return;
  }
  list.innerHTML = classes.map(function(cls) {
    var myMember = cls.members.find(function(m) { return m.userId === user.id; });
    var isAdmin = myMember && myMember.role === 'admin';
    var announcements = Announcements.forClass(cls.id);
    var unreadAnn = announcements.filter(function(a) { return !a.read; }).length;
    var docLinks = DocLinks.forClass(cls.id);
    return '<div class="class-card">' +
      '<div class="class-card-header">' +
        '<div>' +
          '<div class="class-card-name">' + escHtml(cls.name) + '</div>' +
          '<div class="class-card-meta">' + escHtml(cls.school || '') + (cls.school ? ' · ' : '') + cls.members.length + ' 位成员</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          (isAdmin ? '<span class="badge badge-blue">管理员</span>' : '<span class="badge badge-gray">成员</span>') +
          '<button type="button" class="btn btn-ghost btn-sm" onclick="openClassDetail(\'' + cls.id + '\')">查看成员</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' +
        cls.members.slice(0, 8).map(function(m) {
          var u = Users.findById(m.userId);
          return u ? renderAvatar(u.name, 'sm') : '';
        }).join('') +
        (cls.members.length > 8 ? '<div class="avatar avatar-sm" style="background:var(--gray-300);color:var(--gray-600)">+' + (cls.members.length - 8) + '</div>' : '') +
      '</div>' +
      '<div class="class-card-actions">' +
        '<button type="button" class="btn ' + (isAdmin ? 'btn-secondary' : 'btn-ghost') + ' btn-sm" onclick="event.stopPropagation();openAnnouncementModal(\'' + cls.id + '\')">📢 班级公告' + (unreadAnn > 0 ? ' <span class="badge badge-red">' + unreadAnn + '</span>' : '') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openClassDashboard(\'' + cls.id + '\')">📊 班级数据看板</button>' +
      '</div>' +
      (docLinks.length > 0 ? '<div class="class-card-docs">' +
        '<div class="class-docs-label">📂 共享文档</div>' +
        '<div class="class-docs-list">' + docLinks.slice(0, 4).map(function(d) {
          return '<a class="class-doc-link" href="' + escHtml(d.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="' + escHtml(d.title) + '">' +
            (d.icon || '📄') + ' ' + escHtml(d.title) +
          '</a>';
        }).join('') +
        (docLinks.length > 4 ? '<span class="class-doc-more">+' + (docLinks.length - 4) + ' 更多</span>' : '') +
        '</div>' +
        (isAdmin ? '<button type="button" class="btn btn-ghost btn-sm class-doc-add-btn" onclick="event.stopPropagation();openDocLinkModal(\'' + cls.id + '\')">＋ 添加文档</button>' : '') +
      '</div>' : '<div class="class-card-docs class-card-docs-empty">' +
        '<span style="font-size:12px;color:var(--gray-400)">暂无共享文档</span>' +
        (isAdmin ? '<button type="button" class="btn btn-ghost btn-sm class-doc-add-btn" onclick="event.stopPropagation();openDocLinkModal(\'' + cls.id + '\')">＋ 添加文档</button>' : '') +
      '</div>') +
    '</div>';
  }).join('');
}

// ── 班级数据看板 ──
function openClassDashboard(classId) {
  var cls = Classes.findById(classId);
  if (!cls) return;
  _currentClassId = classId;
  document.getElementById('cd-title').textContent = cls.name + ' · 数据看板';
  var classGroups = Groups.getAll().filter(function(g) { return g.classId === classId; });
  var allTasks = [];
  classGroups.forEach(function(g) {
    Tasks.forGroup(g.id).forEach(function(t) { allTasks.push(t); });
  });
  var totalTasks = allTasks.length;
  var doneTasks = allTasks.filter(function(t) { return t.status === 'done'; }).length;
  var doingTasks = allTasks.filter(function(t) { return t.status === 'doing'; }).length;
  var todoTasks = allTasks.filter(function(t) { return t.status === 'todo'; }).length;
  var overdueTasks = allTasks.filter(function(t) { return t.status !== 'done' && t.deadline && t.deadline < Date.now(); }).length;
  var overallProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  document.getElementById('cd-total-tasks').textContent = totalTasks;
  document.getElementById('cd-done-tasks').textContent = doneTasks;
  document.getElementById('cd-doing-tasks').textContent = doingTasks;
  document.getElementById('cd-overdue-tasks').textContent = overdueTasks;
  document.getElementById('cd-progress').textContent = overallProgress + '%';
  document.getElementById('cd-progress-bar').style.width = overallProgress + '%';
  var groupRows = '';
  classGroups.forEach(function(g) {
    var gt = Tasks.forGroup(g.id);
    var gDone = gt.filter(function(t) { return t.status === 'done'; }).length;
    var gProgress = gt.length > 0 ? Math.round((gDone / gt.length) * 100) : 0;
    groupRows += '<tr><td>' + escHtml(g.name) + '</td><td>' + gt.length + '</td><td>' + gDone + '</td><td><div class="progress progress-sm" style="width:120px"><div class="progress-bar" style="width:' + gProgress + '%"></div></div></td><td><strong>' + gProgress + '%</strong></td></tr>';
  });
  if (!groupRows) groupRows = '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:20px">该班级暂无小组</td></tr>';
  document.getElementById('cd-group-table').innerHTML = groupRows;
  openModal('class-dashboard-modal');
}

// ── 班级公告 ──
function openAnnouncementModal(classId) {
  _currentClassId = classId;
  var user = Session.get();
  var cls = Classes.findById(classId);
  if (!cls) return;
  var myMember = cls.members.find(function(m) { return m.userId === user.id; });
  var isAdmin = myMember && myMember.role === 'admin';
  document.getElementById('ann-title').textContent = cls.name + ' · 班级公告';
  var announceInput = document.getElementById('announce-input-section');
  if (isAdmin) { announceInput.style.display = 'block'; } else { announceInput.style.display = 'none'; }
  renderAnnouncements(classId);
  openModal('announcement-modal');
}

function renderAnnouncements(classId) {
  var announcements = Announcements.forClass(classId);
  var list = document.getElementById('announce-list');
  if (announcements.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)"><div style="font-size:40px;margin-bottom:8px">📭</div>暂无班级公告</div>';
    return;
  }
  list.innerHTML = announcements.map(function(a) {
    var author = Users.findById(a.authorId);
    var authorName = author ? author.name : '未知';
    return '<div class="announce-item">' +
      '<div class="announce-item-header">' +
        '<span class="announce-author">📢 ' + escHtml(authorName) + '</span>' +
        '<span class="announce-time">' + formatMsgTime(a.createdAt) + '</span>' +
      '</div>' +
      '<div class="announce-item-title">' + escHtml(a.title) + '</div>' +
      '<div class="announce-item-body">' + escHtml(a.content) + '</div>' +
    '</div>';
  }).join('');
}

function handlePostAnnouncement() {
  var user = Session.get();
  var title = document.getElementById('announce-title-input').value.trim();
  var content = document.getElementById('announce-content-input').value.trim();
  var errEl = document.getElementById('announce-error');
  errEl.classList.add('hidden');
  if (!title) { errEl.textContent = '请输入公告标题'; errEl.classList.remove('hidden'); return; }
  if (!content) { errEl.textContent = '请输入公告内容'; errEl.classList.remove('hidden'); return; }
  Announcements.create({
    classId: _currentClassId,
    authorId: user.id,
    title: title,
    content: content
  });
  document.getElementById('announce-title-input').value = '';
  document.getElementById('announce-content-input').value = '';
  showToast('班级公告发布成功！', 'success');
  renderAnnouncements(_currentClassId);
  renderDashboard(user);
}

// ── 共享文档 ──
function openDocLinkModal(classId) {
  _currentClassId = classId;
  document.getElementById('doc-link-title').value = '';
  document.getElementById('doc-link-url').value = '';
  document.getElementById('doc-link-error').classList.add('hidden');
  var list = document.getElementById('doc-link-list');
  var links = DocLinks.forClass(classId);
  if (links.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);font-size:13px">暂无共享文档</div>';
  } else {
    list.innerHTML = links.map(function(d) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gray-100)">' +
        '<a href="' + escHtml(d.url) + '" target="_blank" rel="noopener" style="font-size:13px;color:var(--primary);text-decoration:none">' + (d.icon || '📄') + ' ' + escHtml(d.title) + '</a>' +
        '<button type="button" class="btn btn-ghost btn-sm btn-icon" onclick="handleDeleteDocLink(\'' + d.id + '\')" title="删除">🗑️</button>' +
      '</div>';
    }).join('');
  }
  openModal('doc-link-modal');
}

function handleAddDocLink() {
  var user = Session.get();
  var title = document.getElementById('doc-link-title').value.trim();
  var url = document.getElementById('doc-link-url').value.trim();
  var errEl = document.getElementById('doc-link-error');
  errEl.classList.add('hidden');
  if (!title) { errEl.textContent = '请输入文档名称'; errEl.classList.remove('hidden'); return; }
  if (!url) { errEl.textContent = '请输入文档链接'; errEl.classList.remove('hidden'); return; }
  if (!/^https?:\/\//i.test(url)) { errEl.textContent = '请输入有效的链接地址（以 http:// 或 https:// 开头）'; errEl.classList.remove('hidden'); return; }
  DocLinks.create({ classId: _currentClassId, title: title, url: url, icon: '📄' });
  showToast('共享文档添加成功！', 'success');
  openDocLinkModal(_currentClassId);
  renderDashboard(user);
}

function handleDeleteDocLink(docId) {
  DocLinks.delete(docId);
  showToast('共享文档已删除', 'info');
  openDocLinkModal(_currentClassId);
  renderDashboard(Session.get());
}

function openClassDetail(classId) {
  _currentClassId = classId;
  var cls = Classes.findById(classId);
  if (!cls) return;
  document.getElementById('class-detail-title').textContent = cls.name;
  document.getElementById('class-detail-code').textContent = cls.inviteCode;
  document.getElementById('class-member-count').textContent = cls.members.length + ' 人';
  var user = Session.get();
  document.getElementById('class-members-list').innerHTML = cls.members.map(function(m) {
    var u = Users.findById(m.userId);
    if (!u) return '';
    return '<div class="member-item">' +
      renderAvatar(u.name, 'md') +
      '<div class="member-info">' +
        '<div class="member-name">' + escHtml(u.name) + (u.id === user.id ? ' <span style="color:var(--primary);font-size:12px">（我）</span>' : '') + '</div>' +
        '<div class="member-skills">' + (u.skills && u.skills.length ? u.skills.join('、') : '未设置擅长领域') + '</div>' +
      '</div>' +
      '<div>' + (m.role === 'admin' ? '<span class="badge badge-blue">管理员</span>' : '<span class="badge badge-gray">成员</span>') + '</div>' +
    '</div>';
  }).join('');
  openModal('class-detail-modal');
}

function copyClassCode() {
  var code = document.getElementById('class-detail-code').textContent;
  navigator.clipboard.writeText(code).then(function() { showToast('班级码已复制！', 'success'); }).catch(function() {
    var el = document.createElement('textarea'); el.value = code; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); showToast('班级码已复制！', 'success');
  });
}

function openCreateClassModal() { openModal('create-class-modal'); }
function handleCreateClass() {
  var user = Session.get();
  var name = document.getElementById('class-name').value.trim();
  var school = document.getElementById('class-school').value.trim();
  var errEl = document.getElementById('class-name-error');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = '请输入班级名称'; errEl.classList.remove('hidden'); return; }
  var cls = Classes.create({ name: name, school: school, creatorId: user.id });
  Classes.addMember(cls.id, user.id, 'admin');
  closeModal('create-class-modal');
  document.getElementById('class-name').value = '';
  document.getElementById('class-school').value = '';
  showToast('班级群"' + name + '"创建成功！班级码：' + cls.inviteCode, 'success', 5000);
  renderDashboard(user);
}

function openJoinClassModal() { openModal('join-class-modal'); }
function handleJoinClass() {
  var user = Session.get();
  var code = document.getElementById('join-class-code').value.trim().toUpperCase();
  var errEl = document.getElementById('join-class-code-error');
  errEl.classList.add('hidden');
  if (!code || code.length !== 6) { errEl.textContent = '请输入6位班级码'; errEl.classList.remove('hidden'); return; }
  var cls = Classes.findByInviteCode(code);
  if (!cls) { errEl.textContent = '班级码无效，请检查后重试'; errEl.classList.remove('hidden'); return; }
  if (cls.members.some(function(m) { return m.userId === user.id; })) { errEl.textContent = '你已经在这个班级群了'; errEl.classList.remove('hidden'); return; }
  Classes.addMember(cls.id, user.id, 'member');
  closeModal('join-class-modal');
  document.getElementById('join-class-code').value = '';
  showToast('成功加入班级群"' + cls.name + '"！', 'success');
  renderDashboard(user);
}

function openCreateModal() {
  var user = Session.get();
  var myClasses = Classes.forUser(user.id);
  var sel = document.getElementById('create-class');
  sel.innerHTML = '<option value="">不关联班级群</option>' + myClasses.map(function(c) { return '<option value="' + c.id + '">' + escHtml(c.name) + '</option>'; }).join('');
  _pickerClassId = null;
  _pickerSelected = new Set();
  document.getElementById('member-picker-group').classList.add('picker-hidden');
  document.getElementById('member-picker').innerHTML = '';
  document.getElementById('selected-count').textContent = '0';
  document.getElementById('member-search').value = '';
  openModal('create-modal');
}

function onCreateClassChange() {
  var user = Session.get();
  var classId = document.getElementById('create-class').value;
  var pickerGroup = document.getElementById('member-picker-group');
  if (!classId) { pickerGroup.classList.add('picker-hidden'); _pickerClassId = null; _pickerSelected = new Set(); return; }
  _pickerClassId = classId;
  _pickerSelected = new Set();
  pickerGroup.classList.remove('picker-hidden');
  document.getElementById('member-search').value = '';
  renderMemberPicker(classId, user.id, '');
}

function renderMemberPicker(classId, excludeUserId, query) {
  var members = Classes.getMemberUsers(classId, excludeUserId);
  var q = query.toLowerCase();
  var filtered = q ? members.filter(function(u) { return u.name.toLowerCase().indexOf(q) > -1 || (u.skills || []).some(function(s) { return s.toLowerCase().indexOf(q) > -1; }); }) : members;
  var container = document.getElementById('member-picker');
  if (filtered.length === 0) { container.innerHTML = '<div style="font-size:13px;color:var(--gray-400);padding:12px 0;text-align:center">没有找到匹配的成员</div>'; return; }
  container.innerHTML = filtered.map(function(u) {
    var sel = _pickerSelected.has(u.id);
    return '<div class="member-picker-item' + (sel ? ' selected' : '') + '" onclick="toggleMemberPick(\'' + u.id + '\')">' +
      renderAvatar(u.name, 'sm') +
      '<div class="member-picker-info"><div class="member-picker-name">' + escHtml(u.name) + '</div><div class="member-picker-skills">' + (u.skills && u.skills.length ? u.skills.join('、') : '未设置擅长领域') + '</div></div>' +
      '<div class="member-picker-check">' + (sel ? '✓' : '') + '</div></div>';
  }).join('');
}

function toggleMemberPick(userId) {
  var user = Session.get();
  if (_pickerSelected.has(userId)) _pickerSelected.delete(userId); else _pickerSelected.add(userId);
  document.getElementById('selected-count').textContent = _pickerSelected.size;
  renderMemberPicker(_pickerClassId, user.id, document.getElementById('member-search').value);
}

function filterMemberPicker() {
  var user = Session.get();
  if (_pickerClassId) renderMemberPicker(_pickerClassId, user.id, document.getElementById('member-search').value);
}

function handleCreateGroup() {
  var user = Session.get();
  var name = document.getElementById('create-name').value.trim();
  var course = document.getElementById('create-course').value.trim();
  var desc = document.getElementById('create-desc').value.trim();
  var classId = document.getElementById('create-class').value || null;
  var errEl = document.getElementById('create-name-error');
  errEl.classList.add('hidden');
  if (!name) { errEl.textContent = '请输入小组名称'; errEl.classList.remove('hidden'); return; }
  var group = Groups.create({ name: name, course: course, desc: desc, creatorId: user.id, classId: classId });
  Groups.addMember(group.id, user.id, 'leader');
  var addedCount = 0;
  _pickerSelected.forEach(function(uid) {
    if (Groups.addMember(group.id, uid, 'member')) addedCount++;
  });
  closeModal('create-modal');
  document.getElementById('create-name').value = '';
  document.getElementById('create-course').value = '';
  document.getElementById('create-desc').value = '';
  _pickerSelected = new Set();
  showToast(addedCount > 0 ? '小组"' + name + '"创建成功，已添加 ' + addedCount + ' 位组员！' : '小组"' + name + '"创建成功！邀请码：' + group.inviteCode, 'success', 5000);
  renderDashboard(user);
}

function renderGroups(user) {
  var groups = Groups.forUser(user.id);
  // 过滤掉已归档的小组
  var activeGroups = groups.filter(function(g) { return !GroupArchives.isArchived(g.id, user.id); });

  // 更新筛选项
  updateGroupFilters(user, activeGroups);

  // 应用筛选
  var filterClass = document.getElementById('filter-class');
  var filterDeadline = document.getElementById('filter-deadline');
  if (filterClass && filterClass.value) {
    activeGroups = activeGroups.filter(function(g) { return g.classId === filterClass.value; });
  }
  if (filterDeadline && filterDeadline.value) {
    var now = Date.now();
    activeGroups = activeGroups.filter(function(g) {
      var tasks = Tasks.forGroup(g.id);
      var deadlines = tasks.filter(function(t) { return t.status !== 'done' && t.deadline; });
      if (filterDeadline.value === 'urgent') {
        return deadlines.some(function(t) { return t.deadline - now < 24 * 60 * 60 * 1000; });
      }
      if (filterDeadline.value === 'week') {
        return deadlines.some(function(t) { return t.deadline - now < 7 * 24 * 60 * 60 * 1000; });
      }
      return deadlines.length > 0;
    });
  }

  var resultCountEl = document.getElementById('filter-result-count');
  if (resultCountEl) resultCountEl.textContent = activeGroups.length + ' 个结果';

  document.getElementById('group-count').textContent = activeGroups.length + ' 个';
  var grid = document.getElementById('groups-grid');
  if (activeGroups.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📚</div><div class="empty-state-text">没有匹配的小组</div><div class="empty-state-hint">尝试调整筛选条件或创建新小组</div></div>';
    return;
  }
  grid.innerHTML = activeGroups.map(function(group) {
    var tasks = Tasks.forGroup(group.id);
    var myTasks = tasks.filter(function(t) { return t.assigneeId === user.id; });
    var doneTasks = tasks.filter(function(t) { return t.status === 'done'; });
    var progress = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
    var myPending = myTasks.filter(function(t) { return t.status !== 'done'; }).length;
    var myMember = group.members.find(function(m) { return m.userId === user.id; });
    var isLeader = myMember && myMember.role === 'leader';
    var cls = group.classId ? Classes.findById(group.classId) : null;
    return '<div class="group-card" onclick="window.location.href=\'group.html?id=' + group.id + '\'">' +
      '<div class="group-card-header"><div><div class="group-card-name">' + escHtml(group.name) + '</div>' +
      '<div class="group-card-course">' + escHtml(group.course || '未设置课程') + '</div>' +
      (cls ? '<div style="font-size:12px;color:var(--primary);margin-top:2px">🏫 ' + escHtml(cls.name) + '</div>' : '') + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
      (isLeader ? '<span class="badge badge-blue">组长</span>' : '<span class="badge badge-gray">成员</span>') +
      (myPending > 0 ? '<span class="badge badge-red">' + myPending + ' 待完成</span>' : '') + '</div></div>' +
      '<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px"><div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-500);margin-bottom:4px"><span>整体进度</span><span>' + progress + '%</span></div>' +
      '<div class="progress"><div class="progress-bar' + (progress === 100 ? ' success' : '') + '" style="width:' + progress + '%"></div></div></div>' +
      '<div class="group-card-quick-actions" onclick="event.stopPropagation()">' +
        '<a href="group.html?id=' + group.id + '#files" class="btn btn-ghost btn-sm btn-icon" title="小组文件库">📁</a>' +
        '<a href="idea-board.html?groupId=' + group.id + '" class="btn btn-ghost btn-sm btn-icon" title="小组讨论板">💬</a>' +
      '</div></div>' +
      '<div class="group-card-stats"><div class="group-card-stat"><strong>' + group.members.length + '</strong> 位成员</div>' +
      '<div class="group-card-stat"><strong>' + tasks.length + '</strong> 个任务</div>' +
      '<div class="group-card-stat"><strong>' + doneTasks.length + '</strong> 已完成</div></div>' +
      '<div style="margin-top:12px;display:flex;gap:4px;flex-wrap:wrap">' +
      group.members.slice(0, 5).map(function(m) {
        var u = Users.findById(m.userId);
        if (!u) return '';
        var mTasks = Tasks.forUser(u.id).filter(function(t) { return t.groupId === group.id && t.status !== 'done'; });
        return '<div class="avatar avatar-sm member-avatar-tip" style="cursor:pointer" onmouseenter="showMemberTip(event,\'' + m.userId + '\',\'' + group.id + '\')" onmouseleave="hideMemberTip()" onclick="event.stopPropagation()">' +
          renderAvatar(u.name, 'sm') +
          (mTasks.length > 0 ? '<span class="member-avatar-badge">' + mTasks.length + '</span>' : '') +
        '</div>';
      }).join('') +
      (group.members.length > 5 ? '<div class="avatar avatar-sm" style="background:var(--gray-300);color:var(--gray-600)">+' + (group.members.length - 5) + '</div>' : '') + '</div>' +
      '<div class="group-card-footer">' +
        '<button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px" onclick="event.stopPropagation();generateGroupBrief(\'' + group.id + '\')">📝 小组简报</button>' +
      '</div></div>';
  }).join('');
}

// ── 小组筛选 ──
function updateGroupFilters(user, activeGroups) {
  var filterBar = document.getElementById('groups-filter-bar');
  if (!filterBar) return;
  if (activeGroups.length <= 1) {
    filterBar.style.display = 'none';
    return;
  }
  filterBar.style.display = 'flex';

  // 更新班级筛选下拉框
  var filterClass = document.getElementById('filter-class');
  if (filterClass) {
    var currentVal = filterClass.value;
    var classOptions = '<option value="">全部班级</option>';
    var seenClasses = {};
    activeGroups.forEach(function(g) {
      if (g.classId && !seenClasses[g.classId]) {
        seenClasses[g.classId] = true;
        var cls = Classes.findById(g.classId);
        if (cls) classOptions += '<option value="' + g.classId + '"' + (currentVal === g.classId ? ' selected' : '') + '>' + escHtml(cls.name) + '</option>';
      }
    });
    filterClass.innerHTML = classOptions;
    if (currentVal) filterClass.value = currentVal;
  }
}

// ── 个人头像下拉菜单 ──
function initUserMenu() {
  var userEl = document.getElementById('navbar-user');
  if (!userEl) return;
  userEl.style.position = 'relative';
  userEl.style.cursor = 'pointer';
  userEl.onclick = function(e) {
    e.stopPropagation();
    toggleUserMenu();
  };

  // 创建下拉菜单
  var menu = document.createElement('div');
  menu.id = 'user-dropdown-menu';
  menu.style.cssText = 'display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid var(--gray-200);border-radius:var(--radius);box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:9999;min-width:160px;padding:4px 0;margin-top:4px';
  menu.innerHTML = '<div style="padding:8px 14px;font-size:13px;font-weight:600;color:var(--gray-800);border-bottom:1px solid var(--gray-100)" id="dm-user-name"></div>' +
    '<a href="settings.html" style="display:block;padding:8px 14px;font-size:13px;color:var(--gray-700);text-decoration:none;cursor:pointer" onmouseenter="this.style.background=\'var(--gray-50)\'" onmouseleave="this.style.background=\'none\'">⚙️ 个人设置</a>' +
    '<a href="analytics.html" style="display:block;padding:8px 14px;font-size:13px;color:var(--gray-700);text-decoration:none;cursor:pointer" onmouseenter="this.style.background=\'var(--gray-50)\'" onmouseleave="this.style.background=\'none\'">📊 数据面板</a>' +
    '<div style="border-top:1px solid var(--gray-100);margin:4px 0"></div>' +
    '<div onclick="handleLogout()" style="display:block;padding:8px 14px;font-size:13px;color:var(--danger);cursor:pointer" onmouseenter="this.style.background=\'var(--gray-50)\'" onmouseleave="this.style.background=\'none\'">🚪 退出登录</div>';
  userEl.appendChild(menu);

  document.addEventListener('click', function(e) {
    if (!userEl.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // 更新下拉菜单中的用户名
  var user = Session.get();
  if (user && document.getElementById('dm-user-name')) {
    document.getElementById('dm-user-name').textContent = user.name || user.email;
  }
}

function toggleUserMenu() {
  var menu = document.getElementById('user-dropdown-menu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    var user = Session.get();
    var nameEl = document.getElementById('dm-user-name');
    if (user && nameEl) nameEl.textContent = user.name || user.email;
  }
}

// ── 成员任务悬浮提示 ──
var _memberTipTimer = null;
function showMemberTip(e, userId, groupId) {
  clearTimeout(_memberTipTimer);
  var u = Users.findById(userId);
  if (!u) return;
  var tasks = Tasks.forUser(userId).filter(function(t) { return t.groupId === groupId && t.status !== 'done'; });
  var html = '<div style="font-weight:600;margin-bottom:4px">' + escHtml(u.name) + '</div>';
  if (tasks.length === 0) {
    html += '<div style="font-size:12px;color:var(--gray-400)">暂无进行中任务 ✓</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--gray-600)">进行中任务：' + tasks.length + ' 个</div>';
    tasks.slice(0, 5).forEach(function(t) {
      var statusLabel = t.status === 'todo' ? '⏳' : '🔄';
      html += '<div style="font-size:11px;color:var(--gray-500);margin-top:2px">' + statusLabel + ' ' + escHtml(t.title) + '</div>';
    });
    if (tasks.length > 5) html += '<div style="font-size:11px;color:var(--gray-400)">...还有 ' + (tasks.length - 5) + ' 个</div>';
  }
  showTooltip(e, html);
}
function hideMemberTip() {
  _memberTipTimer = setTimeout(function() { hideTooltip(); }, 150);
}

// ── 通用 Tooltip ──
function showTooltip(e, html) {
  var tip = document.getElementById('dashboard-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'dashboard-tooltip';
    tip.style.cssText = 'position:fixed;background:#1F2937;color:#fff;padding:10px 14px;border-radius:8px;font-size:12px;z-index:10000;pointer-events:auto;max-width:240px;box-shadow:0 4px 16px rgba(0,0,0,0.2);line-height:1.5';
    document.body.appendChild(tip);
    tip.addEventListener('mouseenter', function() { clearTimeout(_memberTipTimer); });
    tip.addEventListener('mouseleave', function() { hideTooltip(); });
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
  var rect = e.target.getBoundingClientRect();
  var top = rect.bottom + 4;
  var left = rect.left;
  if (top + 120 > window.innerHeight) top = rect.top - 130;
  if (left + 240 > window.innerWidth) left = window.innerWidth - 250;
  if (left < 8) left = 8;
  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
}
function hideTooltip() {
  var tip = document.getElementById('dashboard-tooltip');
  if (tip) tip.style.display = 'none';
}

// ── 小组简报 ──
function generateGroupBrief(groupId) {
  var group = Groups.findById(groupId);
  if (!group) return;
  var tasks = Tasks.forGroup(groupId);
  var doneTasks = tasks.filter(function(t) { return t.status === 'done'; });
  var progress = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  var brief = '【' + escHtml(group.name) + '】小组简报\n';
  brief += '课程：' + (group.course || '未设置') + '\n';
  brief += '成员数：' + group.members.length + ' | 任务数：' + tasks.length + ' | 整体进度：' + progress + '%\n';
  brief += '━━━━━━━━━━━━━━━\n';
  group.members.forEach(function(m) {
    var u = Users.findById(m.userId);
    var mTasks = Tasks.forUser(m.userId).filter(function(t) { return t.groupId === groupId; });
    var mDone = mTasks.filter(function(t) { return t.status === 'done'; }).length;
    var mLabel = m.role === 'leader' ? '👑组长' : '👤组员';
    brief += mLabel + ' ' + (u ? u.name : '未知') + '：' + mDone + '/' + mTasks.length + ' 完成';
    if (mTasks.length === 0) brief += '（暂无任务）';
    brief += '\n';
    mTasks.forEach(function(t) {
      var sIcon = t.status === 'done' ? '✅' : t.status === 'doing' ? '🔄' : '⏳';
      brief += '  ' + sIcon + ' ' + t.title;
      if (t.deadline) brief += ' | 截止：' + new Date(t.deadline).toLocaleDateString('zh-CN');
      brief += '\n';
    });
  });
  brief += '━━━━━━━━━━━━━━━\n';
  brief += '生成时间：' + new Date().toLocaleString('zh-CN');
  navigator.clipboard.writeText(brief).then(function() {
    showToast('小组简报已复制到剪贴板！可直接粘贴用于课堂汇报', 'success', 3000);
  }).catch(function() {
    showToast('复制失败，请重试', 'error');
  });
}

// ── 小组归档 ──
function openArchiveModal() {
  var user = Session.get();
  var groups = Groups.forUser(user.id);
  if (groups.length === 0) {
    showToast('没有可以归档的小组', 'info');
    return;
  }
  var body = document.getElementById('archive-body');
  body.innerHTML = '<div style="font-size:13px;color:var(--gray-500);margin-bottom:12px">将已完成的小组归档后，它们将不再占用首页展示。归档仅在本地生效，不影响其他成员。</div>' +
    groups.map(function(g) {
      var archived = GroupArchives.isArchived(g.id, user.id);
      var tasks = Tasks.forGroup(g.id);
      var doneTasks = tasks.filter(function(t) { return t.status === 'done'; });
      var progress = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray-100)">' +
        '<div>' +
          '<div style="font-weight:600;font-size:14px">' + escHtml(g.name) + ' ' + (archived ? '<span class="badge badge-gray">已归档</span>' : '') + '</div>' +
          '<div style="font-size:12px;color:var(--gray-500)">' + tasks.length + ' 个任务 · 进度 ' + progress + '% · ' + g.members.length + ' 人</div>' +
        '</div>' +
        '<button type="button" class="btn ' + (archived ? 'btn-secondary' : 'btn-primary') + ' btn-sm" onclick="handleToggleArchive(\'' + g.id + '\')">' + (archived ? '📤 取消归档' : '📥 归档') + '</button>' +
      '</div>';
    }).join('');
  openModal('archive-modal');
}

function handleToggleArchive(groupId) {
  var user = Session.get();
  var group = Groups.findById(groupId);
  if (!group) return;
  if (GroupArchives.isArchived(groupId, user.id)) {
    GroupArchives.unarchive(groupId, user.id);
    showToast('已取消归档', 'info');
  } else {
    GroupArchives.archive(group, user.id);
    showToast('小组"' + group.name + '"已归档', 'success');
  }
  openArchiveModal();
  renderDashboard(user);
}

function renderUpcoming(user) {
  var myTasks = Tasks.forUser(user.id).filter(function(t) { return t.status !== 'done' && t.deadline; });
  var now = Date.now();
  var overdue = myTasks.filter(function(t) { return t.deadline < now; }).sort(function(a, b) { return a.deadline - b.deadline; });
  var today = myTasks.filter(function(t) { return t.deadline >= now && t.deadline - now < 24 * 60 * 60 * 1000; }).sort(function(a, b) { return a.deadline - b.deadline; });
  var threeDay = myTasks.filter(function(t) { return t.deadline - now >= 24 * 60 * 60 * 1000 && t.deadline - now < 3 * 24 * 60 * 60 * 1000; }).sort(function(a, b) { return a.deadline - b.deadline; });
  var future = myTasks.filter(function(t) { return t.deadline - now >= 3 * 24 * 60 * 60 * 1000; }).sort(function(a, b) { return a.deadline - b.deadline; });

  var allCount = overdue.length + today.length + threeDay.length + future.length;
  var urgentCount = overdue.length + today.length;
  var urgentEl = document.getElementById('urgent-count');
  if (urgentCount > 0) { urgentEl.textContent = urgentCount + ' 紧急'; urgentEl.classList.remove('hidden'); } else { urgentEl.classList.add('hidden'); }

  var list = document.getElementById('upcoming-list');
  if (allCount === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-state-icon">🎉</div><div class="empty-state-text" style="font-size:13px">暂无即将截止的任务</div></div>';
    return;
  }

  var html = '<div class="upcoming-list">';

  if (overdue.length > 0) {
    html += '<div class="upcoming-section-label">🔴 已超期</div>';
    html += overdue.slice(0, 4).map(function(task) { return renderUpcomingItem(task, true); }).join('');
  }
  if (today.length > 0) {
    html += '<div class="upcoming-section-label">⏰ 今日到期</div>';
    html += today.slice(0, 3).map(function(task) { return renderUpcomingItem(task, true); }).join('');
  }
  if (threeDay.length > 0) {
    html += '<div class="upcoming-section-label">📅 3 天内到期</div>';
    html += threeDay.slice(0, 3).map(function(task) { return renderUpcomingItem(task, false); }).join('');
  }
  if (future.length > 0) {
    html += '<div class="upcoming-section-label">📆 远期任务</div>';
    html += future.slice(0, 2).map(function(task) { return renderUpcomingItem(task, false); }).join('');
  }

  html += '</div>';
  list.innerHTML = html;
}

function renderUpcomingItem(task, isUrgent) {
  var group = Groups.findById(task.groupId);
  var assignee = Users.findById(task.assigneeId);
  return '<div class="upcoming-item ' + (isUrgent ? 'urgent' : 'normal') + '" style="cursor:pointer">' +
    '<div class="upcoming-info" onclick="window.location.href=\'group.html?id=' + task.groupId + '\'">' +
      '<div class="upcoming-title">' + escHtml(task.title) + '</div>' +
      '<div class="upcoming-group">' + escHtml(group ? group.name : '') + '</div>' +
    '</div>' +
    '<div class="upcoming-right">' +
      '<div class="upcoming-deadline" style="color:' + (isUrgent ? 'var(--danger)' : 'var(--warning)') + '">' + formatDeadline(task.deadline) + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm btn-icon" style="font-size:14px;padding:2px 4px" onclick="event.stopPropagation();handleRemindMember(\'' + task.id + '\')" title="提醒负责人">🔔</button>' +
    '</div>' +
  '</div>';
}

function handleRemindMember(taskId) {
  var task = Tasks.findById(taskId);
  if (!task) return;
  var assignee = Users.findById(task.assigneeId);
  var assigneeName = assignee ? assignee.name : '未知';
  showToast('已提醒 ' + assigneeName + ' 尽快完成"' + task.title + '"', 'success', 2500);
  // 同时写入一条站内消息
  if (assignee) {
    var db = DB.get();
    var messages = db.messages || [];
    var user = Session.get();
    messages.push({
      id: genId(),
      userId: assignee.id,
      fromName: user ? user.name : '系统',
      title: '催办提醒',
      content: '请尽快完成"' + task.title + '"！截止时间：' + (task.deadline ? new Date(task.deadline).toLocaleDateString('zh-CN') : '未设置'),
      time: Date.now(),
      read: false,
      type: 'system'
    });
    db.messages = messages;
    DB.set(db);
  }
}

function renderStats(user) {
  var myTasks = Tasks.forUser(user.id);
  document.getElementById('stat-todo').textContent = myTasks.filter(function(t) { return t.status === 'todo'; }).length;
  document.getElementById('stat-doing').textContent = myTasks.filter(function(t) { return t.status === 'doing'; }).length;
  document.getElementById('stat-done').textContent = myTasks.filter(function(t) { return t.status === 'done'; }).length;
  document.getElementById('stat-overdue').textContent = myTasks.filter(function(t) { return t.status !== 'done' && t.deadline && t.deadline < Date.now(); }).length;

  // 本周工作量小结
  var now = new Date();
  var startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  var endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  var weekDone = myTasks.filter(function(t) {
    return t.status === 'done' && t.completedAt && t.completedAt >= startOfWeek.getTime() && t.completedAt < endOfWeek.getTime();
  }).length;
  var weekRemaining = myTasks.filter(function(t) { return t.status !== 'done'; }).length;
  var weekTotal = weekDone + weekRemaining;

  var summaryEl = document.getElementById('weekly-summary');
  if (summaryEl) {
    var efficiency = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 100;
    var emoji = efficiency >= 80 ? '🔥' : efficiency >= 50 ? '💪' : '🐢';
    summaryEl.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--gray-600);margin-bottom:6px">📊 本周小结</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div><span style="font-size:11px;color:var(--gray-500)">完成</span> <strong style="color:var(--success)">' + weekDone + '</strong> / 待办 <strong style="color:var(--warning)">' + weekRemaining + '</strong></div>' +
        '<div style="font-size:11px;color:var(--gray-500)">效率 <strong>' + emoji + ' ' + efficiency + '%</strong></div>' +
      '</div>';
  }
}

function openJoinModal() { openModal('join-modal'); }
function handleJoinGroup() {
  var user = Session.get();
  var code = document.getElementById('join-code').value.trim().toUpperCase();
  var errEl = document.getElementById('join-code-error');
  errEl.classList.add('hidden');
  if (!code || code.length !== 6) { errEl.textContent = '请输入6位邀请码'; errEl.classList.remove('hidden'); return; }
  var group = Groups.findByInviteCode(code);
  if (!group) { errEl.textContent = '邀请码无效，请检查后重试'; errEl.classList.remove('hidden'); return; }
  if (group.members.some(function(m) { return m.userId === user.id; })) { errEl.textContent = '你已经在这个小组了'; errEl.classList.remove('hidden'); return; }
  if (group.classId) {
    var cls = Classes.findById(group.classId);
    if (cls && !cls.members.some(function(m) { return m.userId === user.id; })) { errEl.textContent = '该小组仅限班级群成员加入，请先加入对应班级群'; errEl.classList.remove('hidden'); return; }
  }
  Groups.addMember(group.id, user.id, 'member');
  closeModal('join-modal');
  document.getElementById('join-code').value = '';
  showToast('成功加入"' + group.name + '"！', 'success');
  renderDashboard(user);
}

// ── 项目动态流 ──
function renderActivityFeed(user) {
  var feed = document.getElementById('activity-feed');
  if (!feed) return;

  // 收集所有相关动态事件
  var activities = [];

  // 1. 任务完成动态（最近完成的任务）
  var allTasks = Tasks.getAll();
  var doneTasks = allTasks.filter(function(t) { return t.status === 'done'; }).sort(function(a, b) { return b.completedAt - a.completedAt || b.createdAt - a.createdAt; }).slice(0, 5);
  doneTasks.forEach(function(t) {
    var assignee = Users.findById(t.assigneeId);
    var group = Groups.findById(t.groupId);
    if (assignee && group) {
      activities.push({
        type: 'done',
        icon: '✅',
        text: '<strong>' + escHtml(assignee.name) + '</strong> 完成了任务 <strong>' + escHtml(t.title) + '</strong>',
        sub: '来自「' + escHtml(group.name) + '」',
        time: t.completedAt || t.createdAt
      });
    }
  });

  // 2. 小组创建动态
  var recentGroups = Groups.getAll().sort(function(a, b) { return b.createdAt - a.createdAt; }).slice(0, 3);
  recentGroups.forEach(function(g) {
    var creator = Users.findById(g.creatorId);
    if (creator) {
      activities.push({
        type: 'create',
        icon: '👥',
        text: '<strong>' + escHtml(creator.name) + '</strong> 创建了小组 <strong>' + escHtml(g.name) + '</strong>',
        sub: g.course ? '课程：' + escHtml(g.course) : '',
        time: g.createdAt
      });
    }
  });

  // 3. 班级公告动态
  var userClasses = Classes.forUser(user.id);
  var announcementActivities = [];
  userClasses.forEach(function(cls) {
    Announcements.forClass(cls.id).slice(0, 3).forEach(function(a) {
      var author = Users.findById(a.authorId);
      if (author) {
        announcementActivities.push({
          type: 'announce',
          icon: '📢',
          text: '<strong>' + escHtml(author.name) + '</strong> 发布了班级公告 <strong>' + escHtml(a.title) + '</strong>',
          sub: '班级「' + escHtml(cls.name) + '」',
          time: a.createdAt
        });
      }
    });
  });
  activities = activities.concat(announcementActivities);

  // 按时间排序取最近10条
  activities.sort(function(a, b) { return b.time - a.time; });
  activities = activities.slice(0, 10);

  if (activities.length === 0) {
    feed.innerHTML = '<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px">暂无动态</div>';
    return;
  }

  feed.innerHTML = activities.map(function(a) {
    var iconClass = a.type === 'done' ? 'done' : a.type === 'create' ? 'create' : a.type === 'announce' ? 'announce' : 'join';
    return '<div class="activity-item">' +
      '<div class="activity-icon ' + iconClass + '">' + a.icon + '</div>' +
      '<div class="activity-body">' +
        '<div class="activity-text">' + a.text + '</div>' +
        (a.sub ? '<div class="activity-text" style="font-size:12px;color:var(--gray-400)">' + a.sub + '</div>' : '') +
        '<div class="activity-time">' + formatMsgTime(a.time) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function handleLogout() { Session.clear(); window.location.href = 'index.html'; }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.addEventListener('click', function(e) { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active'); });
function escHtml(str) { if (!str) return ''; return str.replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"'); }