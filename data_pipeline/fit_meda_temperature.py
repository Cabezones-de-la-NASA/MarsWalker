#!/usr/bin/env python3
"""Ajusta la media y la amplitud de M17 con un CSV de temperatura de MEDA (D6).

M17: T_amb = media + 95 (a / r - 1) + A cos(2 pi (LTST - 14.2) / 24)

El script ajusta por mínimos cuadrados T = c + A cos(2 pi (LTST - 14.2) / 24) sobre las
filas del CSV, con la fase fija en 14.2 h. c incluye el término orbital del periodo medido;
con --ls se resta ese término y se devuelve la media que M17 espera.

Solo usa la librería estándar de Python. No descarga nada: el CSV lo baja la persona del
nodo de Atmósferas de PDS (ver D6 en docs/modelosydb.md).

    python3 data_pipeline/fit_meda_temperature.py meda.csv \
        --time-column LTST --temp-column AIR_TEMP --kelvin --ls 45

ESTADO: probado solo con CSV sintéticos. No se ha corrido con un producto real de MEDA,
así que los nombres de columna y el formato de hora de los archivos reales hay que
confirmarlos antes de usar el resultado.
"""

import argparse
import csv
import json
import math
import sys

PEAK_LTST_H = 14.2
ORBITAL_COEFFICIENT_C = 95.0
SEMI_MAJOR_AXIS_AU = 1.52368
ECCENTRICITY = 0.0934
PERIHELION_LS_DEG = 251.0


def parse_hours(text):
    """Acepta horas decimales ("14.25") u "HH:MM[:SS]", con un prefijo de sol opcional."""
    text = text.strip()
    if ":" in text:
        clock = text.split()[-1].split("M")[-1]      # "00123M14:05:10" -> "14:05:10"
        parts = [float(p) for p in clock.split(":")]
        while len(parts) < 3:
            parts.append(0.0)
        return parts[0] + parts[1] / 60 + parts[2] / 3600
    return float(text)


def orbital_term_c(ls_deg):
    r = SEMI_MAJOR_AXIS_AU * (1 - ECCENTRICITY ** 2) / (
        1 + ECCENTRICITY * math.cos(math.radians(ls_deg - PERIHELION_LS_DEG)))
    return ORBITAL_COEFFICIENT_C * (SEMI_MAJOR_AXIS_AU / r - 1)


def fit(samples):
    """samples: lista de (ltst_h, temp_c). -> (constante, amplitud, rmse)."""
    n = len(samples)
    if n < 3:
        raise ValueError("hacen falta al menos 3 filas válidas")
    xs = [math.cos(2 * math.pi * (t - PEAK_LTST_H) / 24) for t, _ in samples]
    ys = [temp for _, temp in samples]
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    var_x = sum((x - mean_x) ** 2 for x in xs)
    if var_x < 1e-9:
        raise ValueError("las horas no cubren el ciclo diario; no se puede ajustar la amplitud")
    amplitude = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / var_x
    constant = mean_y - amplitude * mean_x
    rmse = math.sqrt(sum((constant + amplitude * x - y) ** 2 for x, y in zip(xs, ys)) / n)
    return constant, amplitude, rmse


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("csv_path")
    parser.add_argument("--time-column", required=True, help="columna con la hora solar local")
    parser.add_argument("--temp-column", required=True, help="columna con la temperatura")
    parser.add_argument("--kelvin", action="store_true", help="la temperatura viene en kelvin")
    parser.add_argument("--ls", type=float, help="longitud solar media del periodo, en grados")
    args = parser.parse_args(argv)

    samples, skipped = [], 0
    try:
        with open(args.csv_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            columns = [name.strip() for name in (reader.fieldnames or [])]
            for name in (args.time_column, args.temp_column):
                if name not in columns:
                    raise ValueError("no existe la columna '%s'; columnas: %s"
                                     % (name, ", ".join(columns)))
            for row in reader:
                row = {key.strip(): value for key, value in row.items() if key}
                try:
                    hours = parse_hours(row[args.time_column])
                    temp = float(row[args.temp_column])
                    if not (math.isfinite(temp) and 0 <= hours < 24.0001):
                        raise ValueError
                except (ValueError, TypeError, AttributeError):
                    skipped += 1
                    continue
                samples.append((hours, temp - 273.15 if args.kelvin else temp))
        constant, amplitude, rmse = fit(samples)
    except (OSError, ValueError) as error:
        print("error: %s" % error, file=sys.stderr)
        return 1

    result = {
        "rows_used": len(samples),
        "rows_skipped": skipped,
        "amplitude_c": round(amplitude, 2),
        "rmse_c": round(rmse, 2),
    }
    if args.ls is None:
        result["constant_c"] = round(constant, 2)
        result["note"] = "constant_c incluye el término orbital; pasa --ls para obtener mean_c"
    else:
        result["mean_c"] = round(constant - orbital_term_c(args.ls), 2)
        result["ls_deg"] = args.ls
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
