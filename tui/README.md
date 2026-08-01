# bookmarks-tui

Terminal UI for managing the `links` table in the site's Turso database.
Connects to the **production** database by default; pass `--dev` to use the
dev database (`TURSO_DB_URL`). Credentials come from the repo-root `.env`
(`TURSO_DB_PROD_URL`, `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`). The active target
(PROD / dev) is always shown in the header.

Unlike the website, the TUI shows private links by default. In the list's
"P" column, a red `●` marks private links and a dim `○` marks public ones
(the ones visible on the website).

The default theme is `ansi-flavours` (a tweaked `ansi-dark`), which renders
with the terminal's own palette and background — so it inherits whatever
flavours/base16 scheme the terminal is using. Form fields are compact
(single-row, borderless) and signified by background fills: base01 (indexed
color 18) when idle, base02 (19) when focused — the slots base16 terminal
templates reserve for "lighter background" and "selection background". Row
striping also uses base01; muted text uses bright black (base03). Pass
`--theme <name>` (any Textual built-in, e.g. `ansi-light`, `gruvbox`) to
override.

## Run

```bash
cd tui
uv run bookmarks-tui        # prod
uv run bookmarks-tui --dev  # dev database
```

## Keys

| Key                 | Where      | Action                                                          |
| ------------------- | ---------- | --------------------------------------------------------------- |
| type                | search box | live filter across title/url/comment/tags (matches highlighted) |
| `enter`             | anywhere   | open the highlighted bookmark in the browser and quit           |
| `↓`                 | search box | move into the list                                              |
| `escape`            | anywhere   | clear active search (refocuses it) · then search → list → quit  |
| `j` / `k`           | list       | move down / up                                                  |
| `/`                 | list       | back to the search box                                          |
| `e`                 | list       | edit the highlighted bookmark                                   |
| `n`                 | list       | new bookmark                                                    |
| `space`             | list       | toggle selection (for bulk delete)                              |
| `d`                 | list       | delete selected (or highlighted) bookmarks, with confirmation   |
| `r`                 | list       | refresh from Turso                                              |
| `p`                 | list       | toggle hiding private links                                     |
| `escape`            | form       | cancel                                                          |
| `ctrl+s` / `ctrl+t` | form       | save · re-fetch page title                                      |
| `q`                 | list       | quit                                                            |

Creating a new bookmark prefills the URL and title from the active Firefox
tab (read from the profile's session store, which Firefox writes every ~15
seconds — a just-opened page may briefly show the previous one). Otherwise,
tabbing out of the URL field auto-fills an empty title from the page's
`og:title`/`<title>`, and the tags field autocompletes from your existing
tags (comma separated).

## GNOME hotkeys

Two custom shortcuts (Settings → Keyboard → Custom Shortcuts, or `gsettings`)
point at the launcher, which forwards its arguments:

- `Ctrl+Shift+Y` → `tui/bin/bookmarks-tui` — the list view
- `Ctrl+Shift+E` → `tui/bin/bookmarks-tui --new` — straight into the
  new-bookmark form; saving or cancelling closes the window (quick add)

Optional: add a window rule (e.g. via a tiling extension) matching the window
class `bookmarks-tui` to float/center the window. The app exits when you open
a bookmark, so the window closes itself.

## Development

```bash
uv run textual run --dev bookmarks_tui.app:dev_app   # dev DB, live devtools
uv run textual console                               # in another terminal
```
