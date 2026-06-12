import pytest

from netwatch_light.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_default_settings(monkeypatch):
    monkeypatch.delenv("NETWATCH_SETUP_TOKEN", raising=False)
    monkeypatch.delenv("NETWATCH_LAN_TRUSTED", raising=False)
    monkeypatch.delenv("NETWATCH_CORS_ORIGINS", raising=False)
    monkeypatch.delenv("NETWATCH_STATE_PATH", raising=False)
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.SETUP_TOKEN == ""
    assert settings.LAN_TRUSTED is False
    assert settings.CORS_ORIGINS == ["http://127.0.0.1:5173", "http://localhost:5173"]
    assert settings.STATE_PATH.as_posix().endswith("data/netwatch_state.json")


def test_cors_origins_from_env(monkeypatch):
    monkeypatch.setenv("NETWATCH_CORS_ORIGINS", "https://a.test, https://b.test")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.CORS_ORIGINS == ["https://a.test", "https://b.test"]


def test_setup_token_from_env(monkeypatch):
    monkeypatch.setenv("NETWATCH_SETUP_TOKEN", "x")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.SETUP_TOKEN == "x"


def test_lan_trusted_requires_explicit_env(monkeypatch):
    monkeypatch.setenv("NETWATCH_LAN_TRUSTED", "1")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.LAN_TRUSTED is True
