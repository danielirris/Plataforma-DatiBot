"""EbookForge CLI — genera un ebook (PDF/HTML) desde contenido + tema. Sin IA."""
import argparse, json
from pathlib import Path
from themes import get_theme, list_themes
from engine import generate

def main():
    ap = argparse.ArgumentParser(description="EbookForge — contenido + tema -> PDF")
    ap.add_argument("content", help="ruta al JSON de contenido")
    ap.add_argument("--theme", default=None, help=f"tema (por defecto el del JSON). Disponibles: {list_themes()}")
    ap.add_argument("-o", "--out", default="salida.pdf", help="PDF de salida")
    ap.add_argument("--html", default=None, help="(opcional) guardar también el HTML")
    a = ap.parse_args()
    p = Path(a.content)
    doc = json.loads(p.read_text(encoding="utf-8"))
    theme = get_theme(a.theme or doc.get("theme", "amigurumi"))
    generate(doc, theme, p.parent / "imagenes", a.out, a.html)
    print(f"OK -> {a.out} (tema: {theme.NAME})")

if __name__ == "__main__":
    main()
