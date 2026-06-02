// server.js — 本地 DeepSeek API 代理服务
// 启动方式：node server.js（必须先 npm install）
// 
// 安全说明：
//   API Key 只存在于服务端 .env 文件中，绝不发送到浏览器
//   前端页面通过 localhost:3001 的代理接口间接访问 DeepSeek

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';

// ── 中间件 ──
app.use(cors({ origin: '*' })); // 开发环境允许所有来源
app.use(express.json({ limit: '1mb' }));

// 静态文件服务（可选：直接通过代理访问前端页面）
app.use(express.static(path.join(__dirname)));

// ── 健康检查 ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasKey: !!DEEPSEEK_API_KEY,
    uptime: process.uptime()
  });
});

// ── DeepSeek 代理接口 ──
app.post('/api/deepseek/proxy', async (req, res) => {
  try {
    // 校验 API Key 是否已配置
    if (!DEEPSEEK_API_KEY) {
      return res.status(503).json({
        error: '服务端未配置 DEEPSEEK_API_KEY。请在 .env 文件中设置。',
        code: 'NO_API_KEY'
      });
    }

    // 获取前端发来的参数
    const { messages, max_tokens, temperature } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: '请求参数错误：messages 不能为空',
        code: 'INVALID_PARAMS'
      });
    }

    console.log(`[Proxy] 收到请求，messages 数量: ${messages.length}`);

    // 转发到 DeepSeek API
    const response = await fetch(DEEPSEEK_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: max_tokens || 4096,
        temperature: temperature ?? 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`[Proxy] DeepSeek API 错误: ${response.status}`, errData);
      return res.status(response.status).json({
        error: errData.error?.message || `DeepSeek API 返回错误 (${response.status})`,
        code: 'API_ERROR',
        details: errData
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log(`[Proxy] 请求成功，返回内容长度: ${content.length}`);

    res.json({
      success: true,
      content,
      usage: data.usage || null
    });

  } catch (err) {
    console.error('[Proxy] 代理请求异常:', err.message);
    res.status(500).json({
      error: `代理服务内部错误：${err.message}`,
      code: 'PROXY_ERROR'
    });
  }
});

// ── 启动服务器 ──
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║     TaskMate · DeepSeek 本地代理服务          ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  🟢 代理地址:  http://localhost:${PORT}        ║`);
  console.log('  ║  🔑 API Key:   ' + (DEEPSEEK_API_KEY ? '已配置 ✅' : '未设置 ❌（请编辑 .env 文件）') + '       ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');

  if (!DEEPSEEK_API_KEY) {
    console.warn('  ⚠️  警告：未检测到 DEEPSEEK_API_KEY，请在 .env 文件中设置后重启服务。');
    console.warn('      获取 Key: https://platform.deepseek.com/api_keys');
    console.log('');
  }
});