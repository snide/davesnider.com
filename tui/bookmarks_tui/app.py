"""App shell and CLI entry point."""

from __future__ import annotations

import argparse
import sys

from dataclasses import replace

from textual.app import App
from textual.theme import BUILTIN_THEMES

from .db import Database
from .env import Config, ConfigError, load_config
from .screens.list_screen import ListScreen

# ANSI themes render with the terminal's own palette (and default background),
# so the TUI inherits whatever flavours/base16 scheme is active. The stock
# ansi-dark theme maps $border-blurred to ansi_black, which is invisible in
# base16 terminals (color 0 == the background), leaving inputs/buttons without
# borders — remap the border variables to visible palette slots.
FLAVOURS_THEME = replace(
    BUILTIN_THEMES["ansi-dark"],
    name="ansi-flavours",
    variables={
        **BUILTIN_THEMES["ansi-dark"].variables,
        "border-blurred": "ansi_bright_black",  # base03: midshade for idle borders
        "border": "ansi_blue",  # focused borders match $primary
        # Subtle scrollbars: base03 thumb on the terminal background, with the
        # accent only while actively dragging (stock ansi-dark uses blue).
        "scrollbar": "ansi_bright_black",
        "scrollbar-hover": "ansi_bright_black",
        "scrollbar-active": "ansi_blue",
        "scrollbar-background": "ansi_default",
        "scrollbar-background-hover": "ansi_default",
        "scrollbar-background-active": "ansi_default",
        "scrollbar-corner-color": "ansi_default",
    },
)
DEFAULT_THEME = FLAVOURS_THEME.name


class BookmarksApp(App):
    CSS_PATH = "app.tcss"
    TITLE = "Bookmarks"

    def __init__(
        self,
        db: Database,
        config: Config,
        theme: str = DEFAULT_THEME,
        start_new: bool = False,
    ) -> None:
        super().__init__()
        self.register_theme(FLAVOURS_THEME)
        self.db = db
        self.db_target = config.target
        self.sub_title = config.target
        self.theme = theme
        self.start_new = start_new

    def on_mount(self) -> None:
        self.push_screen(ListScreen())


def build_app(
    dev: bool, theme: str = DEFAULT_THEME, start_new: bool = False
) -> BookmarksApp:
    config = load_config(dev=dev)
    return BookmarksApp(
        Database(config.url, config.auth_token), config, theme=theme, start_new=start_new
    )


def dev_app() -> BookmarksApp:
    """App factory for `textual run --dev bookmarks_tui.app:dev_app`."""
    return build_app(dev=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Bookmarks TUI")
    parser.add_argument(
        "--dev",
        action="store_true",
        help="use the dev database (TURSO_DB_URL) instead of prod (TURSO_DB_PROD_URL)",
    )
    parser.add_argument(
        "--new",
        action="store_true",
        help="open straight into the new-bookmark form; the app exits when it closes",
    )
    parser.add_argument(
        "--theme",
        default=DEFAULT_THEME,
        choices=sorted([*BUILTIN_THEMES, FLAVOURS_THEME.name]),
        help="color theme; the default ansi-flavours inherits the terminal's palette",
    )
    args = parser.parse_args()

    try:
        app = build_app(dev=args.dev, theme=args.theme, start_new=args.new)
    except ConfigError as exc:
        print(f"bookmarks-tui: {exc}", file=sys.stderr)
        raise SystemExit(1)

    app.run()


if __name__ == "__main__":
    main()
