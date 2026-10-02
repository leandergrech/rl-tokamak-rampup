"""Trained policies live in a GitHub release asset, not in git, so that data/ stays small.

data/checkpoints.json names the release archive, its SHA-256 and the SHA-256 of every policy file in it.
`ensure(path)` downloads and unpacks the archive the first time a listed policy file is missing; files that
are not listed (a run you trained yourself) are left alone.

    python -m rl_tokamak.checkpoints                      # fetch every listed policy that is missing
    python -m rl_tokamak.checkpoints --data data/physics  # the same for the physics environment's runs
    python -m rl_tokamak.checkpoints --pack T             # maintainers: write the archive T and the manifest
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import tarfile
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
MANIFEST = DATA / "checkpoints.json"
CACHE = DATA / ".cache"


def _sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _manifest(data: Path) -> dict | None:
    f = data / "checkpoints.json"
    return json.loads(f.read_text()) if f.exists() else None


def _data_dir(path: Path) -> Path:
    """The data/ directory a run file belongs to (data/runs/<run>/<file>), or the package's own."""
    path = path.resolve()
    return path.parents[2] if len(path.parents) > 2 and path.parents[1].name == "runs" else DATA


def fetch(data: Path = DATA) -> list[str]:
    """Download (once, cached in data/.cache) and unpack the release archive; return the files written."""
    m = _manifest(data)
    if m is None:
        return []
    cached = data / ".cache" / m["asset"]
    if cached.exists() and _sha256(cached.read_bytes()) == m["sha256"]:
        blob = cached.read_bytes()
    else:
        print(f"downloading {m['url']} ({m['bytes'] / 1e6:.1f} MB)", flush=True)
        with urllib.request.urlopen(m["url"], timeout=120) as r:
            blob = r.read()
        if _sha256(blob) != m["sha256"]:
            raise RuntimeError(f"{m['asset']}: SHA-256 does not match data/checkpoints.json")
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(blob)
    written = []
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for member in tar.getmembers():
            rel = member.name
            if rel not in m["files"] or (data / rel).exists():
                continue
            content = tar.extractfile(member).read()
            if _sha256(content) != m["files"][rel]:
                raise RuntimeError(f"{rel}: SHA-256 does not match data/checkpoints.json")
            (data / rel).parent.mkdir(parents=True, exist_ok=True)
            (data / rel).write_bytes(content)
            written.append(rel)
    return written


def ensure(path: str | Path) -> None:
    """Make sure a released policy file exists locally (no-op for files the manifest does not list)."""
    path = Path(path)
    if path.exists():
        return
    data = _data_dir(path)
    m = _manifest(data)
    if m is not None and path.resolve().relative_to(data.resolve()).as_posix() in m["files"]:
        fetch(data)


def pack(archive: Path, tag: str, repo: str, data: Path = DATA) -> None:
    """Write a deterministic archive of every data/runs/*/policy*.pt and the manifest that points at it."""
    files = sorted(p.relative_to(data).as_posix() for p in data.glob("runs/*/policy*.pt"))
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.PAX_FORMAT) as tar:
        for rel in files:
            content = (data / rel).read_bytes()
            info = tarfile.TarInfo(rel)
            info.size, info.mtime, info.mode = len(content), 0, 0o644
            tar.addfile(info, io.BytesIO(content))
    blob = buf.getvalue()
    archive.write_bytes(blob)
    manifest = {
        "release": tag, "asset": archive.name, "bytes": len(blob), "sha256": _sha256(blob),
        "url": f"https://github.com/{repo}/releases/download/{tag}/{archive.name}",
        "files": {rel: _sha256((data / rel).read_bytes()) for rel in files},
    }
    (data / "checkpoints.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{archive}: {len(files)} files, {len(blob) / 1e6:.1f} MB")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pack", type=Path, help="write the release archive here and update data/checkpoints.json")
    p.add_argument("--tag", default="checkpoints-v1")
    p.add_argument("--repo", default="leandergrech/rl-tokamak-rampup")
    p.add_argument("--data", type=Path, default=DATA, help="data directory holding runs/ and checkpoints.json")
    a = p.parse_args()
    if a.pack:
        pack(a.pack, a.tag, a.repo, a.data)
    else:
        written = fetch(a.data)
        print(f"{len(written)} policy files fetched" if written else "all listed policy files are present")


if __name__ == "__main__":
    main()
