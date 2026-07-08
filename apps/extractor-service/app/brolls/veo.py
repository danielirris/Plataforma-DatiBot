"""Generación de un clip con Google Veo (SDK oficial google-genai) + backoff."""
from __future__ import annotations

import logging
import time
from pathlib import Path

from app.brolls.config import BrollConfig, gemini_key

logger = logging.getLogger("brolls.veo")

_API_RETRIES = 3           # reintentos por errores transitorios de la API
_POLL_EVERY = 10           # segundos entre sondeos de la operación
_POLL_TIMEOUT = 600        # techo de espera por clip (10 min)


def generate_clip(prompt: str, cfg: BrollConfig, dest: Path,
                  *, negative: str | None = None) -> Path:
    """Genera UN clip con Veo y lo guarda en ``dest``. Reintenta con backoff.

    Raises:
        RuntimeError: si Veo falla tras los reintentos.
    """
    from google import genai            # import perezoso (dep opcional)
    from google.genai import types

    key = gemini_key()
    if not key:
        raise RuntimeError("Falta GEMINI_API_KEY para llamar a Veo.")
    client = genai.Client(api_key=key)

    kw = dict(aspect_ratio=cfg.aspect_ratio, resolution=cfg.resolution,
              duration_seconds=str(cfg.duration_s))
    last: Exception | None = None
    for intento in range(_API_RETRIES):
        try:
            try:
                config = types.GenerateVideosConfig(**kw, negative_prompt=negative)
            except TypeError:  # el modelo/SDK no acepta negative_prompt
                config = types.GenerateVideosConfig(**kw)

            op = client.models.generate_videos(model=cfg.model, prompt=prompt, config=config)
            waited = 0
            while not op.done and waited < _POLL_TIMEOUT:
                time.sleep(_POLL_EVERY)
                waited += _POLL_EVERY
                op = client.operations.get(op)
            if not op.done:
                raise RuntimeError("Veo no terminó a tiempo (timeout).")

            vids = getattr(op.response, "generated_videos", None) or []
            if not vids:
                raise RuntimeError("Veo no devolvió ningún video (posible filtro de seguridad).")
            video = vids[0].video
            client.files.download(file=video)
            video.save(str(dest))
            if not dest.is_file() or dest.stat().st_size == 0:
                raise RuntimeError("El archivo de video quedó vacío.")
            return dest
        except Exception as e:  # noqa: BLE001
            last = e
            espera = min(30, 2 ** intento)
            logger.warning("Veo intento %d/%d falló (%s); backoff %ds",
                           intento + 1, _API_RETRIES, e, espera)
            time.sleep(espera)
    raise RuntimeError(f"Veo falló tras {_API_RETRIES} intentos: {last}")
