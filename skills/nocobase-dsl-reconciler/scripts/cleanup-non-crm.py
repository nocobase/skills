#!/usr/bin/env python3
"""Nuke everything from the target NocoBase that isn't the original CRM
source template:

  - collections: nb_starter_*, nb_pm_*
  - workflows whose title does not match the CRM title allowlist
  - top-level routes: "Starter", "Project Management"
  - flowModelTemplates with starter_* / pm_* / project_* / "Starter" / "PM" prefix

Keep: nb_crm_*, nb_cbo_* (CRM depends on them), CRM routes/workflows/templates.

Auth resolution order matches cleanup-copy.py (NB_TOKEN, NB_USER+NB_PASSWORD,
/tmp/nb-token.txt). Base URL: NB_URL env or http://localhost:14000.

This is a one-shot for resetting the demo instance. Not for e2e — e2e only
clears Copy artefacts via cleanup-copy.py.
"""
import json, os, sys
import urllib.request, urllib.error
from urllib.parse import urlencode

BASE = os.environ.get('NB_URL', 'http://localhost:14000').rstrip('/')

# Titles of the 10 CRM workflows that ship with the source template. Anything
# else — starter, pm, ad-hoc — is removed.
CRM_WORKFLOW_TITLES = {
    'CRM Overall Analytics',
    'CRM System Demo Date Shift',
    'Follow-up Reminder',
    'Initiate Customer Merge',
    'Lead Assignment',
    'Lead Conversion',
    'Lead Scoring',
    'Leads Created',
    'New Quotation',
    'Post-Merge Processing',
}

# Top-level route titles that belong to the CRM source. Anything else goes.
CRM_ROUTE_TITLES = {'Main', 'Lookup', 'Other'}

# Collection name prefixes worth keeping. Drop anything matching the kill list.
COLLECTION_KILL_PREFIXES = ('nb_starter_', 'nb_pm_')

# Template name patterns worth killing (name-based; the CRM ships names that
# either start with nb_crm_ or are anonymous pointer UIDs).
TEMPLATE_KILL_PATTERNS = ('nb_starter_', 'nb_pm_', 'nb_project_', 'starter_', 'pm_', 'project_')


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
    t = t or ''
    return t.startswith('Copy - ') or t.startswith('[Copy] ')


print(f'=== Cleaning non-CRM artefacts from {BASE} ===')
print(f'  (keep: CRM collections nb_crm_*/nb_cbo_*, CRM workflows, CRM routes)\n')

# ── Workflows ──
print('--- workflows (keep CRM allowlist, drop everything else) ---')
wfs = req('GET', '/api/workflows:list', params={'paginate': 'false'}) or {}
to_drop = []
for w in wfs.get('data', []):
    title = w.get('title') or ''
    if title in CRM_WORKFLOW_TITLES:
        continue
    if is_copy_title(title):
        # Handled by cleanup-copy.py; skip here so users see a clear separation.
        continue
    to_drop.append(w)
for w in to_drop:
    print(f'  DELETE workflow id={w["id"]} title={w["title"]!r}')
    req('POST', '/api/workflows:destroy', params={'filterByTk': w['id']})
print(f'  ({len(to_drop)} workflow(s))')

# ── Routes ──
print('\n--- routes (top groups not in CRM allowlist; skipping Copy-titled) ---')
routes = req('GET', '/api/desktopRoutes:list', params={'paginate': 'false'}) or {}
top_to_drop = []
for r in routes.get('data', []):
    if r.get('parentId') is not None:
        continue
    title = r.get('title') or ''
    if title in CRM_ROUTE_TITLES:
        continue
    if is_copy_title(title):
        continue
    top_to_drop.append(r)
for r in top_to_drop:
    print(f'  DELETE route id={r["id"]} title={r["title"]!r}')
    req('POST', '/api/desktopRoutes:destroy', params={'filterByTk': r['id']})
print(f'  ({len(top_to_drop)} route(s))')

# ── Collections ──
print('\n--- collections (nb_starter_*, nb_pm_*) ---')
colls = req('GET', '/api/collections:list', params={'paginate': 'false'}) or {}
to_drop_c = [c for c in colls.get('data', []) if (c.get('name') or '').startswith(COLLECTION_KILL_PREFIXES)]
for c in to_drop_c:
    print(f'  DELETE collection name={c["name"]}')
    req('POST', '/api/collections:destroy', params={'filterByTk': c['name']})
print(f'  ({len(to_drop_c)} collection(s))')

# ── FlowModelTemplates ──
print('\n--- flowModelTemplates (starter / pm / project prefix) ---')
tpls = req('GET', '/api/flowModelTemplates:list', params={'pageSize': '500'}) or {}
to_drop_t = []
for t in tpls.get('data', []):
    name = (t.get('name') or '').lower()
    if any(name.startswith(p) for p in TEMPLATE_KILL_PATTERNS):
        to_drop_t.append(t)
for t in to_drop_t:
    print(f'  DELETE template name={t["name"]} uid={t.get("uid")}')
    req('POST', '/api/flowModelTemplates:destroy', params={'filterByTk': t['uid']})
print(f'  ({len(to_drop_t)} template(s))')

print('\nDone.')
