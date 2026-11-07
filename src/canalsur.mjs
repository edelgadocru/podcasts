import { fetchRetry, mapLimit, headInfo, mimeFromUrl, stripHtml } from './util.mjs';

const SITE = 'https://audio.canalsurmas.es';
const API = 'https://api-canalsuraudio.interactvty.com/api/2.0/contents';
const EP_FIELDS = 'name,description,short_description,emision_date,duration,image,friendly_url';

let token;
async function getToken() {
  if (!token) {
    const res = await fetchRetry(`${SITE}/api/fetch-api/jwt/token`, { method: 'POST' });
    token = (await res.json()).access;
  }
  return token;
}

async function api(url) {
  const res = await fetchRetry(url, { headers: { Authorization: `jwtok ${await getToken()}` } });
  return res.json();
}

async function paginate(path) {
  let url = `${API}/${path}`;
  const out = [];
  while (url) {
    const page = await api(url);
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

export function categoryId(source) {
  const m = String(source.url ?? source.id).match(/category\/(\d+)|^(\d+)$/);
  if (!m) throw new Error(`URL de CanalSur Más no válida: ${source.url}`);
  return Number(m[1] ?? m[2]);
}

async function collectEpisodes(id, seen = new Set(), depth = 0) {
  if (seen.has(id) || depth > 4) return [];
  seen.add(id);
  let items = [];
  try {
    items = await paginate(`category_contents/${id}/?page_size=100&optional_fields=${EP_FIELDS}`);
  } catch (e) {
    console.warn(`  aviso: sin contenidos en categoría ${id}: ${e.message}`);
  }
  const subs = await paginate(`subcategory/${id}/?page_size=100&optional_fields=is_final,type`);
  for (const s of subs) items.push(...(await collectEpisodes(s.id, seen, depth + 1)));
  return items;
}

async function showMeta(id) {
  const c = await api(`${API}/category/${id}/?optional_fields=name,short_description,description,image,friendly_url`);
  return {
    title: c.name.trim(),
    description: stripHtml(c.description || c.short_description || c.name),
    image: c.image || undefined,
    link: `${SITE}/videos/category/${id}${c.friendly_url ? '-' + c.friendly_url : ''}`,
    author: 'CanalSur Más Audio',
    language: 'es',
  };
}

async function resolveMedia(contentId) {
  const res = await api(
    `${API}/content_resources/${contentId}/?optional_fields=is_initial,videotype,media_url,type`,
  );
  const r = res.results.find((x) => x.media_url && x.is_initial) ?? res.results.find((x) => x.media_url);
  return r?.media_url;
}

function makeShow(id) {
  return {
    slug: `canalsur-${id}`,
    async update(prev) {
      const meta = await showMeta(id);
      const episodes = { ...(prev?.episodes ?? {}) };
      const contents = await collectEpisodes(id);
      const fresh = contents.filter((c, i, a) => !episodes[c.id] && a.findIndex((x) => x.id === c.id) === i);
      console.log(`  ${contents.length} episodios en la web, ${fresh.length} nuevos`);
      await mapLimit(fresh, 5, async (c) => {
        const url = await resolveMedia(c.id);
        if (!url) return;
        const head = await headInfo(url);
        episodes[c.id] = {
          id: String(c.id),
          title: c.name.trim(),
          description: stripHtml(c.description || c.short_description || ''),
          pubDate: c.emision_date,
          duration: Math.round(c.duration) || undefined,
          url,
          type: mimeFromUrl(url) ?? head.type ?? 'audio/mpeg',
          length: head.length,
          image: c.image || undefined,
          link: `${SITE}/videos/detail/${c.id}${c.friendly_url ? '-' + c.friendly_url : ''}`,
        };
      });
      return { meta, episodes };
    },
  };
}

export async function resolve(source) {
  const id = categoryId(source);
  if (!source.expand) return [makeShow(id)];
  const subs = await paginate(`subcategory/${id}/?page_size=100&optional_fields=type`);
  return subs.map((s) => makeShow(s.id));
}
