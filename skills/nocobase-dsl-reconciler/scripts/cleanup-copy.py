#!/usr/bin/env python3
"""Delete every duplicate-project artefact from a running NocoBase instance:
routes ("Copy - *" / "[Copy] *"), workflows (same prefixes, including nested
"Copy - [Copy] *"), collections (*_copy), and flowModelTemplates (*_copy or
"Copy - " / "[Copy]" in name).

Auth resolution order:
  1. NB_TOKEN env var
  2. NB_USER + NB_PASSWORD env vars → POST /api/users:signin
  3. /tmp/nb-token.txt file

Base URL: NB_URL env or http://localhost:14000.
"""
import json, os, sys
import urllib.request, urllib.error
from urllib.parse import urlencode

BASE = os.environ.get('NB_URL', 'http://localhost:14000').rstrip('/')

def resolve_token():
    if os.environ.get('NB_TOKEN'):
        return os.environ['NB_TOKEN'].strip()
    user = os.environ.get('NB_USER')
    pwd = os.environ.get('NB_PASSWORD')
    if user and pwd:
        body = json.dumps({'account': user, 'password': pwd}).encode()
        req = urllib.request.Request(
            f'{BASE}/api/auth:signIn',
            data=body,
            method='POST',
            headers={'Content-Type': 'application/json', 'X-Authenticator': 'basic'},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        return data['data']['token']
    try:
        return open('/tmp/nb-token.txt').read().strip()
    except FileNotFoundError:
        print('error: no NB token — set NB_TOKEN, or NB_USER+NB_PASSWORD, or write /tmp/nb-token.txt', file=sys.stderr)
        sys.exit(2)

TOKEN = resolve_token()

def req(method, path, body=None, params=None):
    url = f'{BASE}{path}'
    if params:
        url += '?' + urlencode(params)
    headers = {'Authorization': f'Bearer {TOKEN}', 'X-Authenticator': 'basic'}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    r = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors='replace')
        print(f'  ! {method} {path}: HTTP {e.code} {body_text[:200]}', file=sys.stderr)
        return None

def is_copy_title(t: str) -> bool:
    """Match every copy flavour: 'Copy - X', '[Copy] X', 'Copy - [Copy] X'."""
    t = t or ''
    return t.startswith('Copy - ') or t.startswith('[Copy] ')

print(f'=== Cleaning Copy artefacts from {BASE} ===')

print('\n--- routes (top groups "Copy - *" / "[Copy] *") ---')
routes = req('GET', '/api/desktopRoutes:list', params={'paginate': 'false'}) or {}
top = [r for r in routes.get('data', []) if r.get('parentId') is None and is_copy_title(r.get('title'))]
for t in top:
    print(f'  DELETE route id={t["id"]} title={t["title"]!r}')
    req('POST', '/api/desktopRoutes:destroy', params={'filterByTk': t['id']})
print(f'  ({len(top)} route(s))')

print('\n--- workflows "Copy - *" / "[Copy] *" ---')
wfs = req('GET', '/api/workflows:list', params={'paginate': 'false'}) or {}
copy_wfs = [w for w in wfs.get('data', []) if is_copy_title(w.get('title'))]
for w in copy_wfs:
    print(f'  DELETE workflow id={w["id"]} title={w["title"]!r}')
    req('POST', '/api/workflows:destroy', params={'filterByTk': w['id']})
print(f'  ({len(copy_wfs)} workflow(s))')

print('\n--- collections *_copy ---')
colls = req('GET', '/api/collections:list', params={'paginate': 'false'}) or {}
copy_colls = [c for c in colls.get('data', []) if (c.get('name') or '').endswith('_copy')]
for c in copy_colls:
    print(f'  DELETE collection name={c["name"]}')
    req('POST', '/api/collections:destroy', params={'filterByTk': c['name']})
print(f'  ({len(copy_colls)} collection(s))')

print('\n--- flowModelTemplates (*_copy | "Copy - " | "[Copy]") ---')
tpls = req('GET', '/api/flowModelTemplates:list', params={'pageSize': '500'}) or {}
def is_copy_template(n: str) -> bool:
    n = n or ''
    return n.endswith('_copy') or 'Copy - ' in n or '[Copy]' in n
copy_tpls = [t for t in tpls.get('data', []) if is_copy_template(t.get('name'))]
for t in copy_tpls:
    print(f'  DELETE template name={t["name"]} uid={t.get("uid")}')
    req('POST', '/api/flowModelTemplates:destroy', params={'filterByTk': t['uid']})
print(f'  ({len(copy_tpls)} template(s))')

print('\nDone.')
