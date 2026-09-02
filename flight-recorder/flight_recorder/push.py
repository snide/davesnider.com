"""Push payloads to the ingest endpoint, with an on-disk retry queue."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import httpx

log = logging.getLogger(__name__)


class Pusher:
    def __init__(self, ingest_url: str, token: str, queue_dir: Path):
        self._url = ingest_url
        self._token = token
        self._queue_dir = queue_dir

    def push(self, item: dict) -> bool:
        """Send one flight; queue it on failure. Returns True when delivered."""
        if self._send([item]):
            return True
        self._queue_dir.mkdir(parents=True, exist_ok=True)
        path = self._queue_dir / f"{item['externalId']}.json"
        path.write_text(json.dumps(item), encoding="utf-8")
        log.warning("push failed, queued %s", path.name)
        return False

    def flush_queue(self) -> None:
        """Retry anything queued from earlier failures (server dedupes by externalId)."""
        if not self._queue_dir.exists():
            return
        for path in sorted(self._queue_dir.glob("*.json")):
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                log.error("dropping unreadable queue file %s", path.name)
                path.unlink()
                continue
            if self._send([item]):
                path.unlink()
                log.info("delivered queued flight %s", path.stem)
            else:
                return  # still offline; keep the rest for later

    def _send(self, items: list[dict]) -> bool:
        try:
            resp = httpx.post(
                self._url,
                json={"items": items},
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=60,
            )
            if resp.status_code != 200:
                log.warning("ingest returned %s: %s", resp.status_code, resp.text[:500])
                return False
            body = resp.json()
            results = body.get("results", {})
            log.info(
                "ingest ok: created=%s skipped=%s errors=%s at %s",
                results.get("created"),
                results.get("skipped"),
                results.get("errors"),
                time.strftime("%H:%M:%S"),
            )
            return not results.get("errors")
        except httpx.HTTPError:
            log.warning("ingest request failed", exc_info=True)
            return False
