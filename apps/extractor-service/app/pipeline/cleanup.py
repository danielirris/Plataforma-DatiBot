"""Limpieza de temporales por job y purga de outputs antiguos."""
from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

logger = logging.getLogger(__name__)


def cleanup_job_dir(work_dir: Path) -> None:
    """Borra por completo la carpeta de trabajo temporal de un job.

    Args:
        work_dir: carpeta ``storage/jobs/{job_id}`` a eliminar.
    """
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.info("Temporales borrados: %s", work_dir)


def delete_source(source: Path) -> None:
    """Borra el video fuente subido en cuanto deja de necesitarse."""
    try:
        if source.exists():
            source.unlink()
            logger.info("Video fuente borrado: %s", source.name)
    except OSError as exc:  # pragma: no cover - mejor esfuerzo
        logger.warning("No se pudo borrar el fuente %s: %s", source, exc)


def purge_keep_recent(outputs_dir: Path, keep_n: int) -> int:
    """Conserva los ``keep_n`` trabajos más recientes y borra el resto.

    Se usa para alimentar la Galería: en vez de borrar por antigüedad (que haría
    desaparecer los trabajos pasadas unas horas), mantenemos SIEMPRE los últimos
    ``keep_n`` por fecha, y el disco queda acotado a esa cantidad de trabajos.

    Args:
        outputs_dir: carpeta ``storage/outputs`` (un subdirectorio por job).
        keep_n: cuántos trabajos recientes conservar.

    Returns:
        Número de trabajos borrados.
    """
    if not outputs_dir.exists() or keep_n <= 0:
        return 0
    items = list(outputs_dir.iterdir())
    try:
        items.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        return 0
    borrados = 0
    for item in items[keep_n:]:
        try:
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink()
            borrados += 1
            logger.info("Galería llena: borrado el trabajo viejo %s", item.name)
        except OSError as exc:  # pragma: no cover - mejor esfuerzo
            logger.warning("No se pudo borrar %s: %s", item, exc)
    return borrados


def purge_dir_contents(target: Path) -> int:
    """Vacía por completo una carpeta.

    Se usa al arrancar sobre ``storage/tmp``, cuando no hay ninguna subida en
    curso: barre los temporales huérfanos que hayan quedado de un proceso
    interrumpido (una fuga lenta de disco en el volumen persistente).
    """
    if not target.exists():
        return 0
    borrados = 0
    for item in target.iterdir():
        try:
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink()
            borrados += 1
        except OSError as exc:  # pragma: no cover - mejor esfuerzo
            logger.warning("No se pudo borrar el temporal %s: %s", item, exc)
    if borrados:
        logger.info("Temporales huérfanos borrados: %d en %s", borrados, target)
    return borrados


def purge_older_than(base_dir: Path, max_age_hours: float) -> int:
    """Borra las entradas de ``base_dir`` más antiguas que ``max_age_hours``.

    Se usa para las miniaturas de ganchos (``storage/hooks/<sesión>``): solo
    sirven durante la edición y, si no se purgan, se acumulan sin límite en el
    volumen persistente.

    Returns:
        Número de entradas borradas.
    """
    if not base_dir.exists():
        return 0
    limite = time.time() - max_age_hours * 3600
    borrados = 0
    for item in base_dir.iterdir():
        try:
            if item.stat().st_mtime >= limite:
                continue
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink()
            borrados += 1
        except OSError as exc:  # pragma: no cover - mejor esfuerzo
            logger.warning("No se pudo borrar %s: %s", item, exc)
    if borrados:
        logger.info("Purga por antigüedad: %d entradas viejas en %s", borrados, base_dir)
    return borrados
