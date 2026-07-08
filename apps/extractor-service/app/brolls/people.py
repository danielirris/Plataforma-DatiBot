"""Verificación 'sin personas' por VISIÓN con Gemini (gemini-2.5-flash).

Muestrea varios frames del clip y le pregunta a Gemini si hay personas/manos.
Se eligió visión-Gemini en vez de YOLO para no meter torch/ultralytics (~GB) en
la imagen del extractor y reutilizar la key existente.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
import tempfile
from pathlib import Path

from app.brolls.config import GEMINI_MODEL, BrollConfig, gemini_key

logger = logging.getLogger("brolls.people")

_PREGUNTA = (
    "Mira estos fotogramas de un clip publicitario. ¿Alguno contiene una PERSONA, "
    "un ser humano, una cara, una mano, un dedo o cualquier parte del cuerpo humano? "
    'Responde SOLO con JSON: {"people": true} o {"people": false}.'
)


def _probe_duration(video: Path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nk=1:nw=1", str(video)],
            capture_output=True, text=True, check=True,
        )
        return max(0.2, float(out.stdout.strip()))
    except Exception:  # noqa: BLE001
        return 4.0


def _extract_frames(video: Path, n: int, workdir: Path) -> list[Path]:
    dur = _probe_duration(video)
    frames: list[Path] = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        out = workdir / f"f{i}.jpg"
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-ss", f"{t:.2f}", "-i", str(video),
                 "-frames:v", "1", "-vf", "scale=360:-2", str(out)],
                capture_output=True, check=True,
            )
            if out.is_file():
                frames.append(out)
        except Exception:  # noqa: BLE001
            continue
    return frames


def has_people(video: Path, cfg: BrollConfig) -> bool:
    """True si Gemini detecta personas en los frames muestreados.

    Ante cualquier fallo (sin frames, sin key, error de API) devuelve False para
    NO bloquear indefinidamente la generación; se registra un aviso.
    """
    key = gemini_key()
    if not key:
        return False
    with tempfile.TemporaryDirectory() as td:
        frames = _extract_frames(video, cfg.frames_per_check, Path(td))
        if not frames:
            logger.warning("Sin frames para verificar personas; acepto el clip.")
            return False
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=key)
            parts: list = [types.Part(text=_PREGUNTA)]
            for f in frames:
                parts.append(types.Part.from_bytes(data=f.read_bytes(), mime_type="image/jpeg"))
            resp = client.models.generate_content(model=GEMINI_MODEL, contents=parts)
            txt = (resp.text or "").strip()
            m = re.search(r"\{.*\}", txt, re.S)
            if m:
                return bool(json.loads(m.group(0)).get("people"))
            return "true" in txt.lower()
        except Exception as e:  # noqa: BLE001
            logger.warning("Detector de personas falló (%s); acepto el clip.", e)
            return False
