#!/usr/bin/env python3
"""Compara la pendiente M1 de un dataset contra el ráster oficial de pendientes D5.

D5: J03_045994_1986_J03_046060_1986_20m_slope_20m.tif (USGS, sección 2.2 del documento).
Solo usa la librería estándar de Python. La fórmula de M1 se repite aquí porque este
script no puede importar src/models/terrain/slope.js; si cambia una, hay que cambiar la otra.

    python3 data_pipeline/compare_slope_d5.py --dataset jezero_ctx \
        --d5 data_pipeline/raw/D5_slope_20m.tif

Las dos mallas no coinciden celda a celda (20 m contra ~20.2 m), así que D5 se lee en la
celda más cercana al centro de cada celda del dataset.
"""

import argparse
import json
import math
import os
import struct
import sys
from array import array

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import convert_dem  # noqa: E402

GEO_DOUBLE_PARAMS_TAG = 34736


def slope_grid_deg(values, rows, cols, resolution_m):
    """M1: diferencias centradas; hacia un solo lado en los bordes."""
    out = array("f", bytes(rows * cols * 4))
    for row in range(rows):
        north, south = max(row - 1, 0), min(row + 1, rows - 1)
        for col in range(cols):
            west, east = max(col - 1, 0), min(col + 1, cols - 1)
            d_east = 0.0 if east == west else (
                (values[row * cols + east] - values[row * cols + west])
                / ((east - west) * resolution_m))
            d_south = 0.0 if south == north else (
                (values[south * cols + col] - values[north * cols + col])
                / ((south - north) * resolution_m))
            out[row * cols + col] = math.degrees(math.atan(math.hypot(d_east, d_south)))
    return out


def central_meridian_offset_m(tif_path):
    """Desplazamiento en x de una proyección equirectangular centrada en otra longitud.

    D5 está centrado en la longitud 180 y D1 en 0; x_D1 = x_D5 + R * lon_centro.
    Se lee de GeoDoubleParams: [.., lon_centro_deg, .., semieje_mayor_m, ..].
    """
    with open(tif_path, "rb") as handle:
        data = handle.read()
    byte_order = "<" if data[:2] == b"II" else ">"
    tags = convert_dem._read_ifd(data, byte_order)
    params = tags.get(GEO_DOUBLE_PARAMS_TAG)
    if not params or len(params) < 7:
        raise convert_dem.DemError("D5 no trae GeoDoubleParams; no se puede alinear")
    center_lon_deg, radius_m = params[1], params[5]
    return math.radians(center_lon_deg) * radius_m


def load_dataset(folder):
    with open(os.path.join(folder, "metadata.json"), encoding="utf-8") as handle:
        meta = json.load(handle)
    values = array("f")
    with open(os.path.join(folder, "heightmap.f32"), "rb") as handle:
        values.frombytes(handle.read())
    if sys.byteorder != "little":
        values.byteswap()
    return meta, values


def compare(meta, values, d5, d5_shift_m):
    """Devuelve estadísticas de (pendiente M1 - pendiente D5) en grados."""
    rows, cols = meta["shape"]
    res = meta["resolution_m"]
    georef = meta.get("georef") or {}
    if "x_min_m" not in georef:
        raise convert_dem.DemError("el dataset no tiene georef; no se puede ubicar en D5")
    ours = slope_grid_deg(values, rows, cols, res)
    d5_x_min = d5.georef["x_min_m"] + d5_shift_m
    d5_y_max = d5.georef["y_max_m"]

    count = 0
    sum_abs = sum_signed = sum_sq = 0.0
    sum_ours = sum_d5 = 0.0
    within_1 = within_2 = 0
    for row in range(rows):
        y_m = georef["y_max_m"] - (row + 0.5) * res
        d5_row = int(math.floor((d5_y_max - y_m) / d5.resolution_m))
        if d5_row < 0 or d5_row >= d5.rows:
            continue
        for col in range(cols):
            x_m = georef["x_min_m"] + (col + 0.5) * res
            d5_col = int(math.floor((x_m - d5_x_min) / d5.resolution_m))
            if d5_col < 0 or d5_col >= d5.cols:
                continue
            official = d5.values[d5_row * d5.cols + d5_col]
            if d5.is_nodata(official):
                continue
            mine = ours[row * cols + col]
            diff = mine - official
            count += 1
            sum_abs += abs(diff)
            sum_signed += diff
            sum_sq += diff * diff
            sum_ours += mine
            sum_d5 += official
            within_1 += abs(diff) <= 1.0
            within_2 += abs(diff) <= 2.0
    if count == 0:
        raise convert_dem.DemError("la ventana del dataset no se solapa con D5")
    return {
        "cells_compared": count,
        "cells_total": rows * cols,
        "mean_abs_error_deg": sum_abs / count,
        "mean_signed_error_deg": sum_signed / count,
        "rmse_deg": math.sqrt(sum_sq / count),
        "mean_slope_m1_deg": sum_ours / count,
        "mean_slope_d5_deg": sum_d5 / count,
        "fraction_within_1_deg": within_1 / count,
        "fraction_within_2_deg": within_2 / count,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dataset", default="jezero_ctx")
    parser.add_argument("--data-dir", default=convert_dem.DEFAULT_OUT_DIR)
    parser.add_argument("--d5", required=True, help="GeoTIFF de pendientes D5 sin comprimir")
    args = parser.parse_args(argv)
    try:
        meta, values = load_dataset(os.path.join(args.data_dir, args.dataset))
        d5 = convert_dem.read_geotiff(args.d5)
        stats = compare(meta, values, d5, central_meridian_offset_m(args.d5))
    except (convert_dem.DemError, OSError, struct.error) as error:
        print("error: %s" % error, file=sys.stderr)
        return 1
    print("Dataset %s contra D5 (%s)" % (args.dataset, os.path.basename(args.d5)))
    print("  celdas comparadas:        %d de %d" % (stats["cells_compared"], stats["cells_total"]))
    print("  pendiente media M1:       %.3f grados" % stats["mean_slope_m1_deg"])
    print("  pendiente media D5:       %.3f grados" % stats["mean_slope_d5_deg"])
    print("  error medio absoluto:     %.3f grados" % stats["mean_abs_error_deg"])
    print("  error medio con signo:    %.3f grados (M1 - D5)" % stats["mean_signed_error_deg"])
    print("  error cuadrático medio:   %.3f grados" % stats["rmse_deg"])
    print("  celdas a 1 grado o menos: %.1f %%" % (100 * stats["fraction_within_1_deg"]))
    print("  celdas a 2 grados o menos: %.1f %%" % (100 * stats["fraction_within_2_deg"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
