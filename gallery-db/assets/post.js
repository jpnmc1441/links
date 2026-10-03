import { SITE_NAME } from './config.js';
import { getPost, listComments, addComment, deleteComment, imageUrl } from './db.js';
import { $, h, formatDate, timeAgo, renderHeader, toast } from './ui.js';

const id = new URLSearchParams(location.search).get('id');
const { admin } = await renderHeader();
$('#footer').textContent = `© ${new Date().getFullYear()} ${SITE_NAME}`;

let post;
try {
  post = id ? await getPost(id) : null;
} catch (e) {
  toast(e.message, 'error');
}

if (!post) {
  $('#post').replaceChildren(
    h('a', { class: 'back', href: './' }, '← All posts'),
    h('div', { class: 'empty' }, h('h2', {}, 'Post not found'), h('p', {}, 'It may have been removed.')));
} else {
  document.title = `${post.title} · ${SITE_NAME}`;
  renderMedia(post.images || []);
  renderDetails(post);
  renderComments();
}

// ───────────── Section 1: media ─────────────
function renderMedia(images) {
  const box = $('#media');
  if (!images.length) { box.remove(); return; }

  let i = 0;
  const first = images[0];
  const stage = h('div', { class: 'stage' });
  stage.style.setProperty('--ar', `${first.w || 3} / ${first.h || 2}`);
  const img = h('img', { alt: post.title, decoding: 'async' });
  stage.append(img);

  const thumbs = images.length > 1 ? h('div', { class: 'thumbs', role: 'tablist' },
    images.map((im, k) => h('button', {
      type: 'button', 'aria-label': `Image ${k + 1}`, onclick: () => show(k),
    }, h('img', { src: imageUrl(im.thumb || im.full), alt: '', loading: 'lazy' })))) : null;

  let count;
  if (images.length > 1) {
    stage.append(
      h('button', { class: 'stage-btn prev', type: 'button', 'aria-label': 'Previous image', onclick: () => show(i - 1) }, '‹'),
      h('button', { class: 'stage-btn next', type: 'button', 'aria-label': 'Next image', onclick: () => show(i + 1) }, '›'),
      count = h('span', { class: 'stage-count' }));
  }

  function show(k) {
    i = (k + images.length) % images.length;
    const im = images[i];
    img.classList.add('loading');
    img.onload = () => img.classList.remove('loading');
    img.src = imageUrl(im.full);
    if (count) count.textContent = `${i + 1} / ${images.length}`;
    thumbs?.querySelectorAll('button').forEach((b, k2) => b.setAttribute('aria-current', k2 === i ? 'true' : 'false'));
    thumbs?.children[i]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // preload neighbour
    if (images.length > 1) new Image().src = imageUrl(images[(i + 1) % images.length].full);
  }

  img.addEventListener('click', () => openLightbox(images, i, k => show(k)));
  swipe(stage, d => show(i + d));
  document.addEventListener('keydown', e => {
    if (document.querySelector('.lightbox') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  });

  box.replaceChildren(stage, thumbs || '');
  show(0);
}

function swipe(el, cb) {
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) cb(dx < 0 ? 1 : -1);
    x0 = null;
  });
}

function openLightbox(images, start, onChange) {
  let i = start;
  const img = h('img', { alt: post.title });
  const count = h('div', { class: 'lb-count' });
  const close = () => { lb.remove(); document.removeEventListener('keydown', key); document.body.style.overflow = ''; onChange(i); };
  const show = k => { i = (k + images.length) % images.length; img.src = imageUrl(images[i].full); count.textContent = images.length > 1 ? `${i + 1} / ${images.length}` : ''; };
  const key = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  };
  const lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', onclick: e => { if (e.target === lb) close(); } },
    img, count,
    h('button', { class: 'lb-close', type: 'button', 'aria-label': 'Close', onclick: close }, '×'),
    images.length > 1 ? h('button', { class: 'stage-btn prev', type: 'button', 'aria-label': 'Previous', onclick: () => show(i - 1) }, '‹') : null,
    images.length > 1 ? h('button', { class: 'stage-btn next', type: 'button', 'aria-label': 'Next', onclick: () => show(i + 1) }, '›') : null);
  swipe(lb, d => show(i + d));
  document.addEventListener('keydown', key);
  document.body.style.overflow = 'hidden';
  document.body.append(lb);
  show(i);
}

// ───────────── Section 2: title & description ─────────────
function linkify(text) {
  const parts = text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g);
  return parts.map((p, k) => (k % 2 ? h('a', { href: p, target: '_blank', rel: 'noopener nofollow' }, p) : p));
}

function renderDetails(p) {
  const edited = p.updated_at && new Date(p.updated_at) - new Date(p.created_at) > 60000;
  $('#details').replaceChildren(
    h('h1', {}, p.title),
    h('div', { class: 'details-meta' },
      h('time', { datetime: p.created_at }, formatDate(p.created_at, true)),
      edited ? h('span', {}, '· edited') : null,
      p.images?.length ? h('span', {}, `· ${p.images.length} image${p.images.length > 1 ? 's' : ''}`) : null,
      admin ? h('a', { class: 'btn btn-sm', href: `admin.html#edit=${encodeURIComponent(p.id)}`, style: 'margin-left:auto' }, 'Edit post') : null),
    p.description ? h('div', { class: 'details-body' }, linkify(p.description)) : null);
}

// ───────────── Section 3: comments ─────────────
const COLORS = ['#c8a96a', '#9fb7c9', '#b9a3c9', '#a9c39a', '#d49a7e', '#c9c1a3'];
function avatar(name) {
  const n = name || 'Anonymous';
  let hsh = 0; for (const ch of n) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return h('div', { class: 'avatar', style: `background:${COLORS[hsh % COLORS.length]}` }, n.trim()[0].toUpperCase());
}

function commentEl(c) {
  return h('li', { class: 'comment' },
    avatar(c.name),
    h('div', {},
      h('div', { class: 'comment-head' },
        h('span', { class: 'comment-name' }, c.name || 'Anonymous'),
        h('time', { class: 'comment-time', datetime: c.created_at, title: new Date(c.created_at).toLocaleString() }, timeAgo(c.created_at)),
        admin ? h('button', {
          class: 'comment-del', type: 'button', onclick: async () => {
            if (!confirm('Delete this comment?')) return;
            try { await deleteComment(c.id); renderComments(); toast('Comment deleted', 'ok'); }
            catch (e) { toast(e.message, 'error'); }
          },
        }, 'Delete') : null),
      h('p', { class: 'comment-body' }, c.body)));
}

async function renderComments() {
  const box = $('#comments');
  let comments = [];
  try { comments = await listComments(post.id); } catch (e) { toast(e.message, 'error'); }

  const NAME_KEY = 'gallery-comment-name';
  let savedName = '';
  try { savedName = localStorage.getItem(NAME_KEY) || ''; } catch {}

  const form = h('form', { class: 'comment-form', novalidate: true },
    h('h3', {}, 'Leave a comment'),
    h('div', { class: 'field' },
      h('label', { for: 'c-name' }, 'Name (optional)'),
      h('input', { class: 'input', id: 'c-name', name: 'name', maxlength: '60', placeholder: 'Anonymous', value: savedName, autocomplete: 'nickname' })),
    h('div', { class: 'field' },
      h('label', { for: 'c-body' }, 'Comment'),
      h('textarea', { class: 'textarea', id: 'c-body', name: 'body', maxlength: '2000', required: true, placeholder: 'Say something nice…' })),
    h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
    h('div', { class: 'row' },
      h('span', { class: 'hint' }, 'Be kind. Comments may be removed.'),
      h('button', { class: 'btn btn-accent', type: 'submit' }, 'Post comment')));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    if (fd.get('website')) return;                              // bot trap
    const body = String(fd.get('body') || '').trim();
    const name = String(fd.get('name') || '').trim();
    if (!body) { toast('Write a comment first', 'error'); form.body.focus(); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Posting…';
    try {
      await addComment({ postId: post.id, name, body });
      try { localStorage.setItem(NAME_KEY, name); } catch {}
      toast('Comment posted', 'ok');
      await renderComments();
      $('#comments .comment-list li:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Post comment';
    }
  });

  box.replaceChildren(
    h('h2', {}, 'Comments ', h('span', {}, comments.length ? `(${comments.length})` : '')),
    comments.length
      ? h('ul', { class: 'comment-list' }, comments.map(commentEl))
      : h('p', { class: 'no-comments' }, 'No comments yet — be the first.'),
    form);
}
