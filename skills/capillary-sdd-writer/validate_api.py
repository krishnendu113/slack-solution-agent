#!/usr/bin/env python3
"""
Capillary API Validator
=======================
Validates a Capillary API endpoint before it is documented in an SDD.
Uses only Python stdlib — no pip installs required.

Auth resolution order (first match wins):
  1. --headers argument (explicit override)
  2. CAPILLARY_BEARER_TOKEN env var  -> Authorization: Bearer
  3. CAPILLARY_API_KEY + CAPILLARY_API_SECRET env vars
     -> POST /v3/oauth/token/generate on CAPILLARY_CLUSTER host
     -> X-cap-api-oauth-token: <jwt>
  4. No auth (proceeds without auth header)

Usage:
  python3 validate_api.py --url URL --method METHOD [--headers JSON]
                          [--params JSON] [--body JSON] [--timeout SECS]

Exit codes: 0 always (errors are reported in JSON output, never as exceptions)
"""

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional


RESPONSE_PREVIEW_MAX = 500

CLUSTER_MAP = {
    "in":    "in.api.capillarytech.com",
    "eu":    "eu.api.capillarytech.com",
    "apac2": "apac2.api.capillarytech.com",
    "apac":  "apac.api.capillarytech.com",
    "us":    "us.api.capillarytech.com",
}


def _cluster_host() -> str:
    """Resolve CAPILLARY_CLUSTER env var to a hostname. Falls back to in.api."""
    alias = os.environ.get("CAPILLARY_CLUSTER", "").strip().lower()
    return CLUSTER_MAP.get(alias, alias or "in.api.capillarytech.com")


_CACHED_TOKEN: Optional[str] = None  # module-level cache


def _generate_token(host: str, key: str, secret: str) -> Optional[str]:
    """POST key+secret to /v3/oauth/token/generate, return JWT string or None."""
    global _CACHED_TOKEN
    if _CACHED_TOKEN:
        return _CACHED_TOKEN
    url = f"https://{host}/v3/oauth/token/generate"
    payload = json.dumps({"key": key, "secret": secret}).encode()
    req = urllib.request.Request(url, data=payload,
                                  headers={"Content-Type": "application/json"},
                                  method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            token = (data.get("auth") or {}).get("token")
            _CACHED_TOKEN = token
            return token
    except Exception:
        return None


def resolve_auth_headers(explicit_headers: dict) -> dict:
    """Build auth headers from env vars if not already in explicit_headers."""
    headers = dict(explicit_headers)

    # If caller already provided an Authorization header, honour it
    if any(k.lower() == "authorization" for k in headers):
        return headers

    bearer = os.environ.get("CAPILLARY_BEARER_TOKEN", "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
        return headers

    api_key = os.environ.get("CAPILLARY_API_KEY", "").strip()
    api_secret = os.environ.get("CAPILLARY_API_SECRET", "").strip()
    if api_key and api_secret:
        host = _cluster_host()
        token = _generate_token(host, api_key, api_secret)
        if token:
            headers["X-cap-api-oauth-token"] = token
        return headers

    return headers  # no auth resolved


def call_api(url: str, method: str, headers: dict, params: dict,
             body: Optional[dict], timeout: int) -> dict:
    """Make the HTTP request and return a result dict."""
    auth_present = any(
        k.lower() in ("authorization", "x-cap-api-oauth-token")
        for k in headers
    )

    # Append query params to URL
    if params:
        url = url + "?" + urllib.parse.urlencode(params)

    body_bytes = None
    if body is not None:
        body_bytes = json.dumps(body).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url, data=body_bytes, headers=headers,
                                  method=method.upper())

    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            raw = resp.read().decode("utf-8", errors="replace")
            preview = raw[:RESPONSE_PREVIEW_MAX] + ("…" if len(raw) > RESPONSE_PREVIEW_MAX else "")
            return {
                "url": url,
                "method": method.upper(),
                "status_code": resp.status,
                "response_time_ms": elapsed_ms,
                "success": True,
                "auth": "provided" if auth_present else "none",
                "response_preview": preview,
                "error": None,
            }
    except urllib.error.HTTPError as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        preview = raw[:RESPONSE_PREVIEW_MAX] + ("…" if len(raw) > RESPONSE_PREVIEW_MAX else "")
        # 401 = endpoint exists (auth just failed) → treat as "path valid"
        path_valid = e.code in (401, 403)
        return {
            "url": url,
            "method": method.upper(),
            "status_code": e.code,
            "response_time_ms": elapsed_ms,
            "success": path_valid,
            "auth": "provided" if auth_present else "none",
            "response_preview": preview,
            "error": f"HTTP {e.code}: {e.reason}",
        }
    except urllib.error.URLError as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "url": url,
            "method": method.upper(),
            "status_code": None,
            "response_time_ms": elapsed_ms,
            "success": False,
            "auth": "provided" if auth_present else "none",
            "response_preview": None,
            "error": f"URLError: {e.reason}",
        }
    except TimeoutError:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "url": url,
            "method": method.upper(),
            "status_code": None,
            "response_time_ms": elapsed_ms,
            "success": False,
            "auth": "provided" if auth_present else "none",
            "response_preview": None,
            "error": f"Request timed out after {timeout}s",
        }
    except Exception as e:  # noqa: BLE001
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "url": url,
            "method": method.upper(),
            "status_code": None,
            "response_time_ms": elapsed_ms,
            "success": False,
            "auth": "provided" if auth_present else "none",
            "response_preview": None,
            "error": str(e),
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a Capillary API endpoint.")
    parser.add_argument("--url", required=True, help="Full endpoint URL")
    parser.add_argument("--method", default="GET", help="HTTP method (default: GET)")
    parser.add_argument("--headers", default="{}", help="JSON object of request headers")
    parser.add_argument("--params", default="{}", help="JSON object of query parameters")
    parser.add_argument("--body", default=None, help="JSON object for request body (POST/PUT)")
    parser.add_argument("--timeout", type=int, default=10, help="Timeout in seconds (default: 10)")
    args = parser.parse_args()

    try:
        explicit_headers = json.loads(args.headers)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid --headers JSON: {e}", "success": False}))
        return

    try:
        params = json.loads(args.params)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid --params JSON: {e}", "success": False}))
        return

    body = None
    if args.body:
        try:
            body = json.loads(args.body)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"Invalid --body JSON: {e}", "success": False}))
            return

    headers = resolve_auth_headers(explicit_headers)
    result = call_api(args.url, args.method, headers, params, body, args.timeout)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
