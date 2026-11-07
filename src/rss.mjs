import { XMLParser } from 'fast-xml-parser';
import { fetchRetry, stripHtml, mimeFromUrl } from './util.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});

const text = (v) => (v && typeof v === 'object' ? v['#text'] : v) ?? '';
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const toIso = (s) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

// Acepta la URL de la página de iVoox, la del feed o cualquier RSS genérico.
export function feedUrl(source) {
  const u = source.url;
  const page = u.match(/_sq_f(\d+)_\d+\.html/);
  if (page) return `https://www.ivoox.com/x_fg_f${page[1]}_filtro_1.xml`;
  return u;
}

// La URL del feed (_mf_..._feed_) sirve un recorte; la del reproductor web (listen_mn_) sirve el audio completo.
const fullAudioUrl = (url) => {
  const m = url.match(/^https?:\/\/(?:www\.)?ivoox\.com\/[^?]*_mf_(\d+)_feed_\d+\.mp3/);
  return m ? `https://www.ivoox.com/listen_mn_${m[1]}_1.mp3` : url;
};

function slugFor(source, url) {
  const m = url.match(/_fg_f(\d+)_/);
  if (m) return `ivoox-${m[1]}`;
  let h = 0;
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `rss-${h.toString(16)}`;
}

export async function resolve(source) {
  const url = feedUrl(source);
  return [
    {
      slug: slugFor(source, url),
      async update(prev) {
        const xml = await (await fetchRetry(url, { headers: { Accept: 'application/rss+xml, text/xml' } })).text();
        const ch = parser.parse(xml).rss?.channel;
        if (!ch) throw new Error(`Feed no válido: ${url}`);
        const meta = {
          title: text(ch.title).trim(),
          description: stripHtml(text(ch.description) || text(ch['itunes:summary']) || text(ch.title)),
          image: ch['itunes:image']?.['@_href'] || ch.image?.url || undefined,
          link: text(ch.link) || url,
          author: text(ch['itunes:author']) || undefined,
          language: text(ch.language) || 'es',
          guidSuffix: 'v2',
        };
        const episodes = { ...(prev?.episodes ?? {}) };
        const items = arr(ch.item);
        let added = 0;
        for (const it of items) {
          const enc = it.enclosure;
          const mediaUrl = enc?.['@_url'];
          if (!mediaUrl) continue;
          const id = String(text(it.guid) || mediaUrl);
          if (!episodes[id]) added++;
          episodes[id] = {
            id,
            title: text(it.title).trim(),
            description: stripHtml(text(it.description) || text(it['itunes:summary'])),
            pubDate: toIso(text(it.pubDate)),
            duration: text(it['itunes:duration']) || undefined,
            url: fullAudioUrl(mediaUrl),
            type: enc['@_type'] || mimeFromUrl(mediaUrl) || 'audio/mpeg',
            length: Number(enc['@_length']) || 0,
            image: it['itunes:image']?.['@_href'] || undefined,
            link: text(it.link) || undefined,
          };
        }
        for (const ep of Object.values(episodes)) ep.url = fullAudioUrl(ep.url);
        console.log(`  ${items.length} episodios en el feed, ${added} nuevos`);
        return { meta, episodes };
      },
    },
  ];
}
