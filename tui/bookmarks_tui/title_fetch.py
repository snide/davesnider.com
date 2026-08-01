"""Fetch a page title for the create/edit form: og:title, falling back to <title>."""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser

import httpx

MAX_BYTES = 200 * 1024
TIMEOUT = 5.0
USER_AGENT = "Mozilla/5.0 (bookmarks-tui)"


class _TitleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.og_title: str | None = None
        self.title: str | None = None
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "meta":
            attr_map = dict(attrs)
            if attr_map.get("property") == "og:title" and attr_map.get("content"):
                if self.og_title is None:
                    self.og_title = attr_map["content"]
        elif tag == "title" and self.title is None:
            self._in_title = True
            self.title = ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title = (self.title or "") + data


def _clean(value: str | None) -> str | None:
    if not value:
        return None
    return re.sub(r"\s+", " ", html.unescape(value)).strip() or None


async def fetch_title(url: str) -> str | None:
    """Return the page title, or None on any failure (callers just notify)."""
    async with httpx.AsyncClient(
        timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT}
    ) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                chunks.append(chunk)
                total += len(chunk)
                if total >= MAX_BYTES:
                    break
            body = b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")

    parser = _TitleParser()
    parser.feed(body)
    return _clean(parser.og_title) or _clean(parser.title)
