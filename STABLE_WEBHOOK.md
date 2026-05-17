# Stable Webhook URL

Quick tunnels such as `trycloudflare.com` and random localtunnel URLs are temporary. They are good for a quick test, but the URL can change after restart. For LINE webhook testing, use one of these options.

## Option A: ngrok Free Static Dev Domain

This is the easiest free option when you do not own a domain.

1. Create a free ngrok account: https://dashboard.ngrok.com/signup
2. In the ngrok dashboard, copy your authtoken.
3. Run once:

```powershell
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
```

4. In the ngrok dashboard, find your free dev/static domain. It looks similar to:

```text
your-name.ngrok-free.app
```

5. Start the bot:

```powershell
npm start
```

6. Start ngrok with your static URL:

```powershell
ngrok http 3000 --url https://your-name.ngrok-free.app
```

7. Set LINE webhook URL to:

```text
https://your-name.ngrok-free.app/webhook
```

After this, you can stop/start ngrok and keep the same LINE webhook URL as long as you use the same ngrok domain.

## Option B: Cloudflare Named Tunnel

This is a good free option if you own a domain and can put it on Cloudflare.

1. Add your domain to Cloudflare.
2. Create a named Cloudflare Tunnel.
3. Map a public hostname such as:

```text
linebot.yourdomain.com
```

4. Point it to:

```text
http://localhost:3000
```

5. Set LINE webhook URL to:

```text
https://linebot.yourdomain.com/webhook
```

## Current Recommendation

Use ngrok free static/dev domain for this project unless you already own a domain. It avoids changing the LINE webhook URL every time you restart the tunnel.
