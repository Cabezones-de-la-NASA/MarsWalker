#!/usr/bin/env python3
"""Escribe public/data/index.json con la lista de zonas disponibles.

La aplicación lee ese índice para ofrecer el selector de zona. Hay que volver a correrlo
cada vez que se añade o se quita una carpeta de public/data.

    python3 data_pipeline/build_index.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import validate  # noqa: E402


def build_index(data_dir=validate.DEFAULT_DATA_DIR):
    datasets = []
    for name in sorted(os.listdir(data_dir)):
        folder = os.path.join(data_dir, name)
        if not os.path.isdir(folder):
            continue
        errors = validate.validate_dataset(folder)
        if errors:
            print("se omite %s: no cumple la sección 3 (%s)" % (name, errors[0]), file=sys.stderr)
            continue
        with open(os.path.join(folder, "metadata.json"), encoding="utf-8") as handle:
            meta = json.load(handle)
        datasets.append({
            "dataset_id": meta["dataset_id"],
            "label": meta["label"],
            "source": meta["source"],
            "resolution_m": meta["resolution_m"],
            "size_m": meta["size_m"],
            "has_poi": os.path.isfile(os.path.join(folder, "poi.json")),
        })
    # De mayor a menor detalle.
    datasets.sort(key=lambda item: item["resolution_m"])
    with open(os.path.join(data_dir, "index.json"), "w", encoding="utf-8") as handle:
        json.dump({"datasets": datasets}, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return datasets


if __name__ == "__main__":
    for item in build_index():
        print("%-18s %s" % (item["dataset_id"], item["label"]))
