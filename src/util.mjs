export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchRetry(url, opts = {}, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': UA, ...opts.headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) throw lastErr;
    } catch (e) {
      lastErr = e;
      if (e.message?.startsWith('HTTP 4') && !e.message.startsWith('HTTP 429')) throw e;
    }
    await sleep(1000 * 2 ** i);
  }
  throw lastErr;
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Elimina caracteres no válidos en XML 1.0
const INVALID_XML = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

export function escapeXml(s) {
  return String(s ?? '')
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function stripHtml(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function mimeFromUrl(url) {
  const ext = new URL(url).pathname.split('.').pop().toLowerCase();
  return { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav' }[ext];
}

export async function headInfo(url) {
  try {
    const res = await fetchRetry(url, { method: 'HEAD' }, 2);
    return {
      length: Number(res.headers.get('content-length')) || 0,
      type: res.headers.get('content-type') || undefined,
    };
  } catch {
    return { length: 0, type: undefined };
  }
}

// Tamaño real servido tras las redirecciones; undefined si no se pudo consultar.
export async function servedLength(url) {
  try {
    const res = await fetchRetry(url, { method: 'HEAD' }, 2);
    return Number(res.headers.get('content-length')) || 0;
  } catch {
    return undefined;
  }
}
