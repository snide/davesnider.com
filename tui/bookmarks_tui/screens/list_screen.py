"""List/search view: live-filtered table of bookmarks with multi-select."""

from __future__ import annotations

import webbrowser

from rich.color import Color as RichColor
from rich.style import Style
from rich.text import Text
from textual import on, work
from textual.app import ComposeResult
from textual.binding import Binding
from textual.screen import Screen
from textual.widgets import DataTable, Footer, Header, Input

from ..db import DatabaseError
from ..models import Link
from ..widgets.compact import CompactInput
from .confirm_delete import ConfirmDeleteScreen
from .edit_screen import EditScreen

HIGHLIGHT_STYLE = "bold reverse"
SNIPPET_CONTEXT = 30

# Single-cell markers render crisply where the 🔒 emoji doesn't: hidden rows
# get a red dot, listed rows a dim ring (they're the exception — visible on
# the website's /links page).
HIDDEN_MARK = Text("●", style="red")
LISTED_MARK = Text("○", style="dim")

# base16 terminal templates map base01 ("lighter background") to indexed
# color 18 — the palette's designated stripe/status-bar shade.
ANSI_STRIPE_STYLE = Style(bgcolor=RichColor.from_ansi(18))


class StripedDataTable(DataTable):
    """DataTable that stripes with the terminal palette under ANSI themes.

    TCSS can only name the 16 standard ANSI colors, but the right stripe
    shade (base01) lives at index 18, so we override the row-style hook.
    Private API, guarded by the textual <9 pin.

    Also adds vim-style j/k row navigation.
    """

    BINDINGS = [
        Binding("j", "cursor_down", "Down", show=False),
        Binding("k", "cursor_up", "Up", show=False),
    ]

    def _get_row_style(self, row_index: int, base_style: Style) -> Style:
        if row_index >= 0 and row_index % 2 == 0 and self.app.current_theme.ansi:
            return base_style + ANSI_STRIPE_STYLE
        return super()._get_row_style(row_index, base_style)


def highlight(value: str, query: str) -> Text:
    """Style every case-insensitive occurrence of query inside value."""
    text = Text(value)
    if query:
        lower = value.lower()
        start = lower.find(query)
        while start != -1:
            text.stylize(HIGHLIGHT_STYLE, start, start + len(query))
            start = lower.find(query, start + len(query))
    return text


def comment_snippet(comment: str, query: str) -> Text | None:
    """A dim excerpt around the first comment match, with the match styled."""
    index = comment.lower().find(query)
    if index == -1:
        return None
    start = max(0, index - SNIPPET_CONTEXT)
    end = min(len(comment), index + len(query) + SNIPPET_CONTEXT)
    excerpt = comment[start:end].replace("\n", " ")
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(comment) else ""
    snippet = highlight(f"{prefix}{excerpt}{suffix}", query)
    snippet.stylize("dim")
    return snippet


class ListScreen(Screen):
    BINDINGS = [
        ("e", "edit", "Edit"),
        ("n", "new", "New"),
        ("space", "toggle_select", "Select"),
        ("d", "delete", "Delete"),
        ("r", "refresh", "Refresh"),
        ("p", "toggle_hidden", "Listed only"),
        ("slash", "focus_search", "Search"),
        ("escape", "smart_escape", "Quit"),
        ("q", "app.quit", "Quit"),
        Binding("down", "focus_table", "List", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.all_links: list[Link] = []
        self.filtered: list[Link] = []
        self.selected: set[int] = set()
        self.search_query: str = ""
        self.hide_hidden = False

    def compose(self) -> ComposeResult:
        yield Header(icon="")
        yield CompactInput(placeholder="Search bookmarks…", id="search")
        yield StripedDataTable(cursor_type="row", zebra_stripes=True)
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.add_column("✓", key="sel", width=1)
        table.add_column("H", key="hidden", width=1)
        table.add_column("Title", key="title", width=48)
        table.add_column("URL", key="url", width=40)
        table.add_column("Tags", key="tags", width=24)
        table.add_column("Created", key="date", width=10)
        self.query_one("#search", Input).focus()
        table.loading = True
        self.load_worker()
        if getattr(self.app, "start_new", False):
            # Launched with --new (quick-add hotkey): open the form at once —
            # the tag vocabulary fills in live when the load worker finishes —
            # and close the app when the form is dismissed.
            self.app.push_screen(
                EditScreen(None, self._tag_vocab),
                callback=lambda _saved: self.app.exit(),
            )

    # --- data loading -------------------------------------------------------

    @work(thread=True, exclusive=True, group="load")
    def load_worker(self) -> None:
        db = self.app.db  # type: ignore[attr-defined]
        try:
            links = db.list_links()
        except DatabaseError as exc:
            self.app.call_from_thread(self._load_failed, str(exc))
            return
        self.app.call_from_thread(self._populate, links)

    def _load_failed(self, message: str) -> None:
        self.query_one(DataTable).loading = False
        self.notify(
            f"Failed to load — {message}. Check credentials, press r to retry.",
            severity="error",
            timeout=10,
        )

    def _populate(self, links: list[Link]) -> None:
        self.all_links = links
        self.selected &= {link.id for link in links}
        self.query_one(DataTable).loading = False
        self.rebuild()

    # --- filtering + rendering ----------------------------------------------

    @on(Input.Changed, "#search")
    def search_changed(self, event: Input.Changed) -> None:
        self.search_query = event.value.strip().lower()
        self.rebuild()

    def rebuild(self) -> None:
        table = self.query_one(DataTable)
        self.filtered = [
            link
            for link in self.all_links
            if (not self.hide_hidden or not link.is_hidden)
            and (not self.search_query or self.search_query in link.haystack())
        ]
        table.clear()
        for link in self.filtered:
            title = highlight(link.title, self.search_query)
            snippet = (
                comment_snippet(link.comment, self.search_query)
                if self.search_query and link.comment
                else None
            )
            if snippet is not None:
                title = Text.assemble(title, "\n", snippet)
            table.add_row(
                "✓" if link.id in self.selected else "",
                HIDDEN_MARK if link.is_hidden else LISTED_MARK,
                title,
                highlight(link.url, self.search_query),
                highlight(", ".join(link.tag_list()), self.search_query),
                link.created_date(),
                key=str(link.id),
                height=2 if snippet is not None else 1,
            )
        self._update_subtitle()

    def _update_subtitle(self) -> None:
        counts = f"{len(self.filtered)}/{len(self.all_links)}"
        selected = f" · {len(self.selected)} selected" if self.selected else ""
        hidden = " · listed only" if self.hide_hidden else ""
        self.app.sub_title = f"{self.app.db_target} · {counts}{selected}{hidden}"  # type: ignore[attr-defined]

    def cursor_link(self) -> Link | None:
        table = self.query_one(DataTable)
        if not self.filtered or table.cursor_row < 0:
            return None
        try:
            return self.filtered[table.cursor_row]
        except IndexError:
            return None

    # --- open in browser ----------------------------------------------------

    @on(DataTable.RowSelected)
    def row_selected(self, event: DataTable.RowSelected) -> None:
        link = next(
            (l for l in self.filtered if str(l.id) == event.row_key.value), None
        )
        if link:
            self._open_and_exit(link)

    @on(Input.Submitted, "#search")
    def search_submitted(self) -> None:
        link = self.cursor_link()
        if link:
            self._open_and_exit(link)

    def _open_and_exit(self, link: Link) -> None:
        webbrowser.open(link.url)
        self.app.exit()

    # --- actions ------------------------------------------------------------

    def action_focus_table(self) -> None:
        if self.query_one("#search", Input).has_focus:
            self.query_one(DataTable).focus()

    def action_focus_search(self) -> None:
        self.query_one("#search", Input).focus()

    def action_smart_escape(self) -> None:
        """Vim-style escape, one level per press.

        An active search is always the first thing escape backs out of:
        clearing it refocuses the search input. With no search, escape moves
        search → list, and from the list it quits.
        """
        search = self.query_one("#search", Input)
        if search.value:
            search.value = ""
            search.focus()
        elif search.has_focus:
            self.query_one(DataTable).focus()
        else:
            self.app.exit()

    def action_edit(self) -> None:
        link = self.cursor_link()
        if link:
            self.app.push_screen(
                EditScreen(link, self._tag_vocab),
                callback=lambda saved: self._on_saved(saved, created=False),
            )

    def action_new(self) -> None:
        self.app.push_screen(
            EditScreen(None, self._tag_vocab),
            callback=lambda saved: self._on_saved(saved, created=True),
        )

    def _tag_vocab(self) -> list[str]:
        return sorted({tag for link in self.all_links for tag in link.tag_list()})

    def _on_saved(self, saved: Link | None, *, created: bool) -> None:
        if saved is None:
            return
        if created:
            # Full refetch keeps ordering/ids consistent with the server.
            self.query_one(DataTable).loading = True
            self.load_worker()
        else:
            self.rebuild()
        self.notify(f"Saved “{saved.title}”")

    def action_toggle_select(self) -> None:
        link = self.cursor_link()
        if link is None or link.id is None:
            return
        table = self.query_one(DataTable)
        if link.id in self.selected:
            self.selected.discard(link.id)
        else:
            self.selected.add(link.id)
        table.update_cell(str(link.id), "sel", "✓" if link.id in self.selected else "")
        if table.cursor_row < len(self.filtered) - 1:
            table.move_cursor(row=table.cursor_row + 1)
        self._update_subtitle()

    def action_toggle_hidden(self) -> None:
        self.hide_hidden = not self.hide_hidden
        self.rebuild()

    def action_refresh(self) -> None:
        self.query_one(DataTable).loading = True
        self.load_worker()

    def action_delete(self) -> None:
        if self.selected:
            targets = [link for link in self.all_links if link.id in self.selected]
        else:
            link = self.cursor_link()
            targets = [link] if link else []
        if not targets:
            return
        self.app.push_screen(
            ConfirmDeleteScreen(targets),
            callback=lambda confirmed: self._delete_confirmed(targets)
            if confirmed
            else None,
        )

    def _delete_confirmed(self, targets: list[Link]) -> None:
        self.delete_worker([link.id for link in targets if link.id is not None])

    @work(thread=True, exclusive=True, group="delete")
    def delete_worker(self, ids: list[int]) -> None:
        db = self.app.db  # type: ignore[attr-defined]
        try:
            db.delete_links(ids)
        except DatabaseError as exc:
            self.app.call_from_thread(
                self.notify, f"Delete failed: {exc}", severity="error"
            )
            return
        self.app.call_from_thread(self._deleted, ids)

    def _deleted(self, ids: list[int]) -> None:
        removed = set(ids)
        self.all_links = [link for link in self.all_links if link.id not in removed]
        self.selected -= removed
        self.rebuild()
        self.notify(f"Deleted {len(ids)} bookmark{'s' if len(ids) != 1 else ''}")
