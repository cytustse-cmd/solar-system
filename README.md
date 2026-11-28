# 实时太阳系漫游

浏览器里的 3D 太阳系，天体位置按现实时间实时计算，可自由飞行。

- 行星：VSOP87 / TOP2013（Astronomy Engine）；月球：ELP/MPP02；木卫：L1.2；自转：IAU 2015 + IAU2000B 章动
- 小行星：NASA JPL SBDB 中 H<15 的约 8.5 万颗（开普勒二体传播）
- 实时数据：全球云图（matteason/live-cloud-maps）、NASA SDO/HMI 太阳图像（GitHub Actions 每 15 分钟抓取）
- 恒星：依巴谷星表；纹理：NASA Blue Marble、Solar System Scope（CC BY 4.0）
- 银河：[ESA/Gaia/DPAC](https://sci.esa.int/web/gaia/-/the-colour-of-the-sky-from-gaia-s-early-data-release-3-equirectangular-projection)，致谢 A. Moitinho。[CC BY-SA 3.0 IGO](https://creativecommons.org/licenses/by-sa/3.0/igo/)；将 16K 原图重新投影、调整亮度并切片，衍生贴图使用同一许可。加载占位图：[ESO/S. Brunier](https://www.eso.org/public/images/eso0932a/)（[CC BY 4.0](https://www.eso.org/public/outreach/copyright/)）。

本地运行：`python3 server.py 8080`，然后打开 http://localhost:8080/

高清银河贴图按视角加载。使用原始 `Gaia_EDR3_flux_cartesian_16k.png` 和安装了 NumPy、SciPy、Pillow 的 Python 运行 `python3 scripts/build_milkyway.py Gaia_EDR3_flux_cartesian_16k.png` 可重建切片。

小行星星表可用 `python3 scripts/build_asteroids.py` 重建。脚本使用 JPL SBDB 当前提供的瞬时轨道根数及其历元（不一定是下载当天）；没有完整椭圆轨道根数的对象不绘制。浏览器在线检查版本，离线使用上一次成功加载的星表。

GitHub Actions 每周刷新一次，也可在 Actions 中手动运行。仅在星表或历元清单变化时提交到 `main`。`GITHUB_TOKEN` 推送不会触发 Pages 的推送工作流；Pages 每 15 分钟的定时任务会部署新数据。
