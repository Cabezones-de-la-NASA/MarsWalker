#!/usr/bin/env python3
"""Propone posiciones de puntos de interés a partir de la pendiente M1 de un dataset.

Criterios (docs/modelosydb.md, paso 6 del plan de construcción):
  - refugio:  pendiente < 4 grados en el punto y en todo su entorno; el más cercano al
              centro del mapa.
  - peligro:  puntos con pendiente > 25 grados, separados entre sí.
  - muestreo: puntos de pendiente < 8 grados cerca de un escarpe (> 20 grados) de la mitad
              oeste del mapa, separados entre sí.

Las distancias se escalan con el tamaño del mapa, para que sirva igual en una zona de
10 km a 20 m/px que en una de 2 km a 1 m/px. En mapas muy finos los candidatos se toman
cada pocos metros, pero la pendiente de cada uno es siempre la de M1 en esa celda.

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

# Distancias como fracción del lado menor del mapa.
FLAT_RADIUS = 0.004        # entorno llano del refugio (40 m en un mapa de 10 km)
HAZARD_GAP = 0.15          # separación entre peligros
SCARP_NEAR = (0.01, 0.03)  # distancia de un muestreo a su escarpe
SAMPLING_GAP = 0.09        # separación entre muestreos
# Separación mínima entre candidatos, en metros.
CANDIDATE_STEP_M = 5.0


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
    side_cells = min(rows, cols)
    slope = compare_slope_d5.slope_grid_deg(values, rows, cols, res)
    at = lambda r, c: slope[r * cols + c]  # noqa: E731

    step = max(1, int(round(CANDIDATE_STEP_M / res)))
    margin = max(3, int(side_cells * 0.03))
    grid = [(r, c) for r in range(margin, rows - margin, step) for c in range(margin, cols - margin, step)]

    # Refugio: llano con entorno llano, lo más cerca posible del centro.
    flat_cells = max(2, int(round(side_cells * FLAT_RADIUS)))
    offsets = range(-flat_cells, flat_cells + 1, max(1, flat_cells // 2))

    def flat_around(r, c):
        return all(at(r + dr, c + dc) < SHELTER_MAX_DEG for dr in offsets for dc in offsets)
    by_center = sorted(grid, key=lambda p: math.hypot(p[0] - rows / 2, p[1] - cols / 2))
    shelters = []
    for point in by_center:
        if flat_around(*point):
            shelters.append(point)
            break

    # Peligros: los puntos más empinados, separados entre sí.
    steep = sorted((p for p in grid if at(*p) > HAZARD_MIN_DEG), key=lambda p: -at(*p))
    hazards = spaced(steep, 3, side_cells * HAZARD_GAP)

    # Muestreo: junto a un escarpe de la mitad oeste, sobre terreno suave.
    scarp = [p for p in grid if at(*p) > SCARP_MIN_DEG and p[1] < cols / 2]
    lo, hi = side_cells * SCARP_NEAR[0], side_cells * SCARP_NEAR[1]
    reach = int(math.ceil(hi / step)) * step
    near = set()
    for r, c in scarp:
        for dr in range(-reach, reach + 1, step):
            for dc in range(-reach, reach + 1, step):
                if lo <= math.hypot(dr, dc) <= hi:
                    near.add((r + dr, c + dc))
    gentle = sorted((p for p in near
                     if margin <= p[0] < rows - margin and margin <= p[1] < cols - margin
                     and at(*p) < SAMPLING_MAX_DEG),
                    key=lambda p: (round(at(*p), 2), p))
    samplings = spaced(gentle, 4, side_cells * SAMPLING_GAP)

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
