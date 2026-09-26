import pytest
import json


def test_list_styles(client):
    response = client.get("/styles")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert isinstance(data, list)


def test_generate_missing_melody(client):
    response = client.post("/generate", json={})
    assert response.status_code == 400


def test_generate_with_melody(client):
    response = client.post(
        "/generate",
        json={
            "melody": [
                {"hz": 440.0, "start": 0.0, "duration": 1.0}
            ],
            "style": "classical",
        },
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "midi_path" in data or "result" in data


def test_generate_invalid_style(client):
    response = client.post(
        "/generate",
        json={
            "melody": [
                {"hz": 440.0, "start": 0.0, "duration": 1.0}
            ],
            "style": "nonexistent",
        },
    )
    assert response.status_code == 400
