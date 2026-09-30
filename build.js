// Bouwt de EU-e-commerce-website: vult de sjablonen in templates/ met de teksten
// uit content/ en zet het resultaat in dist/. Geen extra pakketten nodig.
const fs = require('fs');
const path = require('path');

const SITE = 'https://eu.financefabriek.nl';

const read = (p) => fs.readFileSync(p, 'utf8');
const readJSON = (p) => JSON.parse(read(p));

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const get = (obj, key) => key === '.' ? obj : key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// {{> naam}} voegt templates/partials/naam.html in
function withPartials(str) {
  return str.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => read(`templates/partials/${name}.html`).trimEnd());
}

function render(str, ctx, root) {
  // lijsten en voorwaarden: {{#pad}} ... {{/pad}}
  str = str.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const val = get(ctx, key) ?? get(root, key);
    if (!Array.isArray(val)) return val ? render(inner, ctx, root) : '';
    return val.map((item, i) => {
      const extra = {
        '@num': String(i + 1).padStart(2, '0'),
        '@squares': '<span></span>'.repeat(Number(item) || 0),
      };
      return render(inner, typeof item === 'object' ? { ...item, ...extra } : { '.': item, ...extra }, root);
    }).join('');
  });
  // omgekeerd: {{^pad}} ... {{/pad}} toont alleen als het veld leeg is
  str = str.replace(/\{\{\^([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const val = get(ctx, key) ?? get(root, key);
    const empty = !val || (Array.isArray(val) && val.length === 0);
    return empty ? render(inner, ctx, root) : '';
  });
  const special = { '@year': new Date().getFullYear() };
  const lookup = (key) => {
    if (key in special) return special[key];
    if (ctx && key in ctx) return ctx[key];
    const v = get(ctx, key);
    return v !== undefined ? v : get(root, key);
  };
  str = str.replace(/\{\{\{([@\w.]+)\}\}\}/g, (_, k) => String(lookup(k) ?? ''));
  str = str.replace(/\{\{([@\w.]+)\}\}/g, (_, k) => esc(lookup(k)));
  return str;
}

const jsonld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const c = readJSON('content/en.json');
const services = readJSON('content/services.json').pages.map((s) => ({ ...s, url: '/services/' + s.slug + '/' }));
const tplHome = withPartials(read('templates/home.html'));
const tplService = withPartials(read('templates/service.html'));
const tplGuide = withPartials(read('templates/guide.html'));
const guides = readJSON('content/guides.json').pages.map((g) => ({ ...g, url: '/guides/' + g.slug + '/' }));
const provider = { '@type': 'AccountingService', name: c.bedrijf.naam, url: SITE + '/' };
const urls = [];

fs.rmSync('dist', { recursive: true, force: true });
function write(url, html) {
  const dir = path.join('dist', url);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  urls.push(url);
}

// homepage
const homeCtx = {
  ...c,
  site: SITE,
  services: { ...c.services, items: services },
  guides: { ...c.guides, items: guides },
  page: {
    title: c.meta.title,
    description: c.meta.description,
    url: '/',
    image: c.hero.background,
    jsonld: jsonld([
      {
        '@context': 'https://schema.org',
        '@type': 'AccountingService',
        name: c.bedrijf.naam,
        legalName: c.bedrijf.rechtspersoon,
        url: SITE + '/',
        logo: SITE + '/images/logo.png',
        email: c.contact.email,
        description: c.meta.description,
        address: { '@type': 'PostalAddress', addressLocality: 'Bergen op Zoom', addressCountry: 'NL' },
        areaServed: 'NL',
        availableLanguage: ['en', 'nl'],
        parentOrganization: { '@type': 'Organization', name: 'De Finance Fabriek', url: 'https://financefabriek.nl/' },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: c.nav.services,
          itemListElement: services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.title, url: SITE + s.url } })),
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: c.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ]),
  },
};
write('/', render(tplHome, homeCtx, homeCtx));

// dienstpagina's
for (const s of services) {
  const ctx = {
    ...c,
    site: SITE,
    svc: s,
    others: services.filter((o) => o.slug !== s.slug),
    page: {
      title: `${s.seo_title} | ${c.bedrijf.naam}`,
      description: s.meta_description,
      url: s.url,
      image: s.image,
      jsonld: jsonld([
        { '@context': 'https://schema.org', '@type': 'Service', name: s.title, serviceType: s.title, description: s.meta_description, url: SITE + s.url, areaServed: 'NL', provider },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: c.ui.crumb_home, item: SITE + '/' },
            { '@type': 'ListItem', position: 2, name: c.nav.services, item: SITE + '/#services' },
            { '@type': 'ListItem', position: 3, name: s.title, item: SITE + s.url },
          ],
        },
      ]),
    },
  };
  write(s.url, render(tplService, ctx, ctx));
}

// gidsen
for (const g of guides) {
  const ctx = {
    ...c,
    site: SITE,
    g,
    others: guides.filter((o) => o.slug !== g.slug),
    page: {
      title: `${g.seo_title} | ${c.bedrijf.naam}`,
      description: g.meta_description,
      url: g.url,
      image: g.image,
      jsonld: jsonld([
        { '@context': 'https://schema.org', '@type': 'Article', headline: g.seo_title, description: g.meta_description, url: SITE + g.url, inLanguage: 'en', image: SITE + g.image, author: provider, publisher: provider },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: c.ui.crumb_home, item: SITE + '/' },
            { '@type': 'ListItem', position: 2, name: c.nav.guides, item: SITE + '/#guides' },
            { '@type': 'ListItem', position: 3, name: g.title, item: SITE + g.url },
          ],
        },
      ]),
    },
  };
  write(g.url, render(tplGuide, ctx, ctx));
}

const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync('dist/sitemap.xml', ['<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`),
  '</urlset>', ''].join('\n'));
fs.writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.cpSync('images', 'dist/images', { recursive: true });
console.log(`Website gebouwd in dist/ (${urls.length} pagina's)`);
