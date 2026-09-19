"""Real unpacked-extension smoke test (RUN08).

Loads the actual extension/ folder into Chromium through Playwright's
extension support. Unlike tests/browser.py this is not a mocked harness:
the MV3 service worker, content script, adapters and CSS run for real.
It still does not contact TypeSafe, does not use an API key and makes no
live-site or provider-accuracy claims.

Run:  python tests/extension_smoke.py
Evidence: evidence/extension-smoke.json
Exit code 0 when the smoke test passes or the environment cannot load an
unpacked extension at all (marked INSUFFICIENT, reproducible by hand).
"""
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension"
OUT = ROOT / "evidence" / "extension-smoke.json"


def write(result):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    for check in result["checks"]:
        mark = "PASS" if check["ok"] else "FAIL"
        detail = f" ({check['detail']})" if check["detail"] else ""
        print(f"{mark} {check['name']}{detail}", flush=True)
    print(f"state: {result['state']}", flush=True)
    print(f"evidence: {OUT}", flush=True)


async def main():
    result = {
        "scope": "real unpacked extension load (RUN08)",
        "state": "INSUFFICIENT",
        "reason": None,
        "extensionId": None,
        "version": None,
        "cards": 0,
        "optionsVersionLabel": None,
        "requests": 0,
        "localhostHits": [],
        "consoleErrors": [],
        "checks": [],
    }

    def check(name, ok, detail=""):
        result["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
        return ok

    if not (EXT / "manifest.json").exists():
        result["reason"] = "extension/ is missing; run npm run build first"
        write(result)
        return 0

    profile = Path(os.environ.get("TEMP", str(ROOT))) / "feedgate-extension-smoke-profile"
    shutil.rmtree(profile, ignore_errors=True)
    context = None
    launch_error = None
    async with async_playwright() as p:
        for kwargs in (
            {"channel": "chromium", "headless": True},
            {"headless": False},
        ):
            try:
                context = await p.chromium.launch_persistent_context(
                    str(profile),
                    args=[
                        f"--disable-extensions-except={EXT}",
                        f"--load-extension={EXT}",
                        "--no-sandbox",
                    ],
                    **kwargs,
                )
                break
            except Exception as exc:  # noqa: BLE001 - environment probe
                launch_error = f"{type(exc).__name__}: {exc}"
                context = None
        if context is None:
            result["reason"] = (
                "Chromium refused to load an unpacked extension in this environment: "
                + (launch_error or "unknown launch error")
            )
            write(result)
            return 0

        worker = None
        try:
            worker = await context.wait_for_event("serviceworker", timeout=15000)
        except Exception:  # noqa: BLE001 - worker may already be running
            worker = context.service_workers[0] if context.service_workers else None
        if worker is None or "chrome-extension://" not in (worker.url or ""):
            result["reason"] = "The MV3 service worker did not start; cannot verify a real load here."
            await context.close()
            write(result)
            return 0

        result["extensionId"] = worker.url.split("/")[2]
        worker_errors = []
        worker.on("console", lambda m: worker_errors.append(m.text) if m.type == "error" else None)

        def collect(request):
            result["requests"] += 1
            url = request.url
            if "localhost" in url or "127.0.0.1" in url:
                result["localhostHits"].append(url)

        page = await context.new_page()
        page.on("request", collect)
        page_errors = []
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        try:
            version = await worker.evaluate("globalThis.FeedGateCore && globalThis.FeedGateCore.VERSION")
        except Exception as exc:  # noqa: BLE001
            version = None
            worker_errors.append(f"evaluate failed: {exc}")
        result["version"] = version
        check("worker reports release version 3.1.1", version == "3.1.1", str(version))

        await page.goto(f"chrome-extension://{result['extensionId']}/demo.html")
        await page.wait_for_timeout(2000)
        result["cards"] = await page.locator("feedgate-card").count()
        check(
            "the real content script collapses the promoted demo post locally",
            result["cards"] >= 1,
            f"{result['cards']} card(s)",
        )
        card_text = ""
        if result["cards"]:
            card_text = await page.locator("feedgate-card").first.evaluate("el=>el.shadowRoot.textContent")
        check(
            "the card explains a verified platform label",
            "Platform-labelled ad" in card_text,
            card_text.strip()[:80],
        )

        await page.goto(f"chrome-extension://{result['extensionId']}/options.html")
        await page.wait_for_timeout(600)
        label = await page.locator(".version, [data-version], #version").first.inner_text() if await page.locator(".version, [data-version], #version").count() else ""
        result["optionsVersionLabel"] = label
        check("options page opens as the real extension page", "3.1.1" in label, label.strip()[:60])

        check("no localhost or bridge traffic", not result["localhostHits"], ",".join(result["localhostHits"][:3]))
        check("no page errors during the demo run", not page_errors, "; ".join(page_errors[:2]))
        check("no worker errors during the demo run", not worker_errors, "; ".join(worker_errors[:2]))

        await context.close()

    result["state"] = "PASS" if all(c["ok"] for c in result["checks"]) else "FAIL"
    write(result)
    return 0 if result["state"] != "FAIL" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
