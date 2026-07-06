from pathlib import Path
import sys
from themes import _base
from . import components as C

NAME = "sabores"
_DIR = Path(__file__).parent
_F = _DIR / "fonts"
FONTS = { "Fraunces-Display": _F / "Fraunces-Display.ttf", "Fraunces-Head": _F / "Fraunces-Head.ttf", "Lora-Bold": _F / "Lora-Bold.ttf", "Lora-Regular": _F / "Lora-Regular.ttf", "Lora-SemiBold": _F / "Lora-SemiBold.ttf" }
CSS = (_DIR / "theme.css").read_text(encoding="utf-8").replace("FONTS/", f"{_F.as_posix()}/")
DECO, COVER_DECO = C.DECO, C.COVER_DECO
FLOURISH, DIVIDER, CLOSING_MOTIF = C.FLOURISH, C.DIVIDER, C.CLOSING_MOTIF
_self = sys.modules[__name__]
def render_block(b): return _base.render_block(_self, b)
def wrap(body, title="Ebook"): return _base.wrap(_self, body, title)
