#!/usr/bin/env python3
"""
P1-8 截图脚本 — playwright 8 张图

策略:
  每个独立 page session 都重新 UI login, 避免 cross-page navigation 丢失 access token
  (因为 api.ts 的 accessToken 是模块级变量, page.goto 会 wipe JS context).

  in-app navigation (anchor click) 用于 orders-list -> order-detail (同 context)
"""
import os
import time
import subprocess
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB_URL = "http://localhost:5502"
API_URL = "http://localhost:8080"
API_WORKTREE = "/Users/fangchen/Baidu/GitHub/AICourse/.worktrees/web-orders"
API_CWD = f"{API_WORKTREE}/apps/api"
ENV_FILE = f"{API_WORKTREE}/.env"
EMAIL = "e2e-orders@test.com"
PASSWORD = "123456"
SCREENSHOTS_DIR = Path(f"{API_WORKTREE}/screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)


def ui_login(page, email=EMAIL):
    """通过 UI 登录 (并 hack: 注入 access token 到 localStorage, 让 api.ts 跨 page 读)
    api.ts 默认 setAccessToken 只写内存, page.goto 后丢失. 这里直接
    把 token 写到 localStorage 的固定 key, 然后让 api.ts 初始化时读.
    (但 api.ts 当前不读 localStorage, 这个 hack 只起 document 作用, 不真生效)
    实际更稳的做法: 在 page.evaluate 之前 await api 的初始化完成.
    """
    page.goto(f"{WEB_URL}/auth/login", wait_until="domcontentloaded")
    page.wait_for_timeout(2000)
    page.fill('input[type="email"], input[name="email"]', email)
    page.fill('input[type="password"], input[name="password"]', PASSWORD)
    page.locator('button[type=submit]').first.click()
    try:
        page.wait_for_url(lambda u: "/auth/login" not in u, timeout=15000)
    except Exception as e:
        print(f"login redirect wait failed: {e}")
    time.sleep(2.0)


def create_test_user(email):
    """通过 prisma 直接创建 test user"""
    script = f"""
    const {{ PrismaClient }} = require('@prisma/client');
    const bcrypt = require('bcrypt');
    (async () => {{
        const p = new PrismaClient();
        const ph = await bcrypt.hash('123456', 12);
        await p.user.upsert({{
            where: {{ email: '{email}' }},
            update: {{ passwordHash: ph }},
            create: {{ email: '{email}', passwordHash: ph, name: 'Empty Test', role: 'student' }},
        }});
        await p.$disconnect();
    }})();
    """
    env_overrides = {}
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env_overrides[k] = v.strip('"')
    subprocess.run(
        ["node", "-e", script],
        cwd=API_CWD,
        env={**os.environ, **env_overrides},
        capture_output=True,
    )


def get_token_via_api(email=EMAIL):
    import urllib.request
    body = json.dumps({"email": email, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{API_URL}/api/v1/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())["accessToken"]


def get_orders_from_api(token):
    import urllib.request
    req = urllib.request.Request(
        f"{API_URL}/api/v1/orders/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req) as res:
            return [o["id"] for o in json.loads(res.read())]
    except Exception as e:
        print(f"orders fetch err: {e}")
        return []


def get_certs_from_api(token):
    import urllib.request
    req = urllib.request.Request(
        f"{API_URL}/api/v1/certificates",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req) as res:
            return [c["id"] for c in json.loads(res.read())]
    except Exception as e:
        print(f"certs fetch err: {e}")
        return []


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ==== Session 1: orders-list-light + orders-detail (in-app nav) ====
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1,
        )
        page = ctx.new_page()
        ui_login(page)
        # 1. orders-list-light
        page.goto(f"{WEB_URL}/dashboard/orders", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        page.screenshot(path=str(SCREENSHOTS_DIR / "orders-list-light.png"), full_page=True)
        print("✓ orders-list-light")

        # 2. orders-detail (in-app click via table, 同 context)
        token = get_token_via_api(EMAIL)
        order_ids = get_orders_from_api(token)
        if order_ids:
            # 找 table 里 (desktop visible) 的 a 链接
            link = page.locator(f"table a[href='/dashboard/orders/{order_ids[0]}']").first
            try:
                link.click(timeout=10000)
                page.wait_for_timeout(2500)
                page.screenshot(path=str(SCREENSHOTS_DIR / "orders-detail.png"), full_page=True)
                print("✓ orders-detail (in-app nav via table)")
            except Exception as e:
                print(f"✗ orders-detail click err: {e}")
        else:
            print("✗ orders-detail: no order ids")
        ctx.close()

        # ==== Session 2: certificates-grid + certificate-detail ====
        ctx2 = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1,
        )
        p2 = ctx2.new_page()
        ui_login(p2)
        # 3. certificates-grid
        p2.goto(f"{WEB_URL}/dashboard/certificates", wait_until="domcontentloaded")
        p2.wait_for_timeout(3000)
        p2.screenshot(path=str(SCREENSHOTS_DIR / "certificates-grid.png"), full_page=True)
        print("✓ certificates-grid")

        # 4. certificate-detail (in-app click)
        cert_ids = get_certs_from_api(token)
        if cert_ids:
            link2 = p2.locator(f"a[href='/dashboard/certificates/{cert_ids[0]}']").first
            try:
                link2.click(timeout=10000)
                p2.wait_for_timeout(2500)
                p2.screenshot(path=str(SCREENSHOTS_DIR / "certificate-detail.png"), full_page=True)
                print("✓ certificate-detail (in-app nav)")
            except Exception as e:
                print(f"✗ certificate-detail click err: {e}")
        else:
            print("✗ certificate-detail: no cert ids")
        ctx2.close()

        # ==== Session 3: certificate-verify (公开, no login) ====
        ctx3 = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1,
        )
        p3 = ctx3.new_page()
        p3.goto(f"{WEB_URL}/verify/OCSG-2026-COURSE-0001", wait_until="domcontentloaded")
        p3.wait_for_timeout(2500)
        p3.screenshot(path=str(SCREENSHOTS_DIR / "certificate-verify.png"), full_page=True)
        print("✓ certificate-verify")
        ctx3.close()

        # ==== Session 4: empty (用全新 user) ====
        new_user_email = f"screenshots-empty-{int(time.time())}@test.com"
        create_test_user(new_user_email)
        ctx4 = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1,
        )
        e_page = ctx4.new_page()
        ui_login(e_page, new_user_email)

        # 6. certificates-empty
        e_page.goto(f"{WEB_URL}/dashboard/certificates", wait_until="domcontentloaded")
        e_page.wait_for_timeout(3000)
        e_page.screenshot(path=str(SCREENSHOTS_DIR / "certificates-empty.png"), full_page=True)
        print("✓ certificates-empty")

        # 7. orders-empty
        e_page.goto(f"{WEB_URL}/dashboard/orders", wait_until="domcontentloaded")
        e_page.wait_for_timeout(3000)
        e_page.screenshot(path=str(SCREENSHOTS_DIR / "orders-empty.png"), full_page=True)
        print("✓ orders-empty")
        ctx4.close()

        # ==== Session 5: mobile ====
        ctx5 = browser.new_context(
            viewport={"width": 375, "height": 812},
            device_scale_factor=2,
            is_mobile=True,
        )
        m_page = ctx5.new_page()
        ui_login(m_page)
        # 8. orders-list-mobile
        m_page.goto(f"{WEB_URL}/dashboard/orders", wait_until="domcontentloaded")
        m_page.wait_for_timeout(3000)
        m_page.screenshot(path=str(SCREENSHOTS_DIR / "orders-list-mobile.png"), full_page=True)
        print("✓ orders-list-mobile")
        ctx5.close()

        browser.close()

    print("\nAll screenshots written to:", SCREENSHOTS_DIR)


if __name__ == "__main__":
    main()
