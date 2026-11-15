"""Pruebas de convert_dem.py y validate.py.

    python3 -m unittest discover data_pipeline
"""

import json
import os
import struct
import sys
import tempfile
import unittest
from array import array

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import convert_dem  # noqa: E402
import validate  # noqa: E402

NODATA = -3.4028226550889045e38


def write_tiff(path, rows, cols, values, byte_order="<", compression=1, nodata=True):
    """Escribe un GeoTIFF Float32 mínimo de una tira, como los de USGS."""
    bo = byte_order
    pixels = struct.pack(bo + "%df" % len(values), *values)
    nodata_text = b"-3.40282265508890445e+38\0"
    entries = [
        (256, 3, 1, cols), (257, 3, 1, rows), (258, 3, 1, 32), (259, 3, 1, compression),
        (273, 4, 1, None), (277, 3, 1, 1), (278, 3, 1, rows), (279, 4, 1, len(pixels)),
        (339, 3, 1, 3), (33550, 12, 3, None), (33922, 12, 6, None),
    ]
    if nodata:
        entries.append((42113, 2, len(nodata_text), None))
    ifd_size = 2 + 12 * len(entries) + 4
    scale_at = 8 + ifd_size
    tie_at = scale_at + 24
    nodata_at = tie_at + 48
    pixels_at = nodata_at + len(nodata_text)
    offsets = {273: pixels_at, 33550: scale_at, 33922: tie_at, 42113: nodata_at}
    out = bytearray((b"II" if bo == "<" else b"MM") + struct.pack(bo + "HI", 42, 8))
    out += struct.pack(bo + "H", len(entries))
    for tag, type_id, count, value in entries:
        out += struct.pack(bo + "HHI", tag, type_id, count)
        if value is None:
            out += struct.pack(bo + "I", offsets[tag])
        elif type_id == 3:
            out += struct.pack(bo + "HH", value, 0)
        else:
            out += struct.pack(bo + "I", value)
    out += struct.pack(bo + "I", 0)
    out += struct.pack(bo + "3d", 20.0, 20.0, 0.0)
    out += struct.pack(bo + "6d", 0.0, 0.0, 0.0, 1000.0, 5000.0, 0.0)
    out += nodata_text
    out += pixels
    with open(path, "wb") as handle:
        handle.write(out)


class GeoTiffTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "dem.tif")
        self.values = [float(v) for v in range(12)]

    def test_reads_both_byte_orders(self):
        for byte_order in ("<", ">"):
            write_tiff(self.path, 3, 4, self.values, byte_order)
            grid = convert_dem.read_geotiff(self.path)
            self.assertEqual((grid.rows, grid.cols, grid.resolution_m), (3, 4, 20.0))
            self.assertEqual(list(grid.values), self.values)
            self.assertEqual(grid.georef["x_min_m"], 1000.0)
            self.assertEqual(grid.georef["y_max_m"], 5000.0)

    def test_compressed_is_rejected_with_gdal_hint(self):
        write_tiff(self.path, 3, 4, self.values, compression=5)
        with self.assertRaises(convert_dem.DemError) as caught:
            convert_dem.read_geotiff(self.path)
        self.assertIn("gdal_translate", str(caught.exception))

    def test_nodata_is_replaced_by_lowest_valid(self):
        values = [5.0, NODATA, 7.0, 3.0, 9.0, NODATA]
        write_tiff(self.path, 2, 3, values)
        grid, filled = convert_dem.fill_nodata(convert_dem.read_geotiff(self.path))
        self.assertEqual(filled, 2)
        self.assertEqual(list(grid.values), [5.0, 3.0, 7.0, 3.0, 9.0, 3.0])


class OperationsTest(unittest.TestCase):
    def grid(self, rows, cols, values):
        return convert_dem.Grid(rows, cols, array("f", values), 20.0, NODATA,
                                {"x_min_m": 0.0, "y_max_m": 0.0})

    def test_crop_takes_window_from_northwest_corner(self):
        grid = self.grid(3, 4, range(12))
        window = convert_dem.crop(grid, 1, 1, 2, 2)
        self.assertEqual(list(window.values), [5.0, 6.0, 9.0, 10.0])
        self.assertEqual(window.georef, {"x_min_m": 20.0, "y_max_m": -20.0})
        with self.assertRaises(convert_dem.DemError):
            convert_dem.crop(grid, 3, 0, 2, 2)

    def test_downsample_averages_blocks_and_skips_nodata(self):
        grid = self.grid(2, 4, [1, 3, 10, NODATA, 5, 7, 20, 30])
        small = convert_dem.downsample(grid, 2)
        self.assertEqual((small.rows, small.cols, small.resolution_m), (1, 2, 40.0))
        self.assertEqual(list(small.values), [4.0, 20.0])

    def test_hillshade_of_flat_ground_is_uniform(self):
        shade = convert_dem.hillshade(self.grid(4, 4, [100.0] * 16))
        self.assertEqual(len(set(shade)), 1)

    def test_synthetic_crater_is_deterministic_with_rim_above_floor(self):
        first = convert_dem.make_synthetic_crater(64)
        second = convert_dem.make_synthetic_crater(64)
        self.assertEqual(first.values, second.values)
        center = first.values[32 * 64 + 32]
        self.assertLess(center, -300.0)
        self.assertGreater(max(first.values), 80.0)


class DatasetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def convert(self, *extra):
        return convert_dem.main(["--out-dir", self.tmp.name, *extra])

    def test_synthetic_dataset_validates(self):
        self.assertEqual(self.convert("--synthetic", "--dataset-id", "synth"), 0)
        folder = os.path.join(self.tmp.name, "synth")
        self.assertEqual(os.path.getsize(os.path.join(folder, "heightmap.f32")), 512 * 512 * 4)
        self.assertEqual(validate._png_size(os.path.join(folder, "texture.png")), (512, 512))
        self.assertEqual(validate.validate_dataset(folder), [])
        self.assertEqual(validate.main([self.tmp.name]), 0)

    def test_geotiff_with_crop_and_downsample_validates(self):
        tif = os.path.join(self.tmp.name, "in.tif")
        values = [float(r * 8 + c) for r in range(8) for c in range(8)]
        values[0] = NODATA
        write_tiff(tif, 8, 8, values)
        code = self.convert(tif, "--dataset-id", "win", "--crop", "0", "0", "8", "4",
                            "--downsample", "2", "--acquisition-date", "2020-07",
                            "--source", "CTX")
        self.assertEqual(code, 0)
        folder = os.path.join(self.tmp.name, "win")
        with open(os.path.join(folder, "metadata.json"), encoding="utf-8") as handle:
            meta = json.load(handle)
        self.assertEqual(meta["shape"], [2, 4])
        self.assertEqual(meta["size_m"], [160.0, 80.0])
        self.assertEqual(meta["resolution_m"], 40.0)
        self.assertIn("40 m/px", meta["uncertainty_note"])
        self.assertEqual(validate.validate_dataset(folder), [])

    def test_geotiff_needs_acquisition_date(self):
        tif = os.path.join(self.tmp.name, "in.tif")
        write_tiff(tif, 2, 2, [1.0, 2.0, 3.0, 4.0])
        self.assertEqual(self.convert(tif, "--dataset-id", "nodate"), 1)

    def test_validator_catches_wrong_heightmap_size_and_metadata(self):
        self.convert("--synthetic", "--dataset-id", "bad")
        folder = os.path.join(self.tmp.name, "bad")
        with open(os.path.join(folder, "heightmap.f32"), "ab") as handle:
            handle.write(b"\0\0\0\0")
        errors = validate.validate_dataset(folder)
        self.assertTrue(any("filas x columnas x 4" in e for e in errors))
        os.remove(os.path.join(folder, "texture.png"))
        meta_path = os.path.join(folder, "metadata.json")
        with open(meta_path, encoding="utf-8") as handle:
            meta = json.load(handle)
        del meta["crs"]
        meta["acquisition_date"] = "julio 2020"
        with open(meta_path, "w", encoding="utf-8") as handle:
            json.dump(meta, handle)
        errors = validate.validate_dataset(folder)
        self.assertTrue(any("texture.png" in e for e in errors))
        self.assertTrue(any("'crs'" in e for e in errors))
        self.assertTrue(any("AAAA-MM" in e for e in errors))
        self.assertEqual(validate.main([self.tmp.name]), 1)


if __name__ == "__main__":
    unittest.main()
