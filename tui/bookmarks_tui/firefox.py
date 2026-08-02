"""Read the active tab's (url, title) from Firefox's session recovery file.

Firefox writes session state to sessionstore-backups/recovery.jsonlz4 in the
profile directory roughly every 15 seconds, so the "current" tab can lag by
that much. The file is Mozilla-LZ4: a "mozLz40\\0" magic header followed by an
LZ4 block. Any failure (no Firefox, stale profile, format change) returns
None — callers treat the grab as best-effort.
"""

from __future__ import annotations

import configparser
import json
from pathlib import Path

import lz4.block

MOZ_DIR = Path.home() / ".mozilla" / "firefox"
MAGIC = b"mozLz40\0"


def _profile_dir() -> Path | None:
    ini = MOZ_DIR / "profiles.ini"
    if not ini.exists():
        return None
    parser = configparser.ConfigParser()
    parser.read(ini)
    # The Install section names the profile Firefox actually launches.
    for section in parser.sections():
        if section.startswith("Install") and parser[section].get("Default"):
            return MOZ_DIR / parser[section]["Default"]
    for section in parser.sections():
        options = parser[section]
        if options.get("Default") == "1" and options.get("Path"):
            path = Path(options["Path"])
            return path if path.is_absolute() else MOZ_DIR / path
    return None


def current_tab() -> tuple[str, str] | None:
    """Return (url, title) of the selected tab in the active Firefox window."""
    try:
        profile = _profile_dir()
        if profile is None:
            return None
        raw = (profile / "sessionstore-backups" / "recovery.jsonlz4").read_bytes()
        if not raw.startswith(MAGIC):
            return None
        session = json.loads(lz4.block.decompress(raw[len(MAGIC) :]))
        # The session's selectedWindow/selected pointers are only refreshed on
        # some flushes and often lag behind tab switches; lastAccessed is
        # stamped on every activation, so the freshest tab wins.
        tabs = [t for w in session["windows"] for t in w["tabs"] if t.get("entries")]
        if not tabs:
            return None
        tab = max(tabs, key=lambda t: t.get("lastAccessed", 0))
        entry = tab["entries"][tab.get("index", 1) - 1]
        url = entry.get("url", "")
        if not url.startswith(("http://", "https://")):
            return None
        return url, entry.get("title", "")
    except Exception:  # noqa: BLE001 - best-effort by design
        return None
