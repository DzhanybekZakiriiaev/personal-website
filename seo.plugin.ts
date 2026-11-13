// Build-time SEO, generated from src/content.ts so it never drifts from the site:
//  - index.html: title, description, canonical link, Open Graph / Twitter cards,
//    JSON-LD (Person + WebSite) and a crawlable text version of the whole site in
//    <noscript> (for visitors without JavaScript and crawlers that don't run it);
//  - robots.txt (every crawler welcome, search engines and AI assistants alike),
//    sitemap.xml and llms.txt (a plain summary for AI assistants), in the build and
//    on the dev server.
// The site's address is profile.siteUrl in src/content.ts. Without it the canonical
// link, og:url, og:image and the sitemap are left out (relative URLs are not allowed).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import type { HtmlTagDescriptor, Plugin } from 'vite';

type Content = typeof import('./src/content');

/** Bundles src/content.ts on its own (images become empty modules) and imports it. */
async function loadContent(root: string): Promise<Content> {
  const out = await build({
    entryPoints: [path.join(root, 'src/content.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
    loader: { '.webp': 'empty', '.png': 'empty', '.jpg': 'empty', '.jpeg': 'empty', '.svg': 'empty', '.avif': 'empty' },
  });
  const code = out.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Date.now()}`) as Promise<Content>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Dzhanybek (Johnny) Zakiriiaev" -> legal name and nickname form for structured data. */
function names(display: string) {
  const m = display.match(/^(\S+)\s*\(([^)]+)\)\s*(.+)$/);
  return m ? { legal: `${m[1]} ${m[3]}`, alias: `${m[2]} ${m[3]}` } : { legal: display, alias: undefined };
}

function pageTitle(c: Content) {
  return `${c.profile.name} · ${c.profile.tagline}`;
}

/** Lower-cases only the first letter ("Applied AI" -> "applied AI"). */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function description(c: Content) {
  const wins = c.sections.find((s) => s.id === 'projects')?.note ?? '';
  return `${c.profile.name}, ${c.profile.location}: ${lowerFirst(c.profile.tagline)}. Experience, featured projects${
    wins ? ` (${lowerFirst(wins.replace(/!$/, ''))})` : ''
  }, education and contact.`;
}

function jsonLd(c: Content, site: string, image: string | null) {
  const { legal, alias } = names(c.profile.name);
  const person = {
    '@type': 'Person',
    '@id': site ? `${site}/#person` : undefined,
    name: legal,
    alternateName: alias,
    jobTitle: c.profile.tagline,
    description: c.profile.pitch,
    url: site || undefined,
    image: image || undefined,
    address: { '@type': 'PostalAddress', addressLocality: c.profile.location.split(',')[0].trim(), addressRegion: 'ON', addressCountry: 'CA' },
    alumniOf: { '@type': 'CollegeOrUniversity', name: c.education.school },
    knowsAbout: c.skills.flatMap((g) => g.items),
    sameAs: c.profile.links.map((l) => l.href),
  };
  const graph: object[] = [person];
  if (site) graph.push({ '@type': 'WebSite', '@id': `${site}/#website`, url: `${site}/`, name: c.profile.name, about: { '@id': `${site}/#person` } });
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

/** The whole site as plain, semantic HTML (shown only without JavaScript). */
function fallbackHtml(c: Content) {
  const p = c.profile;
  const li = (items: string[]) => items.map((i) => `<li>${esc(i)}</li>`).join('');
  const jobs = c.jobs
    .map((j) => `<li><h3>${esc(j.role)}, ${esc(j.org)}</h3><p>${esc(j.type)} · ${esc(j.place)} · ${esc(j.when)}</p><p>${esc(j.summary)}</p>${j.points.length ? `<ul>${li(j.points)}</ul>` : ''}</li>`)
    .join('');
  const projects = c.projects
    .map((pr) => {
      const links = [
        pr.liveUrl ? `<a href="${esc(pr.liveUrl)}">Live site</a>` : '',
        pr.repoUrl ? `<a href="${esc(pr.repoUrl)}">Code on GitHub</a>` : '',
        pr.devpostUrl ? `<a href="${esc(pr.devpostUrl)}">Devpost</a>` : '',
      ].filter(Boolean);
      return `<li><h3>${esc(pr.title)}</h3><p>${esc(pr.badge)} · ${esc(pr.when)}</p><p>${esc(pr.summary)}</p>${links.length ? `<p>${links.join(' · ')}</p>` : ''}</li>`;
    })
    .join('');
  const e = c.education;
  return `
      <main class="seo-fallback" style="font-family: system-ui, sans-serif; max-width: 46rem; margin: 0 auto; padding: 1rem; line-height: 1.5; color: #fff; background: #121a2e">
        <h1>${esc(p.name)}</h1>
        <p>${esc(p.tagline)} · ${esc(p.location)}</p>
        <p>${esc(p.pitch)}</p>
        <ul>${p.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>
        <h2>Experience</h2><ul>${jobs}</ul>
        <h2>Featured projects</h2><ul>${projects}</ul>
        <h2>Education</h2><p>${esc(e.degree)}, ${esc(e.minor)}. ${esc(e.school)}, ${esc(e.place)}. ${esc(e.when)}.</p>
        <h2>Skills</h2><ul>${c.skills.map((g) => `<li>${esc(g.group)}: ${esc(g.items.join(', '))}</li>`).join('')}</ul>
      </main>`;
}

function llmsTxt(c: Content, site: string) {
  const p = c.profile;
  const e = c.education;
  const lines = [
    `# ${p.name}`,
    '',
    `> ${p.tagline} · ${p.location}`,
    '',
    p.pitch,
    '',
    site ? `Website: ${site}/` : '',
    ...p.links.map((l) => `- ${l.label}: ${l.href}`),
    '',
    '## Experience',
    '',
    ...c.jobs.map((j) => `- **${j.role}**, ${j.org} (${j.type}, ${j.place}, ${j.when}): ${j.summary}`),
    '',
    '## Featured projects',
    '',
    ...c.projects.map((pr) => {
      const links = [pr.liveUrl && `[Live](${pr.liveUrl})`, pr.repoUrl && `[Code](${pr.repoUrl})`, pr.devpostUrl && `[Devpost](${pr.devpostUrl})`].filter(Boolean).join(' ');
      return `- **${pr.title}** (${pr.badge}, ${pr.when}): ${pr.summary}${links ? ` ${links}` : ''}`;
    }),
    '',
    '## Education',
    '',
    `- ${e.degree}, ${e.minor}. ${e.school}, ${e.place}. ${e.when}.`,
    '',
    '## Skills',
    '',
    ...c.skills.map((g) => `- ${g.group}: ${g.items.join(', ')}`),
    '',
  ];
  return lines.filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n');
}

function robotsTxt(site: string) {
  return [
    '# Everyone is welcome: search engines and AI assistants alike.',
    'User-agent: *',
    'Allow: /',
    '',
    ...(site ? [`Sitemap: ${site}/sitemap.xml`, ''] : []),
  ].join('\n');
}

function sitemapXml(site: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${esc(site)}/</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`;
}

export function seo(): Plugin {
  let root = process.cwd();
  let content: Content | null = null;
  const load = async () => (content = await loadContent(root));
  const siteOf = (c: Content) => (((c.profile as { siteUrl?: string }).siteUrl ?? '') as string).trim().replace(/\/+$/, '');
  const ogImage = () => ['og-image.png', 'og-image.jpg'].find((f) => existsSync(path.join(root, 'public', f))) ?? null;

  const files = (c: Content): Record<string, { type: string; body: string }> => {
    const site = siteOf(c);
    const out: Record<string, { type: string; body: string }> = {
      'robots.txt': { type: 'text/plain; charset=utf-8', body: robotsTxt(site) },
      'llms.txt': { type: 'text/plain; charset=utf-8', body: llmsTxt(c, site) },
    };
    if (site) out['sitemap.xml'] = { type: 'application/xml; charset=utf-8', body: sitemapXml(site) };
    return out;
  };

  return {
    name: 'site-seo',
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      await load();
      const c = content as Content;
      if (!siteOf(c)) this.warn('profile.siteUrl is empty in src/content.ts: no canonical link, og:url, og:image or sitemap.xml.');
    },
    async transformIndexHtml(html) {
      const c = content ?? (await load());
      const site = siteOf(c);
      const img = ogImage();
      const imageUrl = site && img ? `${site}/${img}` : null;
      const title = pageTitle(c);
      const desc = description(c);
      const tags: HtmlTagDescriptor[] = [
        { tag: 'meta', attrs: { name: 'author', content: names(c.profile.name).legal }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'robots', content: 'index, follow, max-image-preview:large' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:type', content: 'profile' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:site_name', content: c.profile.name }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:title', content: title }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:description', content: desc }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:locale', content: 'en_CA' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:card', content: imageUrl ? 'summary_large_image' : 'summary' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:title', content: title }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:description', content: desc }, injectTo: 'head' },
        { tag: 'script', attrs: { type: 'application/ld+json' }, children: jsonLd(c, site, imageUrl), injectTo: 'head' },
      ];
      if (site) {
        tags.push(
          { tag: 'link', attrs: { rel: 'canonical', href: `${site}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${site}/` }, injectTo: 'head' },
        );
      }
      if (imageUrl) {
        tags.push(
          { tag: 'meta', attrs: { property: 'og:image', content: imageUrl }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image:alt', content: `${c.profile.name}: ${c.profile.tagline}` }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:image', content: imageUrl }, injectTo: 'head' },
        );
      }
      const out = html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace(/<noscript>[\s\S]*?<\/noscript>/, `<noscript>${fallbackHtml(c)}\n    </noscript>`);
      return { html: out, tags };
    },
    generateBundle() {
      const c = content as Content;
      for (const [fileName, f] of Object.entries(files(c))) this.emitFile({ type: 'asset', fileName, source: f.body });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        if (!['robots.txt', 'llms.txt', 'sitemap.xml'].includes(name)) return next();
        const f = files(await load())[name];
        if (!f) return next();
        res.setHeader('Content-Type', f.type);
        res.end(f.body);
      });
    },
  };
}
