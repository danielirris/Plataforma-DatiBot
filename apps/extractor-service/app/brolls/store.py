"""Almacenamiento de los B-rolls y su metadata, enlazados al product_id."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

from app.brolls.config import output_base


def safe_id(product_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", str(product_id)) or "producto"


def broll_dir(product_id: str) -> Path:
    d = output_base() / safe_id(product_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def clip_path(product_id: str, index: int) -> Path:
    return broll_dir(product_id) / f"broll_{index:02d}.mp4"


def write_metadata(product_id: str, *, source: str, model: str,
                   clips: list[dict], cost_usd: float, seconds_total: float) -> dict:
    """Escribe metadata.json (prompt usado, duración, model ID, coste…) y lo devuelve."""
    meta = {
        "product_id": product_id,
        "source": source,
        "model": model,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "seconds_total": round(seconds_total, 2),
        "cost_usd": round(cost_usd, 4),
        "n_clips": len(clips),
        "clips": clips,
    }
    dest = broll_dir(product_id) / "metadata.json"
    dest.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def file_path(product_id: str, name: str) -> Path | None:
    """Ruta segura de un archivo de B-roll (evita path traversal)."""
    base = broll_dir(product_id).resolve()
    p = (base / Path(name).name).resolve()
    if str(p).startswith(str(base)) and p.is_file():
        return p
    return None
