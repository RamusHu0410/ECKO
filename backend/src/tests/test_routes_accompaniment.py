import json


def test_list_styles(client):
    response = client.get("/accompaniment/styles")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert isinstance(data["styles"], list)
    assert "classical" in data["styles"]


def test_generate_missing_melody(client):
    response = client.post("/accompaniment/generate", json={})
    assert response.status_code == 400


def test_generate_with_melody(client):
    response = client.post(
        "/accompaniment/generate",
        json={
            "melody": [
                {"hz": 60, "start": 0, "duration": 1},
                {"hz": 64, "start": 1, "duration": 1},
            ],
            "style": "classical",
            "format": "json",
        },
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["status"] == "success"
    assert data["style"] == "classical"


def test_generate_invalid_style(client):
    response = client.post(
        "/accompaniment/generate",
        json={
            "melody": [
                {"hz": 440.0, "start": 0.0, "duration": 1.0}
            ],
            "style": "nonexistent",
        },
    )
    assert response.status_code == 400
