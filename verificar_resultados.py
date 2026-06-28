#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verifica que los resultados de fase de grupos ingresados en Firestore
por el admin coincidan con los resultados oficiales del Mundial 2026.
Fuente oficial: worldcup26.ir (datos abiertos).
"""

import json
import requests
from collections import defaultdict

# Configuración Firebase
FIREBASE_PROJECT = "polla-mundialista-83633"
FIREBASE_API_KEY = "AIzaSyCvDxv2rEaOf0dgVDSkxL-uno5GWn-p1yg"
FIRESTORE_URL = (
    f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/"
    f"databases/(default)/documents/partidos_grupos?key={FIREBASE_API_KEY}"
)

# Fuente de resultados oficiales
OFFICIAL_URL = "https://worldcup26.ir/get/games"

# Mapeo de nombres en inglés -> español (según js/data.js)
MAPEO_EQUIPOS = {
    "South Korea": "Corea del Sur",
    "Korea Republic": "Corea del Sur",
    "Czech Republic": "República Checa",
    "Czechia": "República Checa",
    "Mexico": "México",
    "South Africa": "Sudáfrica",
    "Canada": "Canadá",
    "Bosnia and Herzegovina": "Bosnia y Herzegovina",
    "Bosnia & Herzegovina": "Bosnia y Herzegovina",
    "Qatar": "Catar",
    "Switzerland": "Suiza",
    "Brazil": "Brasil",
    "Morocco": "Marruecos",
    "Haiti": "Haití",
    "Scotland": "Escocia",
    "United States": "Estados Unidos",
    "USA": "Estados Unidos",
    "Paraguay": "Paraguay",
    "Australia": "Australia",
    "Turkey": "Turquía",
    "Türkiye": "Turquía",
    "Germany": "Alemania",
    "Curaçao": "Curazao",
    "Curacao": "Curazao",
    "Ivory Coast": "Costa de Marfil",
    "Cote d'Ivoire": "Costa de Marfil",
    "Ecuador": "Ecuador",
    "Netherlands": "Países Bajos",
    "Japan": "Japón",
    "Sweden": "Suecia",
    "Tunisia": "Túnez",
    "Belgium": "Bélgica",
    "Egypt": "Egipto",
    "Iran": "Irán",
    "New Zealand": "Nueva Zelanda",
    "Spain": "España",
    "Cape Verde": "Cabo Verde",
    "Saudi Arabia": "Arabia Saudí",
    "Uruguay": "Uruguay",
    "France": "Francia",
    "Senegal": "Senegal",
    "Iraq": "Irak",
    "Norway": "Noruega",
    "Argentina": "Argentina",
    "Algeria": "Argelia",
    "Austria": "Austria",
    "Jordan": "Jordania",
    "Portugal": "Portugal",
    "Democratic Republic of the Congo": "RD Congo",
    "DR Congo": "RD Congo",
    "Uzbekistan": "Uzbekistán",
    "Colombia": "Colombia",
    "England": "Inglaterra",
    "Croatia": "Croacia",
    "Ghana": "Ghana",
    "Panama": "Panamá",
}


def normalizar_equipo(nombre):
    nombre = nombre.strip()
    return MAPEO_EQUIPOS.get(nombre, nombre)


def obtener_partidos_firestore():
    print("Descargando resultados ingresados en Firestore...")
    resp = requests.get(FIRESTORE_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    partidos = []
    for doc in data.get("documents", []):
        fields = doc.get("fields", {})

        def get_int(field):
            val = fields.get(field, {}).get("integerValue")
            return int(val) if val is not None else None

        def get_str(field):
            return fields.get(field, {}).get("stringValue", "")

        def get_bool(field):
            return fields.get(field, {}).get("booleanValue", False)

        partido = {
            "id": doc["name"].split("/")[-1],
            "grupo": get_str("grupo"),
            "equipo1": get_str("equipo1"),
            "equipo2": get_str("equipo2"),
            "goles_equipo1": get_int("goles_equipo1"),
            "goles_equipo2": get_int("goles_equipo2"),
            "jugado": get_bool("jugado"),
            "fecha": get_int("fecha"),
        }
        partidos.append(partido)
    return partidos


def obtener_partidos_oficiales():
    print("Descargando resultados oficiales desde worldcup26.ir...")
    resp = requests.get(OFFICIAL_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    partidos = []
    for g in data.get("games", []):
        if g.get("type") != "group":
            continue
        home = normalizar_equipo(g.get("home_team_name_en", ""))
        away = normalizar_equipo(g.get("away_team_name_en", ""))
        partido = {
            "id": g.get("id"),
            "grupo": g.get("group", "").upper(),
            "equipo1": home,
            "equipo2": away,
            "goles_equipo1": int(g.get("home_score", 0)) if g.get("home_score") not in (None, "", "null") else None,
            "goles_equipo2": int(g.get("away_score", 0)) if g.get("away_score") not in (None, "", "null") else None,
            "jugado": str(g.get("finished", "")).upper() == "TRUE",
        }
        partidos.append(partido)
    return partidos


def clave_partido(p):
    """Clave canónica para comparar sin importar orden local/visitante."""
    return tuple(sorted([p["equipo1"], p["equipo2"]]))


def comparar(firestore, oficiales):
    oficiales_by_key = defaultdict(list)
    for p in oficiales:
        oficiales_by_key[clave_partido(p)].append(p)

    coinciden = []
    discrepancias = []
    no_encontrados = []
    solo_en_firestore = []

    for p in firestore:
        if not p["jugado"]:
            continue

        key = clave_partido(p)
        candidatos = oficiales_by_key.get(key, [])

        if not candidatos:
            solo_en_firestore.append(p)
            continue

        # Buscar el oficial con mismo orden de equipos si es posible
        oficial = None
        for c in candidatos:
            if c["equipo1"] == p["equipo1"] and c["equipo2"] == p["equipo2"]:
                oficial = c
                break
        if not oficial:
            oficial = candidatos[0]

        # Verificar si el marcador coincide considerando posible inversión local/visitante
        mismo_orden = (
            oficial["goles_equipo1"] == p["goles_equipo1"]
            and oficial["goles_equipo2"] == p["goles_equipo2"]
        )
        orden_invertido = (
            oficial["equipo1"] == p["equipo2"]
            and oficial["equipo2"] == p["equipo1"]
            and oficial["goles_equipo1"] == p["goles_equipo2"]
            and oficial["goles_equipo2"] == p["goles_equipo1"]
        )

        if mismo_orden or orden_invertido:
            coinciden.append({
                "firestore": p,
                "oficial": oficial,
                "orden_invertido": orden_invertido,
            })
        else:
            discrepancias.append({
                "firestore": p,
                "oficial": oficial,
            })

    # Partidos jugados oficialmente pero no marcados en Firestore
    fs_keys = {clave_partido(p) for p in firestore if p["jugado"]}
    for p in oficiales:
        if p["jugado"] and clave_partido(p) not in fs_keys:
            no_encontrados.append(p)

    return coinciden, discrepancias, no_encontrados, solo_en_firestore


def main():
    firestore = obtener_partidos_firestore()
    oficiales = obtener_partidos_oficiales()

    print(f"  - Firestore: {len(firestore)} partidos de grupos ({sum(1 for p in firestore if p['jugado'])} jugados)")
    print(f"  - Oficiales: {len(oficiales)} partidos de grupos ({sum(1 for p in oficiales if p['jugado'])} jugados)")
    print()

    coinciden, discrepancias, no_encontrados, solo_en_firestore = comparar(firestore, oficiales)

    print("=" * 70)
    print(f"[OK] COINCIDEN: {len(coinciden)} partidos")
    print("=" * 70)
    for item in coinciden:
        p = item["firestore"]
        print(f"  {p['id']} (Grupo {p['grupo']}): {p['equipo1']} {p['goles_equipo1']} - {p['goles_equipo2']} {p['equipo2']}")

    print()
    print("=" * 70)
    print(f"[DIFERENCIA] DISCREPANCIAS: {len(discrepancias)} partidos")
    print("=" * 70)
    for item in discrepancias:
        f = item["firestore"]
        o = item["oficial"]
        print(f"  {f['id']} (Grupo {f['grupo']}):")
        print(f"    Firestore: {f['equipo1']} {f['goles_equipo1']} - {f['goles_equipo2']} {f['equipo2']}")
        print(f"    Oficial:   {o['equipo1']} {o['goles_equipo1']} - {o['goles_equipo2']} {o['equipo2']}")

    print()
    print("=" * 70)
    print(f"[AVISO] JUGADOS OFICIALMENTE PERO NO EN FIRESTORE: {len(no_encontrados)} partidos")
    print("=" * 70)
    for p in no_encontrados:
        print(f"  Grupo {p['grupo']}: {p['equipo1']} {p['goles_equipo1']} - {p['goles_equipo2']} {p['equipo2']}")

    print()
    print("=" * 70)
    print(f"[AVISO] MARCADOS EN FIRESTORE PERO NO ENCONTRADOS OFICIALMENTE: {len(solo_en_firestore)} partidos")
    print("=" * 70)
    for p in solo_en_firestore:
        print(f"  {p['id']} (Grupo {p['grupo']}): {p['equipo1']} {p['goles_equipo1']} - {p['goles_equipo2']} {p['equipo2']}")

    print()
    print("=" * 70)
    print("RESUMEN")
    print("=" * 70)
    print(f"  Total partidos jugados en Firestore: {sum(1 for p in firestore if p['jugado'])}")
    print(f"  Total partidos jugados oficialmente: {sum(1 for p in oficiales if p['jugado'])}")
    print(f"  Coinciden: {len(coinciden)}")
    print(f"  Discrepancias: {len(discrepancias)}")
    print(f"  Faltan en Firestore: {len(no_encontrados)}")
    print(f"  Solo en Firestore (no encontrados oficialmente): {len(solo_en_firestore)}")

    # Guardar reporte JSON
    reporte = {
        "coinciden": coinciden,
        "discrepancias": discrepancias,
        "no_encontrados_en_firestore": no_encontrados,
        "solo_en_firestore": solo_en_firestore,
    }
    with open("reporte_verificacion.json", "w", encoding="utf-8") as f:
        json.dump(reporte, f, ensure_ascii=False, indent=2)
    print()
    print("Reporte detallado guardado en: reporte_verificacion.json")


if __name__ == "__main__":
    main()
