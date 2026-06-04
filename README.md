# Website for Dave Snider

https://davesnider.com

This site is powered by [SvelteKit][0], [Svelte][5], [Turso][1], [Cloudflare R2][7] and hosted on [Fly.io][2]. It is provided publicly so others can learn from the code, but please do not copy the design.

The fonts are paid-fonts I've licensed through [SG Type][3] and [Berkeley Graphics][4]. Using these fonts in your own project without obtaining your own license is illegal and not very cool.

## Credentials

You'll need access to a [Turso][1] API key to run the museum locally. If you're curious, I wrote up a detailed blog about how it works over [here][6].

## Commands

All commands are run from the root of the project, from a terminal:

| Command                 | Action                                       |
| :---------------------- | :------------------------------------------- |
| `pnpm install`          | Installs dependencies                        |
| `pnpm run dev`          | Starts local dev server at `localhost:5177`  |
| `pnpm run build`        | Build your production site to `.svelte-kit/` |
| `pnpm run preview`      | Preview your build locally, before deploying |
| `pnpm run lint`         | Run eslint and svelte-check                  |
| `pnpm run format-write` | Format code with Prettier                    |
| `pnpm run test`         | Run Playwright e2e tests                     |

## Scripts

The `src/scripts` directory has a few Desktop scripts I use on my Linux desktop to upload to the museum portion of this site.

### Watch script

The `watchfiles` script monitors a local folder for new files (screenshots, images, etc.) and automatically:

1. Uploads them to both Google Cloud Storage (backup) and Cloudflare R2 (serving)
2. Creates a database record in Turso with a unique ID
3. Runs Google Vision API on images to extract labels, text content, and dominant colors
4. Sends a desktop notification with the shareable URL (copied to clipboard)
5. Deletes the local file after processing

This powers the screenshot workflow described in [this blog post][6]. Configure `WATCH_FOLDER` in your `.env` to point to your screenshot directory.

```bash
pnpm run watchfiles
```

### Upload Script

The `uploadfiles` script is for batch uploading a folder of files into a named gallery. Useful for one-time migrations or creating curated collections.

```bash
pnpm run uploadfiles /path/to/folder "Gallery Name"
```

## Local Tunnel for Webhooks

To test webhooks locally (Plex, GitHub, etc.), use [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/) to create a tunnel that exposes your local dev server to the internet.

### First-time setup

1. Install cloudflared:
   ```bash
   # Arch Linux
   yay -S cloudflared

   # macOS
   brew install cloudflared

   # Other: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
   ```

2. Authenticate with Cloudflare:
   ```bash
   cloudflared tunnel login
   ```

3. Create the tunnel:
   ```bash
   cloudflared tunnel create local-dev
   ```
   Note the tunnel ID from the output.

4. Route DNS (requires domain on Cloudflare):
   ```bash
   cloudflared tunnel route dns local-dev local.davesnider.com
   ```

5. Create `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: local-dev
   credentials-file: /home/YOUR_USER/.cloudflared/TUNNEL_ID.json

   ingress:
     - hostname: local.davesnider.com
       service: http://localhost:5177
     - service: http_status:404
   ```

### Running the tunnel

```bash
cloudflared tunnel run local-dev
```

Your local server is now accessible at `https://local.davesnider.com`. Use this URL for webhook configurations (Plex, GitHub, etc.).

**Security note:** Your entire dev server is publicly accessible while the tunnel runs. Stop it with `Ctrl+C` when not testing webhooks.

[0]: https://svelte.dev/docs/kit
[1]: https://turso.tech
[2]: https://fly.io
[3]: https://sgtype.com/collections/fonts
[4]: https://berkeleygraphics.com/typefaces/berkeley-mono/
[5]: https://svelte.dev/
[6]: https://www.davesnider.com/posts/screenshot-app
[7]: https://cloudflare.com
