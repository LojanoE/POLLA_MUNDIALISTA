#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Descarga partidos_grupos y partidos_final de Firestore y los guarda en JSON."""

import json
import requests
import time

PROJECT = "polla-mundialista-83633"
API_KEY = "AIzaSyCvDxv2rEaOf0dgVDSkxL-uno5GWn-p1yg"


def descargar_coleccion(nombre):
    url = (
        f"https://firestore.googleapis.com/v1/projects/{PROJECT}/"
        f"databases/(default)/documents/{nombre}?key={API_KEY}"
    )
    print(f"Descargando {nombre}...")
    for intento in range(5):
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.HTTPError as e:
            if resp.status_code == 429:
                print(f"  intento {intento+1}: 429, esperando {(intento+1)*10}s...")
                time.sleep((intento + 1) * 10)
            else:
                raise
    raise Exception("No se pudo descargar después de varios intentos")


def parse_documentos(data):
    docs = []
    for doc in data.get("documents", []):
        fields = doc.get("fields", {})
        item = {"id": doc["name"].split("/")[-1]}

        def get_int(f):
            v = fields.get(f, {}).get("integerValue")
            return int(v) if v is not None else None

        def get_str(f):
            return fields.get(f, {}).get("stringValue", "")

        def get_bool(f):
            return fields.get(f, {}).get("booleanValue", False)

        for f in fields:
            val = fields[f]
            if "integerValue" in val:
                item[f] = get_int(f)
            elif "stringValue" in val:
                item[f] = get_str(f)
            elif "booleanValue" in val:
                item[f] = get_bool(f)
        docs.append(item)
    return docs


if __name__ == "__main__":
    grupos_raw = descargar_coleccion("partidos_grupos")
    final_raw = descargar_coleccion("partidos_final")

    grupos = parse_documentos(grupos_raw)
    final = parse_documentos(final_raw)

    with open("firestore_grupos.json", "w", encoding="utf-8") as f:
        json.dump(grupos, f, ensure_ascii=False, indent=2)

    with open("firestore_final.json", "w", encoding="utf-8") as f:
        json.dump(final, f, ensure_ascii=False, indent=2)

    print(f"Guardados {len(grupos)} partidos de grupos y {len(final)} partidos de final.")
