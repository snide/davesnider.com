# Website for Dave Snider

https://davesnider.com

This site is powered by [Astro][0], Svelte[5], [Turso][1], [Cloudflare][7] and hosted on [Vercel][2]. It is provided publicly so others can learn from the code, but please do not copy the design.

The fonts are paid-fonts I've licensed through [SG Type][3] and [Berkeley Graphics][4]. Using these fonts in your your own project without obtaining your own license is illegal and not very cool.

## Credentials

You'll need access to a [Turso][1] API key to run the museum locally. If you're curious, I wrote up a detailed blog about how it works over [here][6]

## Commands

All commands are run from the root of the project, from a terminal:

| Command                 | Action                                           |
| :---------------------- | :----------------------------------------------- |
| `pnpm install`          | Installs dependencies                            |
| `pnpm run dev`          | Starts local dev server at `localhost:3000`      |
| `pnpm run build`        | Build your production site to `./dist/`          |
| `pnpm run preview`      | Preview your build locally, before deploying     |
| `pnpm run astro ...`    | Run CLI commands like `astro add`, `astro check` |
| `pnpm run astro --help` | Get help using the Astro CLI                     |

[0]: https://astro.build/
[1]: https://turso.tech
[2]: https://vercel.com
[3]: https://sgtype.com/collections/fonts
[4]: https://berkeleygraphics.com/typefaces/berkeley-mono/
[5]: https://svelte.dev/
[6]: https://www.davesnider.com/posts/screenshot-app
[7]: https://cloudflare.com
