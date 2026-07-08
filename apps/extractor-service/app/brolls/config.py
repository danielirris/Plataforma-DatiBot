"""Configuración del generador de B-rolls (nº, duración, aspecto, precios)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings

# Precios oficiales USD/seg a 720p — ai.google.dev/gemini-api/docs/pricing (jul-2026).
VEO_PRICE_PER_SEC: dict[str, float] = {
    "veo-3.1-lite-generate-preview": 0.05,   # tier más barato (por defecto)
    "veo-3.1-fast-generate-preview": 0.10,
    "veo-3.1-generate-preview": 0.40,
}
DEFAULT_MODEL = "veo-3.1-lite-generate-preview"

# Gemini para (a) refinar prompts y (b) el detector "sin personas" por visión.
GEMINI_MODEL = "gemini-2.5-flash"

# Veo 3.1 solo admite estas duraciones de clip (segundos).
DURACIONES_VALIDAS = (4, 6, 8)
ASPECTOS_VALIDOS = ("9:16", "16:9")


@dataclass
class BrollConfig:
    """Parámetros de una tanda de B-rolls (con overrides por request)."""

    n_brolls: int = 10
    duration_s: int = 4          # 4 | 6 | 8 (Veo)
    aspect_ratio: str = "9:16"   # 9:16 vertical (default) | 16:9
    resolution: str = "720p"
    model: str = DEFAULT_MODEL
    max_retries: int = 3         # reintentos por clip (Veo o verificación de personas)
    frames_per_check: int = 3    # frames muestreados para el detector de personas
    refine_with_gemini: bool = True

    @property
    def price_per_sec(self) -> float:
        return VEO_PRICE_PER_SEC.get(self.model, 0.05)

    @classmethod
    def from_overrides(cls, data: dict | None) -> "BrollConfig":
        cfg = cls()
        data = data or {}
        for k in ("n_brolls", "duration_s", "aspect_ratio", "resolution",
                  "model", "max_retries", "frames_per_check", "refine_with_gemini"):
            if data.get(k) is not None:
                setattr(cfg, k, data[k])
        # Saneos (Veo es estricto con estos valores).
        cfg.n_brolls = max(1, min(20, int(cfg.n_brolls)))
        cfg.duration_s = int(cfg.duration_s) if int(cfg.duration_s) in DURACIONES_VALIDAS else 4
        cfg.aspect_ratio = cfg.aspect_ratio if cfg.aspect_ratio in ASPECTOS_VALIDOS else "9:16"
        cfg.max_retries = max(0, min(6, int(cfg.max_retries)))
        cfg.frames_per_check = max(1, min(8, int(cfg.frames_per_check)))
        if cfg.model not in VEO_PRICE_PER_SEC:
            cfg.model = DEFAULT_MODEL
        return cfg


def gemini_key() -> str:
    """Clave de Google AI Studio (Veo + Gemini). NUNCA hardcodeada."""
    return os.environ.get("GEMINI_API_KEY", "") or get_settings().gemini_api_key or ""


def output_base() -> Path:
    """Carpeta raíz de salida de los B-rolls.

    Por defecto ``<storage>/brolls``; si hay un volumen compartido (VPS_LOCAL_DIR)
    o se fija BROLL_OUTPUT_DIR, se usa esa (persistente entre redeploys).
    """
    env = os.environ.get("BROLL_OUTPUT_DIR") or os.environ.get("VPS_LOCAL_DIR")
    if env:
        base = Path(env)
        # Bajo el volumen de imágenes lo separamos en /brolls.
        return base / "brolls" if base.name != "brolls" else base
    return get_settings().storage_dir / "brolls"
