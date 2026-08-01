"""Autocomplete for a comma-separated tags Input.

Subclasses textual-autocomplete's AutoComplete so that matching and completion
operate only on the segment after the last comma before the cursor. If this
library ever breaks under a Textual upgrade, the fallback is a hand-rolled
OptionList overlay under the input (~60 lines) — all usage is isolated here.
"""

from __future__ import annotations

from textual.widgets import Input
from textual_autocomplete import AutoComplete, DropdownItem, TargetState


class TagAutoComplete(AutoComplete):
    def get_search_string(self, target_state: TargetState) -> str:
        prefix = target_state.text[: target_state.cursor_position]
        return prefix.rsplit(",", 1)[-1].strip()

    def apply_completion(self, value: str, state: TargetState) -> None:
        target = self.target
        prefix = state.text[: state.cursor_position]
        comma = prefix.rfind(",")
        head = f"{state.text[: comma + 1].rstrip()} " if comma != -1 else ""
        with self.prevent(Input.Changed):
            target.value = f"{head}{value}, "
            target.cursor_position = len(target.value)
        new_state = self._get_target_state()
        self._rebuild_options(new_state, self.get_search_string(new_state))


def tag_candidates(provider):
    """Build a candidates callable from a () -> list[str] vocabulary provider.

    Evaluated per keystroke, so a form opened before the link list has loaded
    still picks up the vocabulary once it arrives.
    """

    def candidates(_state: TargetState) -> list[DropdownItem]:
        return [DropdownItem(main=tag) for tag in provider()]

    return candidates
