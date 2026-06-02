// ai-chatbot.js — 右下角 AI 助手悬浮组件
// 基于 DeepSeek，通过 localhost:3001 代理访问

(function() {

var _botMessages = [];
var _botVisible = false;
var _botInitialized = false;
var _botContext = '';

function initAIBot() {
  if (_botInitialized) return;
  _botInitialized = true;

  var style = document.createElement('style');
  style.textContent = [
    '.aicb-float{position:fixed;bottom:28px;right:28px;z-index:9999;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#4F6EF7,#7C3AED);border:none;cursor:pointer;box-shadow:0 6px 24px rgba(79,110,247,0.4);display:flex;align-items:center;justify-content:center;font-size:26px;transition:transform 0.25s,box-shadow 0.25s;color:#fff}',
    '.aicb-float:hover{transform:scale(1.08);box-shadow:0 8px 30px rgba(79,110,247,0.55)}',
    '.aicb-float.pulse{animation:aicbPulse 2s ease-in-out infinite}',
    '@keyframes aicbPulse{0%,100%{box-shadow:0 6px 24px rgba(79,110,247,0.4)}50%{box-shadow:0 6px 36px rgba(124,58,237,0.7),0 0 0 8px rgba(79,110,247,0.15)}}',
    '.aicb-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:#EF4444;border-radius:50%;font-size:11px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700}',
    '.aicb-panel{position:fixed;bottom:100px;right:28px;z-index:9998;width:400px;max-width:calc(100vw - 56px);height:560px;max-height:calc(100vh - 140px);background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;transform:translateY(20px) scale(0.95);opacity:0;pointer-events:none;transition:transform 0.3s cubic-bezier(0.16,1,0.3,1),opacity 0.3s}',
    '.aicb-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:all}',
    '.aicb-header{background:linear-gradient(135deg,#4F6EF7,#7C3AED);color:#fff;padding:16px 18px;display:flex;align-items:center;gap:10px}',
    '.aicb-header-avatar{width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}',
    '.aicb-header-text{flex:1}',
    '.aicb-header-title{font-weight:700;font-size:15px}',
    '.aicb-header-sub{font-size:11px;opacity:0.8}',
    '.aicb-header-close{background:rgba(255,255,255,0.2);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}',
    '.aicb-header-close:hover{background:rgba(255,255,255,0.35)}',
    '.aicb-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:#f9fafb}',
    '.aicb-msg{display:flex;gap:8px;animation:aicbMsgIn 0.3s ease}',
    '@keyframes aicbMsgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    '.aicb-msg.bot{flex-direction:row}',
    '.aicb-msg.user{flex-direction:row-reverse}',
    '.aicb-msg-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}',
    '.aicb-msg.bot .aicb-msg-avatar{background:#ede9fe;color:#7c3aed}',
    '.aicb-msg.user .aicb-msg-avatar{background:#eef2ff;color:#4f6ef7}',
    '.aicb-msg-content{max-width:80%;padding:10px 14px;border-radius:16px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}',
    '.aicb-msg.bot .aicb-msg-content{background:#fff;border:1px solid #e5e7eb}',
    '.aicb-msg.user .aicb-msg-content{background:#4f6ef7;color:#fff}',
    '.aicb-msg-typing .aicb-msg-content{background:#fff;border:1px solid #e5e7eb;color:#9ca3af}',
    '.aicb-footer{padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;display:flex;gap:8px}',
    '.aicb-input{flex:1;border:1px solid #e5e7eb;border-radius:12px;padding:9px 14px;font-size:13px;font-family:inherit;outline:none;resize:none;min-height:40px;max-height:100px}',
    '.aicb-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}',
    '.aicb-send{background:#4f6ef7;color:#fff;border:none;border-radius:12px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;transition:background 0.15s}',
    '.aicb-send:hover{background:#3b56d9}',
    '.aicb-send:disabled{opacity:0.5;cursor:not-allowed}',
    '.aicb-quick-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 8px;background:#fff}',
    '.aicb-quick-btn{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:20px;padding:6px 14px;font-size:11px;cursor:pointer;font-family:inherit;color:#374151;transition:all 0.15s;white-space:nowrap}',
    '.aicb-quick-btn:hover{background:#6366f1;color:#fff;border-color:#6366f1}',
    '@media(max-width:500px){.aicb-panel{width:calc(100vw - 32px);right:16px;bottom:90px}.aicb-float{right:16px;bottom:20px}}'
  ].join('');
  document.head.appendChild(style);

  var floatBtn = document.createElement('button');
  floatBtn.className = 'aicb-float pulse';
  floatBtn.innerHTML = '🤖';
  floatBtn.title = 'AI 助手 · 点击提问';
  floatBtn.onclick = toggleBotPanel;
  document.body.appendChild(floatBtn);

  var panel = document.createElement('div');
  panel.className = 'aicb-panel';
  panel.id = 'aicb-panel';
  panel.innerHTML =
    '<div class="aicb-header">' +
      '<div class="aicb-header-avatar">🤖</div>' +
      '<div class="aicb-header-text">' +
        '<div class="aicb-header-title">TaskMate AI 助手</div>' +
        '<div class="aicb-header-sub">Powered by DeepSeek</div>' +
      '</div>' +
      '<button class="aicb-header-close" onclick="window._closeAIBot()">×</button>' +
    '</div>' +
    '<div class="aicb-quick-actions" id="aicb-quick-actions">' +
      '<button class="aicb-quick-btn" onclick="window._quickBotAsk(\'我有哪些即将截止的任务？\')">📋 即将截止</button>' +
      '<button class="aicb-quick-btn" onclick="window._quickBotAsk(\'帮我总结各小组的进度\')">📊 小组进度</button>' +
      '<button class="aicb-quick-btn" onclick="window._quickBotAsk(\'今天有什么需要我优先处理的？\')">⚡ 今日优先</button>' +
      '<button class="aicb-quick-btn" onclick="window._quickBotAsk(\'给一些提高协作效率的建议\')">💡 效率建议</button>' +
    '</div>' +
    '<div class="aicb-body" id="aicb-body">' +
      '<div class="aicb-msg bot">' +
        '<div class="aicb-msg-avatar">🤖</div>' +
        '<div class="aicb-msg-content">你好！我是 TaskMate 的 AI 助手，基于 DeepSeek。你可以问我任何关于小组作业的问题，或者直接下达命令。</div>' +
      '</div>' +
    '</div>' +
    '<div class="aicb-footer">' +
      '<textarea class="aicb-input" id="aicb-input" rows="1" placeholder="输入问题或命令..." onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();window._sendBotMsg()}"></textarea>' +
      '<button class="aicb-send" id="aicb-send-btn" onclick="window._sendBotMsg()">发送</button>' +
    '</div>';
  document.body.appendChild(panel);

  window._toggleAIBot = toggleBotPanel;
  window._closeAIBot = closeBotPanel;
  window._sendBotMsg = sendBotMessage;
  window._quickBotAsk = quickBotAsk;
}

function toggleBotPanel() {
  var panel = document.getElementById('aicb-panel');
  if (!panel) return;
  _botVisible = !_botVisible;
  panel.classList.toggle('open', _botVisible);
  if (_botVisible) {
    setTimeout(function() {
      var input = document.getElementById('aicb-input');
      if (input) input.focus();
    }, 350);
  }
}

function closeBotPanel() {
  var panel = document.getElementById('aicb-panel');
  if (panel) { panel.classList.remove('open'); _botVisible = false; }
}

function addBotMessage(role, content) {
  _botMessages.push({ role: role, content: content });
  var body = document.getElementById('aicb-body');
  if (!body) return;
  var div = document.createElement('div');
  div.className = 'aicb-msg ' + role;
  div.innerHTML = '<div class="aicb-msg-avatar">' + (role === 'user' ? '👤' : '🤖') + '</div>' +
    '<div class="aicb-msg-content">' + escHtml(content) + '</div>';
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function addTypingIndicator() {
  var body = document.getElementById('aicb-body');
  if (!body) return;
  var div = document.createElement('div');
  div.className = 'aicb-msg bot aicb-msg-typing';
  div.id = 'aicb-typing';
  div.innerHTML = '<div class="aicb-msg-avatar">🤖</div><div class="aicb-msg-content">思考中...</div>';
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function removeTypingIndicator() {
  var el = document.getElementById('aicb-typing');
  if (el) el.remove();
}

async function sendBotMessage() {
  var input = document.getElementById('aicb-input');
  var btn = document.getElementById('aicb-send-btn');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  btn.disabled = true;
  addBotMessage('user', text);
  addTypingIndicator();
  try {
    var contextSummary = buildContextSummary();
    var systemPrompt = '你是 TaskMate 的 AI 助手，基于 DeepSeek。你帮助用户管理小组作业、任务和协作。回复请简洁、友好、有建设性。';
    var userPrompt = '当前系统状态：\n' + contextSummary + '\n\n用户问题/命令：' + text;
    var resp = await fetch('http://localhost:3001/api/deepseek/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 1500, temperature: 0.7 }),
      signal: AbortSignal.timeout(45000)
    });
    var data = await resp.json();
    removeTypingIndicator();
    if (data.success) addBotMessage('bot', data.content);
    else addBotMessage('bot', '抱歉，请求出错了：' + (data.error || '未知错误'));
  } catch (err) {
    removeTypingIndicator();
    var msg = err.message || '网络错误';
    if (msg.indexOf('Failed to fetch') > -1) msg = '无法连接到 AI 代理服务。请确保已运行 node server.js 或 start.bat';
    addBotMessage('bot', '⚠️ ' + msg);
  }
  btn.disabled = false;
}

function quickBotAsk(question) {
  var input = document.getElementById('aicb-input');
  if (input) { input.value = question; }
  var panel = document.getElementById('aicb-panel');
  if (panel && !_botVisible) {
    _botVisible = true;
    panel.classList.add('open');
    setTimeout(function() { sendBotMessage(); }, 400);
  } else {
    sendBotMessage();
  }
}

function buildContextSummary() {
  var user = (typeof Session !== 'undefined' && Session.get) ? Session.get() : null;
  if (!user) return '用户未登录';
  var groups = (typeof Groups !== 'undefined' && Groups.forUser) ? Groups.forUser(user.id) : [];
  var tasks = (typeof Tasks !== 'undefined' && Tasks.forUser) ? Tasks.forUser(user.id) : [];
  var summary = '当前用户：' + (user.name || '未知') + '\n';
  summary += '小组数量：' + groups.length + '\n';
  groups.forEach(function(g) {
    var gtasks = (typeof Tasks !== 'undefined' && Tasks.forGroup) ? Tasks.forGroup(g.id) : [];
    var done = gtasks.filter(function(t) { return t.status === 'done'; });
    var total = gtasks.length;
    summary += '- ' + g.name + '：' + total + ' 个任务，' + (total ? Math.round((done.length / total) * 100) : 0) + '% 完成\n';
  });
  if (tasks.length > 0) {
    var pending = tasks.filter(function(t) { return t.status !== 'done' && t.deadline; });
    var urgent = pending.filter(function(t) { return isUrgent && isUrgent(t.deadline); });
    summary += '你个人待完成：' + tasks.filter(function(t) { return t.status !== 'done'; }).length + ' 个，紧急：' + urgent.length + ' 个\n';
  }
  return summary;
}

function escHtml(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAIBot);
} else {
  initAIBot();
}

})();