// deepseek.js — DeepSeek API 集成模块（安全代理版）
//
// 安全架构：
//   浏览器 ──→ 本地代理服务(localhost:3001) ──→ DeepSeek API
//   API Key 仅存在于服务端 .env 文件，绝不暴露到前端
//
// 启动方式：
//   双击 start.bat 或执行 node server.js

// 自动检测代理地址：部署环境走同源 /api，本地开发走 localhost:3001
function getProxyBaseUrl() {
  // 生产环境（非 localhost）使用同源 API，API Key 不会暴露到前端
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return ''; // 同源，直接调用 /api/deepseek
  }
  return 'http://localhost:3001'; // 本地开发走 node server.js 代理
}

function getProxyUrl(path) {
  var base = getProxyBaseUrl();
  if (base === '') {
    return path; // 生产环境直接用 /api/deepseek
  }
  return base + path;
}

// ── 代理服务状态检测 ──
async function checkProxyHealth() {
  try {
    var url;
    var base = getProxyBaseUrl();
    if (base === '') {
      url = '/api/deepseek';
    } else {
      url = base + '/api/health';
    }
    // 生产环境用 GET 请求 /api/deepseek（serverless 函数在 GET 时返回健康检查）
    var resp = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return { online: false, hasKey: false, error: 'HTTP ' + resp.status };
    var data = await resp.json();
    return { online: true, hasKey: !!data.hasKey, status: data.status };
  } catch (err) {
    return { online: false, hasKey: false, error: err.message };
  }
}

// ── 通用代理请求函数 ──
async function callDeepSeek(messages, options = {}) {
  const health = await checkProxyHealth();
  if (!health.online) {
    throw new Error('代理服务未启动，请先运行 node server.js 或双击 start.bat');
  }
  if (!health.hasKey) {
    throw new Error('代理服务已在线，但未配置 API Key。请在 .env 文件中设置 DEEPSEEK_API_KEY 后重启服务');
  }

  var url = getProxyUrl('/api/deepseek');
  var response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7
    }),
    signal: AbortSignal.timeout(60000)
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `请求失败 (${response.status})`);
  }

  return data.content;
}

// ── 1. 思路整理 → 大纲 ──
async function generateOutline(ideas, extraContext = '') {
  const contextStr = extraContext ? `\n\n【补充信息】\n${extraContext}` : '';
  const ideasStr = ideas.map((idea, i) => `${i + 1}. [${idea.author}] ${idea.content}`).join('\n');

  const systemPrompt = `你是一个擅长整理团队讨论思路的 AI 助手。请根据以下团队成员讨论的思路笔记，生成一个结构清晰的大纲。
要求：
1. 用一个简明的标题概括核心主题
2. 按逻辑层次组织大纲（一级标题、二级要点）
3. 用 Markdown 格式输出，使用 ## 作为主标题，### 作为一级大纲，- 作为要点
4. 语言简洁专业，不要添加过多评论
5. 只输出大纲内容，不要加任何开场白或结束语`;

  const userPrompt = `以下是团队讨论中记录的所有思路：\n\n${ideasStr}${contextStr}\n\n请将这些思路整理成一份结构清晰的大纲。`;

  return await callDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);
}

// ── 2. 大纲 → 思维导图 JSON ──
async function generateMindMap(outlineText) {
  const systemPrompt = `你是一个思维导图生成器。请根据下面的大纲文本，生成一个层级结构的思维导图 JSON 数据。
规则：
1. 输出必须是纯 JSON 对象，包含 { title, nodes } 两个字段
2. title 是导图的根主题（字符串）
3. nodes 是一级节点数组，每个节点格式为 { text, nodes: [] }
4. 最多 3 层深度
5. 只输出 JSON，不要加任何 Markdown 代码块标记或其他文字`;

  const userPrompt = `请将以下大纲转换为思维导图 JSON 数据：\n\n${outlineText}`;

  const response = await callDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.3 });

  // 清理可能的 Markdown 代码块
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  return JSON.parse(cleaned);
}

// ── 3. 根据成员擅长领域 + 任务大纲 → 分工建议 ──
async function generateTaskAssignment(outlineText, members) {
  const membersStr = members.map(m => {
    const skills = m.skills?.length > 0 ? m.skills.join('、') : '未标注';
    return `- ${m.name}：擅长 ${skills}`;
  }).join('\n');

  const systemPrompt = `你是一个小组任务分工顾问。请根据任务大纲和团队成员的擅长领域，给出合理的任务分工建议。
要求：
1. 将大纲中的各个任务模块分配给最匹配的成员
2. 在每个分配后面，用 1-2 句话说明分配理由（基于该成员的擅长领域）
3. 如果某个任务模块没有完美匹配的人，也给出最佳人选
4. 输出 Markdown 格式，每个人用 ### 姓名 作为标题，下面列出分配给他的任务和理由
5. 在最前面加一个 ## 分工总览 段落，用表格展示（任务模块 | 负责人 | 理由简述）
6. 语言简洁专业`;

  const userPrompt = `以下是大纲和成员信息：\n\n## 项目大纲\n${outlineText}\n\n## 团队成员\n${membersStr}\n\n请给出合理的任务分工建议。`;

  return await callDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);
}

// ── 5. AI 任务评分 ──
async function evaluateTaskWithAI(task, submissions, comments) {
  var taskInfo = '任务标题：' + (task.title || '') + '\n';
  taskInfo += '任务描述：' + (task.desc || '无') + '\n';
  taskInfo += '任务状态：' + (task.status === 'done' ? '已完成' : '进行中') + '\n';

  var subInfo = '';
  if (submissions && submissions.length) {
    subInfo = '提交版本数：' + submissions.length + '\n';
    var latest = submissions[0];
    subInfo += '最新版本说明：' + (latest.title || '') + '\n';
    subInfo += '文件：' + (latest.fileName || '无') + '\n';
  } else {
    subInfo = '暂未提交版本\n';
  }

  var commentInfo = '';
  if (comments && comments.length) {
    var pending = comments.filter(function(c) { return c.status === 'pending'; }).length;
    var resolved = comments.filter(function(c) { return c.status === 'resolved'; }).length;
    commentInfo = '评论总数：' + comments.length + '，待处理：' + pending + '，已处理：' + resolved + '\n';
    commentInfo += '评论摘要：' + comments.slice(0, 3).map(function(c) { return c.content.slice(0, 80); }).join('; ');
  } else {
    commentInfo = '暂无评论';
  }

  var systemPrompt = '你是一个客观公正的小组作业评分助手。请根据任务信息、提交情况和组员互评，给出一个0-100分的评分，并附上1-2句简短评语。请严格输出JSON格式：{"score": 数字, "comment": "评语"}，不要输出其他内容。';

  var userPrompt = '请评分以下任务：\n\n' + taskInfo + '\n提交情况：\n' + subInfo + '\n互评情况：\n' + commentInfo;

  try {
    var response = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.3, maxTokens: 200 });

    var cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    var result = JSON.parse(cleaned);
    return { score: Math.min(100, Math.max(0, Math.round(result.score || 70))), comment: result.comment || '评分完成' };
  } catch (e) {
    // AI不available时的fallback评分
    var hasSub = submissions && submissions.length > 0;
    var hasComments = comments && comments.length > 0;
    var pendingRate = comments ? comments.filter(function(c) { return c.status === 'pending'; }).length / Math.max(comments.length, 1) : 0;
    var base = 60;
    if (hasSub) base += 15;
    if (hasComments) base += 10;
    base -= Math.round(pendingRate * 15);
    return { score: Math.min(100, Math.max(30, base)), comment: '（AI 不可用，系统根据完成度自动评分）' };
  }
}

// ── 4. 自由问答（针对白板讨论的即时 AI 提问）──
async function askAIOnIdeas(ideas, question) {
  const ideasStr = ideas.map((idea, i) => `${i + 1}. [${idea.author}] ${idea.content}`).join('\n');

  const systemPrompt = `你是一个帮助团队进行思路整理和决策的 AI 助手。你会基于团队已有的讨论记录回答问题。请简洁、直接地回复。`;

  const userPrompt = `团队当前讨论的思路记录：\n\n${ideasStr}\n\n我的问题：${question}`;

  return await callDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);
}