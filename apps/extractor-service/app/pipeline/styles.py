"""Los 5 estilos de edición (ver remotion/ESTILOS_EDICION.md).

Cada estilo es un PRESET que:
  - fuerza el tipo de subtítulo y la intensidad,
  - limita cuántos elementos entran (tarjetas, píldoras, emojis, listas),
  - fija la intención de color (paleta),
  - y guía a la IA con su propio prompt (tono, ritmo, qué NO usar).

Así los 5 producen resultados claramente distintos con el motor actual. Las
"movidas sobre el video" (punch-in, B&N, freeze…) son una sub-fase posterior.
"""
from __future__ import annotations

import random as _random

# Reglas comunes que comparten los 5 (se anteponen al prompt de cada estilo).
_COMUN = (
    "Subtítulos Anton MAYÚSCULAS con contorno. CÍÑETE SIEMPRE AL AUDIO: no "
    "inventes cifras, precios ni datos que la voz no diga. Safe-area 8-10%. "
    "Cierra con CTA 'Haz clic para conseguir el tuyo' + botón a WhatsApp."
)

STYLES: dict[str, dict] = {
    "editorial_mono": {
        "nombre": "Editorial Mono",
        "subtitle_style": "color",
        "intensidad": 25,
        "max_fullscreen": 1, "max_pills": 2, "max_emojis": 1, "max_lists": 1,
        "color": "mono",
        "prompt": (
            "ESTILO EDITORIAL MONO — minimalismo editorial/keynote. Silencio visual, "
            "cada palabra pesa. Subtítulos 'color': solo la palabra clave cambia de color, "
            "sin caja ni escala. Intensidad baja (25): edición sobria que respira. Máximo 1 "
            "tarjeta full-screen en el gancho (2-4 palabras, sin emoji). 1-2 píldoras discretas "
            "solo para el dato más importante. Sin emojis (máx 1 sutil). Si la voz enumera, lista "
            "limpia y alineada. Color monocromático (1 color + neutros), sensación de marca. "
            "Menos es más: ante la duda, no lo pongas."
        ),
    },
    "premium_noir": {
        "nombre": "Premium Noir",
        "subtitle_style": "karaoke",
        "intensidad": 35,
        "max_fullscreen": 2, "max_pills": 2, "max_emojis": 2, "max_lists": 1,
        "color": "mono_oscuro",
        "prompt": (
            "ESTILO PREMIUM NOIR — lujo silencioso, oscuro, cinematográfico. Subtítulos 'karaoke': "
            "la palabra que suena se pinta siguiendo la voz. Intensidad 35: elegante y pausado, "
            "deja respirar. 1-2 tarjetas full-screen (gancho y antes del cierre), 3-5 palabras, "
            "máx 1 emoji refinado. 2 píldoras de atributos de valor. Pocos emojis (1-2 sutiles). "
            "Si enumera beneficios, un ítem a la vez, lento. Color monocromático oscuro/premium. "
            "Prioriza elegancia sobre cantidad."
        ),
    },
    "afiche_retro": {
        "nombre": "Afiche Retro",
        "subtitle_style": "box",
        "intensidad": 65,
        "max_fullscreen": 2, "max_pills": 4, "max_emojis": 3, "max_lists": 2,
        "color": "contrastante",
        "prompt": (
            "ESTILO AFICHE RETRO — cartel bold, tipografía protagonista, póster vintage. "
            "Subtítulos 'box': las palabras clave con fondo de color sólido tipo etiqueta. "
            "Intensidad 65: carácter gráfico y ritmo marcado, ordenado como un afiche. 1-2 tarjetas "
            "full-screen con frases cortas y contundentes + 1 emoji sticker. 3-4 píldoras como "
            "etiquetas/tags. 2-3 emojis estética sticker. Si enumera, lista estilo tarjeta/tabla bold. "
            "Color: 2 contrastantes en bloques planos de alto contraste. La tipografía manda."
        ),
    },
    "modo_bestia": {
        "nombre": "Modo Bestia",
        "subtitle_style": "punch",
        "intensidad": 92,
        "max_fullscreen": 3, "max_pills": 5, "max_emojis": 6, "max_lists": 2,
        "color": "vibrante",
        "prompt": (
            "ESTILO MODO BESTIA — hype puro, máxima energía e impacto. Subtítulos 'punch': la "
            "palabra activa se agranda con golpe. Intensidad 92: cortes rápidos, todo entra y sale "
            "con fuerza. 2-3 tarjetas full-screen con texto corto explosivo + 1 emoji fuerte cada una. "
            "4-5 píldoras rápidas. Muchos emojis con pop en los énfasis. Si enumera, lista con entrada "
            "rápida y agresiva. Color muy colorido o 2 contrastantes saturados. Aunque sea intenso, "
            "el subtítulo principal SIEMPRE debe leerse."
        ),
    },
    "relato_doc": {
        "nombre": "Relato Doc",
        "subtitle_style": "pop",
        "intensidad": 40,
        "max_fullscreen": 2, "max_pills": 2, "max_emojis": 2, "max_lists": 1,
        "color": "calido",
        "prompt": (
            "ESTILO RELATO DOC — storytelling documental, ritmo narrativo. Subtítulos 'pop' suave: "
            "la palabra clave rebota leve, como énfasis narrativo (no saltarín). Intensidad 40: ritmo "
            "de relato, deja respirar las frases. 1-2 tarjetas full-screen (una de título en el gancho, "
            "otra de conclusión antes del cierre), poco texto. 2 píldoras de contexto. Pocos emojis "
            "(1-2, solo si suman al relato). Si enumera pasos/aprendizajes, lista pausada. Color mínimo/"
            "monocromático cálido para que domine la imagen real. La historia manda; los gráficos apoyan."
        ),
    },
}

DEFAULT_STYLE = "modo_bestia"


def style_prompt(style_id: str) -> str:
    """Prompt (lineamientos) del estilo, con las reglas comunes antepuestas."""
    s = STYLES.get(style_id)
    if not s:
        return ""
    return f"{s['prompt']}\n\n{_COMUN}"


def _palette_for(intencion: str, seed: str) -> list[str]:
    """Paleta acorde a la intención de color del estilo (parte de su identidad)."""
    r = _random.Random(seed)
    if intencion == "mono":
        base = r.choice(["#10B981", "#3B82F6", "#7C5CFF", "#F59E0B", "#EF4444"])
        return [base, "#F4F4F5", "#C7C7CC", "#7A7A80", base]
    if intencion == "mono_oscuro":
        base = r.choice(["#C9A227", "#8B7BE8", "#3B82F6", "#B0B0B0"])
        return [base, "#141414", "#2A2A2A", "#4A4A4A", base]
    if intencion == "contrastante":
        return r.choice([
            ["#FF2D78", "#00C2FF"], ["#FFD400", "#7C5CFF"],
            ["#FF8A00", "#00C2FF"], ["#2ECC71", "#FF2D78"],
        ])
    if intencion == "calido":
        base = r.choice(["#D9822B", "#C0562B", "#B8860B", "#A0522D"])
        return [base, "#F3E9DD", "#D9C6A5", "#8B6B4A", base]
    # "vibrante": paleta vibrante barajada (como hoy)
    from app.pipeline.analyze import random_palette
    return random_palette(seed)


def apply_style(plan: dict, style_id: str, seed: str) -> dict:
    """Aplica el estilo sobre un plan de la IA: fuerza subtítulo/intensidad,
    recorta la cantidad de elementos y fija la paleta. Muta y devuelve ``plan``."""
    s = STYLES.get(style_id)
    if not s:
        return plan
    plan["subtitle_style"] = s["subtitle_style"]
    plan["intensidad"] = s["intensidad"]
    plan["fullscreen"] = (plan.get("fullscreen") or [])[: s["max_fullscreen"]]
    plan["pills"] = (plan.get("pills") or [])[: s["max_pills"]]
    plan["emojis"] = (plan.get("emojis") or [])[: s["max_emojis"]]
    plan["lists"] = (plan.get("lists") or [])[: s["max_lists"]]
    pal = _palette_for(s["color"], seed)
    plan["palette"] = pal
    plan["accent"] = pal[0]
    plan["estilo"] = style_id
    return plan
