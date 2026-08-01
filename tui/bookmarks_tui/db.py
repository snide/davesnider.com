"""All SQL against the `links` table lives here.

Every operation is a single parameterized statement + commit (remote libsql
interactive transactions are unreliable). The libsql client is blocking and
not safe for concurrent use, so callers must invoke these methods from thread
workers only, and a lock serializes access to the one connection.

The database has FTS5 triggers (links_ai/ad/au) that keep `links_fts` in sync
with plain writes to `links` — nothing FTS-related is needed here.
"""

from __future__ import annotations

import threading
import time

import libsql

from .models import Link, normalize_tags


class DatabaseError(Exception):
    pass


class Database:
    def __init__(self, url: str, auth_token: str) -> None:
        self._lock = threading.Lock()
        try:
            self._conn = libsql.connect(url, auth_token=auth_token)
        except Exception as exc:  # noqa: BLE001 - surface as our error type
            raise DatabaseError(f"Could not connect to database: {exc}") from exc

    def list_links(self) -> list[Link]:
        rows = self._run(
            "SELECT id, title, url, comment, tags, is_private, created_at"
            " FROM links ORDER BY created_at DESC, id DESC"
        ).fetchall()
        return [
            Link(
                id=row[0],
                title=row[1],
                url=row[2],
                comment=row[3],
                tags=row[4],
                is_private=bool(row[5]),
                created_at=row[6],
            )
            for row in rows
        ]

    def create_link(
        self, title: str, url: str, comment: str | None, tags: str | None, is_private: bool
    ) -> Link:
        created_at = int(time.time())
        tags = normalize_tags(tags)
        cursor = self._run(
            "INSERT INTO links (title, url, comment, tags, is_private, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (title, url, comment or None, tags, int(is_private), created_at),
            commit=True,
        )
        return Link(
            id=cursor.lastrowid,
            title=title,
            url=url,
            comment=comment or None,
            tags=tags,
            is_private=is_private,
            created_at=created_at,
        )

    def update_link(self, link: Link) -> Link:
        link.tags = normalize_tags(link.tags)
        self._run(
            "UPDATE links SET title = ?, url = ?, comment = ?, tags = ?, is_private = ?"
            " WHERE id = ?",
            (
                link.title,
                link.url,
                link.comment or None,
                link.tags,
                int(link.is_private),
                link.id,
            ),
            commit=True,
        )
        return link

    def delete_links(self, ids: list[int]) -> None:
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        self._run(
            f"DELETE FROM links WHERE id IN ({placeholders})", tuple(ids), commit=True
        )

    def _run(self, sql: str, params: tuple = (), *, commit: bool = False):
        with self._lock:
            try:
                cursor = self._conn.execute(sql, params)
                if commit:
                    self._conn.commit()
                return cursor
            except Exception as exc:  # noqa: BLE001 - surface as our error type
                raise DatabaseError(str(exc)) from exc
