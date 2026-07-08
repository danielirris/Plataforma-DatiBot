"""Orquestador de B-rolls: genera N clips 'sin personas' y los enlaza al producto.

Dos fuentes:
  - "veo"      → crea clips de cero con Veo (tier barato) desde los datos del
                 producto, verifica sin-personas y les quita el audio.
  - "uploaded" → recorta clips cortos de los videos ya subidos al producto ($0).

Función pública: ``generate_brolls(product_id, product, source=...)``.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
import urllib.request
from pathlib import Path
from typing import Callable

from app.brolls import people, postprocess, store, veo
from app.brolls.config import BrollConfig
from app.brolls.people import _probe_duration
from app.brolls.prompts import build_broll_prompts

logger = logging.getLogger("brolls.service")

Progress = Callable[[int, int, str], None]


def _noop(done: int, total: int, msg: str) -> None:  # pragma: no cover
    pass


def _from_veo(product_id: str, product: dict, cfg: BrollConfig,
              on_progress: Progress) -> tuple[list[dict], float, list[str]]:
    """Genera clips de cero con Veo, verificando 'sin personas'."""
    from app.brolls.prompts import NEGATIVOS

    prompts = build_broll_prompts(product, cfg)
    clips: list[dict] = []
    errores: list[str] = []
    seconds = 0.0
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for i, prompt in enumerate(prompts):
            on_progress(i, cfg.n_brolls, f"Generando broll {i + 1}/{cfg.n_brolls}…")
            aceptado = False
            for intento in range(cfg.max_retries + 1):
                raw = tmp / f"raw_{i}_{intento}.mp4"
                try:
                    veo.generate_clip(prompt, cfg, raw, negative=NEGATIVOS)
                except Exception as e:  # noqa: BLE001
                    logger.error("Broll %d: Veo falló definitivamente: %s", i + 1, e)
                    errores.append(str(e))
                    break
                seconds += cfg.duration_s  # se factura aunque se descarte
                if people.has_people(raw, cfg):
                    on_progress(i, cfg.n_brolls,
                                f"Broll {i + 1}: detecté personas, regenerando "
                                f"({intento + 1}/{cfg.max_retries})…")
                    continue
                dest = store.clip_path(product_id, len(clips) + 1)
                postprocess.strip_audio(raw, dest, max_dur=float(cfg.duration_s))
                clips.append({
                    "index": len(clips) + 1,
                    "file": dest.name,
                    "prompt": prompt,
                    "duration_s": cfg.duration_s,
                    "model": cfg.model,
                    "source": "veo",
                })
                aceptado = True
                break
            if not aceptado and not errores:
                errores.append(f"Broll {i + 1}: sin versión sin personas tras "
                               f"{cfg.max_retries} reintentos.")
            if len(clips) >= cfg.n_brolls:
                break
    return clips, seconds, errores


def _download(url: str, dest: Path) -> Path:
    req = urllib.request.Request(url, headers={"User-Agent": "datibot-brolls/1"})
    with urllib.request.urlopen(req, timeout=120) as r, dest.open("wb") as f:  # noqa: S310
        while chunk := r.read(1 << 16):
            f.write(chunk)
    return dest


def _from_uploaded(product_id: str, product: dict, cfg: BrollConfig,
                   on_progress: Progress) -> tuple[list[dict], float]:
    """Recorta N clips cortos de los videos ya subidos al producto (sin coste)."""
    videos = [v for v in (product.get("videos") or []) if v.get("url")]
    if not videos:
        raise RuntimeError("El producto no tiene videos subidos para recortar.")

    clips: list[dict] = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        # Descarga cada video una vez.
        fuentes: list[tuple[Path, float]] = []
        for j, v in enumerate(videos):
            on_progress(0, cfg.n_brolls, f"Descargando video {j + 1}/{len(videos)}…")
            try:
                p = _download(v["url"], tmp / f"src_{j}.mp4")
                fuentes.append((p, _probe_duration(p)))
            except Exception as e:  # noqa: BLE001
                logger.warning("No pude descargar %s: %s", v.get("url"), e)
        if not fuentes:
            raise RuntimeError("No se pudo descargar ningún video del producto.")

        for i in range(cfg.n_brolls):
            on_progress(i, cfg.n_brolls, f"Recortando broll {i + 1}/{cfg.n_brolls}…")
            src, dur = fuentes[i % len(fuentes)]
            # Punto de inicio repartido a lo largo del video.
            usable = max(0.0, dur - cfg.duration_s)
            start = (usable * ((i // len(fuentes) + 1) / (cfg.n_brolls / len(fuentes) + 1))) if usable else 0.0
            dest = store.clip_path(product_id, i + 1)
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", f"{start:.2f}", "-i", str(src),
                     "-t", f"{cfg.duration_s}", "-an", "-c:v", "libx264",
                     "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dest)],
                    capture_output=True, check=True,
                )
                clips.append({
                    "index": i + 1, "file": dest.name, "prompt": "(recorte de video subido)",
                    "duration_s": cfg.duration_s, "model": "ffmpeg-cut", "source": "uploaded",
                })
            except Exception as e:  # noqa: BLE001
                logger.warning("Recorte %d falló: %s", i + 1, e)
    return clips, 0.0


def generate_brolls(product_id: str, product: dict, *, source: str = "veo",
                    overrides: dict | None = None,
                    on_progress: Progress | None = None) -> dict:
    """Genera los B-rolls del producto y devuelve el resumen (clips, coste, metadata).

    Args:
        product_id: id del producto (para las rutas de salida).
        product: TODOS los datos guardados del producto (dict del JSON del store).
        source: "veo" (crear de cero) | "uploaded" (recortar los videos subidos).
    """
    cfg = BrollConfig.from_overrides(overrides)
    on_progress = on_progress or _noop
    source = source if source in ("veo", "uploaded") else "veo"

    errores: list[str] = []
    if source == "uploaded":
        clips, seconds = _from_uploaded(product_id, product, cfg, on_progress)
    else:
        clips, seconds, errores = _from_veo(product_id, product, cfg, on_progress)

    # Si NO salió ningún clip, propaga el motivo real (falta key, billing, filtro…).
    if not clips:
        detalle = errores[-1] if errores else "no se produjo ningún clip."
        raise RuntimeError(f"No se generó ningún broll: {detalle}")

    cost = seconds * cfg.price_per_sec if source == "veo" else 0.0
    logger.info("Brolls '%s' producto %s: %d clips, %.0fs, coste estimado $%.2f",
                source, product_id, len(clips), seconds, cost)
    meta = store.write_metadata(product_id, source=source, model=cfg.model,
                                clips=clips, cost_usd=cost, seconds_total=seconds)
    on_progress(cfg.n_brolls, cfg.n_brolls, "Listo.")
    return {"product_id": product_id, "clips": clips, "cost_usd": round(cost, 4),
            "seconds_total": round(seconds, 2), "source": source,
            "model": cfg.model, "errores": errores, "metadata": meta}
