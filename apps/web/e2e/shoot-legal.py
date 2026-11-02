#!/usr/bin/env python3
"""
shoot-legal.py — 截图 4 个法律页
- /terms 服务条款
- /privacy 隐私政策
- /cookies Cookie 政策
- /refund 退款政策

依赖: dev server 已起来 (5500 端口)
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT_DIR = Path("/tmp/legal-pages")
OUT_DIR.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("terms", "/terms"),
    ("privacy", "/privacy"),
    ("cookies", "/cookies"),
    ("refund", "/refund"),
]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        for name, path in PAGES:
            url = f"http://localhost:5500{path}"
            print(f"→ {name} → {url}")
            try:
                await page.goto(url, wait_until="networkidle", timeout=20000)
            except Exception as e:
                print(f"  ! networkidle 失败, 退到 domcontentloaded: {e}")
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(1500)
            out = OUT_DIR / f"{name}.png"
            await page.screenshot(path=str(out), full_page=True)
            print(f"  ✓ {out}")

        await browser.close()
        print(f"\n截图保存到 {OUT_DIR}/")


if __name__ == "__main__":
    asyncio.run(main())
