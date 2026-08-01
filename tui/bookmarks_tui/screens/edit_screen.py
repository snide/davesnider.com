"""Create/edit form for a bookmark."""

from __future__ import annotations

from typing import Callable

import httpx
from textual import on, work
from textual.app import ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.screen import Screen
from textual.widgets import Button, Footer, Input, Label, RadioSet, TextArea

from ..db import DatabaseError
from ..firefox import current_tab
from ..models import Link
from ..title_fetch import fetch_title
from ..widgets.compact import (
    ChipRadioButton,
    CompactButton,
    CompactInput,
    CompactRadioSet,
    CompactTextArea,
)
from ..widgets.tag_autocomplete import TagAutoComplete, tag_candidates


class EditScreen(Screen[Link | None]):
    BINDINGS = [
        ("ctrl+s", "save", "Save"),
        ("escape", "cancel", "Cancel"),
        ("ctrl+t", "fetch_title", "Fetch title"),
    ]

    def __init__(self, link: Link | None, tag_vocab: Callable[[], list[str]]) -> None:
        super().__init__()
        self.link = link
        self.tag_vocab = tag_vocab

    def compose(self) -> ComposeResult:
        with VerticalScroll(classes="editForm"):
            yield Label(
                "Edit bookmark" if self.link else "New bookmark",
                classes="editForm__heading",
            )
            yield Label("Title", classes="editForm__label")
            yield CompactInput(id="title", placeholder="Title")
            yield Label("URL", classes="editForm__label")
            yield CompactInput(id="url", placeholder="https://…")
            yield Label("Comment", classes="editForm__label")
            yield CompactTextArea(id="comment", soft_wrap=True)
            yield Label("Tags (comma separated)", classes="editForm__label")
            tags_input = CompactInput(id="tags", placeholder="tag, another-tag")
            yield tags_input
            yield TagAutoComplete(tags_input, candidates=tag_candidates(self.tag_vocab))
            is_hidden = self.link.is_hidden if self.link else True
            yield Label("Hidden from links page", classes="editForm__label")
            yield CompactRadioSet(
                ChipRadioButton("yes", value=is_hidden),
                ChipRadioButton("no", value=not is_hidden),
                id="hidden",
            )
            with Horizontal(classes="editForm__buttons"):
                yield CompactButton("Save", variant="primary", id="save")
                yield CompactButton("Cancel", id="cancel")
        yield Footer()

    def on_mount(self) -> None:
        if self.link:
            self.query_one("#title", Input).value = self.link.title
            self.query_one("#url", Input).value = self.link.url
            self.query_one("#comment", TextArea).text = self.link.comment or ""
            self.query_one("#tags", Input).value = ", ".join(self.link.tag_list())
            self.query_one("#title", Input).focus()
            return
        # New link: prefill from the active Firefox tab (best-effort, may lag
        # Firefox's ~15s session-write interval).
        if tab := current_tab():
            url, title = tab
            self.query_one("#url", Input).value = url
            self.query_one("#title", Input).value = title
            self.query_one("#title", Input).focus()
        else:
            self.query_one("#url", Input).focus()

    # --- title auto-fetch ---------------------------------------------------

    @on(Input.Blurred, "#url")
    def url_blurred(self, event: Input.Blurred) -> None:
        if event.input.value.strip() and not self.query_one("#title", Input).value.strip():
            self.fetch_title_worker(self._normalized_url())

    def action_fetch_title(self) -> None:
        if self._normalized_url():
            self.fetch_title_worker(self._normalized_url())

    @work(exclusive=True, group="title-fetch")
    async def fetch_title_worker(self, url: str) -> None:
        title_input = self.query_one("#title", Input)
        placeholder = title_input.placeholder
        title_input.placeholder = "fetching…"
        try:
            title = await fetch_title(url)
        except (httpx.HTTPError, ValueError):
            title = None
        finally:
            title_input.placeholder = placeholder
        if title is None:
            self.notify("Couldn't fetch title", severity="warning")
        elif not title_input.value.strip():
            title_input.value = title

    # --- save/cancel --------------------------------------------------------

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "save":
            self.action_save()
        else:
            self.action_cancel()

    def action_cancel(self) -> None:
        self.dismiss(None)

    def action_save(self) -> None:
        title = self.query_one("#title", Input).value.strip()
        url = self._normalized_url()
        if not title or not url:
            self.notify("Title and URL are required", severity="error")
            return
        comment = self.query_one("#comment", TextArea).text.strip() or None
        tags = self.query_one("#tags", Input).value.strip() or None
        is_hidden = self.query_one("#hidden", RadioSet).pressed_index == 0
        self.save_worker(title, url, comment, tags, is_hidden)

    @work(thread=True, exclusive=True, group="save")
    def save_worker(
        self, title: str, url: str, comment: str | None, tags: str | None, is_hidden: bool
    ) -> None:
        db = self.app.db  # type: ignore[attr-defined]
        try:
            if self.link is None:
                saved = db.create_link(title, url, comment, tags, is_hidden)
            else:
                self.link.title = title
                self.link.url = url
                self.link.comment = comment
                self.link.tags = tags
                self.link.is_hidden = is_hidden
                saved = db.update_link(self.link)
        except DatabaseError as exc:
            self.app.call_from_thread(
                self.notify, f"Save failed: {exc}", severity="error"
            )
            return
        self.app.call_from_thread(self.dismiss, saved)

    def _normalized_url(self) -> str:
        url = self.query_one("#url", Input).value.strip()
        if url and "://" not in url:
            url = f"https://{url}"
        return url
