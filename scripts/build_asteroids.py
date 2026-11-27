#!/usr/bin/env python3
"""Build the asteroid catalogue from JPL SBDB Query."""

import base64
from collections import Counter
from hashlib import sha256
import json
import math
from pathlib import Path
import struct
import sys
from tempfile import NamedTemporaryFile
from urllib.parse import urlencode
from urllib.request import urlopen


API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api'
FIELDS = ['pdes', 'a', 'e', 'i', 'om', 'w', 'ma', 'epoch', 'H']
GAUSS_K = 0.01720209895
RECORD = struct.Struct('<6f')
DATA = Path(__file__).resolve().parents[1] / 'data'


def query():
    params = {
        'fields': ','.join(FIELDS),
        'sb-kind': 'a',
        'sb-cdata': '{"AND":["H|LT|15","a|GT|0","e|LT|1","ma|DF"]}',
        'full-prec': 'true',
        'sort': 'H,pdes',
    }
    with urlopen(f'{API}?{urlencode(params)}', timeout=120) as response:
        return json.load(response)


def build(result):
    rows = result.get('data')
    if result.get('fields') != FIELDS or not isinstance(rows, list):
        raise ValueError('unexpected SBDB response schema')
    if not 50_000 <= len(rows) <= 200_000 or len(rows) != int(result.get('count', 0)):
        raise ValueError(f'unexpected SBDB row count: {len(rows)} (reported {result.get("count")})')

    objects = {}
    for pdes, *fields in rows:
        values = tuple(map(float, fields))
        a, e, i, _, _, _, epoch, h = values
        if (not pdes or pdes in objects or not all(map(math.isfinite, values))
                or not (a > 0 and 0 <= e < 1 and 0 <= i <= 180 and 2_400_000 <= epoch <= 2_500_000 and h < 15)):
            raise ValueError(f'invalid SBDB record for {pdes!r}')
        objects[pdes] = values

    # Use the common osculation epoch supplied by SBDB, not the download date.
    # Objects with a different solution epoch need their own mean anomaly advanced to it.
    epochs = Counter(row[6] for row in objects.values())
    epoch = max(epochs, key=lambda day: (epochs[day], day))
    payload = bytearray()
    for a, e, i, node, peri, mean, row_epoch, _ in objects.values():
        phase = (math.radians(mean) + GAUSS_K / (a * math.sqrt(a)) * (epoch - row_epoch)) % math.tau
        row = RECORD.pack(a, e, math.radians(i), math.radians(node), math.radians(peri), phase)
        packed_a, packed_e, *angles = RECORD.unpack(row)
        if not (packed_a > 0 and 0 <= packed_e < 1 and all(map(math.isfinite, (packed_a, *angles)))):
            raise ValueError('SBDB record is not representable as six float32s')
        payload.extend(row)

    digest = base64.b64encode(sha256(payload).digest()).decode('ascii')
    return payload, {'epoch': epoch, 'rows': len(rows), 'sha256': digest}, epochs[epoch]


def replace(path, content):
    if path.is_file() and path.read_bytes() == content:
        return
    with NamedTemporaryFile(dir=path.parent, delete=False) as pending:
        tmp = Path(pending.name)
        try:
            pending.write(content)
            pending.close()
            tmp.chmod(0o644)
            tmp.replace(path)
        finally:
            tmp.unlink(missing_ok=True)


def main():
    try:
        payload, manifest, common = build(query())
        old = DATA / 'asteroids.bin'
        previous_size = old.stat().st_size if old.exists() else 0
        replace(old, payload)
        replace(DATA / 'asteroids.json', (json.dumps(manifest, separators=(',', ':')) + '\n').encode())
    except (OSError, ValueError, TypeError, OverflowError, struct.error) as error:
        sys.exit(f'Asteroid build failed: {error}')
    print(f'Previous: {previous_size // RECORD.size:,} rows / {previous_size:,} bytes')
    print(f'Current:  {manifest["rows"]:,} rows / {len(payload):,} bytes')
    print(f'SBDB osculation epoch: JD {manifest["epoch"]} TDB ({common:,} rows at that epoch)')


if __name__ == '__main__':
    main()
