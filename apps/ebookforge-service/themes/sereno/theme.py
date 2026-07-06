from pathlib import Path
import sys
from themes import _base
from . import components as C

NAME = "sereno"
_DIR = Path(__file__).parent
_F = _DIR / "fonts"
FONTS = { "Fredoka-Bold": _F / "Fredoka-Bold.ttf", "Fredoka-Medium": _F / "Fredoka-Medium.ttf", "Fredoka-SemiBold": _F / "Fredoka-SemiBold.ttf", "Poppins-Bold": _F / "Poppins-Bold.ttf", "Poppins-Medium": _F / "Poppins-Medium.ttf", "Poppins-Regular": _F / "Poppins-Regular.ttf" }
CSS = (_DIR / "theme.css").read_text(encoding="utf-8").replace("FONTS/", f"{_F.as_posix()}/")
DECO, COVER_DECO = C.DECO, C.COVER_DECO
FLOURISH, DIVIDER, CLOSING_MOTIF = C.FLOURISH, C.DIVIDER, C.CLOSING_MOTIF
_self = sys.modules[__name__]
def render_block(b): return _base.render_block(_self, b)
def wrap(body, title="Ebook"): return _base.wrap(_self, body, title)
