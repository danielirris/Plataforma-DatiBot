"""Registro de temas. Añadir un tema = crear una carpeta con un módulo
que exponga: NAME, FONTS, CSS, render_block(block), wrap(body, title)."""
import importlib

def get_theme(name: str):
    return importlib.import_module(f"themes.{name}.theme")

def list_themes():
    import pkgutil, themes
    return [m.name for m in pkgutil.iter_modules(themes.__path__) if m.ispkg]
