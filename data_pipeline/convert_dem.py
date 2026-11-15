#!/usr/bin/env python3
"""Convierte un DEM al formato de public/data/<dataset_id>/ (docs/modelosydb.md, sección 3).

Solo usa la librería estándar de Python.

Entrada: un GeoTIFF Float32 de una banda y sin comprimir (D1 de la sección 2.2),
o --synthetic para generar un cráter de prueba.

Ejemplos:
    python3 data_pipeline/convert_dem.py --synthetic --dataset-id synthetic_crater
    python3 data_pipeline/convert_dem.py data_pipeline/raw/D1.tif --dataset-id jezero_ctx \
        --crop 604 563 512 512 --source CTX --label "Jezero CTX 20 m/px" \
        --acquisition-date 2020-07

Si el GeoTIFF viene comprimido o en mosaicos internos, conviértelo antes con GDAL:
    gdal_translate -ot Float32 -co COMPRESS=NONE -co TILED=NO entrada.tif salida.tif
"""

import argparse
import datetime
import json
import math
import os
import shutil
import struct
import sys
import zlib
from array import array

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_DIR = os.path.join(REPO_ROOT, "public", "data")

# Valor del ejemplo de metadata.json de la sección 3.
DEFAULT_CRS = "IAU_2015:49900"

# Tamaño de cada tipo de dato TIFF, en bytes, y su código de struct.
_TIFF_TYPES = {
    1: (1, "B"), 2: (1, "c"), 3: (2, "H"), 4: (4, "I"), 5: (8, "II"),
    6: (1, "b"), 8: (2, "h"), 9: (4, "i"), 11: (4, "f"), 12: (8, "d"),
}

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class DemError(Exception):
    """Error de lectura o de formato con un mensaje para la persona."""


class Grid:
    """Malla de elevaciones: filas de norte a sur, valores en metros."""

    def __init__(self, rows, cols, values, resolution_m, nodata=None, georef=None):
        if len(values) != rows * cols:
            raise DemError("la malla no mide filas x columnas")
        self.rows = rows
        self.cols = cols
        self.values = values            # array('f'), fila por fila
        self.resolution_m = resolution_m
        self.nodata = nodata            # valor sin dato, o None
        self.georef = georef            # dict o None

    def is_nodata(self, value):
        if value != value:              # NaN
            return True
        if math.isinf(value):
            return True
        return self.nodata is not None and value == self.nodata


# --------------------------------------------------------------------------- GeoTIFF

def _read_ifd(data, byte_order):
    """Devuelve {etiqueta: tupla de valores} del primer directorio del TIFF."""
    (offset,) = struct.unpack_from(byte_order + "I", data, 4)
    (count,) = struct.unpack_from(byte_order + "H", data, offset)
    tags = {}
    for i in range(count):
        entry = offset + 2 + i * 12
        tag, type_id, n = struct.unpack_from(byte_order + "HHI", data, entry)
        if type_id not in _TIFF_TYPES:
            continue
        size, code = _TIFF_TYPES[type_id]
        total = size * n
        if total <= 4:
            start = entry + 8
        else:
            (start,) = struct.unpack_from(byte_order + "I", data, entry + 8)
        if start + total > len(data):
            raise DemError("TIFF truncado: la etiqueta %d apunta fuera del archivo" % tag)
        if type_id == 2:
            tags[tag] = (data[start:start + total].split(b"\0")[0].decode("ascii", "replace"),)
        elif type_id == 5:
            raw = struct.unpack_from(byte_order + "%dI" % (2 * n), data, start)
            tags[tag] = tuple(raw[k] / raw[k + 1] if raw[k + 1] else 0.0
                              for k in range(0, 2 * n, 2))
        else:
            tags[tag] = struct.unpack_from(byte_order + "%d%s" % (n, code), data, start)
    return tags


def read_geotiff(path):
    """Lee un GeoTIFF Float32 de una banda sin comprimir y devuelve un Grid."""
    with open(path, "rb") as handle:
        data = handle.read()
    if data[:2] == b"II":
        byte_order = "<"
    elif data[:2] == b"MM":
        byte_order = ">"
    else:
        raise DemError("%s no es un TIFF" % path)
    (magic,) = struct.unpack_from(byte_order + "H", data, 2)
    if magic == 43:
        raise DemError("BigTIFF no está soportado; conviértelo con gdal_translate "
                       "-co BIGTIFF=NO -co COMPRESS=NONE")
    if magic != 42:
        raise DemError("%s no es un TIFF" % path)

    tags = _read_ifd(data, byte_order)

    def one(tag, default=None):
        return tags[tag][0] if tag in tags else default

    cols, rows = one(256), one(257)
    compression = one(259, 1)
    if compression != 1:
        raise DemError(
            "el GeoTIFF está comprimido (Compression=%d). Conviértelo con:\n"
            "  gdal_translate -ot Float32 -co COMPRESS=NONE -co TILED=NO entrada.tif salida.tif"
            % compression)
    if one(277, 1) != 1:
        raise DemError("se esperaba una sola banda y el archivo tiene %d" % one(277))
    if one(258) != 32 or one(339, 1) != 3:
        raise DemError(
            "se esperaba Float32 (BitsPerSample=32, SampleFormat=3). Conviértelo con:\n"
            "  gdal_translate -ot Float32 -co COMPRESS=NONE -co TILED=NO entrada.tif salida.tif")

    values = array("f")
    if 273 in tags:                                   # tiras
        for offset, size in zip(tags[273], tags[279]):
            values.frombytes(data[offset:offset + size])
    elif 324 in tags:                                 # mosaicos internos
        tile_w, tile_h = one(322), one(323)
        across = (cols + tile_w - 1) // tile_w
        values = array("f", bytes(rows * cols * 4))
        for index, offset in enumerate(tags[324]):
            tile = array("f")
            tile.frombytes(data[offset:offset + tile_w * tile_h * 4])
            row0, col0 = (index // across) * tile_h, (index % across) * tile_w
            width = min(tile_w, cols - col0)
            for r in range(min(tile_h, rows - row0)):
                dst = (row0 + r) * cols + col0
                values[dst:dst + width] = tile[r * tile_w:r * tile_w + width]
    else:
        raise DemError("el TIFF no tiene tiras ni mosaicos")
    if (byte_order == "<") != (sys.byteorder == "little"):
        values.byteswap()
    if len(values) != rows * cols:
        raise DemError("el TIFF tiene %d valores y se esperaban %d" % (len(values), rows * cols))

    scale = tags.get(33550)
    if not scale:
        raise DemError("el TIFF no trae ModelPixelScale; no se conoce la resolución")
    if abs(scale[0] - scale[1]) > 1e-6 * scale[0]:
        raise DemError("los píxeles no son cuadrados (%g x %g m)" % (scale[0], scale[1]))

    nodata = None
    if 42113 in tags:
        try:
            # Se pasa por float32 para compararlo con los valores leídos.
            nodata = array("f", [float(one(42113))])[0]
        except (ValueError, OverflowError):
            nodata = None

    georef = {"projection": one(34737, "").strip("|") or None}
    tie = tags.get(33922)
    if tie and len(tie) >= 6:
        # Coordenadas proyectadas de la esquina noroeste del píxel (0, 0).
        georef["x_min_m"] = tie[3] - tie[0] * scale[0]
        georef["y_max_m"] = tie[4] + tie[1] * scale[1]
    return Grid(rows, cols, values, float(scale[0]), nodata, georef)


# ----------------------------------------------------------------------- operaciones

def make_synthetic_crater(size=512, resolution_m=20.0):
    """Cráter de prueba determinista: cuenco con borde elevado sobre una rampa suave."""
    radius_m = 0.30 * size * resolution_m     # radio del borde
    depth_m = 400.0                           # fondo bajo el llano
    rim_m = 120.0                             # altura del borde sobre el llano
    half = size * resolution_m / 2.0
    values = array("f", bytes(size * size * 4))
    for row in range(size):
        z_m = (row + 0.5) * resolution_m - half        # +z es sur
        for col in range(size):
            x_m = (col + 0.5) * resolution_m - half    # +x es este
            r = math.hypot(x_m, z_m) / radius_m
            if r < 1.0:
                bowl = -depth_m + (depth_m + rim_m) * r * r
            else:
                bowl = rim_m * math.exp(-(r - 1.0) / 0.25)
            ramp = 0.01 * x_m                           # 1 % de subida hacia el este
            ripple = 4.0 * math.sin(x_m / 180.0) * math.cos(z_m / 230.0)
            values[row * size + col] = bowl + ramp + ripple
    return Grid(size, size, values, resolution_m, None,
                {"projection": "sintético, sin georreferencia"})


def crop(grid, x0, y0, width, height):
    """Recorta en píxeles; (x0, y0) es la esquina noroeste de la ventana."""
    if width <= 0 or height <= 0:
        raise DemError("--crop: ancho y alto deben ser positivos")
    if x0 < 0 or y0 < 0 or x0 + width > grid.cols or y0 + height > grid.rows:
        raise DemError("--crop %d %d %d %d se sale del DEM de %d columnas x %d filas"
                       % (x0, y0, width, height, grid.cols, grid.rows))
    values = array("f")
    for row in range(y0, y0 + height):
        start = row * grid.cols + x0
        values.extend(grid.values[start:start + width])
    georef = dict(grid.georef) if grid.georef else None
    if georef and "x_min_m" in georef:
        georef["x_min_m"] += x0 * grid.resolution_m
        georef["y_max_m"] -= y0 * grid.resolution_m
    return Grid(height, width, values, grid.resolution_m, grid.nodata, georef)


def downsample(grid, n):
    """Promedia bloques de n x n; las celdas sin dato no entran al promedio."""
    if n < 1:
        raise DemError("--downsample debe ser 1 o mayor")
    if n == 1:
        return grid
    rows, cols = grid.rows // n, grid.cols // n
    if rows == 0 or cols == 0:
        raise DemError("--downsample %d es mayor que el DEM" % n)
    empty = grid.nodata if grid.nodata is not None else float("nan")
    values = array("f", bytes(rows * cols * 4))
    for row in range(rows):
        for col in range(cols):
            total, count = 0.0, 0
            for dr in range(n):
                base = (row * n + dr) * grid.cols + col * n
                for value in grid.values[base:base + n]:
                    if not grid.is_nodata(value):
                        total += value
                        count += 1
            values[row * cols + col] = total / count if count else empty
    return Grid(rows, cols, values, grid.resolution_m * n, grid.nodata, grid.georef)


def fill_nodata(grid):
    """Sustituye los valores sin dato por el mínimo válido. Devuelve (grid, cuántos)."""
    valid = [v for v in grid.values if not grid.is_nodata(v)]
    if not valid:
        raise DemError("el DEM no tiene ningún valor válido")
    lowest = min(valid)
    filled = 0
    values = array("f", grid.values)
    for i, value in enumerate(values):
        if grid.is_nodata(value):
            values[i] = lowest
            filled += 1
    return Grid(grid.rows, grid.cols, values, grid.resolution_m, None, grid.georef), filled


def hillshade(grid, azimuth_deg=315.0, altitude_deg=45.0):
    """Sombreado en gris (0-255) con luz desde el noroeste. Devuelve bytes, fila por fila."""
    rows, cols, z, res = grid.rows, grid.cols, grid.values, grid.resolution_m
    azimuth = math.radians(azimuth_deg)
    altitude = math.radians(altitude_deg)
    # Vector hacia la luz en ejes (este, norte, arriba).
    light = (math.sin(azimuth) * math.cos(altitude),
             math.cos(azimuth) * math.cos(altitude),
             math.sin(altitude))
    out = bytearray(rows * cols)
    for row in range(rows):
        up, down = max(row - 1, 0), min(row + 1, rows - 1)
        for col in range(cols):
            left, right = max(col - 1, 0), min(col + 1, cols - 1)
            dz_east = (z[row * cols + right] - z[row * cols + left]) / ((right - left) * res or res)
            # La fila crece hacia el sur, así que norte = fila anterior.
            dz_north = (z[up * cols + col] - z[down * cols + col]) / ((down - up) * res or res)
            norm = math.sqrt(dz_east * dz_east + dz_north * dz_north + 1.0)
            shade = (-dz_east * light[0] - dz_north * light[1] + light[2]) / norm
            out[row * cols + col] = max(0, min(255, int(round(255 * max(shade, 0.0)))))
    return bytes(out)


# ------------------------------------------------------------------------------ PNG

def _png_chunk(kind, payload):
    return (struct.pack(">I", len(payload)) + kind + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))


def write_png(path, width, height, gray_bytes):
    """Escribe un PNG de 8 bits en escala de grises."""
    if len(gray_bytes) != width * height:
        raise DemError("la imagen no mide ancho x alto")
    raw = bytearray()
    for row in range(height):
        raw.append(0)                                   # filtro "ninguno"
        raw.extend(gray_bytes[row * width:(row + 1) * width])
    with open(path, "wb") as handle:
        handle.write(PNG_SIGNATURE)
        handle.write(_png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)))
        handle.write(_png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        handle.write(_png_chunk(b"IEND", b""))


def read_png_size(path):
    """Devuelve (ancho, alto) de un PNG leyendo solo su cabecera."""
    with open(path, "rb") as handle:
        head = handle.read(24)
    if len(head) < 24 or head[:8] != PNG_SIGNATURE or head[12:16] != b"IHDR":
        raise DemError("%s no es un PNG" % path)
    return struct.unpack(">II", head[16:24])


# --------------------------------------------------------------------------- salida

def write_dataset(grid, out_dir, dataset_id, label, source, acquisition_date,
                  uncertainty_note, crs=DEFAULT_CRS, texture_path=None):
    """Escribe heightmap.f32, texture.png y metadata.json. Devuelve el metadata."""
    folder = os.path.join(out_dir, dataset_id)
    os.makedirs(folder, exist_ok=True)

    values = array("f", grid.values)
    if sys.byteorder != "little":
        values.byteswap()
    with open(os.path.join(folder, "heightmap.f32"), "wb") as handle:
        handle.write(values.tobytes())

    texture_out = os.path.join(folder, "texture.png")
    if texture_path:
        width, height = read_png_size(texture_path)
        if abs(width * grid.rows - height * grid.cols) > max(width, height):
            raise DemError(
                "--texture mide %d x %d y no tiene la proporción del DEM (%d x %d); "
                "debe tener el mismo encuadre" % (width, height, grid.cols, grid.rows))
        shutil.copyfile(texture_path, texture_out)
    else:
        write_png(texture_out, grid.cols, grid.rows, hillshade(grid))

    metadata = {
        "dataset_id": dataset_id,
        "label": label,
        "source": source,
        "crs": crs,
        "size_m": [grid.cols * grid.resolution_m, grid.rows * grid.resolution_m],
        "resolution_m": grid.resolution_m,
        "shape": [grid.rows, grid.cols],
        "elevation_range_m": [min(grid.values), max(grid.values)],
        "heightmap": {"file": "heightmap.f32", "format": "float32-le", "units": "m"},
        "layers": [{"id": "base", "file": "texture.png", "type": "base"}],
        "acquisition_date": acquisition_date,
        "uncertainty_note": uncertainty_note,
    }
    if grid.georef:
        # Campo extra (no está en la sección 3): ubica la ventana en el producto original.
        metadata["georef"] = grid.georef
    with open(os.path.join(folder, "metadata.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return metadata


def build_parser():
    parser = argparse.ArgumentParser(
        description="Convierte un DEM al formato de public/data/<dataset_id>/.")
    parser.add_argument("input", nargs="?", help="GeoTIFF Float32 de una banda sin comprimir")
    parser.add_argument("--synthetic", action="store_true",
                        help="genera un cráter de prueba de 512x512 en vez de leer un GeoTIFF")
    parser.add_argument("--dataset-id", required=True, help="nombre de la carpeta de salida")
    parser.add_argument("--crop", nargs=4, type=int, metavar=("X0", "Y0", "ANCHO", "ALTO"),
                        help="ventana en píxeles desde la esquina noroeste")
    parser.add_argument("--downsample", type=int, default=1, metavar="N",
                        help="promedia bloques de N x N (se aplica después de --crop)")
    parser.add_argument("--texture", metavar="RUTA.png",
                        help="textura base con el mismo encuadre; si falta, sombreado en gris")
    parser.add_argument("--label", help="nombre legible del dataset")
    parser.add_argument("--source", help="instrumento o producto (por ejemplo CTX)")
    parser.add_argument("--product", help="nombre del producto para uncertainty_note")
    parser.add_argument("--acquisition-date", metavar="AAAA-MM")
    parser.add_argument("--crs", default=DEFAULT_CRS)
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        if args.synthetic == bool(args.input):
            raise DemError("indica un GeoTIFF de entrada o --synthetic (uno de los dos)")
        if args.synthetic:
            grid = make_synthetic_crater()
            source = args.source or "synthetic"
            product = args.product or "cráter sintético generado por convert_dem.py"
            date = args.acquisition_date or datetime.date.today().strftime("%Y-%m")
        else:
            grid = read_geotiff(args.input)
            source = args.source or "desconocido"
            product = args.product or os.path.basename(args.input)
            if not args.acquisition_date:
                raise DemError("falta --acquisition-date AAAA-MM (no se inventa)")
            date = args.acquisition_date
        native_m = grid.resolution_m
        steps = []
        if args.crop:
            grid = crop(grid, *args.crop)
            steps.append("recorte x0=%d y0=%d ancho=%d alto=%d px" % tuple(args.crop))
        if args.downsample != 1:
            grid = downsample(grid, args.downsample)
            steps.append("promedio de bloques %dx%d" % (args.downsample, args.downsample))
        grid, filled = fill_nodata(grid)
        steps.append("%d celdas sin dato sustituidas por el mínimo válido" % filled)

        label = args.label or "%s %g m/px" % (args.dataset_id, grid.resolution_m)
        note = "Producto: %s. Resolución original %g m/px, final %g m/px. Procesado: %s." % (
            product, native_m, grid.resolution_m, "; ".join(steps))
        if grid.georef and grid.georef.get("projection"):
            note += " Proyección del original: %s." % grid.georef["projection"]
        metadata = write_dataset(grid, args.out_dir, args.dataset_id, label, source, date,
                                 note, args.crs, args.texture)
    except (DemError, OSError) as error:
        print("error: %s" % error, file=sys.stderr)
        return 1
    print("%s: %d filas x %d columnas, %g m/px, elevación de %.1f a %.1f m" % (
        args.dataset_id, metadata["shape"][0], metadata["shape"][1],
        metadata["resolution_m"], *metadata["elevation_range_m"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
