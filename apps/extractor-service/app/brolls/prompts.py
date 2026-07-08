"""Construcción de los prompts de Veo a partir de los datos del producto.

Genera N prompts cinematográficos DISTINTOS del producto en primer plano y SIN
personas, variando ángulo, iluminación, encuadre y contexto. La escena se deriva
de la categoría/atributos del producto. Gemini (2.5-flash) es un paso interno
OPCIONAL para redactar mejor; si falla, se usa el andamiaje por reglas.
"""
from __future__ import annotations

import json
import logging

from app.brolls.config import GEMINI_MODEL, BrollConfig, gemini_key

logger = logging.getLogger("brolls.prompts")

# Instrucción negativa que va SIEMPRE en cada prompt (sin personas, sin texto…).
NEGATIVOS = (
    "No people, no humans, no hands, no fingers, no body parts, no faces, "
    "no text, no captions, no subtitles, no logos, no brand names, no watermark, "
    "no UI overlays."
)

_ANGULOS = [
    "low-angle hero shot", "top-down flat-lay shot", "45-degree three-quarter view",
    "eye-level straight-on shot", "slow orbit around the product",
    "dutch-tilt close-up", "extreme macro close-up", "wide establishing shot",
]
_LUCES = [
    "warm golden-hour light", "cool clean studio lighting", "soft diffused daylight",
    "dramatic low-key rim light", "bright high-key lighting", "moody cinematic side light",
]
_MOVIMIENTOS = [
    "slow push-in", "gentle parallax drift", "subtle rack focus", "slow dolly move",
    "locked-off tripod with drifting particles", "slow pedestal rise",
]

# Escenario según la categoría inferida de los textos del producto.
# clave -> (superficie/contexto, ambiente)
_ESCENAS: list[tuple[tuple[str, ...], str, str]] = [
    (("comida", "aliment", "receta", "cocina", "snack", "bebida", "café", "sabor", "food"),
     "a rustic wooden board", "warm kitchen atmosphere with soft steam and scattered ingredients"),
    (("tech", "tecnolog", "gadget", "electrón", "dispositivo", "app", "software", "digital"),
     "a clean matte surface", "minimal tech setting with cool light and subtle reflections"),
    (("belleza", "piel", "cosm", "maquillaje", "skincare", "crema", "sérum", "beauty"),
     "a polished marble surface", "elegant spa ambiance with soft shadows and water droplets"),
    (("salud", "suplement", "vitamin", "nutri", "wellness", "medic"),
     "a clean bright countertop", "fresh clinical-yet-warm wellness setting"),
    (("fitness", "gym", "ejercicio", "deporte", "muscul", "entren", "workout"),
     "a textured concrete gym floor", "energetic setting with hard directional light and light haze"),
    (("moda", "ropa", "textil", "prenda", "calzado", "accesor", "fashion"),
     "a soft fabric backdrop", "editorial fashion setting with clean gradient light"),
    (("hogar", "casa", "decor", "mueble", "cocina-hogar", "home"),
     "a warm wooden tabletop", "cozy home interior with natural window light"),
]
_ESCENA_DEFAULT = ("a seamless minimal backdrop",
                   "clean studio setting with soft gradient light")


def _texto(v: object) -> str:
    return v if isinstance(v, str) else ""


def product_brief(product: dict) -> str:
    """Resumen compacto del producto para alimentar la escena/refinado."""
    ident = product.get("identidad") or {}
    avatar = product.get("avatar") or {}
    oferta = product.get("oferta") or {}
    ebook = (product.get("ebook") or {}).get("idea") or {}
    angulos = product.get("angulos") or []
    prod_ppal = (oferta.get("producto_principal") or {}) if isinstance(oferta, dict) else {}
    partes = [
        f"Producto: {_texto(product.get('nombre'))}",
        f"Promesa: {_texto(ident.get('promesa'))}",
        f"Posicionamiento (tono de marca): {_texto(ident.get('posicionamiento'))}",
        f"Dirigido a: {_texto(ident.get('dirigidoA'))}",
        f"Deseos del avatar: {_texto(avatar.get('deseos'))}",
        f"Mecanismo único: {_texto(avatar.get('mecanismo_unico'))}",
        f"Oferta: {_texto(oferta.get('promesa_grande')) if isinstance(oferta, dict) else ''}",
        f"Incluye: {_texto(prod_ppal.get('titulo'))}",
        f"Ebook: {_texto(ebook.get('titulo'))} — {_texto(ebook.get('concepto'))}",
    ]
    if angulos:
        emos = ", ".join(_texto(a.get("emocion_dominante")) for a in angulos[:3] if _texto(a.get("emocion_dominante")))
        if emos:
            partes.append(f"Emociones dominantes: {emos}")
    return "\n".join(p for p in partes if p.rsplit(": ", 1)[-1].strip())


def _guess_escena(brief: str) -> tuple[str, str]:
    b = brief.lower()
    for claves, superficie, ambiente in _ESCENAS:
        if any(c in b for c in claves):
            return superficie, ambiente
    return _ESCENA_DEFAULT


def _tono(product: dict) -> str:
    ident = product.get("identidad") or {}
    pos = _texto(ident.get("posicionamiento")).strip()
    return f"Brand tone: {pos}." if pos else ""


def build_scaffold(product: dict, cfg: BrollConfig) -> list[str]:
    """N prompts por reglas (sin IA): variando ángulo, luz, encuadre y contexto."""
    brief = product_brief(product)
    producto = _texto(product.get("nombre")) or "the product"
    superficie, ambiente = _guess_escena(brief)
    tono = _tono(product)
    aspecto = "vertical 9:16 framing" if cfg.aspect_ratio == "9:16" else "horizontal 16:9 framing"

    prompts: list[str] = []
    for i in range(cfg.n_brolls):
        ang = _ANGULOS[i % len(_ANGULOS)]
        luz = _LUCES[(i * 2 + 1) % len(_LUCES)]
        mov = _MOVIMIENTOS[(i * 3 + 2) % len(_MOVIMIENTOS)]
        prompts.append(
            f"Cinematic {ang} of {producto}, the product as the sole hero subject, "
            f"placed on {superficie}, {luz}, {ambiente}. Camera: {mov}. "
            f"{tono} Photorealistic, shallow depth of field, crisp product detail, "
            f"{aspecto}, no on-screen graphics. {NEGATIVOS}"
        )
    return prompts


def _refine_with_gemini(product: dict, scaffold: list[str], cfg: BrollConfig) -> list[str]:
    """Reescribe los prompts con gemini-2.5-flash (paso interno OPCIONAL)."""
    key = gemini_key()
    if not key:
        return scaffold
    try:
        from google import genai  # import perezoso
        client = genai.Client(api_key=key)
        instr = (
            "Eres director de fotografía. A partir del brief del producto, reescribe "
            f"estos {cfg.n_brolls} prompts para clips B-roll de Veo (en INGLÉS). Cada uno: "
            "una toma cinematográfica del PRODUCTO como único sujeto, SIN personas, "
            "coherente con el tono de marca; varía ángulo, luz, encuadre y contexto; "
            "escena derivada de la categoría. Mantén SIEMPRE al final las instrucciones "
            f"negativas: \"{NEGATIVOS}\". Devuelve SOLO un array JSON de {cfg.n_brolls} strings.\n\n"
            f"BRIEF:\n{product_brief(product)}\n\nPROMPTS BASE:\n"
            + "\n".join(f"{i+1}. {p}" for i, p in enumerate(scaffold))
        )
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=instr)
        txt = (resp.text or "").strip()
        if txt.startswith("```"):
            txt = txt.split("```", 2)[1].lstrip("json").strip() if "```" in txt else txt
        data = json.loads(txt)
        out = [str(x).strip() for x in data if str(x).strip()]
        # Garantiza los negativos y el nº correcto.
        fixed = []
        for i in range(cfg.n_brolls):
            p = out[i] if i < len(out) else scaffold[i]
            if "no people" not in p.lower():
                p = f"{p} {NEGATIVOS}"
            fixed.append(p)
        return fixed
    except Exception as e:  # noqa: BLE001 — si algo falla, andamiaje por reglas
        logger.warning("Refinado Gemini falló, uso andamiaje: %s", e)
        return scaffold


def build_broll_prompts(product: dict, cfg: BrollConfig) -> list[str]:
    """Devuelve los N prompts finales (andamiaje + refinado opcional)."""
    scaffold = build_scaffold(product, cfg)
    if cfg.refine_with_gemini:
        return _refine_with_gemini(product, scaffold, cfg)
    return scaffold
