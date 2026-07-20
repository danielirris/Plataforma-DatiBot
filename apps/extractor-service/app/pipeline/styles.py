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

# ── Movidas de editor por estilo (Grupo A del spec: solo el video original) ──
# Cada estilo declara QUÉ efectos usa; ``plan_moves`` los convierte en movidas
# concretas y temporizadas. Efectos que NO alteran la duración/sync del audio:
#   punch  — zoom-in de énfasis ("hard" = seco/frecuente, "soft" = lento/espaciado)
#   bw     — desaturado por tramo ("dominant" todo, "intro" 1er cuarto, "arc" 1er 40%)
#   shake  — temblor corto en los golpes
#   flash  — destello de color en cambios de bloque
#   spotlight — viñeta/oscurecido alrededor para dirigir la mirada
#   reframe — recompone el encuadre cada N segundos (variedad)
#   letterbox — barras cine fijas (look premium)
STYLE_MOVES: dict[str, dict] = {
    "editorial_mono": {"punch": "soft", "bw": "intro", "spotlight": True},
    "premium_noir": {"bw": "dominant", "punch": "soft", "letterbox": True},
    "afiche_retro": {"flash": True, "reframe": True, "punch": "hard"},
    "modo_bestia": {"punch": "hard", "shake": True, "flash": True},
    "relato_doc": {"bw": "arc", "punch": "soft"},
}

# ── Personalidad visual por estilo (Parte B) ──
# Hasta ahora los 5 estilos usaban la MISMA fuente y el subtítulo SIEMPRE abajo
# al 15%, así que se veían casi iguales. Cada estilo trae ahora:
#   font       — su tipografía por defecto (de ALLOWED_FONTS); el usuario puede
#                seguir forzando otra en el editor.
#   sub_bottom — a qué % del fondo va el subtítulo (ritmo vertical distinto).
#   sub_scale  — multiplicador de tamaño del subtítulo (sobrio vs. grande).
STYLE_LOOK: dict[str, dict] = {
    "editorial_mono": {"font": "Oswald", "sub_bottom": 30, "sub_scale": 0.82},
    "premium_noir": {"font": "Montserrat", "sub_bottom": 12, "sub_scale": 0.90},
    "afiche_retro": {"font": "BebasNeue", "sub_bottom": 16, "sub_scale": 1.08},
    "modo_bestia": {"font": "Anton", "sub_bottom": 15, "sub_scale": 1.00},
    "relato_doc": {"font": "Poppins", "sub_bottom": 22, "sub_scale": 0.85},
}


def style_font(style_id: str) -> str:
    """Fuente por defecto del estilo (Anton si no tiene o no existe el estilo)."""
    return (STYLE_LOOK.get(style_id) or {}).get("font", "Anton")


def plan_moves(plan: dict, line_starts: list[float], duration: float,
               seed: str = "") -> list[dict]:
    """Genera las "movidas sobre el video" según el estilo del plan.

    Reglas por triggers baratos (inicios de línea = énfasis, tarjetas = cambios de
    bloque, píldoras = palabra clave). Devuelve una lista de movidas temporizadas;
    el motor Remotion las acumula por frame sobre la capa de video.
    """
    style = plan.get("estilo")
    cfg = STYLE_MOVES.get(style or "", {})
    if not cfg or duration <= 0:
        return []

    r = _random.Random(f"{seed}:{style}:moves")
    d = float(duration)
    ls = sorted(t for t in (line_starts or []) if 0.0 <= t < d)
    cards = sorted(round(float(c.get("at", 0.0)), 3)
                   for c in (plan.get("fullscreen") or []) if 0.0 <= float(c.get("at", 0.0)) < d)
    moves: list[dict] = []

    def add(kind: str, start: float, end: float, **extra: object) -> None:
        s = max(0.0, round(start, 3))
        e = min(d, round(end, 3))
        if e - s >= 0.05:
            moves.append({"kind": kind, "start": s, "end": e, **extra})

    # A2 — B&N / desaturado por segmento.
    bw = cfg.get("bw")
    if bw == "dominant":
        add("bw", 0.0, d, amount=0.85)
    elif bw == "intro":
        add("bw", 0.0, d * 0.28, amount=1.0)
    elif bw == "arc":
        add("bw", 0.0, d * 0.4, amount=1.0)

    # letterbox — barras cine fijas.
    if cfg.get("letterbox"):
        add("letterbox", 0.0, d)

    # A1 — punch-in en los énfasis (inicios de línea).
    punch = cfg.get("punch")
    if punch and ls:
        hard = punch == "hard"
        amount = 0.14 if hard else 0.06
        ramp = 0.10 if hard else 0.45
        # El zoom de énfasis es un GOLPE, no un estado: si se queda pegado
        # segundo y pico se siente "filtro puesto todo el rato". El suave baja
        # de 1.2s a 0.6s.
        hold = 0.45 if hard else 0.6
        step = 1 if hard else 2
        for i in range(0, len(ls), step):
            add("punch", ls[i], ls[i] + hold, amount=amount, ramp=round(ramp, 3))

    # A5 — shake/zoom-punch en algunos golpes.
    if cfg.get("shake") and ls:
        for t in ls:
            if r.random() < 0.5:
                add("shake", t, t + 0.28, amount=10)

    # A6 — flash de color en cambios de bloque (o cada varias líneas).
    if cfg.get("flash"):
        puntos = cards or ls[::3]
        for t in puntos:
            add("flash", t, t + 0.14)

    # A7 — spotlight en la palabra clave (píldoras). Tope de 0.9s: si dura toda
    # la píldora (varios segundos) parece un filtro permanente, no un realce.
    if cfg.get("spotlight"):
        for p in (plan.get("pills") or []):
            s = float(p.get("start", 0.0))
            e = float(p.get("end", s + 1.0))
            add("spotlight", s, min(e, s + 0.9))

    # A8 — reframe cada N segundos (variedad de encuadre).
    if cfg.get("reframe"):
        n = 4.0
        zonas = [(-8, -4), (8, -2), (-6, 6), (6, 4)]
        i, t = 0, n
        while t < d - 2.0:
            zx, zy = zonas[i % len(zonas)]
            add("reframe", t, t + n, x=zx, y=zy, amount=0.10)
            t += n
            i += 1

    return moves


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
    # Colocación del subtítulo propia del estilo (la lee Subtitles.tsx; si falta,
    # la plantilla cae al 15% y tamaño 1 de siempre).
    look = STYLE_LOOK.get(style_id) or {}
    plan["subBottom"] = look.get("sub_bottom", 15)
    plan["subScale"] = look.get("sub_scale", 1.0)
    return plan
