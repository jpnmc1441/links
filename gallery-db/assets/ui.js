// Shared UI helpers used by every page.
import { SITE_NAME, SITE_TAGLINE } from './config.js';
import { DEMO, isAdmin } from './db.js';

export const $ = (sel, root = document) => root.querySelector(sel);

/** Tiny element builder: h('div', {class:'x', onclick}, child, 'text') */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}

export function formatDate(iso, long = false) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, long
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  const units = [['year', 31536e3], ['month', 2592e3], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v > 1 ? 's' : ''} ago`; }
}

export function toast(msg, kind = 'info') {
  let wrap = $('.toasts');
  if (!wrap) document.body.append(wrap = h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export async function renderHeader({ search = false, q = '' } = {}) {
  document.title = document.title.replace('{site}', SITE_NAME);
  const admin = await isAdmin();
  const header = h('header', { class: 'site-header' },
    h('div', { class: 'wrap header-inner' },
      h('a', { href: './', class: 'brand' },
        h('span', { class: 'brand-name' }, SITE_NAME),
        h('span', { class: 'brand-tag' }, SITE_TAGLINE)),
      search ? h('form', { class: 'search', role: 'search', id: 'search-form' },
        h('span', { class: 'search-icon', 'aria-hidden': 'true' }),
        h('input', { type: 'search', id: 'q', name: 'q', placeholder: 'Search posts…', value: q, autocomplete: 'off', 'aria-label': 'Search posts' })
      ) : null,
      h('nav', { class: 'nav' },
        admin ? h('a', { href: 'admin.html#new', class: 'btn btn-accent btn-sm' }, '+ New post') : null,
        h('a', { href: 'admin.html', class: 'nav-link' }, admin ? 'Admin' : 'Sign in'))
    ));
  const icon = header.querySelector('.search-icon');
  if (icon) icon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  document.body.prepend(header);
  if (DEMO) document.body.prepend(h('div', { class: 'demo-bar' },
    'Demo mode — sample data only, nothing is saved. Add your Supabase keys in ',
    h('code', {}, 'assets/config.js'), ' to go live.'));
  return { admin };
}
