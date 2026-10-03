import { POSTS_PER_PAGE, SITE_NAME } from './config.js';
import { listPosts, imageUrl } from './db.js';
import { $, h, formatDate, renderHeader, toast } from './ui.js';

const params = new URLSearchParams(location.search);
let q = params.get('q') || '';
let offset = 0;
let total = 0;
let reqId = 0;

await renderHeader({ search: true, q });
$('#footer').textContent = `© ${new Date().getFullYear()} ${SITE_NAME}`;

const grid = $('#grid'), more = $('#more');

function highlight(text, query) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return [text];
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

function card(p) {
  const cover = p.images?.[0];
  const n = p.images?.length || 0;
  const media = h('div', { class: 'card-media' },
    cover
      ? h('img', { src: imageUrl(cover.thumb || cover.full), alt: p.title, loading: 'lazy', decoding: 'async' })
      : h('div', { class: 'noimg' }, 'Text post'),
    n > 1 ? h('span', { class: 'badge' }, `▦ ${n}`) : null);
  const desc = p.description.length > 220 ? p.description.slice(0, 220) + '…' : p.description;
  return h('a', { class: 'card', href: `post.html?id=${encodeURIComponent(p.id)}` },
    media,
    h('h2', { class: 'card-title' }, highlight(p.title, q)),
    desc ? h('p', { class: 'card-desc' }, highlight(desc, q)) : null,
    h('div', { class: 'card-meta' },
      h('span', {}, formatDate(p.created_at)),
      h('span', {}, `${p.comment_count} comment${p.comment_count === 1 ? '' : 's'}`)));
}

function skeletons(n = 6) {
  return Array.from({ length: n }, () => h('div', { class: 'card' },
    h('div', { class: 'card-media skeleton' }),
    h('div', { class: 'skeleton', style: 'height:22px;width:70%' }),
    h('div', { class: 'skeleton', style: 'height:14px;width:90%' })));
}

async function load(reset = false) {
  const my = ++reqId;
  if (reset) { offset = 0; grid.replaceChildren(...skeletons()); more.replaceChildren(); }
  else more.replaceChildren(h('button', { class: 'btn', disabled: true }, 'Loading…'));
  try {
    const { rows, total: t } = await listPosts({ q, offset, limit: POSTS_PER_PAGE });
    if (my !== reqId) return;                       // a newer search started
    total = t;
    if (reset) grid.replaceChildren();
    grid.append(...rows.map(card));
    offset += rows.length;

    $('#feed-title').textContent = q ? `Results for “${q}”` : 'Latest posts';
    $('#feed-count').textContent = total ? `${total} post${total === 1 ? '' : 's'}` : '';
    if (!total) {
      grid.replaceChildren();
      more.replaceChildren(h('div', { class: 'empty' },
        h('h2', {}, q ? 'Nothing found' : 'No posts yet'),
        h('p', {}, q ? 'Try a different word, or clear the search.' : 'Sign in as admin to publish your first post.'),
        q ? h('button', { class: 'btn', onclick: () => setQuery('') }, 'Clear search') : null));
    } else if (offset < total) {
      more.replaceChildren(h('button', { class: 'btn', onclick: () => load(false) }, 'Load more'));
    } else more.replaceChildren();
  } catch (e) {
    if (my !== reqId) return;
    grid.replaceChildren();
    more.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'Couldn’t load posts'), h('p', {}, e.message)));
    toast(e.message, 'error');
  }
}

function setQuery(v) {
  q = v.trim();
  const input = $('#q'); if (input && input.value !== v) input.value = v;
  const url = new URL(location.href);
  q ? url.searchParams.set('q', q) : url.searchParams.delete('q');
  history.replaceState(null, '', url);
  load(true);
}

let t;
$('#q')?.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => setQuery(e.target.value), 300); });
$('#search-form')?.addEventListener('submit', e => { e.preventDefault(); clearTimeout(t); setQuery($('#q').value); });
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault(); $('#q')?.focus();
  }
});

load(true);
