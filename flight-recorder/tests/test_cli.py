from pathlib import Path

from flight_recorder.cli import latest_dumps


def test_latest_dumps_skips_inprogress_and_returns_the_newest_n_oldest_first(tmp_path: Path):
    flights = tmp_path / "flights"
    flights.mkdir()
    for name in ("1789428802.csv", "1789476922.csv", "1789480000-inprogress.csv", "1788876363.csv"):
        (flights / name).write_text("ts\n")
    assert [p.name for p in latest_dumps(tmp_path)] == ["1789476922.csv"]
    assert [p.name for p in latest_dumps(tmp_path, 2)] == ["1789428802.csv", "1789476922.csv"]
    assert [p.name for p in latest_dumps(tmp_path, 9)] == ["1788876363.csv", "1789428802.csv", "1789476922.csv"]
    assert latest_dumps(tmp_path / "nowhere") == []
