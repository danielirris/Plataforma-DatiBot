"""Extracción de audio con FFmpeg (mono, 16 kHz) para minimizar tamaño/costo."""
from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Timeouts de FFmpeg/ffprobe. SIN esto, un archivo de entrada corrupto (VFR raro,
# moov atrasado, pipe bloqueado) podía COLGAR para siempre al ÚNICO hilo worker y
# atascar toda la cola: los jobs siguientes quedaban en "en cola" indefinidamente
# y el usuario lo vivía como "a veces no funciona". Con timeout, un proceso
# colgado falla limpio, el job se marca en error y la cola sigue.
PROBE_TIMEOUT = 30    # ffprobe: debe ser casi instantáneo; si tarda 30s, algo va mal
PROC_TIMEOUT = 600    # operaciones pesadas (extraer/normalizar/recortar audio): 10 min


def _probe(cmd: list[str]) -> str:
    """Ejecuta un ffprobe acotado por timeout; devuelve su stdout ('' si falla o
    se cuelga). Nunca lanza: los probes deben degradar a un valor por defecto, no
    tumbar el job."""
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=PROBE_TIMEOUT)
        return proc.stdout or ""
    except (subprocess.SubprocessError, OSError) as e:
        logger.warning("ffprobe falló o se colgó (%s): %s", cmd[-1], e)
        return ""


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
    out = _probe(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source),
        ]
    )
    try:
        return float(out.strip())
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
    out = _probe(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source),
        ]
    )
    fmt = probe_duration(source)
    try:
        stream = float(out.strip())
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
    return "video" in _probe(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0", str(source),
        ]
    )


def probe_resolution(source: Path) -> tuple[int, int]:
    """Devuelve (ancho, alto) del primer stream de video (o 1080x1920 si falla)."""
    out = _probe(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0:s=x", str(source),
        ]
    )
    try:
        w, h = out.strip().split("x")
        return int(w), int(h)
    except (ValueError, AttributeError):
        return 1080, 1920


def has_audio(source: Path) -> bool:
    """Indica si el video tiene al menos una pista de audio (vía ffprobe).

    Muchos videos exportados (pantalla, animaciones, stock) vienen SIN audio;
    en ese caso no se puede ni se debe extraer audio.
    """
    return bool(
        _probe(
            [
                "ffprobe", "-v", "error", "-select_streams", "a",
                "-show_entries", "stream=index",
                "-of", "csv=p=0", str(source),
            ]
        ).strip()
    )


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
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=PROC_TIMEOUT)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError("FFmpeg se colgó al extraer audio (timeout).") from e
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg falló al extraer audio: {proc.stderr[-800:]}")
    if not dest.exists() or dest.stat().st_size == 0:
        raise RuntimeError("El audio extraído está vacío.")
    return dest


def normalize_voz(source: Path, dest: Path, target_i: float = -16.0) -> bool:
    """Nivela la locución a un loudness estándar (loudnorm) para que TODAS las voces
    suenen al mismo volumen, claras y sin saturar. -16 LUFS es el objetivo típico de
    voz en video social. Devuelve True si escribió ``dest``; False si falló (se usa
    el original)."""
    try:
        proc = subprocess.run(
            ["ffmpeg", "-y", "-i", str(source),
             "-af", f"loudnorm=I={target_i}:TP=-1.5:LRA=11", "-ar", "44100",
             "-c:a", "aac", "-b:a", "160k", str(dest)],
            capture_output=True, text=True, timeout=PROC_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Normalizar voz se colgó (%s); uso el original", source.name)
        dest.unlink(missing_ok=True)
        return False
    if proc.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        logger.warning("No pude normalizar la voz (%s); uso el original", source.name)
        dest.unlink(missing_ok=True)
        return False
    return True


def _detectar_silencios(source: Path, umbral_db: int, min_s: float) -> list[tuple[float, float]]:
    """Devuelve los tramos de silencio [(inicio, fin), …] usando ffmpeg
    silencedetect. Solo DETECTA (no corta): es la base para recortar sin riesgo."""
    try:
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(source),
             "-af", f"silencedetect=noise={umbral_db}dB:d={min_s}", "-f", "null", "-"],
            capture_output=True, text=True, timeout=PROC_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Detección de silencios se colgó (%s); no recorto", source.name)
        return []
    log = proc.stderr or ""
    inicios = [float(x) for x in re.findall(r"silence_start:\s*(-?[\d.]+)", log)]
    fines = [float(x) for x in re.findall(r"silence_end:\s*([\d.]+)", log)]
    return list(zip(inicios, fines))


def strip_silence(source: Path, dest: Path, *, umbral_db: int = -40, min_s: float = 0.35) -> bool:
    """Recorta SOLO el silencio del principio y del final de ``source`` a ``dest``.

    Método seguro: detecta los tramos de silencio (silencedetect) y recorta al
    rango de contenido. Nunca corta voz — si no hay silencio en los extremos, no
    toca nada y devuelve False (el llamador usa el original).

    Returns:
        True si escribió ``dest`` recortado; False si no había nada que recortar
        (o si algo falló y hay que quedarse con el original).
    """
    total = probe_duration(source)
    if total <= 0.6:  # audios muy cortos: no arriesgar
        return False
    tramos = _detectar_silencios(source, umbral_db, min_s)
    if not tramos:
        return False

    inicio = 0.0
    fin = total
    # Silencio de cabeza: un tramo que empieza pegado al inicio (~0).
    if tramos[0][0] <= 0.1:
        inicio = tramos[0][1]
    # Silencio de cola: un tramo que termina pegado al final.
    if tramos[-1][1] >= total - 0.1:
        fin = tramos[-1][0]

    # Nada que recortar en los extremos, o quedaría demasiado corto: no tocar.
    if inicio <= 0.05 and fin >= total - 0.05:
        return False
    if fin - inicio < 0.5:
        return False

    try:
        proc = subprocess.run(
            ["ffmpeg", "-y", "-i", str(source),
             "-af", f"atrim=start={inicio:.3f}:end={fin:.3f},asetpts=PTS-STARTPTS",
             "-c:a", "aac", "-b:a", "160k", str(dest)],
            capture_output=True, text=True, timeout=PROC_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Recortar silencios se colgó (%s); uso el original", source.name)
        dest.unlink(missing_ok=True)
        return False
    if proc.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        logger.warning("No pude recortar silencios (%s); uso el original", source.name)
        dest.unlink(missing_ok=True)
        return False
    logger.info("Silencios recortados: %s  %.1fs -> %.1fs", source.name, total, fin - inicio)
    return True
