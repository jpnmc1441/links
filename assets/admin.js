import { SITE_NAME } from './config.js';
import { DEMO, signIn, signOut, currentUser, isAdmin, listPosts, getPost, savePost, deletePost, imageUrl } from './db.js';
import { $, h, formatDate, renderHeader, toast } from './ui.js';

await renderHeader();
$('#footer').textContent = `© ${new Date().getFullYear()} ${SITE_NAME}`;
const app = $('#app');

async function route() {
  const user = await currentUser();
  if (!user) return loginView();
  if (!(await isAdmin())) return notAdminView(user);
  const hash = location.hash.slice(1);
  if (hash === 'new') return editorView(null);
  if (hash.startsWith('edit=')) return editorView(decodeURIComponent(hash.slice(5)));
  return dashboardView(user);
}
addEventListener('hashchange', route);
route();

// ───────────── login ─────────────
function loginView() {
  const form = h('form', { class: 'panel login' },
    h('h1', {}, 'Sign in'),
    h('p', { class: 'admin-sub', style: 'margin-bottom:22px' }, DEMO ? 'Demo mode: any email & password works.' : 'Admin access only.'),
    h('div', { class: 'field' }, h('label', { for: 'em' }, 'Email'),
      h('input', { class: 'input', id: 'em', type: 'email', required: true, autocomplete: 'username' })),
    h('div', { class: 'field' }, h('label', { for: 'pw' }, 'Password'),
      h('input', { class: 'input', id: 'pw', type: 'password', required: true, autocomplete: 'current-password' })),
    h('button', { class: 'btn btn-accent', type: 'submit', style: 'width:100%' }, 'Sign in'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    try { await signIn($('#em').value.trim(), $('#pw').value); location.reload(); }
    catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Sign in'; }
  });
  app.replaceChildren(form);
}

function notAdminView(user) {
  app.replaceChildren(h('div', { class: 'panel login' },
    h('h1', {}, 'Not an admin'),
    h('p', { class: 'admin-sub' }, `${user.email} is signed in but isn’t in the admins table. See step 4 in the README.`),
    h('p', {}, h('button', { class: 'btn', onclick: async () => { await signOut(); location.reload(); } }, 'Sign out'))));
}

// ───────────── dashboard ─────────────
async function dashboardView(user) {
  const list = h('ul', { class: 'post-rows' }, h('li', { class: 'admin-sub' }, 'Loading…'));
  app.replaceChildren(
    h('div', { class: 'admin-top' },
      h('div', {}, h('h1', {}, 'Your posts'), h('p', { class: 'admin-sub' }, `Signed in as ${user.email}`)),
      h('div', { style: 'display:flex;gap:10px' },
        h('a', { class: 'btn btn-accent', href: '#new' }, '+ New post'),
        h('button', { class: 'btn', onclick: async () => { await signOut(); location.href = './'; } }, 'Sign out'))),
    h('div', { class: 'panel' }, list));

  try {
    const all = [];
    for (let off = 0; ; off += 100) {
      const { rows, total } = await listPosts({ offset: off, limit: 100 });
      all.push(...rows);
      if (all.length >= total || !rows.length) break;
    }
    if (!all.length) { list.replaceChildren(h('li', { class: 'admin-sub' }, 'No posts yet.')); return; }
    list.replaceChildren(...all.map(p => {
      const cover = p.images?.[0];
      return h('li', { class: 'post-row' },
        cover ? h('img', { src: imageUrl(cover.thumb || cover.full), alt: '', loading: 'lazy' }) : h('div', { class: 'ph' }),
        h('div', { style: 'min-width:0' },
          h('a', { class: 'post-row-title', href: `post.html?id=${encodeURIComponent(p.id)}` }, p.title),
          h('div', { class: 'post-row-meta' }, `${formatDate(p.created_at)} · ${p.images?.length || 0} images · ${p.comment_count} comments`)),
        h('div', { class: 'post-row-actions' },
          h('a', { class: 'btn btn-sm', href: `#edit=${encodeURIComponent(p.id)}` }, 'Edit'),
          h('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmDelete(p) }, 'Delete')));
    }));
  } catch (e) {
    list.replaceChildren(h('li', { class: 'admin-sub' }, e.message));
  }
}

async function confirmDelete(p) {
  if (!confirm(`Delete “${p.title}”, its images and all comments? This can’t be undone.`)) return;
  try {
    await deletePost(p); toast('Post deleted', 'ok');
    if (location.hash) location.hash = ''; else route();
  }
  catch (e) { toast(e.message, 'error'); }
}

// ───────────── editor ─────────────
async function editorView(id) {
  let original = null;
  if (id) {
    try { original = await getPost(id); } catch (e) { toast(e.message, 'error'); }
    if (!original) { toast('Post not found', 'error'); location.hash = ''; return; }
  }

  // items: [{ existing } | { file, url }]
  let items = (original?.images || []).map(existing => ({ existing }));
  const previews = h('div', { class: 'previews' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });

  function addFiles(files) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'));
    if (imgs.length < files.length) toast('Only image files can be added', 'error');
    items.push(...imgs.map(file => ({ file, url: URL.createObjectURL(file) })));
    drawPreviews();
  }

  function move(k, d) {
    const j = k + d; if (j < 0 || j >= items.length) return;
    [items[k], items[j]] = [items[j], items[k]]; drawPreviews();
  }

  function drawPreviews() {
    previews.replaceChildren(...items.map((it, k) => h('div', { class: 'pv' },
      h('img', { src: it.url || imageUrl(it.existing.thumb || it.existing.full), alt: '' }),
      k === 0 ? h('span', { class: 'pv-first' }, 'COVER') : null,
      h('div', { class: 'pv-tools' },
        h('div', { style: 'display:flex;gap:4px' },
          h('button', { type: 'button', title: 'Move left', onclick: () => move(k, -1) }, '←'),
          h('button', { type: 'button', title: 'Move right', onclick: () => move(k, 1) }, '→')),
        h('button', {
          type: 'button', class: 'rm', title: 'Remove', onclick: () => {
            if (it.url) URL.revokeObjectURL(it.url);
            items.splice(k, 1); drawPreviews();
          },
        }, '×')))));
  }

  const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', onclick: () => fileInput.click(),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } },
    h('div', {}, 'Drag images here or ', h('strong', {}, 'browse')),
    h('div', { class: 'hint', style: 'margin-top:4px' }, 'Resized automatically for fast loading. The first image is the cover.'));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  document.onpaste = e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) addFiles(f); };

  const title = h('input', { class: 'input', id: 't', maxlength: '200', required: true, value: original?.title || '', placeholder: 'Post title' });
  const desc = h('textarea', { class: 'textarea', id: 'd', maxlength: '20000', style: 'min-height:200px', placeholder: 'Write a description…' });
  desc.value = original?.description || '';
  const progress = h('span', { class: 'progress' });
  const saveBtn = h('button', { class: 'btn btn-accent', type: 'submit' }, id ? 'Save changes' : 'Publish');

  const form = h('form', { class: 'panel' },
    h('p', { class: 'section-label' }, '1 · Media'),
    drop, fileInput, previews,
    h('p', { class: 'section-label', style: 'margin-top:30px' }, '2 · Title & description'),
    h('div', { class: 'field' }, h('label', { for: 't' }, 'Title'), title),
    h('div', { class: 'field' }, h('label', { for: 'd' }, 'Description'), desc,
      h('span', { class: 'hint' }, 'Line breaks are kept. Links become clickable.')),
    h('div', { class: 'form-actions' },
      progress,
      id ? h('button', { class: 'btn btn-danger', type: 'button', onclick: () => confirmDelete(original) }, 'Delete') : null,
      h('a', { class: 'btn', href: '#' }, 'Cancel'),
      saveBtn));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!title.value.trim()) { toast('Add a title', 'error'); title.focus(); return; }
    saveBtn.disabled = true;
    try {
      const saved = await savePost(
        { id, title: title.value, description: desc.value, items, original },
        msg => { progress.textContent = msg; });
      items.forEach(it => it.url && URL.revokeObjectURL(it.url));
      toast(id ? 'Saved' : 'Published', 'ok');
      location.href = `post.html?id=${encodeURIComponent(saved.id)}`;
    } catch (err) {
      toast(err.message, 'error');
      progress.textContent = '';
      saveBtn.disabled = false;
    }
  });

  app.replaceChildren(
    h('div', { class: 'admin-top' },
      h('div', {}, h('h1', {}, id ? 'Edit post' : 'New post'),
        h('p', { class: 'admin-sub' }, h('a', { href: '#', class: 'nav-link' }, '← Back to all posts')))),
    form);
  drawPreviews();
  if (!id) title.focus();
}
