"""Registro de temas. Añadir un tema = crear una carpeta con un módulo
que exponga: NAME, FONTS, CSS, render_block(block), wrap(body, title)."""
import importlib

def get_theme(name: str):
    # Solo temas que existen: antes cualquier texto llegaba a import_module (un
    # nombre raro daba un 500 con la traza, o importaba un módulo no previsto).
    if name not in list_themes():
        raise ValueError(f"Tema desconocido: {name!r}. Disponibles: {', '.join(list_themes())}")
    return importlib.import_module(f"themes.{name}.theme")

def list_themes():
    import pkgutil, themes
    return [m.name for m in pkgutil.iter_modules(themes.__path__) if m.ispkg]
