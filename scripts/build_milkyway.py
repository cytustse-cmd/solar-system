"""Reproject ESA/Gaia/DPAC's EDR3 colour sky (CC BY-SA 3.0 IGO) into cube tiles."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates


SIZE = 1200
GUTTER = 8
FACES = ('px', 'nx', 'py', 'ny', 'pz', 'nz')


def build(source, output):
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(source) as image:
        if image.size != (16000, 8000):
            raise ValueError('Expected the 16000 × 8000 Gaia EDR3 cartesian image')
        sky = np.asarray(image.convert('RGB'))
    height, width, _ = sky.shape
    output.mkdir(parents=True, exist_ok=True)
    a = (np.arange(-GUTTER, SIZE + GUTTER) + 0.5) / SIZE
    for face in FACES:
        for row in range(2):
            for col in range(2):
                u, v = np.meshgrid(a + col - 1, a + row - 1)
                one = np.ones_like(u)
                x, y, z = {
                    'px': (one, u, -v), 'nx': (-one, u, -v),
                    'py': (u, one, -v), 'ny': (u, -one, -v),
                    'pz': (u, v, one), 'nz': (u, v, -one),
                }[face]
                norm = np.sqrt(x*x + y*y + z*z)
                lon, lat = np.arctan2(y, x), np.arcsin(z/norm)
                src_u = (0.5 - lon / (2*np.pi)) * width - 0.5
                src_v = np.clip((0.5 - lat / np.pi) * height - 0.5, 0, height - 1)
                rgb = np.stack([
                    map_coordinates(sky[:, :, ch], (src_v, src_u), order=1, mode='grid-wrap')
                    for ch in range(3)
                ], axis=-1) / 255
                rgb *= 0.35 + 0.30 * rgb
                tile = Image.fromarray(np.rint(rgb * 255).astype(np.uint8))
                tile.save(output / f'{face}-{row}{col}.webp', quality=91, method=6)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'textures' / 'milkyway-gaia-v1')
    args = parser.parse_args()
    build(args.source, args.output)
