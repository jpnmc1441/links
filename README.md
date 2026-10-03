# Gallery DB — searchable posts with images & comments

Static site (HTML/CSS/JS, no build step) + Supabase backend. Hosts on Netlify from GitHub.

```
index.html        Feed + search
post.html         Single post: 1) images  2) title & description  3) comments
admin.html        Sign in, create / edit / delete posts
assets/config.js  ← your Supabase URL + anon key go here
assets/*.js|css   App code & styles
supabase/schema.sql  Run once in Supabase
```

Until you fill in `config.js`, the site runs in **demo mode** with sample posts so you can preview it.

---

## Setup (about 10 minutes)

### 1. Create the Supabase project
1. https://supabase.com → **New project** (free tier is fine).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   This creates the `posts`, `comments`, `admins` tables, search index, security rules, and the `post-images` storage bucket.

### 2. Lock down sign-ups (only you post)
**Authentication → Sign In / Providers → Email**: turn **off** “Allow new users to sign up”.

### 3. Create your admin login
**Authentication → Users → Add user → Create new user** → your email + a strong password → tick **Auto Confirm User**.

### 4. Make that user an admin
SQL Editor → run (with your email):
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'you@example.com';
```

### 5. Add your keys
**Project Settings → API** → copy **Project URL** and the **anon / publishable** key into `assets/config.js`:
```js
export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```
Change `SITE_NAME` / `SITE_TAGLINE` while you're there. (The anon key is safe to be public — the Row Level Security rules in the schema stop anyone but admins from writing posts or uploading images.)

### 6. Push to GitHub → Netlify
```bash
cd gallery-db
git init
git add .
git commit -m "Gallery DB"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Netlify → **Add new site → Import from GitHub** → pick the repo.
Build command: *(leave empty)* · Publish directory: `.` → **Deploy**.

### 7. Post
Go to `https://<your-site>.netlify.app/admin.html`, sign in, click **+ New post**.

---

## How it works
- **Search** matches every word you type against title + description (partial words work: “sun” finds “sunset”). Press `/` to jump to the search box.
- **Images** are resized in your browser before upload (2000px full + 640px thumbnail, WebP) so pages load fast. Drag to add, ← → to reorder, the first image is the cover. You can also paste images.
- **Comments**: anyone, name optional. When you're signed in as admin, a *Delete* link shows on each comment. Built-in spam protection: hidden bot-trap field, length limits, and max 5 comments per post per minute.
- **Deleting a post** also deletes its images from storage and its comments.

## Testing locally
ES modules need a web server (not `file://`):
```bash
python3 -m http.server 8000     # then open http://localhost:8000
```
