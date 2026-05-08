"""Command-line launcher for Data Extraction Agent Open."""

from __future__ import annotations

import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

from backend.model_catalog import MODEL_PRESETS, PROVIDER_ORDER

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
BACKEND_PORT = 8101
FRONTEND_PORT = 5173

LOGO = r"""
   ___       _       _
  / _ \ _ __(_)_ __ | | _____  __
 | | | | '__| | '_ \| |/ _ \ \/ /
 | |_| | |  | | |_) | |  __/>  <
  \___/|_|  |_| .__/|_|\___/_/\_\
              |_|
 Data Extraction Agent Open
"""


def choose_model(api_provider: str) -> dict:
    presets = MODEL_PRESETS.get(api_provider, [])
    if not presets:
        return presets[0] if presets else {"model": ""}

    print(f"\nChoose the model route OpenCode should use for {api_provider}:")
    for index, preset in enumerate(presets, start=1):
        suffix = f" [{preset['model']}]" if preset.get("model") else ""
        print(f"{index}. {preset['label']}{suffix}")

    selected = input("Model [1]: ").strip() or "1"
    try:
        preset = presets[int(selected) - 1]
    except (ValueError, IndexError):
        preset = presets[0]

    if preset.get("custom"):
        model = input(f"OpenCode model route ({preset['placeholder']}): ").strip()
        return {**preset, "model": model}
    return preset


def write_env(api_provider: str, api_key: str, model_choice: dict) -> None:
    template = (ROOT / ".env.example").read_text(encoding="utf-8")
    model = model_choice.get("model") or ""
    values = {
        "DATA_EXTRACTION_PROVIDER": "opencode",
        "DATA_EXTRACTION_MODEL": "opencode",
        "OPENCODE_API_PROVIDER": api_provider,
        "OPENCODE_MODEL": model,
    }
    if api_provider == "openai":
        values["OPENAI_API_KEY"] = api_key
        values["OPENAI_MODEL"] = model.removeprefix("openai/") or "gpt-5.5"
        values["OPENAI_REASONING_EFFORT"] = model_choice.get("reasoning_effort", "")
    elif api_provider == "anthropic":
        values["ANTHROPIC_API_KEY"] = api_key
        values["ANTHROPIC_MODEL"] = model.removeprefix("anthropic/") or "claude-sonnet-4-20250514"
    elif api_provider == "gemini":
        values["GEMINI_API_KEY"] = api_key
        values["GOOGLE_API_KEY"] = api_key
        values["GOOGLE_GENERATIVE_AI_API_KEY"] = api_key
        values["GEMINI_MODEL"] = model.split("/", 1)[-1] if model else "gemini-2.5-pro"
    elif api_provider == "openrouter":
        values["OPENROUTER_API_KEY"] = api_key
        values["OPENROUTER_MODEL"] = model

    lines = []
    for line in template.splitlines():
        if "=" in line and not line.startswith("#"):
            key = line.split("=", 1)[0]
            if key in values:
                line = f"{key}={values[key]}"
        lines.append(line)
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ensure_frontend_dependencies() -> None:
    node_modules = ROOT / "frontend" / "node_modules"
    if node_modules.exists():
        return
    print("Frontend dependencies are not installed.")
    answer = input("Run npm install in frontend now? [y/N]: ").strip().lower()
    if answer == "y":
        subprocess.check_call(["npm", "--prefix", "frontend", "install"], cwd=ROOT)
    else:
        print("Skipping npm install. Run: npm --prefix frontend install")


def start_processes() -> list[subprocess.Popen]:
    env = os.environ.copy()
    env["VITE_API_URL"] = f"http://localhost:{BACKEND_PORT}"
    env["VITE_SESSION_SERVICE_URL"] = f"http://localhost:{BACKEND_PORT}/api"
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", str(BACKEND_PORT)],
        cwd=ROOT,
    )
    wait_for_backend(backend)
    frontend = subprocess.Popen(
        ["npm.cmd" if os.name == "nt" else "npm", "--prefix", "frontend", "run", "dev", "--", "--host", "0.0.0.0", "--port", str(FRONTEND_PORT)],
        cwd=ROOT,
        env=env,
    )
    return [backend, frontend]


def wait_for_backend(process: subprocess.Popen, timeout_seconds: int = 20) -> None:
    deadline = time.time() + timeout_seconds
    health_url = f"http://localhost:{BACKEND_PORT}/api/health"
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Backend exited before becoming ready with code {process.returncode}.")
        try:
            request = Request(health_url, method="GET")
            with urlopen(request, timeout=1) as response:
                if response.status == 200:
                    return
        except URLError:
            time.sleep(0.5)
        except TimeoutError:
            time.sleep(0.5)
    raise RuntimeError(f"Backend did not become ready at {health_url}.")


def main() -> int:
    print(LOGO)
    print("OpenCode is the fixed local file agent.")
    print("Choose the API provider/model route that OpenCode should use:")
    for index, name in enumerate(PROVIDER_ORDER, start=1):
        print(f"{index}. {name}")
    choices = {str(index): name for index, name in enumerate(PROVIDER_ORDER, start=1)}
    api_provider = choices.get(input("API provider [1]: ").strip() or "1", "anthropic")

    api_key = ""
    if api_provider != "custom":
        api_key = input(f"Enter {api_provider} API key for OpenCode: ").strip()
        if not api_key:
            print("No API key entered. OpenCode will use any provider credentials already configured on this machine.")

    model_choice = choose_model(api_provider)
    write_env(api_provider, api_key, model_choice)
    ensure_frontend_dependencies()

    print(f"Starting backend on http://localhost:{BACKEND_PORT}")
    print(f"Starting frontend on http://localhost:{FRONTEND_PORT}")
    try:
        processes = start_processes()
    except Exception as exc:
        print(f"Startup failed: {exc}")
        return 1
    time.sleep(3)
    webbrowser.open(f"http://localhost:{FRONTEND_PORT}")

    print("Session started. Press Ctrl+C to stop both servers.")
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping servers...")
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
