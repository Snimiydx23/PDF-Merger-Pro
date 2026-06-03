// RMA FINANCE PRIVATE LIMITED — Vercel Serverless Function (multi-provider)
// File path (repo): /api/extract.js  ->  https://<your-site>/api/extract
//
// Browser /api/extract ko {payload:{model,messages,...}} bhejta hai.
// Yeh function decide karta hai kaunsa LLM provider use karna hai (env vars se),
// key SERVER par env var se uthata hai (browser me kabhi expose nahi hoti),
// aur request ko us provider ke OpenAI-compatible endpoint par forward karta hai.
//
// ============================ SETUP (Vercel) ============================
// Settings -> Environment Variables me ye set karo:
//
//   LLM_PROVIDER   = groq | gemini | openrouter | cerebras | together | mistral
//                    (kaunsa active rahega; default = groq. Browser body.provider bhi override kar sakta hai)
//   <PROVIDER>_API_KEY = us provider ki key (niche table dekho)
//   LLM_MODEL      = (optional) model force karo. Khaali to provider ka default model use hoga.
//                    (groq ke liye khaali chhodo to browser-dropdown ka model use hota hai)
//
//   Provider           env key var          free key signup
//   -------------------------------------------------------------------
//   groq               GROQ_API_KEY         console.groq.com
//   gemini             GEMINI_API_KEY       aistudio.google.com/apikey
//   openrouter         OPENROUTER_API_KEY   openrouter.ai/keys   (free models = ":free")
//   cerebras           CEREBRAS_API_KEY     cloud.cerebras.ai
//   together           TOGETHER_API_KEY     api.together.xyz
//   mistral            MISTRAL_API_KEY      console.mistral.ai
//
// NOTE: model names time ke saath badalte hain. Agar default galat ho to LLM_MODEL set kar do.
// Node 18+ par global `fetch` available hai (Vercel default). Koi npm dependency nahi.
// =======================================================================

var PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    env: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile'
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    env: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.0-flash'
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    env: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free'
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    env: 'CEREBRAS_API_KEY',
    defaultModel: 'llama-3.3-70b'
  },
  together: {
    url: 'https://api.together.xyz/v1/chat/completions',
    env: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    env: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest'
  }
};

// agar LLM_PROVIDER set nahi hai to: pehla provider jiski key set hai, warna groq
function pickProvider(requested) {
  if (requested && PROVIDERS[requested]) return requested;
  var envP = (process.env.LLM_PROVIDER || '').toLowerCase().trim();
  if (PROVIDERS[envP]) return envP;
  for (var p in PROVIDERS) { if (process.env[PROVIDERS[p].env]) return p; }
  return 'groq';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'POST only' } }); return; }

  try {
    // body auto-parse (Vercel Node) + safety fallback
    var body = req.body;
    if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
    var payload = (body && body.payload) ? body.payload : body;
    if (!payload || !payload.messages) { res.status(400).json({ error: { message: 'payload.messages missing' } }); return; }

    var provider = pickProvider((body && body.provider) || '');
    var cfg = PROVIDERS[provider];
    var key = process.env[cfg.env];
    if (!key) { res.status(500).json({ error: { message: provider + ': ' + cfg.env + ' env var Vercel par set nahi hai' } }); return; }

    // model precedence: LLM_MODEL env > (groq pe browser ka model) > provider default
    var model = (process.env.LLM_MODEL || '').trim();
    if (!model) model = (provider === 'groq' && payload.model) ? payload.model : cfg.defaultModel;
    payload.model = model;

    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = process.env.SITE_URL || 'https://rmafinance.vercel.app';
      headers['X-Title'] = 'RMA Finance Invoice Extractor';
    }

    var r = await fetch(cfg.url, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
    var data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: { message: String((e && e.message) || e) } });
  }
};
