#!/usr/bin/env python3
"""静态文件服务 + 实时数据代理（SDO 太阳图像无 CORS 头，需经服务端转发）。"""
import http.server, os, sys, threading, time, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
LIVE = {
    '/live/sun.jpg': ('https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg', 900, 'image/jpeg'),
    '/live/iss.txt': ('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', 3600, 'text/plain; charset=utf-8'),
}
cache, lock = {}, threading.Lock()


def fetch(path):
    url, ttl, _ = LIVE[path]
    with lock:
        hit = cache.get(path)
        if hit and time.time() - hit[0] < ttl:
            return hit
    req = urllib.request.Request(url, headers={'User-Agent': 'solar-system-explorer'})
    with urllib.request.urlopen(req, timeout=20) as r:
        hit = (time.time(), r.read(), r.headers.get('Last-Modified', ''))
    with lock:
        cache[path] = hit
    return hit


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webp': 'image/webp'}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        if self.path.split('?')[0].endswith(('.js', '.html', '.css', '/')):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        p = self.path.split('?')[0]
        if p in LIVE:
            try:
                _, body, lm = fetch(p)
            except Exception as e:  # noqa: BLE001
                if os.path.isfile(os.path.join(ROOT, p.lstrip('/'))):
                    return super().do_GET()
                self.send_error(502, str(e))
                return
            self.send_response(200)
            self.send_header('Content-Type', LIVE[p][2])
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Source-Last-Modified', lm)
            self.send_header('Cache-Control', 'max-age=300')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    http.server.ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
