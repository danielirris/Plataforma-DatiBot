"""Composición de varios clips combinando ganchos + cuerpo del pool.

Cada clip = [ganchos impactantes al inicio] + [cuerpo con fragmentos variados de
TODOS los videos], acumulando hasta llegar a la duración objetivo. Los N clips se
generan con desplazamientos distintos del pool para que sean combinaciones
diferentes entre sí.
"""
from __future__ import annotations

import logging
import random
from dataclasses import replace
from pathlib import Path

from app.pipeline.analyze import Moment
from app.pipeline.fragments import Beat, VideoSource, _durations

logger = logging.getLogger(__name__)


def build_hook_beats(
    moments: list[Moment],
    videos: list[VideoSource],
    rng: random.Random,
    beat_min: float,
    beat_max: float,
) -> list[Beat]:
    """Convierte los momentos de gancho en beats (el inicio de cada momento).

    Si no hay momentos (sin transcripción), usa el inicio de los primeros videos
    como ganchos por defecto.
    """
    choices = _durations(beat_min, beat_max)
    hooks: list[Beat] = []
    for m in moments:
        if not (0 <= m.video_id < len(videos)):
            continue
        v = videos[m.video_id]
        start = max(0.0, min(m.start, max(0.0, v.duration - beat_min)))
        restante = v.duration - start
        posibles = [d for d in choices if d <= restante + 1e-6] or [beat_min]
        hooks.append(Beat(v.id, v.path, round(start, 3), rng.choice(posibles)))

    if not hooks:
        for v in videos:
            dur = min(beat_min, v.duration)
            hooks.append(Beat(v.id, v.path, 0.0, round(dur, 3)))
        logger.info("Sin ganchos de IA; usando el inicio de los primeros videos.")
    return hooks


def _fill_clip(
    seed_beats: list[Beat],
    pool: list[Beat],
    offset: int,
    objetivo_s: float,
) -> list[Beat]:
    """Acumula beats (ganchos + cuerpo) hasta llegar a ``objetivo_s`` segundos.

    El último beat se recorta para que la suma sea exactamente ``objetivo_s``.
    """
    clip = list(seed_beats)
    total = sum(b.dur for b in clip)
    i = 0
    # Damos varias vueltas al pool si hace falta.
    while total < objetivo_s - 1e-6 and pool:
        beat = pool[(offset + i) % len(pool)]
        i += 1
        if total + beat.dur > objetivo_s:
            beat = replace(beat, dur=round(objetivo_s - total, 3))
        clip.append(beat)
        total += beat.dur
        if i > len(pool) * 4:  # salvaguarda anti-bucle
            break
    return clip


def compose_clips(
    pool: list[Beat],
    moments: list[Moment],
    videos: list[VideoSource],
    rng: random.Random,
    *,
    num_clips: int,
    duraciones_s: list[float],
    hook_beats: int,
    beat_min: float,
    beat_max: float,
    forced_hook: Beat | None = None,
) -> list[list[Beat]]:
    """Compone ``num_clips`` listas de beats (una por clip).

    ``duraciones_s`` da la duración objetivo de CADA clip (una por anuncio, la
    de su locución). Debe tener ``num_clips`` elementos.

    Returns:
        Lista de clips; cada clip es una lista de ``Beat`` cuya suma de
        duraciones se acerca a la suya en ``duraciones_s``.

    Raises:
        RuntimeError: si no hay ningún fragmento disponible.
    """
    if not pool:
        raise RuntimeError("No hay fragmentos para componer los clips.")

    hook_pool = build_hook_beats(moments, videos, rng, beat_min, beat_max)
    hook_n = max(0, hook_beats)

    clips: list[list[Beat]] = []
    for k in range(num_clips):
        # Cada clip dura lo que su propia locución (audio del anuncio k).
        objetivo_k = duraciones_s[k] if k < len(duraciones_s) else duraciones_s[-1]
        # Tamaño aproximado de la ventana de cuerpo por clip (para desplazar).
        aprox_beats = max(1, int(objetivo_k / max(beat_min, 0.5)))
        # Gancho VISUAL elegido por el usuario: abre TODOS los clips.
        forzados = [forced_hook] if forced_hook is not None else []
        restantes = max(0, hook_n - len(forzados))
        hooks = forzados + ([hook_pool[(k * max(1, restantes) + j) % len(hook_pool)]
                             for j in range(restantes)] if restantes and hook_pool else [])
        body_offset = (k * aprox_beats) % len(pool)
        clip = _fill_clip(hooks, pool, body_offset, objetivo_k)
        clips.append(clip)
        logger.info(
            "Clip %d/%d: %d fragmentos, %.1fs, %d videos distintos",
            k + 1, num_clips, len(clip), sum(b.dur for b in clip),
            len({b.video_id for b in clip}),
        )
    return clips


def unique_beats(clips: list[list[Beat]]) -> list[Beat]:
    """Devuelve los beats únicos usados en todos los clips (para renderizar 1 vez)."""
    seen: dict[tuple[int, int, int], Beat] = {}
    for clip in clips:
        for beat in clip:
            seen.setdefault(beat.key(), beat)
    return list(seen.values())
