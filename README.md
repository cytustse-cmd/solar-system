# 实时太阳系漫游

浏览器里的 3D 太阳系，天体位置按现实时间实时计算，可自由飞行。

- 行星：VSOP87 / TOP2013（Astronomy Engine）；月球：ELP/MPP02；木卫：L1.2；自转：IAU 2015 + IAU2000B 章动
- 小行星：NASA JPL SBDB 中 H<15 的约 8.5 万颗（开普勒二体传播）
- 实时数据：全球云图（matteason/live-cloud-maps）、NASA SDO/HMI 太阳图像（GitHub Actions 每 15 分钟抓取）
- 恒星：依巴谷星表；纹理：NASA Blue Marble、Solar System Scope（CC BY 4.0）

本地运行：`python3 server.py 8080`，然后打开 http://localhost:8080/

小行星星表可用 `python3 scripts/build_asteroids.py` 重建。脚本使用 JPL SBDB 当前提供的瞬时轨道根数及其历元（不一定是下载当天）；没有完整椭圆轨道根数的对象不绘制。浏览器在线检查版本，离线使用上一次成功加载的星表。

GitHub Actions 每周刷新一次，也可在 Actions 中手动运行。仅在星表或历元清单变化时提交到 `main`。`GITHUB_TOKEN` 推送不会触发 Pages 的推送工作流；Pages 每 15 分钟的定时任务会部署新数据。
