"""Compact form widgets that signal focus with palette backgrounds.

Compact mode drops the 3-row bordered chrome; in its place, under ANSI
themes, fields get background fills from the base16 palette: idle uses
indexed color 18 (base01, "lighter background") and focus uses 19 (base02,
"selection background"). TCSS can only name the 16 standard ANSI colors, so
the backgrounds are applied as inline styles. Truecolor themes keep Textual's
own compact styling (the inline background is cleared).
"""

from __future__ import annotations

from textual.color import Color
from textual.theme import Theme
from textual.widgets import Button, Input, RadioButton, RadioSet, TextArea

# RGB components are placeholders; only the ANSI index is emitted in
# passthrough mode.
IDLE_BG = Color(84, 54, 47, ansi=18)  # base01
FOCUS_BG = Color(109, 70, 61, ansi=19)  # base02


class AnsiBackgroundMixin:
    """Manage the inline background of a compact widget across focus/theme."""

    def on_mount(self) -> None:
        # call_after_refresh so child targets (e.g. radio buttons) exist.
        self.call_after_refresh(self._apply_ansi_background)
        self.app.theme_changed_signal.subscribe(self, self._on_theme_changed)

    def _on_theme_changed(self, _theme: Theme) -> None:
        self._apply_ansi_background()

    def _background_targets(self):
        """Widgets that receive the fill — the widget itself by default."""
        return [self]

    def _apply_ansi_background(self, focused: bool | None = None) -> None:
        # Focus/Blur events arrive before the has_focus reactive updates, so
        # handlers pass the new state explicitly.
        if focused is None:
            focused = self.has_focus
        if self.app.current_theme.ansi:
            background = FOCUS_BG if focused else IDLE_BG
        else:
            background = None
        for target in self._background_targets():
            target.styles.background = background

    def on_focus(self) -> None:
        self._apply_ansi_background(focused=True)

    def on_blur(self) -> None:
        self._apply_ansi_background(focused=False)


class CompactInput(AnsiBackgroundMixin, Input):
    def __init__(self, *args, **kwargs) -> None:
        kwargs.setdefault("compact", True)
        # No select-all-on-focus: prefilled fields would render as a
        # full-width selection band.
        kwargs.setdefault("select_on_focus", False)
        super().__init__(*args, **kwargs)


class CompactTextArea(AnsiBackgroundMixin, TextArea):
    def __init__(self, *args, **kwargs) -> None:
        kwargs.setdefault("compact", True)
        super().__init__(*args, **kwargs)


class ChipRadioButton(RadioButton):
    """Radio button whose indicator is a bare dot.

    The stock indicator wraps the dot in ▐ ▌ side-caps colored from its
    background, which renders as stray blocks inside a filled chip.
    """

    BUTTON_LEFT = ""
    BUTTON_RIGHT = " "  # gap between the dot and its label


class CompactRadioSet(AnsiBackgroundMixin, RadioSet):
    """The row stays transparent; each radio option is a filled chip."""

    def __init__(self, *args, **kwargs) -> None:
        kwargs.setdefault("compact", True)
        super().__init__(*args, **kwargs)

    def _background_targets(self):
        return list(self.query(RadioButton))


class CompactButton(AnsiBackgroundMixin, Button):
    def __init__(self, *args, **kwargs) -> None:
        kwargs.setdefault("compact", True)
        super().__init__(*args, **kwargs)
