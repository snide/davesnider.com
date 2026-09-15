from pathlib import Path

from flight_recorder.cli import latest_dump


def test_latest_dump_skips_inprogress_and_orders_by_departure(tmp_path: Path):
    flights = tmp_path / "flights"
    flights.mkdir()
    for name in ("1789428802.csv", "1789476922.csv", "1789480000-inprogress.csv", "1788876363.csv"):
        (flights / name).write_text("ts\n")
    assert latest_dump(tmp_path).name == "1789476922.csv"
    assert latest_dump(tmp_path, 2).name == "1789428802.csv"
    assert latest_dump(tmp_path, 3).name == "1788876363.csv"
    assert latest_dump(tmp_path, 4) is None
    assert latest_dump(tmp_path / "nowhere") is None
