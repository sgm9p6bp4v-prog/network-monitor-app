from netwatch_light.snmp_live import (
    _int,
    _is_usable_endpoint_mac,
    _lldp_mgmt_ip_from_index,
    _mac_from_suffix,
    _normalize_mac,
    _suffix,
    _vendor_from_mac,
)


def test_normalize_mac_formats_and_invalid_input():
    assert _normalize_mac("AA:BB:CC:DD:EE:FF") == "aa:bb:cc:dd:ee:ff"
    assert _normalize_mac("aabb.ccdd.eeff") == "aa:bb:cc:dd:ee:ff"
    assert _normalize_mac("AABBCCDDEEFF") == "aa:bb:cc:dd:ee:ff"
    assert _normalize_mac("not-a-mac") == ""


def test_mac_from_suffix():
    assert _mac_from_suffix("9.8.1.2.3.4.5.6") == "01:02:03:04:05:06"
    assert _mac_from_suffix("1.2.3.4.5") == ""


def test_is_usable_endpoint_mac():
    assert _is_usable_endpoint_mac("00:00:00:00:00:00") is False
    assert _is_usable_endpoint_mac("ff:ff:ff:ff:ff:ff") is False
    assert _is_usable_endpoint_mac("01:00:5e:00:00:01") is False
    assert _is_usable_endpoint_mac("02:00:00:00:00:01") is True


def test_suffix_matching():
    base = "1.3.6.1.2.1.2.2.1.2"

    assert _suffix("1.3.6.1.2.1.2.2.1.2.7", base) == "7"
    assert _suffix("1.3.6.1.2.1.2.2.1.3.7", base) is None
    assert _suffix(base, base) == ""


def test_lldp_mgmt_ip_from_index():
    assert _lldp_mgmt_ip_from_index("7.2.9.1.4.192.168.1.20") == "192.168.1.20"
    assert _lldp_mgmt_ip_from_index("7.2.9.1.4.192.168.1") == ""


def test_vendor_from_mac():
    assert _vendor_from_mac("64:9d:99:00:00:01") == "FS"
    assert _vendor_from_mac("12:34:56:78:9a:bc") == "unknown"


def test_int_helper():
    assert _int("5") == 5
    assert _int("x", 9) == 9
