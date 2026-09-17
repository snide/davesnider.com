"""Naming where a flight began or ended: fields, seaplane bases, and the
off-airport fallbacks with their distance caps."""

from pathlib import Path

from flight_recorder.enrich import AirportIndex

CSV = """"id","ident","type","name","latitude_deg","longitude_deg","municipality"
1,"KO69","small_airport","Petaluma Municipal Airport",38.2578,-122.6055,"Petaluma"
2,"LHD","seaplane_base","Lake Hood Seaplane Base",61.18,-149.97,"Anchorage"
3,"PANC","large_airport","Ted Stevens Anchorage International",61.1744,-149.996,"Anchorage"
4,"XX01","heliport","Some Heliport",38.30,-122.60,"Petaluma"
"""


def _index(tmp_path: Path) -> AirportIndex:
    (tmp_path / "airports.csv").write_text(CSV, encoding="utf-8")
    return AirportIndex(tmp_path)


def test_seaplane_bases_are_indexed_but_heliports_are_not(tmp_path: Path):
    idx = _index(tmp_path)
    kinds = {a.icao: a.kind for a in idx._load()}
    assert kinds["LHD"] == "seaplane_base"
    assert "XX01" not in kinds


def test_water_landing_prefers_the_seaplane_base(tmp_path: Path):
    idx = _index(tmp_path)
    # Half a mile from Lake Hood, which is also within 3 nm of PANC
    assert idx.place(61.185, -149.975, water=True) == ("LHD", "Lake Hood Seaplane Base")
    # A lake 20 nm out: no base, no field -> named after the nearest town
    assert idx.place(61.5, -149.9, water=True) == ("WATER", "water near Anchorage")


def test_land_landings_keep_the_nearest_field_within_ten_miles(tmp_path: Path):
    idx = _index(tmp_path)
    assert idx.place(38.26, -122.61, water=False) == ("KO69", "Petaluma Municipal Airport")
    # A strip 15 nm from anything is off-airport, named after the town
    assert idx.place(38.5, -122.6, water=False) == ("OFF", "off-airport near Petaluma")
    # Nothing within 30 nm at all: coordinates instead of a town
    assert idx.place(45.0, -100.0, water=False) == ("OFF", "off-airport near 45.00, -100.00")
