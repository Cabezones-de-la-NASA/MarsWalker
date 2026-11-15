#!/usr/bin/env python3
"""Revisa cada carpeta de public/data contra el contrato de datos (docs/modelosydb.md, sección 3).

Solo usa la librería estándar de Python. Termina con código 1 si alguna carpeta falla.

    python3 data_pipeline/validate.py            # revisa public/data
    python3 data_pipeline/validate.py otra/ruta  # revisa otra carpeta de datasets
"""

import json
import math
import os
import re
import struct
import sys
from array import array

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_DIR = os.path.join(REPO_ROOT, "public", "data")

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
POI_TYPES = {"shelter", "sampling", "hazard"}
ROUTE_ALGORITHMS = {"astar", "health", "qaoa"}
ROUTE_METRICS = ("distance_m", "oxygen_l", "max_slope_deg", "risk_score")


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_pair(value, check=_is_number):
    return isinstance(value, list) and len(value) == 2 and all(check(v) for v in value)


def _load_json(path, errors):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as error:
        errors.append("%s: no se pudo leer (%s)" % (os.path.basename(path), error))
        return None


def _png_size(path):
    with open(path, "rb") as handle:
        head = handle.read(24)
    if len(head) < 24 or head[:8] != PNG_SIGNATURE or head[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", head[16:24])


def _check_metadata(meta, folder_name, errors):
    def text(key):
        if not isinstance(meta.get(key), str) or not meta[key].strip():
            errors.append("metadata.json: '%s' debe ser un texto no vacío" % key)

    for key in ("dataset_id", "label", "source", "crs", "uncertainty_note"):
        text(key)
    if meta.get("dataset_id") != folder_name:
        errors.append("metadata.json: dataset_id '%s' no coincide con la carpeta '%s'"
                      % (meta.get("dataset_id"), folder_name))
    if not (_is_number(meta.get("resolution_m")) and meta["resolution_m"] > 0):
        errors.append("metadata.json: 'resolution_m' debe ser un número positivo")
    shape_ok = _is_pair(meta.get("shape"), lambda v: isinstance(v, int)
                        and not isinstance(v, bool) and v > 0)
    if not shape_ok:
        errors.append("metadata.json: 'shape' debe ser [filas, columnas] enteros positivos")
    if not _is_pair(meta.get("size_m")) or min(meta["size_m"]) <= 0:
        errors.append("metadata.json: 'size_m' debe ser [ancho_m, fondo_m] positivos")
    elif shape_ok and _is_number(meta.get("resolution_m")):
        rows, cols = meta["shape"]
        expected = [cols * meta["resolution_m"], rows * meta["resolution_m"]]
        if any(abs(a - b) > 1e-6 * b for a, b in zip(meta["size_m"], expected)):
            errors.append("metadata.json: size_m %s no es columnas x resolución, filas x "
                          "resolución %s" % (meta["size_m"], expected))
    if not _is_pair(meta.get("elevation_range_m")) or \
            meta["elevation_range_m"][0] > meta["elevation_range_m"][1]:
        errors.append("metadata.json: 'elevation_range_m' debe ser [min, max]")
    heightmap = meta.get("heightmap")
    if not isinstance(heightmap, dict):
        errors.append("metadata.json: falta el objeto 'heightmap'")
    else:
        for key, wanted in (("file", "heightmap.f32"), ("format", "float32-le"), ("units", "m")):
            if heightmap.get(key) != wanted:
                errors.append("metadata.json: heightmap.%s debe ser '%s'" % (key, wanted))
    layers = meta.get("layers")
    if not isinstance(layers, list) or not layers:
        errors.append("metadata.json: 'layers' debe ser una lista no vacía")
    else:
        for i, layer in enumerate(layers):
            if not isinstance(layer, dict) or not all(
                    isinstance(layer.get(k), str) and layer[k] for k in ("id", "file", "type")):
                errors.append("metadata.json: layers[%d] necesita id, file y type" % i)
        if not any(isinstance(l, dict) and l.get("type") == "base"
                   and l.get("file") == "texture.png" for l in layers):
            errors.append("metadata.json: falta la capa base con file 'texture.png'")
    if not isinstance(meta.get("acquisition_date"), str) or \
            not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", meta["acquisition_date"]):
        errors.append("metadata.json: 'acquisition_date' debe tener formato AAAA-MM")
    return shape_ok


def _check_heightmap(path, meta, errors):
    rows, cols = meta["shape"]
    expected = rows * cols * 4
    size = os.path.getsize(path)
    if size != expected:
        errors.append("heightmap.f32 mide %d bytes y deberían ser filas x columnas x 4 = %d"
                      % (size, expected))
        return
    values = array("f")
    with open(path, "rb") as handle:
        values.frombytes(handle.read())
    if sys.byteorder != "little":
        values.byteswap()
    if any(v != v or math.isinf(v) for v in values):
        errors.append("heightmap.f32 contiene valores no finitos (NaN o infinito)")
        return
    declared = meta.get("elevation_range_m")
    if _is_pair(declared):
        lowest, highest = min(values), max(values)
        tolerance = 1e-3 * max(1.0, abs(lowest), abs(highest))
        if abs(lowest - declared[0]) > tolerance or abs(highest - declared[1]) > tolerance:
            errors.append("elevation_range_m %s no coincide con los datos [%g, %g]"
                          % (declared, lowest, highest))


def _check_texture(path, meta, errors):
    size = _png_size(path)
    if size is None:
        errors.append("texture.png no es un PNG válido")
        return
    width, height = size
    rows, cols = meta["shape"]
    if abs(width * rows - height * cols) > max(width, height):
        errors.append("texture.png mide %d x %d y no tiene el encuadre del DEM (%d x %d)"
                      % (width, height, cols, rows))


def _check_poi(path, folder_name, errors):
    poi = _load_json(path, errors)
    if poi is None:
        return
    if poi.get("dataset_id") != folder_name:
        errors.append("poi.json: dataset_id no coincide con la carpeta")
    points = poi.get("points")
    if not isinstance(points, list):
        errors.append("poi.json: 'points' debe ser una lista")
        return
    for i, point in enumerate(points):
        if not isinstance(point, dict):
            errors.append("poi.json: points[%d] debe ser un objeto" % i)
            continue
        for key in ("id", "name", "description", "source"):
            if not isinstance(point.get(key), str):
                errors.append("poi.json: points[%d].%s debe ser texto" % (i, key))
        if not _is_pair(point.get("position_m")):
            errors.append("poi.json: points[%d].position_m debe ser [x, z]" % i)
        for key in ("image_url", "image_src"):
            if key in point and not (isinstance(point[key], str)
                                     and point[key].startswith("https://")):
                errors.append("poi.json: points[%d].%s debe ser un enlace https" % (i, key))
        if point.get("type") not in POI_TYPES:
            errors.append("poi.json: points[%d].type debe ser shelter, sampling o hazard" % i)


def _check_route(path, folder_name, errors):
    route = _load_json(path, errors)
    if route is None:
        return
    if route.get("dataset_id") != folder_name:
        errors.append("route.json: dataset_id no coincide con la carpeta")
    if route.get("algorithm") not in ROUTE_ALGORITHMS:
        errors.append("route.json: algorithm debe ser astar, health o qaoa")
    path_m = route.get("path_m")
    if not isinstance(path_m, list) or not all(_is_pair(p) for p in path_m):
        errors.append("route.json: path_m debe ser una lista de [x, z]")
    metrics = route.get("metrics")
    if not isinstance(metrics, dict) or not all(_is_number(metrics.get(k))
                                                for k in ROUTE_METRICS):
        errors.append("route.json: metrics necesita %s" % ", ".join(ROUTE_METRICS))


def validate_dataset(folder):
    """Devuelve la lista de errores de una carpeta de dataset (vacía si cumple)."""
    errors = []
    name = os.path.basename(os.path.normpath(folder))
    for required in ("metadata.json", "heightmap.f32", "texture.png"):
        if not os.path.isfile(os.path.join(folder, required)):
            errors.append("falta el archivo obligatorio %s" % required)
    meta_path = os.path.join(folder, "metadata.json")
    meta = _load_json(meta_path, errors) if os.path.isfile(meta_path) else None
    if isinstance(meta, dict):
        shape_ok = _check_metadata(meta, name, errors)
        if shape_ok and os.path.isfile(os.path.join(folder, "heightmap.f32")):
            _check_heightmap(os.path.join(folder, "heightmap.f32"), meta, errors)
        if shape_ok and os.path.isfile(os.path.join(folder, "texture.png")):
            _check_texture(os.path.join(folder, "texture.png"), meta, errors)
    elif meta is not None:
        errors.append("metadata.json debe ser un objeto")
    for optional, check in (("poi.json", _check_poi), ("route.json", _check_route)):
        path = os.path.join(folder, optional)
        if os.path.isfile(path):
            check(path, name, errors)
    for optional in ("config_fisio.json", "config_health.json"):
        path = os.path.join(folder, optional)
        if os.path.isfile(path):
            _load_json(path, errors)        # la sección 3 no define su esquema
    return errors


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    data_dir = argv[0] if argv else DEFAULT_DATA_DIR
    if not os.path.isdir(data_dir):
        print("error: no existe la carpeta %s" % data_dir, file=sys.stderr)
        return 1
    folders = sorted(entry for entry in os.listdir(data_dir)
                     if os.path.isdir(os.path.join(data_dir, entry)))
    if not folders:
        print("error: no hay datasets en %s" % data_dir, file=sys.stderr)
        return 1
    failed = 0
    for name in folders:
        errors = validate_dataset(os.path.join(data_dir, name))
        if errors:
            failed += 1
            print("FALLA %s" % name)
            for error in errors:
                print("  - %s" % error)
        else:
            print("OK    %s" % name)
    print("%d de %d datasets cumplen la sección 3" % (len(folders) - failed, len(folders)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
