// Data layer: talks to Supabase, or to an in-browser demo store when
// config.js hasn't been filled in yet.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const BUCKET = 'post-images';
export const DEMO = !SUPABASE_URL || SUPABASE_URL.includes('YOUR_');

let sb = null;
if (!DEMO) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ───────────────────────── helpers ─────────────────────────

export function imageUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

function searchWords(q) {
  return (q || '')
    .toLowerCase()
    .replace(/[%_\\,()*"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
}

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

// Resize an image in the browser so pages load fast.
// Returns { full: Blob, thumb: Blob, w, h, ext }
export async function processImage(file, maxFull = 2000, maxThumb = 640) {
  const bmp = await createImageBitmap(file);
  const encode = async (max, quality) => {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    let blob = await new Promise(r => c.toBlob(r, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp') {           // Safari can't encode WebP
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    }
    return { blob, w, h };
  };
  const full = file.type === 'image/gif' ? { blob: file, w: bmp.width, h: bmp.height } : await encode(maxFull, 0.86);
  const thumb = await encode(maxThumb, 0.8);
  bmp.close?.();
  const ext = b => (b.type === 'image/webp' ? 'webp' : b.type === 'image/gif' ? 'gif' : 'jpg');
  return { full: full.blob, thumb: thumb.blob, w: full.w, h: full.h, extFull: ext(full.blob), extThumb: ext(thumb.blob) };
}

// ───────────────────────── demo store ─────────────────────────

function svgArt(seed, label) {
  const palettes = [
    ['#2b1d14', '#8a5a3b', '#d9b48f'], ['#0f1a24', '#2f5d73', '#a8c5cf'],
    ['#1b1b1f', '#4b3f5c', '#c3a6d8'], ['#14201a', '#3e6b4f', '#b9d3a8'],
    ['#24140f', '#9c3d2a', '#f0b37e'], ['#121417', '#55606b', '#d5d9dd'],
  ];
  const [a, b, c] = palettes[seed % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
  <radialGradient id="s" cx="${30 + (seed * 13) % 40}%" cy="38%" r="22%"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1600" height="1100" fill="url(#g)"/><rect width="1600" height="1100" fill="url(#s)"/>
  <path d="M0 ${760 + (seed % 3) * 40} Q 400 ${640 + (seed % 4) * 30} 800 ${740} T 1600 ${700 + (seed % 5) * 20} V1100 H0Z" fill="${a}" opacity=".85"/>
  <text x="60" y="1040" font-family="Georgia,serif" font-size="44" fill="${c}" opacity=".55">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function demoSeed() {
  const now = Date.now(), day = 864e5;
  const mk = (i, title, description, n, ago) => ({
    id: 'demo-' + i, title, description,
    images: Array.from({ length: n }, (_, k) => {
      const u = svgArt(i * 3 + k, `${title} · ${k + 1}`);
      return { full: u, thumb: u, w: 1600, h: 1100 };
    }),
    created_at: new Date(now - ago * day).toISOString(),
  });
  const posts = [
    mk(1, 'Golden hour at the pier', 'Shot just before sunset. The light turned everything amber for about ten minutes.\n\nCamera: 35mm, f/2.8, 1/500.', 3, 1),
    mk(2, 'Harbor fog', 'Early morning fog rolling over the boats. Barely any color — nearly monochrome straight out of camera.', 2, 3),
    mk(3, 'Night market', 'Neon, steam and noise. Handheld at ISO 3200.', 4, 6),
    mk(4, 'Forest trail', 'A quiet walk after the rain. Moss everywhere.', 1, 9),
    mk(5, 'Desert road', 'Two hours without seeing another car.', 2, 14),
    mk(6, 'Studio still life', 'Testing a single softbox setup with a black backdrop.', 1, 20),
  ];
  const comments = [
    { id: 'c1', post_id: 'demo-1', name: 'Maya', body: 'That second frame is beautiful.', created_at: new Date(now - 0.5 * day).toISOString() },
    { id: 'c2', post_id: 'demo-1', name: null, body: 'What lens was this?', created_at: new Date(now - 0.2 * day).toISOString() },
    { id: 'c3', post_id: 'demo-3', name: 'R.', body: 'Love the color here.', created_at: new Date(now - 4 * day).toISOString() },
  ];
  return { posts, comments, admin: false };
}

const DEMO_KEY = 'gallery-demo-v1';
function demoLoad() {
  try { const s = sessionStorage.getItem(DEMO_KEY); if (s) return JSON.parse(s); } catch {}
  return demoSeed();
}
function demoSave(st) {
  try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(st)); } catch {}
}
const demo = DEMO ? demoLoad() : null;
const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

// ───────────────────────── public API ─────────────────────────

export async function listPosts({ q = '', offset = 0, limit = 12 } = {}) {
  const words = searchWords(q);
  if (DEMO) {
    let rows = [...demo.posts].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (words.length) rows = rows.filter(p => {
      const t = (p.title + ' ' + p.description).toLowerCase();
      return words.every(w => t.includes(w));
    });
    const page = rows.slice(offset, offset + limit).map(p => ({
      ...p, comment_count: demo.comments.filter(c => c.post_id === p.id).length,
    }));
    return { rows: page, total: rows.length };
  }
  let query = sb.from('posts')
    .select('id,title,description,images,created_at,comments(count)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  for (const w of words) query = query.ilike('search_text', `%${w}%`);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return {
    rows: data.map(p => ({ ...p, comment_count: p.comments?.[0]?.count ?? 0 })),
    total: count ?? data.length,
  };
}

export async function getPost(id) {
  if (DEMO) return demo.posts.find(p => p.id === id) || null;
  const { data, error } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listComments(postId) {
  if (DEMO) return demo.comments.filter(c => c.post_id === postId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return check(await sb.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true }));
}

export async function addComment({ postId, name, body }) {
  if (DEMO) {
    const c = { id: 'c' + Date.now(), post_id: postId, name: name?.trim() || null, body: body.trim(), created_at: new Date().toISOString() };
    demo.comments.push(c); demoSave(demo); return c;
  }
  return check(await sb.from('comments')
    .insert({ post_id: postId, name: name?.trim() || null, body: body.trim() })
    .select().single());
}

export async function deleteComment(id) {
  if (DEMO) { demo.comments = demo.comments.filter(c => c.id !== id); demoSave(demo); return; }
  check(await sb.from('comments').delete().eq('id', id));
}

// ── auth ──
export async function signIn(email, password) {
  if (DEMO) { demo.admin = true; demoSave(demo); return; }
  check(await sb.auth.signInWithPassword({ email, password }));
}
export async function signOut() {
  if (DEMO) { demo.admin = false; demoSave(demo); return; }
  await sb.auth.signOut();
}
export async function currentUser() {
  if (DEMO) return demo.admin ? { email: 'demo@example.com' } : null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}
export async function isAdmin() {
  if (DEMO) return !!demo.admin;
  if (!(await currentUser())) return false;
  const { data, error } = await sb.rpc('is_admin');
  return !error && data === true;
}

// ── posts (admin) ──
async function uploadImages(postId, files, onProgress) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(`Processing image ${i + 1} of ${files.length}…`);
    const img = await processImage(files[i]);
    if (DEMO) {
      out.push({ full: await blobToDataUrl(img.thumb), thumb: await blobToDataUrl(img.thumb), w: img.w, h: img.h });
      continue;
    }
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const full = `posts/${postId}/${key}.${img.extFull}`;
    const thumb = `posts/${postId}/${key}_t.${img.extThumb}`;
    onProgress?.(`Uploading image ${i + 1} of ${files.length}…`);
    const opts = { cacheControl: '31536000', upsert: false };
    check(await sb.storage.from(BUCKET).upload(full, img.full, { ...opts, contentType: img.full.type }));
    check(await sb.storage.from(BUCKET).upload(thumb, img.thumb, { ...opts, contentType: img.thumb.type }));
    out.push({ full, thumb, w: img.w, h: img.h });
  }
  return out;
}

async function removeImageFiles(images) {
  const paths = images.flatMap(i => [i.full, i.thumb]).filter(p => p && !/^(data:|blob:|https?:)/.test(p));
  if (!DEMO && paths.length) await sb.storage.from(BUCKET).remove(paths);
}

/**
 * Save a post. `items` is the final ordered list of images, each either
 * { existing: {full,thumb,w,h} } or { file: File }.
 */
export async function savePost({ id, title, description, items, original }, onProgress) {
  const postId = id || crypto.randomUUID();
  const newFiles = items.filter(x => x.file).map(x => x.file);
  const uploaded = await uploadImages(postId, newFiles, onProgress);
  let u = 0;
  const images = items.map(x => (x.file ? uploaded[u++] : x.existing));
  const removed = (original?.images || []).filter(o => !images.some(i => i.full === o.full));

  onProgress?.('Saving post…');
  const row = { title: title.trim(), description: description.trim(), images };
  let saved;
  if (DEMO) {
    if (id) {
      const p = demo.posts.find(p => p.id === id); Object.assign(p, row); saved = p;
    } else {
      saved = { id: postId, ...row, created_at: new Date().toISOString() }; demo.posts.push(saved);
    }
    demoSave(demo);
  } else if (id) {
    saved = check(await sb.from('posts').update(row).eq('id', id).select().single());
  } else {
    saved = check(await sb.from('posts').insert({ id: postId, ...row }).select().single());
  }
  await removeImageFiles(removed);
  return saved;
}

export async function deletePost(post) {
  if (DEMO) {
    demo.posts = demo.posts.filter(p => p.id !== post.id);
    demo.comments = demo.comments.filter(c => c.post_id !== post.id);
    demoSave(demo); return;
  }
  check(await sb.from('posts').delete().eq('id', post.id));
  await removeImageFiles(post.images || []);
}
