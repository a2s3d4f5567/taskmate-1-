// onboarding.js — 注册后个性化配置引导

const SCENE_CONTENT = {
  student: {
    skillTitle: '你擅长哪些方向？',
    skillDesc: '可多选，帮助组长合理分配任务',
    roleTitle: '你在小组中的角色',
    roleDesc: '选择后可解锁对应功能权限',
    skills: ['PPT制作', '文案撰写', '资料搜集', '数据分析', '设计排版', '视频剪辑', '编程开发', '翻译校对', '调研访谈', '思维导图'],
    roles: [
      {
        value: 'leader',
        name: '组长',
        badge: 'badge-leader',
        badgeText: '负责人',
        desc: '负责任务分配、进度跟踪和最终汇总，拥有成员管理权限',
      },
      {
        value: 'member',
        name: '组员',
        badge: 'badge-member',
        badgeText: '执行者',
        desc: '专注完成分配到的任务，可查看全组进度和提交成果',
      },
    ],
    doneTitle: '设置完成！',
    doneDesc: '你的个人档案已保存，现在去看看你的任务面板吧',
  },
  work: {
    skillTitle: '你的核心能力方向？',
    skillDesc: '可多选，便于项目负责人快速了解你的专长',
    roleTitle: '你在项目中的职责',
    roleDesc: '选择后系统会为你展示对应的工作视图',
    skills: ['办公效率', '设计创意', '视频剪辑', '策划运营', '沟通协调', '技术开发', '统筹管理', '数据分析', '市场推广', '客户服务'],
    roles: [
      {
        value: 'leader',
        name: '项目负责人',
        badge: 'badge-leader',
        badgeText: '管理者',
        desc: '负责项目整体推进、资源调配和对外沟通，拥有完整管理权限',
      },
      {
        value: 'member',
        name: '项目成员',
        badge: 'badge-member',
        badgeText: '执行者',
        desc: '专注执行具体任务，可查看项目全貌并提交工作成果',
      },
    ],
    doneTitle: '欢迎加入！',
    doneDesc: '个人档案已保存，前往工作台开始今天的任务',
  },
};

let currentScene = 'student';
let currentStep = 1;
let customSkillsFull = [];
let customSkillsModal = [];

function initOnboarding() {
  // 检查是否有待引导的用户
  const pendingUser = sessionStorage.getItem('ob_pending_user');
  // 若无 pending 用户（直接访问页面），仍正常展示供演示

  renderSkillGrid('full', currentScene);
  renderSkillGrid('modal', currentScene);
  renderRoleOptions('full', currentScene);
  renderRoleOptions('modal', currentScene);

  bindSceneToggle('scene-toggle-full', 'full');
  bindSceneToggle('scene-toggle-modal', 'modal');

  bindCustomSkill('full');
  bindCustomSkill('modal');

  // 视图切换（演示用）
  document.getElementById('btn-show-fullpage').addEventListener('click', () => {
    document.getElementById('fullpage-view').classList.remove('hidden');
    document.getElementById('steps-entry-card').classList.add('hidden');
  });
  document.getElementById('btn-show-steps').addEventListener('click', () => {
    document.getElementById('fullpage-view').classList.add('hidden');
    document.getElementById('steps-entry-card').classList.remove('hidden');
  });

  // 整页表单提交
  document.getElementById('btn-submit-full').addEventListener('click', submitFull);
  document.getElementById('skip-full').addEventListener('click', goToDashboard);

  // 分步弹窗
  document.getElementById('btn-open-modal').addEventListener('click', openModal);
  document.getElementById('skip-steps').addEventListener('click', goToDashboard);
  document.getElementById('modal-next-1').addEventListener('click', () => goStep(2));
  document.getElementById('modal-back-2').addEventListener('click', () => goStep(1));
  document.getElementById('modal-next-2').addEventListener('click', () => goStep(3));
  document.getElementById('modal-back-3').addEventListener('click', () => goStep(2));
  document.getElementById('modal-submit').addEventListener('click', submitModal);
  document.getElementById('btn-go-dashboard').addEventListener('click', goToDashboard);

  // 点击遮罩关闭
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

// ── 渲染技能标签 ──
function renderSkillGrid(target, scene) {
  const container = document.getElementById(`skill-grid-${target}`);
  if (!container) return;
  const skills = SCENE_CONTENT[scene].skills;
  const customList = target === 'full' ? customSkillsFull : customSkillsModal;

  container.innerHTML = skills.map(s =>
    `<span class="skill-chip" data-skill="${s}">${s}</span>`
  ).join('') + customList.map(s =>
    `<span class="skill-chip selected custom-chip" data-skill="${s}">${s} <span class="chip-remove" data-target="${target}" data-skill="${s}">×</span></span>`
  ).join('');

  container.querySelectorAll('.skill-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip-remove')) {
        removeCustomSkill(target, e.target.dataset.skill);
        return;
      }
      chip.classList.toggle('selected');
    });
  });
}

// ── 渲染角色选项 ──
function renderRoleOptions(target, scene) {
  const container = document.getElementById(`role-options-${target}`);
  if (!container) return;
  const roles = SCENE_CONTENT[scene].roles;

  container.innerHTML = roles.map(r => `
    <label class="role-option" data-role="${r.value}">
      <input type="radio" name="role-${target}" value="${r.value}">
      <div class="role-radio"></div>
      <div class="role-info">
        <div class="role-name">
          ${r.name}
          <span class="role-badge ${r.badge}">${r.badgeText}</span>
        </div>
        <div class="role-desc">${r.desc}</div>
      </div>
    </label>
  `).join('');

  container.querySelectorAll('.role-option').forEach(opt => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.role-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input[type="radio"]').checked = true;
    });
  });
}

// ── 场景切换 ──
function bindSceneToggle(toggleId, target) {
  const toggle = document.getElementById(toggleId);
  if (!toggle) return;
  toggle.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggle.querySelectorAll('.scene-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scene = btn.dataset.scene;
      currentScene = scene;
      applySceneContent(target, scene);
    });
  });
}

function applySceneContent(target, scene) {
  const c = SCENE_CONTENT[scene];
  if (target === 'full') {
    document.getElementById('skill-section-title-full').textContent = c.skillTitle;
    document.getElementById('skill-section-desc-full').textContent = c.skillDesc;
    document.getElementById('role-section-title-full').textContent = c.roleTitle;
    document.getElementById('role-section-desc-full').textContent = c.roleDesc;
  } else {
    document.getElementById('skill-step-title').textContent = c.skillTitle;
    document.getElementById('skill-step-desc').textContent = c.skillDesc;
    document.getElementById('role-step-title').textContent = c.roleTitle;
    document.getElementById('role-step-desc').textContent = c.roleDesc;
  }
  renderSkillGrid(target, scene);
  renderRoleOptions(target, scene);
}

// ── 自定义技能 ──
function bindCustomSkill(target) {
  const input = document.getElementById(`custom-skill-input-${target}`);
  const btn = document.getElementById(`btn-add-skill-${target}`);
  if (!input || !btn) return;

  const add = () => {
    const val = input.value.trim();
    if (!val) return;
    const list = target === 'full' ? customSkillsFull : customSkillsModal;
    if (list.includes(val) || SCENE_CONTENT[currentScene].skills.includes(val)) {
      showToast('该技能已存在', 'warning');
      return;
    }
    if (list.length >= 5) { showToast('最多添加 5 个自定义技能', 'warning'); return; }
    list.push(val);
    input.value = '';
    renderSkillGrid(target, currentScene);
  };

  btn.addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
}

function removeCustomSkill(target, skill) {
  if (target === 'full') {
    customSkillsFull = customSkillsFull.filter(s => s !== skill);
  } else {
    customSkillsModal = customSkillsModal.filter(s => s !== skill);
  }
  renderSkillGrid(target, currentScene);
}

// ── 获取选中技能 ──
function getSelectedSkills(target) {
  return [...document.querySelectorAll(`#skill-grid-${target} .skill-chip.selected`)].map(c => c.dataset.skill);
}

// ── 获取选中角色 ──
function getSelectedRole(target) {
  const checked = document.querySelector(`#role-options-${target} input[type="radio"]:checked`);
  return checked ? checked.value : null;
}

// ── 整页表单提交 ──
function submitFull() {
  const skills = getSelectedSkills('full');
  const role = getSelectedRole('full');
  if (!role) { showToast('请选择你的角色', 'warning'); return; }
  saveOnboarding({ scene: currentScene, skills, role });
  showToast('设置已保存！', 'success');
  setTimeout(goToDashboard, 800);
}

// ── 分步弹窗 ──
function openModal() {
  currentStep = 1;
  updateStepUI(1);
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function goStep(step) {
  currentStep = step;
  updateStepUI(step);
}

function updateStepUI(step) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`modal-step-${i}`).classList.toggle('active', i === step);
    const dot = document.getElementById(`sdot-${i}`);
    dot.classList.toggle('active', i === step);
    dot.classList.toggle('done', i < step);
  });
  [1, 2].forEach(i => {
    document.getElementById(`sline-${i}`).classList.toggle('done', i < step);
  });
  document.getElementById('modal-done').classList.remove('show');
}

function submitModal() {
  const skills = getSelectedSkills('modal');
  const role = getSelectedRole('modal');
  if (!role) { showToast('请选择你的角色', 'warning'); return; }
  saveOnboarding({ scene: currentScene, skills, role });

  // 隐藏步骤，显示完成
  [1, 2, 3].forEach(i => document.getElementById(`modal-step-${i}`).classList.remove('active'));
  const c = SCENE_CONTENT[currentScene];
  document.getElementById('done-title').textContent = c.doneTitle;
  document.getElementById('done-desc').textContent = c.doneDesc;
  document.getElementById('modal-done').classList.add('show');
  [1, 2, 3].forEach(i => document.getElementById(`sdot-${i}`).classList.add('done'));
  [1, 2].forEach(i => document.getElementById(`sline-${i}`).classList.add('done'));
}

// ── 保存数据 ──
function saveOnboarding(data) {
  const session = typeof Session !== 'undefined' ? Session.get() : null;
  if (session) {
    const users = JSON.parse(localStorage.getItem('tm_users') || '[]');
    const idx = users.findIndex(u => u.id === session.id);
    if (idx !== -1) {
      users[idx].skills = data.skills;
      users[idx].role = data.role;
      users[idx].scene = data.scene;
      users[idx].onboarded = true;
      localStorage.setItem('tm_users', JSON.stringify(users));
      Session.set(users[idx]);
    }
  }
  sessionStorage.removeItem('ob_pending_user');
}

function goToDashboard() {
  window.location.href = 'dashboard.html';
}
