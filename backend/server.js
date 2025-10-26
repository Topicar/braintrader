// backend/server.js
const express = require('express');
const cors = require('cors');
const { createHmac } = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const ASTER_API_KEY = process.env.ASTER_API_KEY || '';
const ASTER_SECRET = process.env.ASTER_SECRET || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

const ASTER_BASE = 'https://fapi.asterdex.com';

// Aster Public (no auth)
app.get('/api/market/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const url = `${ASTER_BASE}/${endpoint}?${query}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aster Authenticated
app.get('/api/aster/*', async (req, res) => {
  if (!ASTER_API_KEY || !ASTER_SECRET) {
    return res.status(400).json({ error: 'Missing Aster credentials' });
  }
  try {
    const endpoint = req.params[0];
    const timestamp = Date.now();
    const params = { ...req.query, timestamp, recvWindow: 5000 };
    const queryString = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    const signature = createHmac('sha256', ASTER_SECRET).update(queryString).digest('hex');
    const url = `${ASTER_BASE}/${endpoint}?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
      headers: { 'X-MBX-APIKEY': ASTER_API_KEY }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LLM Proxy
app.post('/api/llm', async (req, res) => {
  const { provider, ...body } = req.body;
  let url, headers, apiKey;

  switch(provider) {
    case 'groq':
      url = 'https://api.groq.com/openai/v1/chat/completions';
      apiKey = GROQ_API_KEY;
      break;
    case 'openai':
      url = 'https://api.openai.com/v1/chat/completions';
      apiKey = OPENAI_API_KEY;
      break;
    case 'anthropic':
      url = 'https://api.anthropic.com/v1/messages';
      apiKey = ANTHROPIC_API_KEY;
      break;
    case 'deepseek':
      url = 'https://api.deepseek.com/v1/chat/completions';
      apiKey = DEEPSEEK_API_KEY;
      break;
    default:
      return res.status(400).json({ error: 'Invalid provider' });
  }

  if (!apiKey) return res.status(400).json({ error: `Missing ${provider} API key` });

  headers = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Proxy running on port ${PORT}`);
});
