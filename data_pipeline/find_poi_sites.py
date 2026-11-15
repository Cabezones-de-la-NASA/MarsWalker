#!/usr/bin/env python3
"""Propone posiciones de puntos de interés a partir de la pendiente M1 de un dataset.

Criterios (docs/modelosydb.md, paso 6 del plan de construcción):
  - refugio:  pendiente < 4 grados en la celda y en todo su entorno de 5 x 5; el más cercano
              al centro del mapa.
  - peligro:  celdas con pendiente > 25 grados, separadas entre sí.
  - muestreo: celdas de pendiente < 8 grados a entre 100 y 300 m de un escarpe (> 20 grados)
              de la mitad oeste del mapa, separadas entre sí.

Las posiciones salen en metros con los ejes de la escena: [x_m, z_m], +X este, -Z norte.
Solo usa la librería estándar de Python.

    python3 data_pipeline/find_poi_sites.py --dataset jezero_ctx
"""

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import compare_slope_d5  # noqa: E402  (load_dataset y la pendiente M1)
import convert_dem  # noqa: E402

SHELTER_MAX_DEG = 4.0
HAZARD_MIN_DEG = 25.0
SCARP_MIN_DEG = 20.0
SAMPLING_MAX_DEG = 8.0


def spaced(candidates, count, min_gap_cells):
    """Toma candidatos en orden, saltando los que quedan cerca de uno ya elegido."""
    chosen = []
    for row, col in candidates:
        if all(math.hypot(row - r, col - c) >= min_gap_cells for r, c in chosen):
            chosen.append((row, col))
            if len(chosen) == count:
                break
    return chosen


def find_sites(meta, values):
    rows, cols = meta["shape"]
    res = meta["resolution_m"]
    slope = compare_slope_d5.slope_grid_deg(values, rows, cols, res)
    at = lambda r, c: slope[r * cols + c]  # noqa: E731
    inner = [(r, c) for r in range(3, rows - 3) for c in range(3, cols - 3)]

    # Refugio: llano con entorno llano, lo más cerca posible del centro.
    def flat_around(r, c):
        return all(at(r + dr, c + dc) < SHELTER_MAX_DEG
                   for dr in range(-2, 3) for dc in range(-2, 3))
    shelters = sorted((p for p in inner if flat_around(*p)),
                      key=lambda p: math.hypot(p[0] - rows / 2, p[1] - cols / 2))[:1]

    # Peligros: las celdas más empinadas, separadas 1.5 km.
    steep = sorted((p for p in inner if at(*p) > HAZARD_MIN_DEG), key=lambda p: -at(*p))
    hazards = spaced(steep, 3, 1500 / res)

    # Muestreo: al pie o en lo alto de un escarpe de la mitad oeste, sobre terreno suave.
    scarp = [p for p in inner if at(*p) > SCARP_MIN_DEG and p[1] < cols / 2]
    near = set()
    lo, hi = 100 / res, 300 / res
    reach = int(math.ceil(hi))
    for r, c in scarp:
        for dr in range(-reach, reach + 1):
            for dc in range(-reach, reach + 1):
                if lo <= math.hypot(dr, dc) <= hi:
                    near.add((r + dr, c + dc))
    gentle = sorted((p for p in near
                     if 3 <= p[0] < rows - 3 and 3 <= p[1] < cols - 3
                     and at(*p) < SAMPLING_MAX_DEG),
                    key=lambda p: (at(*p), p))
    samplings = spaced(gentle, 4, 900 / res)

    def describe(kind, cells):
        out = []
        for r, c in cells:
            out.append({
                "type": kind,
                "position_m": [round((c + 0.5) * res - cols * res / 2, 1),
                               round((r + 0.5) * res - rows * res / 2, 1)],
                "slope_deg": round(at(r, c), 2),
                "elevation_m": round(values[r * cols + c], 1),
                "cell": [r, c],
            })
        return out

    return (describe("shelter", shelters) + describe("sampling", samplings)
            + describe("hazard", hazards))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dataset", default="jezero_ctx")
    parser.add_argument("--data-dir", default=convert_dem.DEFAULT_OUT_DIR)
    args = parser.parse_args(argv)
    try:
        meta, values = compare_slope_d5.load_dataset(os.path.join(args.data_dir, args.dataset))
    except OSError as error:
        print("error: %s" % error, file=sys.stderr)
        return 1
    sites = find_sites(meta, values)
    print("%-9s %-20s %-11s %-12s %s" % ("tipo", "position_m [x, z]", "pendiente", "elevación", "celda"))
    for site in sites:
        print("%-9s %-20s %6.2f°     %8.1f m   %s" % (
            site["type"], site["position_m"], site["slope_deg"], site["elevation_m"], site["cell"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
