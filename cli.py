"""Command-line launcher for Data Extraction Agent Open."""

from __future__ import annotations

import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

LOGO = r"""
   ___       _       _
  / _ \ _ __(_)_ __ | | _____  __
 | | | | '__| | '_ \| |/ _ \ \/ /
 | |_| | |  | | |_) | |  __/>  <
  \___/|_|  |_| .__/|_|\___/_/\_\
              |_|
 Data Extraction Agent Open
"""


def write_env(provider: str, api_key: str) -> None:
    template = (ROOT / ".env.example").read_text(encoding="utf-8")
    values = {
        "DATA_EXTRACTION_PROVIDER": provider,
    }
    if provider == "openai":
        values["OPENAI_API_KEY"] = api_key
    elif provider == "anthropic":
        values["ANTHROPIC_API_KEY"] = api_key
    elif provider == "gemini":
        values["GEMINI_API_KEY"] = api_key
    elif provider == "openrouter":
        values["OPENROUTER_API_KEY"] = api_key

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
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8101", "--reload"],
        cwd=ROOT,
    )
    frontend = subprocess.Popen(
        ["npm", "--prefix", "frontend", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
        cwd=ROOT,
        shell=os.name == "nt",
    )
    return [backend, frontend]


def main() -> int:
    print(LOGO)
    print("Choose an LLM provider:")
    print("1. mock (no API key, recommended for first localhost test)")
    print("2. openai")
    print("3. anthropic")
    print("4. gemini")
    print("5. openrouter")
    choices = {"1": "mock", "2": "openai", "3": "anthropic", "4": "gemini", "5": "openrouter"}
    provider = choices.get(input("Provider [1]: ").strip() or "1", "mock")

    api_key = ""
    if provider != "mock":
        api_key = input(f"Enter {provider} API key: ").strip()
        if not api_key:
            print("No API key entered. Falling back to mock provider.")
            provider = "mock"

    write_env(provider, api_key)
    ensure_frontend_dependencies()

    print("Starting backend on http://localhost:8101")
    print("Starting frontend on http://localhost:5173")
    processes = start_processes()
    time.sleep(3)
    webbrowser.open("http://localhost:5173")

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

