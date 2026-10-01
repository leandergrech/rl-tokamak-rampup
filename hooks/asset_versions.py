"""MkDocs hook: version the site's own CSS and JS so browsers never mix old assets with new pages.

GitHub Pages lets browsers cache static files for a while, so after a deploy a reader could get new
HTML with last week's theme.css (unstyled buttons, giant icons). Appending ?v=<content hash> to the
URLs of the local extra_css / extra_javascript files makes every change a new URL.
"""

from __future__ import annotations

import hashlib
from pathlib import Path


def _version(docs_dir: Path, path: str) -> str | None:
    if "://" in path or "?" in path:
        return None
    f = docs_dir / path
    if not f.is_file():
        return None
    return hashlib.sha256(f.read_bytes()).hexdigest()[:10]


def on_config(config, **kwargs):
    docs_dir = Path(config["docs_dir"])
    css = []
    for path in config["extra_css"]:
        v = _version(docs_dir, str(path))
        css.append(f"{path}?v={v}" if v else path)
    config["extra_css"] = css
    scripts = []
    for script in config["extra_javascript"]:
        p = str(getattr(script, "path", script))
        v = _version(docs_dir, p)
        if v and hasattr(script, "path"):
            script.path = f"{p}?v={v}"
            scripts.append(script)
        elif v:
            scripts.append(f"{p}?v={v}")
        else:
            scripts.append(script)
    config["extra_javascript"] = scripts
    return config
