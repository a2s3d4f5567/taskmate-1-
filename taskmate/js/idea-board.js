// idea-board.js — 思路白板页面逻辑（安全代理版）v3
// API Key 仅存于服务端 .env，前端通过 localhost:3001 代理访问 DeepSeek

var _ibGroupId = null;
var _ibGroup = null;
var _ibCurrentUser = null;
var _ideas = [];
var _lastOutline = '';
var _mindMapData = null;
var _proxyOnline = false;

// ── 初始化 ──
function initIdeaBoard() {
  seedDemoData();
  _ibCurrentUser = Session.require();
  if (!_ibCurrentUser) return;

  var params = new URLSearchParams(location.search);
  _ibGroupId = params.get('groupId');
  if (!_ibGroupId) { window.location.href = 'dashboard.html'; return; }

  _ibGroup = Groups.findById(_ibGroupId);
  if (!_ibGroup) { showToast('小组不存在', 'error'); setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500); return; }

  document.getElementById('back-to-group').href = 'group.html?id=' + _ibGroupId;
  document.getElementById('ib-group-name').textContent = '💡 ' + _ibGroup.name + ' · 思路白板';
  document.getElementById('ib-group-meta').textContent =
    (_ibGroup.course || '') + ' · ' + _ibGroup.members.length + ' 位成员';

  document.getElementById('navbar-avatar').innerHTML = renderAvatar(_ibCurrentUser.name, 'sm');
  document.getElementById('navbar-name').textContent = _ibCurrentUser.name;
  document.getElementById('input-avatar').innerHTML = renderAvatar(_ibCurrentUser.name, 'sm');

  loadIdeas();
  renderIdeas();
  refreshProxyStatus();
  updateStats();

  setInterval(refreshProxyStatus, 30000);

  document.getElementById('idea-input').addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); submitIdea(); }
  });
}

// ── 代理状态 ──
async function refreshProxyStatus() {
  var dot = document.getElementById('proxy-dot');
  var text = document.getElementById('proxy-status-text');
  var tip = document.getElementById('proxy-tip');
  if (!dot) return;
  dot.className = 'proxy-status-dot checking';
  text.textContent = '检测中...';
  try {
    var health = await checkProxyHealth();
    _proxyOnline = health.online;
    if (health.online && health.hasKey) {
      dot.className = 'proxy-status-dot online';
      text.textContent = '在线，API Key 已配置';
      tip.textContent = '一切就绪，可以使用 AI 功能';
    } else if (health.online && !health.hasKey) {
      dot.className = 'proxy-status-dot offline';
      text.textContent = '在线，但未配置 API Key';
      tip.textContent = '请在 .env 文件中设置 DEEPSEEK_API_KEY 后重启服务';
    } else {
      dot.className = 'proxy-status-dot offline';
      text.textContent = '代理服务未启动';
      tip.textContent = '请运行 node server.js 或双击 start.bat 启动代理';
    }
  } catch (err) {
    dot.className = 'proxy-status-dot offline';
    text.textContent = '无法连接';
    tip.textContent = '请确保代理运行在 http://localhost:3001';
  }
}

// ── 数据加载 ──
function loadIdeas() {
  _ideas = Ideas.forGroup(_ibGroupId);
  _ideas.sort(function(a, b) { return b.createdAt - a.createdAt; });
}

function saveIdeas() { loadIdeas(); renderIdeas(); updateStats(); }

function updateStats() {
  var countEl = document.getElementById('hero-idea-count');
  if (countEl) { countEl.textContent = _ideas.length; }
}

function quickAsk(question) {
  var input = document.getElementById('ask-input');
  if (input) { input.value = question; sendAskQuestion(); }
}

// ── 思路 CRUD ──
function submitIdea() {
  var input = document.getElementById('idea-input');
  var content = input.value.trim();
  if (!content) { showToast('请输入思路内容', 'error'); return; }
  Ideas.create({
    groupId: _ibGroupId, authorId: _ibCurrentUser.id,
    authorName: _ibCurrentUser.name, content: content
  });
  input.value = '';
  saveIdeas();
  showToast('思路已记录 ✨', 'success');
}
function deleteIdea(ideaId) {
  if (!confirm('确定删除这条思路吗？')) return;
  Ideas.delete(ideaId); saveIdeas(); showToast('已删除', 'info');
}

// ── 便签渲染 ──
function renderIdeas() {
  var container = document.getElementById('idea-list');
  var emptyEl = document.getElementById('ideas-empty');
  if (_ideas.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyEl);
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  container.innerHTML = _ideas.map(function(idea, idx) {
    var author = Users.findById(idea.authorId);
    var authorName = idea.authorName || (author ? author.name : '未知');
    var time = formatRelativeTime(idea.createdAt);
    var colorClass = getIdeaColor(idx);
    return '<div class="idea-sticky ' + colorClass + '" data-id="' + idea.id + '">' +
      '<div class="sticky-header">' +
        renderAvatar(authorName, 'sm') +
        '<span class="sticky-author">' + escHtml(authorName) + '</span>' +
        '<span class="sticky-time">' + time + '</span>' +
        '<button type="button" class="sticky-delete" onclick="event.stopPropagation();deleteIdea(\'' + idea.id + '\')" title="删除">🗑️</button>' +
      '</div>' +
      '<div class="sticky-body">' + escHtml(idea.content) + '</div>' +
      '<div class="sticky-footer"><span class="sticky-id">#' + (_ideas.length - idx) + '</span></div>' +
    '</div>';
  }).join('');
}
function getIdeaColor(idx) {
  var colors = ['sticky-yellow', 'sticky-pink', 'sticky-blue', 'sticky-green', 'sticky-lavender'];
  return colors[idx % colors.length];
}

// ── AI 功能入口 ──
async function runGenerateOutline() {
  if (_ideas.length === 0) { showToast('请先在左侧写下一些思路', 'error'); return; }
  showAILoading('正在分析所有思路，生成结构化大纲...');
  openResultSection('📋', 'AI 生成大纲');
  try {
    var ideas = _ideas.map(function(i) {
      return { author: i.authorName || (Users.findById(i.authorId) ? Users.findById(i.authorId).name : '未知'), content: i.content };
    });
    ideas.reverse();
    var outline = await generateOutline(ideas, '小组：' + _ibGroup.name + '，课程：' + (_ibGroup.course || ''));
    _lastOutline = outline;
    showAIResult(outline);
    document.getElementById('btn-mindmap').disabled = false;
    document.getElementById('btn-mindmap').classList.remove('disabled');
    document.getElementById('btn-mindmap').title = '';
    document.getElementById('result-footer').innerHTML =
      '<button type="button" class="btn btn-secondary btn-sm" onclick="copyResult()">📋 复制</button>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="runGenerateMindMap()">🧠 转为思维导图</button>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="runGenerateAssignment()">👥 智能分工</button>';
    document.getElementById('result-footer').classList.remove('hidden');
  } catch (err) { showAIError(err.message); }
}

async function runGenerateMindMap() {
  if (!_lastOutline) { showToast('请先生成大纲', 'error'); return; }
  showAILoading('正在将大纲转换为思维导图...');
  openResultSection('🧠', '思维导图');
  try {
    var mindMapData = await generateMindMap(_lastOutline);
    _mindMapData = mindMapData;
    document.getElementById('result-footer').innerHTML =
      '<button type="button" class="btn btn-secondary btn-sm" onclick="copyResult()">📋 复制</button>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="openMindMapModal()">🖼️ 打开可视化导图</button>';
    document.getElementById('result-footer').classList.remove('hidden');
    showAIResult(
      '<div class="mindmap-preview" style="text-align:center;padding:20px">' +
        '<div style="font-size:17px;font-weight:700;color:#1f2937;margin-bottom:12px">🧠 思维导图数据已生成</div>' +
        '<p style="color:#6b7280;font-size:13px">根主题：<strong>' + escHtml(mindMapData.title) + '</strong>，' +
        '包含 ' + (mindMapData.nodes ? mindMapData.nodes.length : 0) + ' 个一级分支</p>' +
        '<p style="color:#9ca3af;font-size:12px;margin-top:8px">点击下方按钮查看可视化导图</p>' +
      '</div>'
    );
  } catch (err) { showAIError('思维导图生成失败：' + err.message); }
}

async function runGenerateAssignment() {
  if (_ideas.length === 0) { showToast('请先在左侧写下一些思路', 'error'); return; }
  showAILoading('正在分析成员擅长领域和任务大纲...');
  openResultSection('👥', '智能分工建议');
  try {
    var outlineText = _lastOutline || _ideas.map(function(i) { return '- [' + (i.authorName || '未知') + '] ' + i.content; }).join('\n');
    var members = _ibGroup.members.map(function(m) {
      var u = Users.findById(m.userId);
      return { name: u ? u.name : '未知', skills: u ? (u.skills || []) : [] };
    });
    var assignment = await generateTaskAssignment(outlineText, members);
    showAIResult(assignment);
    document.getElementById('result-footer').innerHTML =
      '<button type="button" class="btn btn-secondary btn-sm" onclick="copyResult()">📋 复制</button>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="applyAssignment()">✅ 跳转到小组创建任务</button>';
    document.getElementById('result-footer').classList.remove('hidden');
  } catch (err) { showAIError(err.message); }
}

// ── AI 结果展示 ──
function showAILoading(text) {
  document.getElementById('ai-loading').classList.remove('hidden');
  document.getElementById('ai-loading-text').textContent = text;
  document.getElementById('ai-result-content').innerHTML = '';
  document.getElementById('result-footer').classList.add('hidden');
}
function showAIResult(html) {
  document.getElementById('ai-loading').classList.add('hidden');
  document.getElementById('ai-result-content').innerHTML = html;
}
function showAIError(msg) {
  document.getElementById('ai-loading').classList.add('hidden');
  document.getElementById('ai-result-content').innerHTML =
    '<div style="padding:20px;text-align:center;color:#ef4444">' +
      '<div style="font-size:28px;margin-bottom:10px">⚠️</div>' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:6px">' + escHtml(msg) + '</div>' +
      '<div style="font-size:12px;color:#9ca3af">请检查代理服务是否正常运行</div>' +
    '</div>';
  document.getElementById('result-footer').classList.add('hidden');
}
function openResultSection(icon, title) {
  var section = document.getElementById('ai-result-section');
  section.classList.remove('hidden');
  document.getElementById('result-label').textContent = icon + ' ' + title;
  section.scrollIntoView({ behavior: 'smooth' });
}
function copyResult() {
  var content = document.getElementById('ai-result-content').innerText;
  navigator.clipboard.writeText(content).then(
    function() { showToast('已复制到剪贴板', 'success'); },
    function() { showToast('复制失败', 'error'); }
  );
}

// ── 思维导图可视化 ──
var _mmZoom = 1, _mmPanX = 0, _mmPanY = 0;
function openMindMapModal() {
  if (!_mindMapData) { showToast('请先生成思维导图', 'error'); return; }
  document.getElementById('mindmap-title').textContent = '🧠 ' + _mindMapData.title;
  openModal('mindmap-modal'); _mmZoom = 1; _mmPanX = 0; _mmPanY = 0;
  setTimeout(function() { renderMindMap(); }, 100);
}
function mindmapZoomIn() { _mmZoom = Math.min(_mmZoom + 0.2, 3); renderMindMap(); }
function mindmapZoomOut() { _mmZoom = Math.max(_mmZoom - 0.2, 0.3); renderMindMap(); }
function mindmapReset() { _mmZoom = 1; _mmPanX = 0; _mmPanY = 0; renderMindMap(); }
function mindmapExpandAll() {
  document.querySelectorAll('#mindmap-svg .mm-collapsed').forEach(function(el) { el.classList.remove('mm-collapsed'); });
}
function mindmapCollapseAll() {
  document.querySelectorAll('#mindmap-svg g.mm-node').forEach(function(el, i) { if (i > 0) el.classList.add('mm-collapsed'); });
}
function renderMindMap() {
  var svg = document.getElementById('mindmap-svg');
  var container = document.getElementById('mindmap-container');
  var w = container.clientWidth || 900, h = container.clientHeight || 500;
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.style.width = '100%'; svg.style.height = '100%';
  var rootX = w / 2, rootY = 50, levelGap = 140, nodeW = 140, nodeH = 36;
  var html = '<g transform="translate(' + _mmPanX + ',' + _mmPanY + ') scale(' + _mmZoom + ')">';
  html += renderMmNode(rootX - nodeW / 2, rootY, nodeW, nodeH, _mindMapData.title, 'root', true, 0);
  if (_mindMapData.nodes) {
    var totalN = _mindMapData.nodes.length, startY = rootY + 90;
    _mindMapData.nodes.forEach(function(node, i) { html += renderMmBranch(rootX, rootY + nodeH, node, i, totalN, startY, levelGap, 1); });
  }
  html += '</g>'; svg.innerHTML = html;
  svg.querySelectorAll('.mm-toggle').forEach(function(el) {
    el.addEventListener('click', function(e) { e.stopPropagation(); var g = el.closest('g.mm-node'); if (g) g.classList.toggle('mm-collapsed'); });
  });
}
function renderMmNode(x, y, w, h, text, cls, hasChildren, level) {
  var radius = 8, textColor = level === 0 ? '#fff' : '#3d2614';
  var fills = ['#6b8cce', '#e8736a', '#5aab85', '#c9a84c', '#9b6bc0', '#4ea7c0'];
  var fill = level === 0 ? '#3d2614' : fills[(level - 1) % fills.length];
  var html = '<g class="mm-node ' + cls + '" data-level="' + level + '">' +
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="' + fill + '" opacity="0.9"/>' +
    '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" fill="' + textColor + '" font-size="' + (level === 0 ? 15 : 12) + '" font-family="\'Noto Serif SC\',serif">' + escHtml(text) + '</text>';
  if (hasChildren) html += '<circle class="mm-toggle" cx="' + (x + w) + '" cy="' + (y + h / 2) + '" r="8" fill="#fff" stroke="' + fill + '" stroke-width="1.5" style="cursor:pointer"/>' +
    '<text x="' + (x + w) + '" y="' + (y + h / 2 + 3) + '" text-anchor="middle" font-size="10" fill="' + fill + '" style="cursor:pointer;pointer-events:none">▼</text>';
  html += '</g>'; return html;
}
function renderMmBranch(px, py, node, idx, total, startY, gapX, level) {
  var nw = 130, nh = 32, x = px + gapX, totalH = total * 50, y = startY + idx * 50 - totalH / 2 + 25;
  var html = '<line x1="' + px + '" y1="' + (py + 10) + '" x2="' + x + '" y2="' + (y + nh / 2) + '" stroke="#c9a84c" stroke-width="1.5" opacity="0.6"/>';
  var hc = node.nodes && node.nodes.length > 0;
  html += renderMmNode(x, y, nw, nh, node.text, 'level-' + level, hc, level);
  if (hc && level < 3) node.nodes.forEach(function(c, ci) { html += renderMmBranch(x + nw, y + nh / 2 - 16, c, ci, node.nodes.length, y, gapX * 0.9, level + 1); });
  return html;
}

// ── AI 问答 ──
var _askHistory = [];
function toggleAskPanel() { openModal('ask-modal'); renderAskHistory(); }
function renderAskHistory() {
  var container = document.getElementById('ask-chat');
  if (_askHistory.length === 0) {
    container.innerHTML = '<div class="ask-welcome"><div class="ask-welcome-icon">🤖</div>' +
      '<div class="ask-welcome-title">基于白板讨论，向我提问</div>' +
      '<div class="ask-examples">' +
        '<button type="button" class="ask-chip" onclick="quickAsk(\'这些思路有什么遗漏？\')">💡 有什么遗漏？</button>' +
        '<button type="button" class="ask-chip" onclick="quickAsk(\'有哪些可优化的点？\')">🔧 如何优化？</button>' +
        '<button type="button" class="ask-chip" onclick="quickAsk(\'给方案打个分并说明理由\')">⭐ 打个分</button>' +
        '<button type="button" class="ask-chip" onclick="quickAsk(\'帮我们把思路概括成三句话\')">📝 三句话概括</button>' +
      '</div></div>';
  } else {
    container.innerHTML = _askHistory.map(function(msg) {
      return '<div class="ask-msg ' + msg.role + '"><div class="ask-msg-avatar">' + (msg.role === 'user' ? '👤' : '🤖') + '</div>' +
        '<div class="ask-msg-content">' + escHtml(msg.content) + '</div></div>';
    }).join('');
    container.scrollTop = container.scrollHeight;
  }
}
async function sendAskQuestion() {
  var input = document.getElementById('ask-input'), question = input.value.trim();
  if (!question) return;
  if (_ideas.length === 0) { showToast('白板上还没有思路', 'error'); return; }
  _askHistory.push({ role: 'user', content: question }); input.value = ''; renderAskHistory();
  _askHistory.push({ role: 'assistant', content: '思考中...' }); renderAskHistory();
  try {
    var ideas = _ideas.map(function(i) { return { author: i.authorName || (Users.findById(i.authorId) ? Users.findById(i.authorId).name : '未知'), content: i.content }; });
    _askHistory[_askHistory.length - 1].content = await askAIOnIdeas(ideas.reverse(), question);
  } catch (err) { _askHistory[_askHistory.length - 1].content = '错误：' + err.message; }
  renderAskHistory();
}

function applyAssignment() {
  if (confirm('智能分工将作为参考。是否跳转到小组页面手动创建任务？\n\nAI 已给出最优分配方案。')) {
    window.location.href = 'group.html?id=' + _ibGroupId;
  }
}

// ── 工具函数 ──
function formatRelativeTime(ts) {
  var diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
  return new Date(ts).toLocaleDateString('zh-CN');
}
function renderAvatar(name, size) {
  var initial = name ? name.charAt(0) : '?';
  var colors = ['#6b8cce', '#e8736a', '#5aab85', '#c9a84c', '#9b6bc0', '#4ea7c0'];
  var color = colors[Math.abs(hashCode(name)) % colors.length];
  var px = size === 'sm' ? '28' : size === 'md' ? '36' : size === 'lg' ? '56' : '28';
  return '<div class="avatar" style="width:' + px + 'px;height:' + px + 'px;background:' + color + ';display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-size:' + (parseInt(px) * 0.45) + 'px;font-weight:600;flex-shrink:0">' + escHtml(initial) + '</div>';
}
function hashCode(str) { if (!str) return 0; var h = 0; for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return Math.abs(h); }
function escHtml(str) { if (!str) return ''; var d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; }
function showToast(msg, type, duration) {
  var c = document.getElementById('toast-container'); if (!c) return;
  var t = document.createElement('div'); t.className = 'toast toast-' + (type || 'info'); t.textContent = msg; c.appendChild(t);
  setTimeout(function() { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(function() { t.remove(); }, 300); }, duration || 2500);
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.addEventListener('click', function(e) { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active'); });