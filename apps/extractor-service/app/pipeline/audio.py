"""Extracción de audio con FFmpeg (mono, 16 kHz) para minimizar tamaño/costo."""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def build_extract_audio_cmd(source: Path, dest: Path) -> list[str]:
    """Construye el comando FFmpeg para extraer audio mono a 16 kHz (WAV PCM).

    Args:
        source: video de entrada.
        dest: ruta del WAV de salida.

    Returns:
        Lista de argumentos lista para ``subprocess.run``.
    """
    return [
        "ffmpeg",
        "-y",                 # sobrescribir sin preguntar
        "-i", str(source),
        "-vn",                # sin video
        "-ac", "1",           # mono
        "-ar", "16000",       # 16 kHz
        "-c:a", "pcm_s16le",  # WAV PCM 16-bit
        str(dest),
    ]


def probe_duration(source: Path) -> float:
    """Devuelve la duración del video en segundos usando ffprobe.

    Args:
        source: archivo de video.

    Returns:
        Duración en segundos (0.0 si no se puede determinar).
    """
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        capture_output=True, text=True,
    )
    try:
        return float(proc.stdout.strip())
    except (ValueError, AttributeError):
        return 0.0


def probe_video_duration(source: Path) -> float:
    """Duración de la PISTA DE VIDEO (no del contenedor), en segundos.

    Es distinta de ``probe_duration`` (que mide ``format=duration``, el
    contenedor): cuando el audio dura más que la imagen —muy común en clips de
    móvil o de pantalla— el contenedor es más largo que el último frame de
    video. Trocear el video hasta esa duración de más produce un fragmento sin
    frames, y luego el ``concat`` falla con "matches no streams". Aquí tomamos la
    extensión REAL del video: el mínimo entre la duración de su stream y la del
    contenedor, restando un pequeño margen para no rozar el último frame.
    """
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        capture_output=True, text=True,
    )
    fmt = probe_duration(source)
    try:
        stream = float(proc.stdout.strip())
    except (ValueError, AttributeError):
        stream = 0.0
    # Algunos contenedores no reportan duración del stream (N/A): se usa el
    # contenedor con un margen de seguridad. Si ambos existen, el menor manda.
    if stream > 0 and fmt > 0:
        base = min(stream, fmt)
    else:
        base = stream or fmt
    return max(0.0, base - 0.05) if base > 0 else 0.0


def has_video(source: Path) -> bool:
    """Indica si el archivo tiene al menos un frame de video decodificable."""
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0", str(source),
        ],
        capture_output=True, text=True,
    )
    return "video" in proc.stdout


def probe_resolution(source: Path) -> tuple[int, int]:
    """Devuelve (ancho, alto) del primer stream de video (o 1080x1920 si falla)."""
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x", str(source),
        ],
        capture_output=True, text=True,
    )
    try:
        w, h = proc.stdout.strip().split("x")
        return int(w), int(h)
    except (ValueError, AttributeError):
        return 1080, 1920


def has_audio(source: Path) -> bool:
    """Indica si el video tiene al menos una pista de audio (vía ffprobe).

    Muchos videos exportados (pantalla, animaciones, stock) vienen SIN audio;
    en ese caso no se puede ni se debe extraer audio.
    """
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a",
            "-show_entries", "stream=index",
            "-of", "csv=p=0", str(source),
        ],
        capture_output=True, text=True,
    )
    return bool(proc.stdout.strip())


def extract_audio(source: Path, dest: Path) -> Path:
    """Extrae el audio de ``source`` a ``dest`` usando FFmpeg.

    Args:
        source: video de entrada.
        dest: ruta del WAV de salida.

    Returns:
        La ruta ``dest`` del audio extraído.

    Raises:
        RuntimeError: si FFmpeg falla.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = build_extract_audio_cmd(source, dest)
    logger.info("Extrayendo audio: %s -> %s", source.name, dest.name)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg falló al extraer audio: {proc.stderr[-800:]}")
    if not dest.exists() or dest.stat().st_size == 0:
        raise RuntimeError("El audio extraído está vacío.")
    return dest
