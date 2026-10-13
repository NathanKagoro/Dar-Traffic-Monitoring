"""
Unit tests for the pure part of the collector: turning a TomTom Flow Segment
Data response into a snapshot row, including the congestion-ratio calculation.

No network and no credentials. The fixtures below are written by hand in the
shape TomTom documents for flowSegmentData and the error body recorded in
docs/provider-coverage.md. The speeds in them are made up for the tests; they
are not readings from any road.
"""
from datetime import datetime

import pytest

from utils.api_helpers import parse_traffic_response

SNAPSHOT_FIELDS = {
    "timestamp",
    "point_name",
    "latitude",
    "longitude",
    "current_speed",
    "free_flow_speed",
    "congestion_ratio",
    "road_closure",
    "confidence",
}


def flow_response(**overrides):
    """A response in the shape of TomTom's flowSegmentData, with test values."""
    segment = {
        "frc": "FRC2",
        "currentSpeed": 30,
        "freeFlowSpeed": 60,
        "currentTravelTime": 120,
        "freeFlowTravelTime": 60,
        "confidence": 0.9,
        "roadClosure": False,
        "coordinates": {
            "coordinate": [
                {"latitude": -6.8160, "longitude": 39.2800},
                {"latitude": -6.8165, "longitude": 39.2806},
            ]
        },
        "@version": "traffic-service-flow 1.0",
    }
    segment.update(overrides)
    return {"flowSegmentData": segment}


def parse(response):
    return parse_traffic_response(response, "Morogoro Road - Test", -6.8160, 39.2800)


def test_snapshot_has_exactly_the_stored_columns():
    snapshot = parse(flow_response())
    assert set(snapshot) == SNAPSHOT_FIELDS


def test_point_identity_is_copied_from_the_arguments_not_the_response():
    snapshot = parse(flow_response())
    assert snapshot["point_name"] == "Morogoro Road - Test"
    assert snapshot["latitude"] == -6.8160
    assert snapshot["longitude"] == 39.2800


def test_speeds_and_confidence_pass_through_unchanged():
    snapshot = parse(flow_response(currentSpeed=42, freeFlowSpeed=55, confidence=0.75))
    assert snapshot["current_speed"] == 42
    assert snapshot["free_flow_speed"] == 55
    assert snapshot["confidence"] == 0.75


def test_timestamp_is_timezone_aware_utc_iso8601():
    stamp = datetime.fromisoformat(parse(flow_response())["timestamp"])
    assert stamp.tzinfo is not None
    assert stamp.utcoffset().total_seconds() == 0


@pytest.mark.parametrize(
    "current, free_flow, expected",
    [
        (60, 60, 0.0),    # moving at free-flow speed: no congestion
        (30, 60, 0.5),    # half of free-flow speed
        (15, 60, 0.75),
        (6, 60, 0.9),
    ],
)
def test_congestion_ratio_is_one_minus_current_over_free_flow(current, free_flow, expected):
    snapshot = parse(flow_response(currentSpeed=current, freeFlowSpeed=free_flow))
    assert snapshot["congestion_ratio"] == pytest.approx(expected)


def test_congestion_ratio_is_clamped_at_zero_when_faster_than_free_flow():
    snapshot = parse(flow_response(currentSpeed=72, freeFlowSpeed=60))
    assert snapshot["congestion_ratio"] == 0


@pytest.mark.parametrize("current", [1, 12, 37, 59, 60, 61, 140])
def test_congestion_ratio_always_lies_between_zero_and_one(current):
    ratio = parse(flow_response(currentSpeed=current, freeFlowSpeed=60))["congestion_ratio"]
    assert 0 <= ratio <= 1


def test_congestion_ratio_is_none_when_free_flow_speed_is_missing():
    response = flow_response()
    del response["flowSegmentData"]["freeFlowSpeed"]
    snapshot = parse(response)
    assert snapshot["congestion_ratio"] is None
    assert snapshot["free_flow_speed"] is None
    assert snapshot["current_speed"] == 30


def test_congestion_ratio_is_none_when_free_flow_speed_is_zero():
    # Guards the division: a zero free-flow speed must not raise.
    assert parse(flow_response(freeFlowSpeed=0))["congestion_ratio"] is None


def test_zero_current_speed_gives_no_ratio():
    # Current behaviour, pinned so a change is deliberate: the parser treats a
    # current speed of 0 the same as a missing one, so a standstill is stored
    # with a null ratio rather than 1.0.
    snapshot = parse(flow_response(currentSpeed=0))
    assert snapshot["current_speed"] == 0
    assert snapshot["congestion_ratio"] is None


def test_road_closure_is_stored_as_an_integer_flag():
    assert parse(flow_response(roadClosure=True))["road_closure"] == 1
    assert parse(flow_response(roadClosure=False))["road_closure"] == 0


def test_road_closure_defaults_to_open_when_absent():
    response = flow_response()
    del response["flowSegmentData"]["roadClosure"]
    assert parse(response)["road_closure"] == 0


def test_no_coverage_error_body_yields_no_snapshot():
    # The body TomTom returned for every Dar es Salaam point, as recorded in
    # docs/provider-coverage.md.
    error_body = {
        "error": "Point too far from nearest existing segment.",
        "httpStatusCode": 400,
        "detailedError": {
            "code": "INVALID_REQUEST",
            "message": "Point too far from nearest existing segment.",
        },
    }
    assert parse(error_body) is None


@pytest.mark.parametrize("response", [{}, {"flowSegmentData": {}}, {"flowSegmentData": None}])
def test_empty_or_missing_segment_yields_no_snapshot(response):
    assert parse(response) is None


def test_segment_of_the_wrong_type_yields_no_snapshot_instead_of_raising():
    assert parse({"flowSegmentData": ["not", "a", "dict"]}) is None
