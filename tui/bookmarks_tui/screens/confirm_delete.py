"""Confirmation modal for bulk delete."""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Static

from ..models import Link
from ..widgets.compact import CompactButton

MAX_TITLES = 5


class ConfirmDeleteScreen(ModalScreen[bool]):
    BINDINGS = [
        ("y", "confirm", "Delete"),
        ("n", "cancel", "Cancel"),
        ("escape", "cancel", "Cancel"),
    ]

    def __init__(self, links: list[Link]) -> None:
        super().__init__()
        self.links = links

    def compose(self) -> ComposeResult:
        count = len(self.links)
        titles = [f"• {link.title}" for link in self.links[:MAX_TITLES]]
        if count > MAX_TITLES:
            titles.append(f"…and {count - MAX_TITLES} more")
        with Vertical(classes="confirmDelete"):
            yield Label(
                f"Delete {count} bookmark{'s' if count != 1 else ''}?",
                classes="confirmDelete__question",
            )
            yield Static("\n".join(titles), classes="confirmDelete__titles")
            with Horizontal(classes="confirmDelete__buttons"):
                yield CompactButton("Delete", variant="error", id="delete")
                yield CompactButton("Cancel", id="cancel")

    def on_mount(self) -> None:
        # Cancel gets focus so a stray Enter can't delete.
        self.query_one("#cancel", Button).focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss(event.button.id == "delete")

    def action_confirm(self) -> None:
        self.dismiss(True)

    def action_cancel(self) -> None:
        self.dismiss(False)
