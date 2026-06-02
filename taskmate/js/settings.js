// settings.js — 个人设置页逻辑

const SKILLS_OPTIONS = ['文案撰写', 'PPT制作', '资料搜集', '数据分析', '设计排版', '视频剪辑', '编程开发', '翻译校对'];

function initSettings() {
  seedDemoData();
  const user = Session.require();
  if (!user) return;

  document.getElementById('navbar-avatar').innerHTML = renderAvatar(user.name, 'sm');
  document.getElementById('navbar-name').textContent = user.name;

  document.getElementById('profile-avatar').innerHTML = renderAvatar(user.name, 'lg');
  document.getElementById('profile-name-display').textContent = user.name;
  document.getElementById('profile-email-display').textContent = user.email;

  document.getElementById('settings-name').value = user.name;

  renderSkillTags(user.skills || []);
  renderMembership(user);
  renderStats(user);
}

function renderSkillTags(selected) {
  const container = document.getElementById('settings-skill-tags');
  container.innerHTML = SKILLS_OPTIONS.map(s =>
    `<span class="skill-tag ${selected.includes(s) ? 'selected' : ''}" data-skill="${s}">${s}</span>`
  ).join('');
  container.querySelectorAll('.skill-tag').forEach(tag => {
    tag.addEventListener('click', () => tag.classList.toggle('selected'));
  });
}

function getSelectedSkills() {
  return [...document.querySelectorAll('#settings-skill-tags .skill-tag.selected')].map(t => t.dataset.skill);
}

function saveProfile() {
  const user = Session.get();
  const name = document.getElementById('settings-name').value.trim();
  const errEl = document.getElementById('settings-name-error');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = '姓名不能为空'; errEl.classList.remove('hidden'); return; }

  const skills = getSelectedSkills();
  const updated = Users.update(user.id, { name, skills });
  Session.set(updated);

  document.getElementById('profile-name-display').textContent = name;
  document.getElementById('navbar-name').textContent = name;
  document.getElementById('profile-avatar').innerHTML = renderAvatar(name, 'lg');
  document.getElementById('navbar-avatar').innerHTML = renderAvatar(name, 'sm');

  showToast('个人信息已保存', 'success');
}

function changePassword() {
  const user = Session.get();
  const oldPwd = document.getElementById('old-password').value;
  const newPwd = document.getElementById('new-password').value;
  const confirmPwd = document.getElementById('confirm-password').value;

  const oldErr = document.getElementById('old-password-error');
  const newErr = document.getElementById('new-password-error');
  const confirmErr = document.getElementById('confirm-password-error');
  [oldErr, newErr, confirmErr].forEach(e => { e.classList.add('hidden'); });

  if (!oldPwd) { oldErr.textContent = '请输入当前密码'; oldErr.classList.remove('hidden'); return; }
  if (user.password !== btoa(oldPwd)) { oldErr.textContent = '当前密码错误'; oldErr.classList.remove('hidden'); return; }
  if (newPwd.length < 6) { newErr.textContent = '新密码至少6位'; newErr.classList.remove('hidden'); return; }
  if (newPwd !== confirmPwd) { confirmErr.textContent = '两次密码不一致'; confirmErr.classList.remove('hidden'); return; }

  const updated = Users.update(user.id, { password: btoa(newPwd) });
  Session.set(updated);

  document.getElementById('old-password').value = '';
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';

  showToast('密码修改成功', 'success');
}

function renderStats(user) {
  const groups = Groups.forUser(user.id);
  const myTasks = Tasks.forUser(user.id);
  document.getElementById('stat-groups').textContent = groups.length;
  document.getElementById('stat-completed').textContent = myTasks.filter(t => t.status === 'done').length;
  document.getElementById('stat-pending').textContent = myTasks.filter(t => t.status !== 'done').length;
}

function renderMembership(user) {
  const container = document.getElementById('membership-info');
  const myClasses = Classes.forUser(user.id);
  const myGroups = Groups.forUser(user.id);

  if (myClasses.length === 0 && myGroups.length === 0) {
    container.innerHTML = '<div class="loading-hint">还未加入任何班级群或小组</div>';
    return;
  }

  let html = '';

  if (myClasses.length > 0) {
    html += '<div style="font-size:13px;font-weight:600;color:var(--gray-600);margin-bottom:8px">所属班级群</div>';
    html += myClasses.map(cls => {
      const myMember = cls.members.find(m => m.userId === user.id);
      const role = myMember?.role === 'admin' ? '管理员' : '成员';
      const roleBadge = myMember?.role === 'admin' ? 'badge-blue' : 'badge-gray';
      return `
        <div class="info-row">
          <span class="info-label">🏫 班级</span>
          <span class="info-value">${escHtml(cls.name)}${cls.school ? `<span style="color:var(--gray-400);font-weight:400"> · ${escHtml(cls.school)}</span>` : ''}</span>
          <span class="badge ${roleBadge}">${role}</span>
        </div>`;
    }).join('');
  }

  if (myGroups.length > 0) {
    if (myClasses.length > 0) html += '<div class="divider"></div>';
    html += '<div style="font-size:13px;font-weight:600;color:var(--gray-600);margin-bottom:8px">所属小组</div>';
    html += myGroups.map(group => {
      const myMember = group.members.find(m => m.userId === user.id);
      const role = myMember?.role === 'leader' ? '组长' : '成员';
      const roleBadge = myMember?.role === 'leader' ? 'badge-blue' : 'badge-gray';
      const cls = group.classId ? Classes.findById(group.classId) : null;
      return `
        <div class="info-row" style="cursor:pointer" onclick="window.location.href='group.html?id=${group.id}'">
          <span class="info-label">👥 小组</span>
          <span class="info-value">
            ${escHtml(group.name)}
            ${group.course ? `<span style="color:var(--gray-400);font-weight:400"> · ${escHtml(group.course)}</span>` : ''}
            ${cls ? `<span style="color:var(--primary);font-weight:400;font-size:12px"> · ${escHtml(cls.name)}</span>` : ''}
          </span>
          <span class="badge ${roleBadge}">${role}</span>
        </div>`;
    }).join('');
  }

  container.innerHTML = html;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function clearAllData() {
  if (!confirm('确定要清除所有本地数据吗？这将删除所有小组、任务和文件，且无法恢复！')) return;
  if (!confirm('再次确认：清除后将退出登录，所有数据永久删除。继续吗？')) return;

  const keys = ['users', 'groups', 'classes', 'tasks', 'filemeta', 'submissions', 'comments', 'bills', '_seeded'];
  keys.forEach(k => localStorage.removeItem(k));
  Session.clear();

  openDB().then(db => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').clear();
  }).catch(() => {});

  showToast('数据已清除，即将跳转...', 'success');
  setTimeout(() => window.location.href = 'index.html', 1500);
}
