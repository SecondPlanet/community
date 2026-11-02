#!/usr/bin/env python3
"""
shoot-errors.py — 截图 4 个错误页 (dev mode)
- 404:  /__error-demo/404   (NotFoundPage 增强版: 返回上一页 + 搜索 + 推荐)
- 403:  /__error-demo/403   (ForbiddenPage: 智能 CTA + 联系客服)
- 500:  /__error-demo/500   (ServerErrorPage: 错误码 + 复制)
- network: /__error-demo/network  (NetworkErrorPage: 诊断 + 状态指示)

依赖: dev server 已起来 (5500 端口)
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT_DIR = Path("/tmp/error-pages")
OUT_DIR.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("404", "/__error-demo/404"),
    ("403", "/__error-demo/403"),
    ("500", "/__error-demo/500"),
    ("network", "/__error-demo/network"),
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
                # networkidle 在 vite HMR 下可能 hang, 退到 domcontentloaded
                print(f"  ! networkidle 失败, 退到 domcontentloaded: {e}")
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            # 等 I18nText / Suspense 异步渲染完
            await page.wait_for_timeout(1500)
            out = OUT_DIR / f"{name}.png"
            await page.screenshot(path=str(out), full_page=True)
            print(f"  ✓ {out}")

        await browser.close()
        print(f"\n截图保存到 {OUT_DIR}/")
        print(f"  {', '.join(p.name for p in sorted(OUT_DIR.glob('*.png')))}")


if __name__ == "__main__":
    asyncio.run(main())
