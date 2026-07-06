"""Componentes SVG del tema amigurumi. Datos -> SVG (deterministas)."""


def flower(size, op=1.0, col="#E6CCF0"):
    pet = "".join(f'<ellipse cx="0" cy="-16" rx="6.5" ry="13" transform="rotate({a})"/>'
                  for a in range(0, 360, 60))
    return (f'<svg width="{size}" height="{size}" viewBox="-30 -30 60 60" style="opacity:{op}">'
            f'<g fill="none" stroke="{col}" stroke-width="2.4">{pet}</g>'
            f'<circle r="4.5" fill="{col}"/></svg>')


def bird(size=72):
    return (f'<svg width="{size}" height="{int(size * 0.84)}" viewBox="0 0 80 64">'
            '<ellipse cx="34" cy="36" rx="21" ry="13" transform="rotate(-12 34 36)" fill="#CBAAE4"/>'
            '<circle cx="53" cy="27" r="9.5" fill="#CBAAE4"/>'
            '<polygon points="61,25 72,28 61,31" fill="#DABBEE"/>'
            '<path d="M14 32 Q3 25 2 37 Q11 36 17 40 Z" fill="#CBAAE4"/>'
            '<path d="M30 32 Q41 23 48 35 Q39 40 30 35 Z" fill="#E6CCF0"/>'
            '<circle cx="55" cy="26" r="1.7" fill="#FCF1FB"/></svg>')


def doodle(w=120):
    return (f'<svg width="{w}" height="24" viewBox="0 0 120 24">'
            '<path d="M4 12 q12 -12 24 0 t24 0 t24 0 t24 0" fill="none" '
            'stroke="#DABBEE" stroke-width="3" stroke-linecap="round"/></svg>')


DIVIDER = ('<svg class="divider" viewBox="0 0 600 12" preserveAspectRatio="xMidYMid meet">'
           '<line x1="8" y1="6" x2="592" y2="6" stroke="#CBAAE4" stroke-width="5" '
           'stroke-dasharray="1 17" stroke-linecap="round"/></svg>')

FLOURISH = ('<svg class="flourish" viewBox="0 0 200 8" preserveAspectRatio="none">'
            '<path d="M2 5 q26 -8 52 0 t52 0 t52 0 t40 0" fill="none" '
            'stroke="#CBAAE4" stroke-width="3.5" stroke-linecap="round"/></svg>')
