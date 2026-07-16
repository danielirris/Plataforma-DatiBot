"""Orquestador de B-rolls: genera N clips 'sin personas' y los enlaza al producto.

Dos fuentes:
  - "veo"      → crea clips de cero con Veo (tier barato) desde los datos del
                 producto, verifica sin-personas y les quita el audio.
  - "uploaded" → recorta clips cortos de los videos ya subidos al producto ($0).

Función pública: ``generate_brolls(product_id, product, source=...)``.
"""
from __future__ import annotations

import logging
import random
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
                   on_progress: Progress,
                   videos_locales: list[Path] | None = None) -> tuple[list[dict], float]:
    """Recorta N clips cortos de los videos del producto (sin coste).

    ``videos_locales``: archivos que el web YA mandó por la red interna. Es el
    camino preferido — no depende de que la URL pública sirva el archivo. Si no
    vienen, se cae al modo antiguo: descargar por URL.
    """
    clips: list[dict] = []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        fuentes: list[tuple[Path, float]] = []
        fallos: list[str] = []

        if videos_locales:
            # El web nos pasó los bytes: cero descargas, cero URLs.
            for p in videos_locales:
                try:
                    fuentes.append((p, _probe_duration(p)))
                except Exception as e:  # noqa: BLE001
                    fallos.append(f"{p.name} → {e}")
        else:
            videos = [v for v in (product.get("videos") or []) if v.get("url")]
            if not videos:
                raise RuntimeError("El producto no tiene videos subidos para recortar.")
            for j, v in enumerate(videos):
                on_progress(0, cfg.n_brolls, f"Descargando video {j + 1}/{len(videos)}…")
                try:
                    p = _download(v["url"], tmp / f"src_{j}.mp4")
                    fuentes.append((p, _probe_duration(p)))
                except Exception as e:  # noqa: BLE001
                    logger.warning("No pude descargar %s: %s", v.get("url"), e)
                    fallos.append(f"{v.get('url')} → {e}")

        if not fuentes:
            detalle = fallos[0] if fallos else "sin detalle"
            raise RuntimeError(
                "No se pudo usar ningún video del producto. "
                f"Primera causa: {detalle}. Si es una URL que no carga, el archivo "
                "no se está sirviendo: vuelve a subir el video en Productos."
            )
        if fallos:
            logger.warning("Se omitieron %d video(s) del producto: %s",
                           len(fallos), "; ".join(fallos[:3]))

        # Cada broll es un MONTAJE: muchos extractos cortos de los videos
        # subidos, encadenados hasta ~montage_total_s (como la app original).
        for i in range(cfg.n_brolls):
            dest = store.clip_path(product_id, i + 1)
            try:
                total = _montar(fuentes, cfg, i, tmp / f"m{i}", dest, on_progress,
                               etiqueta=f"{i + 1}/{cfg.n_brolls}")
                clips.append({
                    "index": i + 1, "file": dest.name,
                    "prompt": "(montaje de extractos de los videos del producto)",
                    "duration_s": round(total, 1), "model": "ffmpeg-montage",
                    "source": "uploaded",
                })
            except Exception as e:  # noqa: BLE001
                logger.warning("Montaje %d falló: %s", i + 1, e)
    return clips, 0.0


def _plan_extractos(fuentes: list[tuple[Path, float]], cfg: BrollConfig,
                    variacion: int) -> list[tuple[Path, float, float]]:
    """Elige (video, inicio, duración) de muchos extractos hasta ~montage_total_s.

    Alterna entre los videos disponibles y reparte los cortes a lo largo de cada
    uno. ``variacion`` desplaza la selección para que cada broll salga distinto.
    """
    rng = random.Random(f"broll:{variacion}")
    # Ventanas candidatas por video, repartidas a lo largo de su duración.
    candidatos: list[tuple[Path, float, float]] = []
    for src, dur in fuentes:
        util = max(0.0, dur - cfg.beat_min_s)
        if util <= 0:
            candidatos.append((src, 0.0, max(0.5, min(dur, cfg.beat_max_s))))
            continue
        # ~1 candidato cada beat_max, sin pasarse del final.
        paso = max(cfg.beat_max_s, util / 12)
        t = 0.0
        while t < util:
            d = round(rng.uniform(cfg.beat_min_s, cfg.beat_max_s), 2)
            d = min(d, dur - t)
            if d >= 0.5:
                candidatos.append((src, round(t, 2), d))
            t += paso
    if not candidatos:
        return []

    rng.shuffle(candidatos)
    # Desplaza el arranque según la variación: cada broll empieza por otro sitio.
    off = (variacion * 3) % len(candidatos)
    orden = candidatos[off:] + candidatos[:off]

    plan: list[tuple[Path, float, float]] = []
    acumulado = 0.0
    k = 0
    while acumulado < cfg.montage_total_s and k < len(orden) * 4:
        src, start, d = orden[k % len(orden)]
        k += 1
        restante = cfg.montage_total_s - acumulado
        if restante < cfg.beat_min_s:
            d = round(restante, 2)  # último extracto: recorta para cuadrar
        if d < 0.5:
            break
        plan.append((src, start, d))
        acumulado += d
    return plan


def _montar(fuentes: list[tuple[Path, float]], cfg: BrollConfig, variacion: int,
            work: Path, dest: Path, on_progress: Progress, etiqueta: str) -> float:
    """Corta los extractos y los encadena en UN video (sin audio). Devuelve su duración."""
    work.mkdir(parents=True, exist_ok=True)
    plan = _plan_extractos(fuentes, cfg, variacion)
    if not plan:
        raise RuntimeError("No se pudieron planificar extractos (videos demasiado cortos).")

    alto, ancho = (1280, 720) if cfg.aspect_ratio == "9:16" else (720, 1280)
    partes: list[Path] = []
    for n, (src, start, dur) in enumerate(plan):
        on_progress(variacion, cfg.n_brolls,
                    f"Montaje {etiqueta}: extracto {n + 1}/{len(plan)}…")
        parte = work / f"p{n:03d}.mp4"
        # Normaliza todos los extractos (mismo tamaño/fps/códec) para poder
        # encadenarlos sin recodificar después.
        subprocess.run(
            ["ffmpeg", "-y", "-ss", f"{start:.2f}", "-i", str(src), "-t", f"{dur:.2f}",
             "-an", "-vf",
             f"scale={ancho}:{alto}:force_original_aspect_ratio=increase,"
             f"crop={ancho}:{alto},fps=30,setsar=1",
             "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
             str(parte)],
            capture_output=True, check=True,
        )
        if parte.is_file() and parte.stat().st_size > 0:
            partes.append(parte)
    if not partes:
        raise RuntimeError("Ningún extracto se pudo cortar.")

    lista = work / "lista.txt"
    lista.write_text("".join(f"file '{p.name}'\n" for p in partes), encoding="utf-8")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "lista.txt",
         "-c", "copy", "-movflags", "+faststart", str(dest)],
        cwd=str(work), capture_output=True, check=True,
    )
    return _probe_duration(dest)


def generate_brolls(product_id: str, product: dict, *, source: str = "veo",
                    overrides: dict | None = None,
                    on_progress: Progress | None = None,
                    videos_locales: list[Path] | None = None) -> dict:
    """Genera los B-rolls del producto y devuelve el resumen (clips, coste, metadata).

    Args:
        product_id: id del producto (para las rutas de salida).
        product: TODOS los datos guardados del producto (dict del JSON del store).
        source: "veo" (crear de cero) | "uploaded" (recortar los videos subidos).
        videos_locales: videos que el web mandó por la red interna (evita tener
            que descargarlos por URL pública).
    """
    cfg = BrollConfig.from_overrides(overrides)
    on_progress = on_progress or _noop
    source = source if source in ("veo", "uploaded") else "veo"

    errores: list[str] = []
    if source == "uploaded":
        clips, seconds = _from_uploaded(product_id, product, cfg, on_progress, videos_locales)
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
