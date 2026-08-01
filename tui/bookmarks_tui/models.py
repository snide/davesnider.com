"""Link model mirroring the site's `links` table (src/db/schema.ts)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


def split_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def normalize_tags(raw: str | None) -> str | None:
    """Split on commas, strip, lowercase, dedupe (order-preserving), rejoin."""
    seen: dict[str, None] = {}
    for tag in split_tags(raw):
        seen.setdefault(tag.lower(), None)
    return ",".join(seen) if seen else None


@dataclass
class Link:
    id: int | None
    title: str
    url: str
    comment: str | None
    tags: str | None
    is_private: bool
    created_at: int  # unix seconds

    def tag_list(self) -> list[str]:
        return split_tags(self.tags)

    def haystack(self) -> str:
        """Lowercased searchable text across all matchable fields."""
        parts = [self.title, self.url, self.comment or "", self.tags or ""]
        return "\n".join(parts).lower()

    def created_date(self) -> str:
        return datetime.fromtimestamp(self.created_at).strftime("%Y-%m-%d")
