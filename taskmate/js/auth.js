// auth.js — 注册/登录逻辑

function initAuthPage() {
  seedDemoData();

  if (Session.get()) {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('tab-login').addEventListener('click', () => switchTab('login'));
  document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);

  document.getElementById('demo-login').addEventListener('click', () => {
    document.getElementById('login-email').value = 'alice@demo.com';
    document.getElementById('login-password').value = 'demo123';
    handleLogin(null, true);
  });
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('login-form').classList.toggle('hidden', !isLogin);
  document.getElementById('register-form').classList.toggle('hidden', isLogin);
  clearErrors();
}

function handleLogin(e, isDemo = false) {
  if (e) e.preventDefault();
  clearErrors();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email) { showError('login-email-error', '请输入邮箱'); return; }
  if (!password) { showError('login-password-error', '请输入密码'); return; }

  const user = Users.findByEmail(email);
  if (!user || user.password !== btoa(password)) {
    showError('login-password-error', '邮箱或密码错误');
    return;
  }

  Session.set(user);
  showToast('登录成功，欢迎回来！', 'success');
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
}

function handleRegister(e) {
  e.preventDefault();
  clearErrors();

  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;

  if (!name || name.length < 4 || name.length > 20) {
    showError('reg-name-error', '用户名需为 4–20 位字母、数字或下划线'); return;
  }
  if (!/^[a-zA-Z0-9_一-龥]+$/.test(name)) {
    showError('reg-name-error', '用户名只能包含字母、数字、下划线或中文'); return;
  }
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    showError('reg-phone-error', '请输入有效的手机号'); return;
  }
  if (password.length < 8) {
    showError('reg-password-error', '密码至少 8 位'); return;
  }
  if (password !== confirm) {
    showError('reg-confirm-error', '两次密码不一致'); return;
  }

  // 用手机号作为唯一标识（复用 email 字段存储）
  if (Users.findByEmail(phone)) {
    showError('reg-phone-error', '该手机号已被注册'); return;
  }

  const user = Users.create({ name, email: phone, password: btoa(password), phone });
  Session.set(user);
  showToast('注册成功，正在为你个性化设置…', 'success');
  setTimeout(() => { window.location.href = 'onboarding.html'; }, 600);
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => { el.textContent = ''; el.classList.add('hidden'); });
  document.querySelectorAll('.form-input').forEach(el => el.classList.remove('error'));
}
