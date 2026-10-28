# mitmproxy addon: log MyWhoosh requests to capture.jsonl with secrets masked.
import base64
import json
import os
import re
import time
from pathlib import Path

# outside the repo by default so captures never end up in git
OUT = Path(os.environ.get("MITM_OUT_DIR", Path.home() / ".mitmproxy" / "captures")) / "capture.jsonl"
OUT.parent.mkdir(parents=True, exist_ok=True)
JWT = re.compile(r"eyJ[\w-]+\.([\w-]+)\.[\w-]+")
SECRET_KEYS = re.compile(r"password|token|authorization|secret", re.I)


def jwt_kind(m):
    try:
        pad = m.group(1) + "=" * (-len(m.group(1)) % 4)
        claims = json.loads(base64.urlsafe_b64decode(pad))
        return f"<JWT exp={claims.get('exp')}>"
    except Exception:
        return "<JWT>"


def mask(text):
    if not text:
        return text
    text = JWT.sub(jwt_kind, text)
    return re.sub(r'("(?:\w*[Pp]assword\w*)"\s*:\s*)"[^"]*"', r'\1"<masked>"', text)


def body(msg, limit=4000):
    try:
        t = msg.get_text(strict=False) or ""
    except Exception:
        return f"<{len(msg.raw_content or b'')} bytes>"
    return mask(t)[:limit]


def response(flow):
    req, res = flow.request, flow.response
    headers = {k: (mask(v) if SECRET_KEYS.search(k) else v) for k, v in req.headers.items()
               if k.lower() not in ("cookie",)}
    entry = {
        "t": time.strftime("%H:%M:%S"),
        "method": req.method,
        "url": mask(req.pretty_url),
        "req_headers": headers,
        "req_body": body(req),
        "status": res.status_code if res else None,
        "res_body": body(res, 1500) if res else None,
    }
    with OUT.open("a") as f:
        f.write(json.dumps(entry) + "\n")
