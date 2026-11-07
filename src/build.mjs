import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeXml } from './util.mjs';
import * as canalsur from './canalsur.mjs';
import * as rss from './rss.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'docs');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

const handlers = { canalsur, ivoox: rss, rss };

// feedSuffix cambia la URL del feed para que Overcast lo trate como uno nuevo.
const feedName = (slug, meta) => `${slug}${meta.feedSuffix ?? ''}`;
const feedUrl = (slug, meta) => `${BASE_URL}/feeds/${feedName(slug, meta)}.xml`;

const readJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
};

function renderFeed(slug, { meta, episodes }) {
  const selfUrl = feedUrl(slug, meta);
  const items = Object.values(episodes).sort(
    (a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0),
  );
  const e = escapeXml;
  const itemXml = items
    .map(
      (ep) => `    <item>
      <title>${e(ep.title)}</title>
      <description>${e(ep.description)}</description>
      <guid isPermaLink="false">${e(`${slug}:${ep.id}`)}</guid>${ep.pubDate ? `\n      <pubDate>${new Date(ep.pubDate).toUTCString()}</pubDate>` : ''}${ep.link ? `\n      <link>${e(ep.link)}</link>` : ''}
      <enclosure url="${e(ep.url)}" length="${ep.length || 0}" type="${e(ep.type)}"/>${ep.duration ? `\n      <itunes:duration>${e(ep.duration)}</itunes:duration>` : ''}${ep.image ? `\n      <itunes:image href="${e(ep.image)}"/>` : ''}
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${e(meta.title)}</title>
    <link>${e(meta.link)}</link>
    <description>${e(meta.description || meta.title)}</description>
    <language>${e(meta.language || 'es')}</language>
    <atom:link href="${e(selfUrl)}" rel="self" type="application/rss+xml"/>${meta.author ? `\n    <itunes:author>${e(meta.author)}</itunes:author>` : ''}${meta.image ? `\n    <itunes:image href="${e(meta.image)}"/>` : ''}
    <itunes:explicit>false</itunes:explicit>
${itemXml}
  </channel>
</rss>
`;
}

function renderIndex(feeds) {
  const e = escapeXml;
  const rows = feeds
    .map(
      (f) =>
        `<li><strong>${e(f.meta.title)}</strong> (${Object.keys(f.episodes).length} episodios)<br><code>${e(feedUrl(f.slug, f.meta))}</code></li>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Podcasts</title>
<style>body{font:16px/1.5 system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem}li{margin:.8rem 0}code{word-break:break-all}</style></head>
<body><h1>Podcasts</h1>
<p>En Overcast: <em>+</em> &rarr; <em>Add URL</em> y pega la URL del feed. Importación masiva: <a href="podcasts.opml">podcasts.opml</a> (overcast.fm &rarr; Settings &rarr; Import OPML).</p>
<ul>
${rows}
</ul></body></html>
`;
}

function renderOpml(feeds) {
  const e = escapeXml;
  const outlines = feeds
    .map((f) => `    <outline type="rss" text="${e(f.meta.title)}" title="${e(f.meta.title)}" xmlUrl="${e(feedUrl(f.slug, f.meta))}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><head><title>Podcasts</title></head><body>
${outlines}
</body></opml>
`;
}

async function main() {
  const { sources } = JSON.parse(await readFile(join(ROOT, 'sources.json'), 'utf8'));
  await mkdir(DATA, { recursive: true });
  await mkdir(join(OUT, 'feeds'), { recursive: true });

  let ok = 0;
  let failed = 0;
  const done = new Set();
  for (const source of sources) {
    const handler = handlers[source.type];
    if (!handler) {
      console.error(`Tipo de fuente desconocido: ${source.type}`);
      failed++;
      continue;
    }
    let shows;
    try {
      shows = await handler.resolve(source);
    } catch (err) {
      console.error(`ERROR resolviendo ${source.url}: ${err.message}`);
      failed++;
      continue;
    }
    for (const show of shows) {
      if (done.has(show.slug)) continue;
      done.add(show.slug);
      const file = join(DATA, `${show.slug}.json`);
      const prev = await readJson(file);
      console.log(`[${show.slug}]`);
      try {
        const next = await show.update(prev);
        const json = JSON.stringify(next, null, 1);
        if (json !== JSON.stringify(prev, null, 1)) await writeFile(file, json);
        ok++;
      } catch (err) {
        console.error(`  ERROR: ${err.message} (se mantiene la caché anterior)`);
        failed++;
      }
    }
  }

  // El render usa toda la caché, así un fallo puntual no elimina feeds.
  const feeds = [];
  for (const name of (await readdir(DATA)).filter((n) => n.endsWith('.json'))) {
    const slug = name.replace(/\.json$/, '');
    const data = await readJson(join(DATA, name));
    if (!data?.meta) continue;
    await writeFile(join(OUT, 'feeds', `${feedName(slug, data.meta)}.xml`), renderFeed(slug, data));
    feeds.push({ slug, ...data });
  }
  feeds.sort((a, b) => a.meta.title.localeCompare(b.meta.title, 'es'));
  await writeFile(join(OUT, 'index.html'), renderIndex(feeds));
  await writeFile(join(OUT, 'podcasts.opml'), renderOpml(feeds));

  console.log(`\n${feeds.length} feeds generados (${ok} actualizados, ${failed} con error)`);
  if (ok === 0 && failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
