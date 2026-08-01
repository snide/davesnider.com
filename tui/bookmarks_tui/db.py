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
            "SELECT id, title, url, comment, tags, is_hidden, created_at"
            " FROM links ORDER BY created_at DESC, id DESC"
        ).fetchall()
        return [
            Link(
                id=row[0],
                title=row[1],
                url=row[2],
                comment=row[3],
                tags=row[4],
                is_hidden=bool(row[5]),
                created_at=row[6],
            )
            for row in rows
        ]

    def create_link(
        self, title: str, url: str, comment: str | None, tags: str | None, is_hidden: bool
    ) -> Link:
        created_at = int(time.time())
        tags = normalize_tags(tags)
        cursor = self._run(
            "INSERT INTO links (title, url, comment, tags, is_hidden, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (title, url, comment or None, tags, int(is_hidden), created_at),
            commit=True,
        )
        link = Link(
            id=cursor.lastrowid,
            title=title,
            url=url,
            comment=comment or None,
            tags=tags,
            is_hidden=is_hidden,
            created_at=created_at,
        )
        self._sync_link_activity(link)
        return link

    def update_link(self, link: Link) -> Link:
        link.tags = normalize_tags(link.tags)
        self._run(
            "UPDATE links SET title = ?, url = ?, comment = ?, tags = ?, is_hidden = ?"
            " WHERE id = ?",
            (
                link.title,
                link.url,
                link.comment or None,
                link.tags,
                int(link.is_hidden),
                link.id,
            ),
            commit=True,
        )
        self._sync_link_activity(link)
        return link

    def delete_links(self, ids: list[int]) -> None:
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        self._run(
            f"DELETE FROM activity_link WHERE link_id IN ({placeholders})",
            tuple(ids),
            commit=True,
        )
        self._run(
            "DELETE FROM activity WHERE type = 'link'"
            f" AND external_id IN ({placeholders})",
            tuple(str(link_id) for link_id in ids),
            commit=True,
        )
        self._run(
            f"DELETE FROM links WHERE id IN ({placeholders})", tuple(ids), commit=True
        )

    # --- activity feed sync -------------------------------------------------
    # A link tagged "activity" gets an item in the site's activity feed
    # (activity + activity_link rows, externalId = str(links.id)). The tag is
    # the source of truth: tagging creates the item (timestamped now), edits
    # update its details in place, untagging or deleting the link removes it.
    # activity.is_private and activity.timestamp are never modified on update,
    # so admin-hidden items stay hidden and edits don't bump feed position.

    ACTIVITY_TAG = "activity"

    def _sync_link_activity(self, link: Link) -> None:
        tagged = self.ACTIVITY_TAG in link.tag_list()
        rows = self._run(
            "SELECT id FROM activity WHERE type = 'link' AND external_id = ?",
            (str(link.id),),
        ).fetchall()
        activity_id = rows[0][0] if rows else None

        if tagged and activity_id is None:
            now = int(time.time())
            cursor = self._run(
                "INSERT INTO activity"
                " (type, external_id, timestamp, is_private, is_thread_root,"
                "  thread_latest_timestamp)"
                " VALUES ('link', ?, ?, 0, 1, ?)",
                (str(link.id), now, now),
                commit=True,
            )
            self._run(
                "INSERT INTO activity_link"
                " (activity_id, link_id, title, url, comment, tags)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (cursor.lastrowid, link.id, link.title, link.url, link.comment, link.tags),
                commit=True,
            )
        elif tagged and activity_id is not None:
            self._run(
                "UPDATE activity_link SET title = ?, url = ?, comment = ?, tags = ?"
                " WHERE activity_id = ?",
                (link.title, link.url, link.comment, link.tags, activity_id),
                commit=True,
            )
        elif not tagged and activity_id is not None:
            self._run(
                "DELETE FROM activity_link WHERE activity_id = ?",
                (activity_id,),
                commit=True,
            )
            self._run(
                "DELETE FROM activity WHERE id = ?", (activity_id,), commit=True
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
