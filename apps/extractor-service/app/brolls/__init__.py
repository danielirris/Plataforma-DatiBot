"""Generación de B-rolls (clips de fondo para anuncios).

Módulo AISLADO del resto del servicio: genera clips de video del PRODUCTO
(sin personas) a partir de los datos guardados del producto, con dos fuentes:

  - "veo"      → crea clips de cero con Google Veo (tier más barato, 720p, sin
                 audio: se le quita la pista tras generar).
  - "uploaded" → recorta clips cortos de los videos que ya subiste al producto.

Punto de entrada: ``generate_brolls(product_id, product, source=...)``.
"""
from app.brolls.service import generate_brolls  # noqa: F401
