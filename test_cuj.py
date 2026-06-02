from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(2000)

    # Mock admin session so we bypass login
    page.evaluate("() => localStorage.setItem('mhc_admin_session', 'dummy')")
    page.reload()
    page.wait_for_timeout(2000)

    # Wait to see if we land on round view or fixture view
    # Let's try to navigate to fixture view directly or click the nav item
    try:
        # Desktop nav
        page.get_by_role("button", name="Fixture & Results").click(timeout=3000)
    except:
        # Mobile nav or "More"
        try:
            page.get_by_role("button", name="More").click(timeout=3000)
            page.wait_for_timeout(500)
            page.get_by_role("button", name="Fixture & Results").click(timeout=3000)
        except:
            pass

    page.wait_for_timeout(2000)

    # Wait for things to render in Fixture View
    # There should be a Digest panel if there's any digests.
    # If not, let's just make sure it loads.
    page.screenshot(path="/home/jules/verification/screenshots/verification.png", full_page=True)
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
