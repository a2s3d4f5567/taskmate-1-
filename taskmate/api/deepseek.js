// api/deepseek.js — Vercel Serverless 函数，安全代理 DeepSeek API
// API Key 存储在 Vercel 环境变量中，前端无法访问

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';

export default async function handler(req, res) {
  // CORS — 允许所有来源（开发 + 生产域名）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 健康检查 — 所有 GET 请求都返回状态
  //   前端线上环境请求 GET /api/deepseek，本地请求 GET /api/health
  //   统一处理，避免路径匹配问题
  if (req.method === 'GET') {
    const hasKey = !!process.env.DEEPSEEK_API_KEY;
    return res.status(200).json({
      status: 'ok',
      hasKey,
      uptime: process.uptime ? process.uptime().toFixed(0) + 's' : 'serverless'
    });
  }

  // DeepSeek 代理
  if (req.method === 'POST') {
    try {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: '服务端未配置 DEEPSEEK_API_KEY，请在 Vercel 后台设置环境变量',
          code: 'NO_API_KEY'
        });
      }

      const { messages, max_tokens, temperature } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: '请求参数错误：messages 不能为空',
          code: 'INVALID_PARAMS'
        });
      }

      const response = await fetch(DEEPSEEK_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
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
        return res.status(response.status).json({
          error: errData.error?.message || `DeepSeek API 返回错误 (${response.status})`,
          code: 'API_ERROR',
          details: errData
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      return res.status(200).json({
        success: true,
        content,
        usage: data.usage || null
      });
    } catch (err) {
      return res.status(500).json({
        error: `代理服务内部错误：${err.message}`,
        code: 'PROXY_ERROR'
      });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}