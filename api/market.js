// /api/market.js — Vercel Serverless Function
// 서버에서 Yahoo Finance 호출 → CORS 문제 없음
// GitHub: dlwns-site/api/market.js (프로젝트 루트의 api/ 폴더)

const TICKERS = [
  { key: 'sp500',   symbol: '^GSPC',      name: 'S&P 500' },
  { key: 'nasdaq',  symbol: '^IXIC',       name: 'NASDAQ' },
  { key: 'kospi',   symbol: '^KS11',       name: 'KOSPI' },
  { key: 'nvda',    symbol: 'NVDA',        name: 'NVIDIA',   unit: '$' },
  { key: 'aapl',    symbol: 'AAPL',        name: 'Apple',    unit: '$' },
  { key: 'tsla',    symbol: 'TSLA',        name: 'Tesla',    unit: '$' },
  { key: 'samsung', symbol: '005930.KS',   name: '삼성전자' },
  { key: 'skhynix', symbol: '000660.KS',   name: 'SK하이닉스' },
];

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
  const fallback = url.replace('query1', 'query2');

  for (const endpoint of [url, fallback]) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; market-widget/1.0)',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const closes = result.indicators?.quote?.[0]?.close ?? [];
      const validCloses = closes.filter(v => v != null && !isNaN(v));
      if (validCloses.length < 1) continue;

      const last = validCloses[validCloses.length - 1];
      const prev = validCloses.length > 1 ? validCloses[validCloses.length - 2] : last;
      const changePct = prev ? ((last - prev) / prev * 100) : 0;
      const prevClose = result.meta?.chartPreviousClose ?? prev;
      const dayChangePct = prevClose ? ((last - prevClose) / prevClose * 100) : changePct;

      return {
        price: parseFloat(last.toFixed(2)),
        change_pct: parseFloat(dayChangePct.toFixed(2)),
      };
    } catch { continue; }
  }
  return null;
}

export default async function handler(req, res) {
  // CORS 헤더 (같은 도메인이지만 혹시 몰라서)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60'); // 5분 캐시

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const results = {};

  await Promise.all(
    TICKERS.map(async ({ key, symbol, name, unit }) => {
      const q = await fetchQuote(symbol);
      if (q) results[key] = { ...q, name, ...(unit ? { unit } : {}) };
    })
  );

  if (Object.keys(results).length === 0) {
    res.status(502).json({ error: '모든 시세 API 실패' });
    return;
  }

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  results.updated_at =
    `${kst.getUTCFullYear()}.${kst.getUTCMonth()+1}.${kst.getUTCDate()} ` +
    `${kst.getUTCHours()}:${String(kst.getUTCMinutes()).padStart(2,'0')} KST`;

  res.status(200).json(results);
}
