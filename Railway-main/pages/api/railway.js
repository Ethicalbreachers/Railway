// Vercel Serverless Function - Railway API Proxy
// Fixed: UUID token support, better errors, debug info

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
    const { query, variables, tokens, testOnly } = req.body;

    if (!query) return res.status(400).json({ error: 'Query is required' });
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'Kam se kam ek token chahiye' });
    }

    const errors = [];
    const debug = [];
    const startTime = Date.now();

    // Sort by priority
    const sorted = [...tokens].sort(
      (a, b) => (a.priority || 99) - (b.priority || 99)
    );

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const token = String(t.token || '').trim();
      const label = t.email || t.name || `Token ${i + 1}`;

      // ===== TOKEN FORMAT VALIDATION =====
      const tokenInfo = {
        account: label,
        length: token.length,
        preview: token.substring(0, 12) + '...' + token.slice(-8),
        hasSpaces: /\s/.test(token),
        hasNewlines: /[\r\n]/.test(token),
      };
      debug.push({ step: 'token_validation', ...tokenInfo });

      if (!token) {
        errors.push(`[${label}] Token khali hai`);
        continue;
      }

      if (tokenInfo.hasSpaces || tokenInfo.hasNewlines) {
        errors.push(`[${label}] Token me extra space/newline hai`);
        continue;
      }

      if (token.length < 20) {
        errors.push(`[${label}] Token bahut chhota hai (${token.length} chars)`);
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

        const responseText = await response.text();

        debug.push({
          step: 'railway_response',
          account: label,
          httpStatus: response.status,
          bodyPreview: responseText.substring(0, 300),
        });

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          errors.push(`[${label}] Invalid JSON from Railway`);
          continue;
        }

        if (!response.ok) {
          errors.push(`[${label}] HTTP ${response.status}`);
          continue;
        }

        // GraphQL errors
        if (data.errors && data.errors.length > 0) {
          const errMsg = data.errors[0].message || 'Unknown error';
          const errCode = data.errors[0].extensions?.code || 'NO_CODE';

          errors.push(`[${label}] ${errMsg}`);

          // Auth errors — try next token
          const lower = errMsg.toLowerCase();
          if (
            errCode === 'UNAUTHENTICATED' ||
            errCode === 'FORBIDDEN' ||
            lower.includes('not authorized') ||
            lower.includes('unauthorized') ||
            lower.includes('invalid token') ||
            lower.includes('unauthenticated')
          ) {
            continue;
          }

          // Other errors (validation) — return as-is
          return res.status(400).json({
            errors: data.errors,
            debug,
            triedTokens: i + 1,
            lastAccount: label,
          });
        }

        // SUCCESS
        return res.status(200).json({
          data: data.data,
          usedAccount: {
            email: label,
            index: i + 1,
            type: t.type || 'account',
          },
          debug,
          triedTokens: i + 1,
          responseTime: Date.now() - startTime,
          testOnly: !!testOnly,
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

    // All tokens failed
    return res.status(500).json({
      error: 'Saare tokens fail ho gaye',
      details: errors,
      debug,
      hint: 'Hoppscotch (https://hoppscotch.io) me token test karo. URL: https://backboard.railway.app/graphql/v2, Header: Authorization: Bearer TOKEN, Body: {"query":"query { me { email } }"}',
    });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}