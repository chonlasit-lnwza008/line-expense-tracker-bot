# Best Deployment Option

## Recommendation

Use **Render Free** first for the public webhook URL, then move persistence to **Supabase Free** when you want data to survive redeploys.

Why this is the best next step:

- LINE needs a stable HTTPS webhook URL.
- Render gives a stable URL such as `https://line-expense-tracker-bot.onrender.com`.
- You do not need to keep your computer on.
- You do not need ngrok/localtunnel/quick Cloudflare URL changes.
- It can still start on a free plan.

Important limitation:

- Render Free web services can sleep after inactivity, so the first request after sleep can be slow.
- SQLite and uploaded images on a free ephemeral filesystem are not production-safe. Redeploys can lose local data/files.

## Phase 1: Deploy Existing App to Render

This is the fastest stable-URL setup.

1. Push this project to GitHub.
2. Create a Render account.
3. Create a new Web Service from the GitHub repository.
4. Use:

```text
Build Command: npm install && npm run migrate
Start Command: npm start
```

5. Add environment variables:

```env
LINE_CHANNEL_ACCESS_TOKEN=your LINE token
LINE_CHANNEL_SECRET=your LINE secret
DATABASE_PATH=./data/app.db
IMAGE_STORAGE_PATH=./uploads
PORT=10000
```

Render sets `PORT` automatically, so you usually do not need to add it manually.

6. After deploy, set LINE webhook URL:

```text
https://YOUR_RENDER_SERVICE.onrender.com/webhook
```

## Phase 2: Make Data Persistent

For real use, move from local SQLite/images to:

- Supabase Free Postgres for transactions, budgets, goals, users
- Supabase Storage or Cloudinary Free for receipt/slip images

Supabase Free currently includes a small free Postgres database and file storage quota, enough for personal testing/MVP use.

## Alternative: Cloudflare Named Tunnel

Use this if you want to keep running the bot on your computer but stop changing the webhook URL.

Requirements:

- Own a domain
- Add the domain to Cloudflare
- Create a named Cloudflare Tunnel
- Use a hostname such as:

```text
https://linebot.yourdomain.com/webhook
```

This avoids URL changes, but your computer must stay on.

## What Not To Use Long Term

Avoid these for stable LINE webhook use:

- `trycloudflare.com` quick tunnels: URL changes after restart.
- random localtunnel URLs: unstable and can timeout.
- ngrok dynamic URLs: URL changes.
- ngrok free browser-warning URLs: can interfere with webhook calls.
