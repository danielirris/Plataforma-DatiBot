"""Post-proceso de los B-rolls: quitar audio (el usuario pone el suyo) y recortar."""
from __future__ import annotations

import subprocess
from pathlib import Path


def strip_audio(src: Path, dest: Path, *, max_dur: float | None = None) -> Path:
    """Copia el video SIN pista de audio (y opcionalmente recorta a ``max_dur``).

    Veo 3.1 siempre genera audio; aquí se elimina para que el usuario ponga el
    suyo. Intenta sin recodificar (rápido); si falla, recodifica a H.264.
    """
    base = ["ffmpeg", "-y", "-i", str(src)]
    dur = ["-t", f"{max_dur:.2f}"] if max_dur else []
    # 1) rápido: copiar el video, descartar audio.
    try:
        subprocess.run([*base, *dur, "-an", "-c:v", "copy", "-movflags", "+faststart", str(dest)],
                       capture_output=True, check=True)
        if dest.is_file() and dest.stat().st_size > 0:
            return dest
    except Exception:  # noqa: BLE001 — algunos contenedores no permiten copy+trim
        pass
    # 2) robusto: recodificar sin audio.
    subprocess.run([*base, *dur, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", str(dest)],
                   capture_output=True, check=True)
    return dest
