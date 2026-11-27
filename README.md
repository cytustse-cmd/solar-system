# 实时太阳系漫游

浏览器里的 3D 太阳系，天体位置按现实时间实时计算，可自由飞行。

- 行星：VSOP87 / TOP2013（Astronomy Engine）；月球：ELP/MPP02；木卫：L1.2；自转：IAU 2015 + IAU2000B 章动
- 小行星：NASA JPL SBDB 中 H<15 的约 8.5 万颗（开普勒二体传播）
- 实时数据：全球云图（matteason/live-cloud-maps）、NASA SDO/HMI 太阳图像（GitHub Actions 每 15 分钟抓取）
- 恒星：依巴谷星表；纹理：NASA Blue Marble、Solar System Scope（CC BY 4.0）

本地运行：`python3 server.py 8080`，然后打开 http://localhost:8080/
