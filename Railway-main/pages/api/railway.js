// Vercel Serverless Function - Railway API Proxy with Multi-Token Failover
export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' },
  },
};

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, variables, tokens } = req.body;

    if (!query) return res.status(400).json({ error: 'Query is required' });
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'Kam se kam ek token chahiye' });
    }

    const errors = [];
    const startTime = Date.now();

    // Sort by priority
    const sorted = [...tokens].sort(
      (a, b) => (a.priority || 99) - (b.priority || 99)
    );

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const token = t.token;
      const label = t.email || t.name || `Token ${i + 1}`;

      if (!token) {
        errors.push(`[${label}] Token missing`);
        continue;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(RAILWAY_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          errors.push(`[${label}] HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();

        if (data.errors && data.errors.length > 0) {
          const errMsg = data.errors[0].message || 'Unknown error';
          errors.push(`[${label}] ${errMsg}`);

          const lower = errMsg.toLowerCase();
          if (
            lower.includes('unauthorized') ||
            lower.includes('not authorized') ||
            lower.includes('invalid token') ||
            lower.includes('forbidden') ||
            lower.includes('unauthenticated')
          ) {
            continue;
          }

          return res.status(400).json({
            errors: data.errors,
            triedTokens: i + 1,
            lastAccount: label,
          });
        }

        return res.status(200).json({
          data: data.data,
          usedAccount: {
            email: label,
            index: i + 1,
            type: t.type || 'account',
          },
          triedTokens: i + 1,
          responseTime: Date.now() - startTime,
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          errors.push(`[${label}] Timeout (25s)`);
        } else {
          errors.push(`[${label}] ${err.message}`);
        }
        continue;
      }
    }

    return res.status(500).json({
      error: 'Saare tokens fail ho gaye',
      details: errors,
      hint: 'Railway pe naya Account ya My Projects token banao aur add karo.',
    });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
