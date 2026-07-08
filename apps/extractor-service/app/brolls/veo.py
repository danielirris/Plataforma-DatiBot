"""Generación de un clip con Google Veo (SDK oficial google-genai) + backoff."""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path

from app.brolls.config import BrollConfig, gemini_key

logger = logging.getLogger("brolls.veo")

_API_RETRIES = 3           # reintentos por errores transitorios de la API
_POLL_EVERY = 10           # segundos entre sondeos de la operación
_POLL_TIMEOUT = 600        # techo de espera por clip (10 min)

# Parámetros que el SDK acepta al construir pero que la Gemini API (AI Studio)
# puede rechazar en runtime. Cubre los dos formatos de error que devuelve Veo:
#   "resolution parameter is not supported"
#   "`negativePrompt` isn't supported by this model"
_NO_SOPORTADO = re.compile(r"`?([a-zA-Z_]+)`? (?:parameter is not supported|isn't supported)")

# Nombres camelCase de la API -> snake_case del SDK, para poder quitarlos del kw.
_CAMEL_A_SNAKE = {"negativePrompt": "negative_prompt", "aspectRatio": "aspect_ratio",
                  "durationSeconds": "duration_seconds", "resolution": "resolution"}


def generate_clip(prompt: str, cfg: BrollConfig, dest: Path,
                  *, negative: str | None = None) -> Path:
    """Genera UN clip con Veo y lo guarda en ``dest``. Reintenta con backoff.

    Si la API rechaza un parámetro (p. ej. ``resolution`` no existe en la Gemini
    API), lo elimina y reintenta sin gastar el presupuesto de reintentos.

    Raises:
        RuntimeError: si Veo falla tras los reintentos.
    """
    from google import genai            # import perezoso (dep opcional)
    from google.genai import types

    key = gemini_key()
    if not key:
        raise RuntimeError("Falta GEMINI_API_KEY para llamar a Veo.")
    client = genai.Client(api_key=key)

    # Solo los parámetros soportados por la Gemini API (AI Studio) para Veo Lite.
    # ``resolution`` NO lo es (Lite da 720p por defecto) y ``negative_prompt``
    # tampoco: los negativos van dentro del texto del prompt.
    _ = negative  # los negativos ya están incrustados en el prompt
    kw: dict[str, str] = {"aspect_ratio": cfg.aspect_ratio,
                          "duration_seconds": str(cfg.duration_s)}
    last: Exception | None = None
    intento = 0
    while intento < _API_RETRIES:
        try:
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
            msg = str(e)
            m = _NO_SOPORTADO.search(msg)
            param = _CAMEL_A_SNAKE.get(m.group(1), m.group(1)) if m else None
            if param and param in kw:
                logger.warning("Veo: quito parámetro no soportado '%s' y reintento", param)
                kw.pop(param)
                continue  # no cuenta como intento
            # Cuota agotada: no tiene sentido reintentar (no se libera en segundos).
            if "RESOURCE_EXHAUSTED" in msg or "429" in msg or "quota" in msg.lower():
                raise RuntimeError(
                    "Cuota de Veo agotada en Google (429). Es un límite de tu cuenta, "
                    "no del código: espera unos minutos o pide aumento de cuota de Veo."
                ) from e
            last = e
            intento += 1
            espera = min(30, 2 ** intento)
            logger.warning("Veo intento %d/%d falló (%s); backoff %ds",
                           intento, _API_RETRIES, e, espera)
            time.sleep(espera)
    raise RuntimeError(f"Veo falló tras {_API_RETRIES} intentos: {last}")
