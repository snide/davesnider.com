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


RUNWAYS_CSV = """"id","airport_ref","airport_ident","length_ft","width_ft","surface","lighted","closed","le_ident","le_latitude_deg","le_longitude_deg","le_elevation_ft","le_heading_degT","le_displaced_threshold_ft","he_ident","he_latitude_deg","he_longitude_deg","he_elevation_ft","he_heading_degT","he_displaced_threshold_ft"
244858,20896,"KPWK",5001,150,"ASP",1,0,"16",42.12329865,-87.90709686,643,159,,"34",42.11059952,-87.90039825,645,339,
244856,20896,"KPWK",3677,50,"ASP",1,1,"6",42.1105,-87.906403,647,63,354,"24",42.115002,-87.894302,641,243,
"""


def test_closed_runways_stay_in_the_index(tmp_path: Path):
    """OurAirports closes KPWK 6/24 but MSFS 2024 still draws it; the Duke
    landed on 24 (2026-09-21) and the landing must match that runway."""
    from flight_recorder.enrich import RunwayIndex
    from flight_recorder.landing import match_runway

    (tmp_path / "runways.csv").write_text(RUNWAYS_CSV, encoding="utf-8")
    ends = RunwayIndex(tmp_path).for_airport("KPWK")
    assert sorted(e.ident for e in ends) == ["16", "24", "34", "6"]
    # First touchdown of that flight: 1,820 ft down 24, 3 ft off its centerline
    assert match_runway(ends, 42.11277, -87.90033, 246.0).ident == "24"
