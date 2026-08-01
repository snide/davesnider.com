"""Locate the repo-root .env and build the database config.

The TUI targets the production database by default; `--dev` switches to the
dev database. Both share the same auth token.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values

PROD_URL_VAR = "TURSO_DB_PROD_URL"
DEV_URL_VAR = "TURSO_DB_URL"
TOKEN_VAR = "TURSO_AUTH_TOKEN"


class ConfigError(Exception):
    pass


@dataclass
class Config:
    url: str
    auth_token: str
    target: str  # "PROD" or "dev"


def find_repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "package.json").exists() or (parent / ".git").exists():
            return parent
    raise ConfigError(
        "Could not find the repo root (no package.json/.git in any parent directory)."
    )


def load_config(dev: bool = False) -> Config:
    env_path = find_repo_root() / ".env"
    if not env_path.exists():
        raise ConfigError(f"Missing env file: {env_path}")
    values = dotenv_values(env_path)

    url_var = DEV_URL_VAR if dev else PROD_URL_VAR
    url = values.get(url_var)
    token = values.get(TOKEN_VAR)
    missing = [name for name, value in ((url_var, url), (TOKEN_VAR, token)) if not value]
    if missing:
        raise ConfigError(f"Missing {', '.join(missing)} in {env_path}")

    return Config(url=url, auth_token=token, target="dev" if dev else "PROD")
