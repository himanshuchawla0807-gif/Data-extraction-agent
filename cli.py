#!/usr/bin/env python3
"""Oriplex Data Gateway launcher.

This command configures the local OpenCode-backed extraction engine and starts
the FastAPI backend plus Vite frontend as one local gateway.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Iterable

try:
    from rich import box
    from rich.console import Console
    from rich.panel import Panel
    from rich.prompt import Confirm, Prompt
    from rich.table import Table
    from rich.text import Text
except ModuleNotFoundError as exc:
    missing = exc.name or "rich"
    print(
        f"Missing Python dependency: {missing}\n"
        "Run these commands first:\n"
        "  python -m pip install --upgrade pip\n"
        "  pip install -r requirements.txt"
    )
    raise SystemExit(1) from exc

from backend.model_catalog import MODEL_PRESETS, PROVIDER_ORDER

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
ENV_EXAMPLE_PATH = ROOT / ".env.example"
FRONTEND_DIR = ROOT / "frontend"
BACKEND_URL = "http://localhost:8101"
FRONTEND_URL = "http://localhost:5173"
DEFAULT_BACKEND_PORT = "8101"
DEFAULT_FRONTEND_PORT = "5173"

console = Console()


PROVIDER_LABELS = {
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "gemini": "Gemini",
    "openrouter": "OpenRouter",
    "custom": "Custom OpenCode Route",
}

API_KEY_ENV = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GOOGLE_GENERATIVE_AI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "custom": "",
}


def gateway_banner() -> None:
    banner = Text()
    banner.append("ORIPLEX DATA GATEWAY\n", style="bold cyan")
    banner.append("OpenCode file intelligence for local extraction agents", style="white")
    console.print(
        Panel(
            banner,
            title="Oriplex",
            subtitle="Backend + Frontend + Local Storage",
            border_style="cyan",
            box=box.DOUBLE,
            padding=(1, 3),
        )
    )


def read_env(path: Path = ENV_PATH) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def write_env(provider: str, model: str, api_key: str, reasoning_effort: str | None = None) -> None:
    template = ENV_EXAMPLE_PATH.read_text(encoding="utf-8") if ENV_EXAMPLE_PATH.exists() else ""
    key_name = API_KEY_ENV[provider]
    values = {
        "OPENCODE_API_PROVIDER": provider,
        "OPENCODE_MODEL": model,
        "DATA_EXTRACTION_PROVIDER": "opencode",
        "BACKEND_PORT": DEFAULT_BACKEND_PORT,
        "FRONTEND_PORT": DEFAULT_FRONTEND_PORT,
    }
    if reasoning_effort:
        values["OPENAI_REASONING_EFFORT"] = reasoning_effort
    if key_name and api_key:
        values[key_name] = api_key

    if template:
        lines: list[str] = []
        seen: set[str] = set()
        for line in template.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                lines.append(line)
                continue
            key = line.split("=", 1)[0].strip()
            if key in values:
                lines.append(f"{key}={values[key]}")
                seen.add(key)
            else:
                lines.append(line)
        for key, value in values.items():
            if key not in seen:
                lines.append(f"{key}={value}")
        ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return

    lines = [f"{key}={value}" for key, value in values.items()]
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def provider_choices() -> list[str]:
    return [key for key in PROVIDER_ORDER if key in MODEL_PRESETS]


def show_model_catalog() -> None:
    table = Table(title="Available OpenCode Model Routes", box=box.SIMPLE_HEAVY)
    table.add_column("Provider", style="cyan", no_wrap=True)
    table.add_column("Model ID", style="green")
    table.add_column("Label", style="white")

    for provider in provider_choices():
        models = MODEL_PRESETS[provider]
        label = PROVIDER_LABELS.get(provider, provider)
        for model in models:
            model_id = model.get("model") or model.get("placeholder", "")
            table.add_row(label, model_id, model.get("label", ""))
    console.print(table)


def choose_provider() -> str:
    choices = provider_choices()
    table = Table(title="Choose the API provider that OpenCode should use", box=box.SIMPLE)
    table.add_column("#", style="cyan", justify="right")
    table.add_column("Provider", style="bold")
    table.add_column("Key env var", style="green")

    for idx, provider in enumerate(choices, start=1):
        key_label = API_KEY_ENV[provider] or "Uses existing OpenCode configuration"
        table.add_row(str(idx), PROVIDER_LABELS.get(provider, provider), key_label)
    console.print(table)

    answer = Prompt.ask("Provider", choices=[str(i) for i in range(1, len(choices) + 1)], default="1")
    return choices[int(answer) - 1]


def choose_model(provider: str) -> tuple[str, str | None]:
    models = MODEL_PRESETS[provider]
    table = Table(
        title=f"Choose the {PROVIDER_LABELS.get(provider, provider)} model route",
        box=box.SIMPLE,
    )
    table.add_column("#", style="cyan", justify="right")
    table.add_column("Model", style="bold green")
    table.add_column("Label", style="white")

    for idx, model in enumerate(models, start=1):
        model_id = model.get("model") or model.get("placeholder", "")
        table.add_row(str(idx), model_id, model.get("label", ""))
    console.print(table)

    answer = Prompt.ask("Model", choices=[str(i) for i in range(1, len(models) + 1)], default="1")
    selected = models[int(answer) - 1]
    if selected.get("custom"):
        model = Prompt.ask("OpenCode model route", default=selected.get("placeholder", "provider/model"))
    else:
        model = selected["model"]
    return model, selected.get("reasoning_effort")


def configure_gateway() -> None:
    provider = choose_provider()
    model, reasoning_effort = choose_model(provider)
    key_name = API_KEY_ENV[provider]
    api_key = ""
    if key_name:
        console.print(
            Panel(
                f"Paste your [bold]{PROVIDER_LABELS.get(provider, provider)}[/bold] API key.\n"
                f"It is written only to local [bold].env[/bold] as [green]{key_name}[/green].",
                title="Local key setup",
                border_style="green",
            )
        )
        api_key = Prompt.ask(f"{key_name}", password=True, default="")
    else:
        console.print("[yellow]Custom route selected. The gateway will use your existing OpenCode credential setup.[/yellow]")
    write_env(provider, model, api_key, reasoning_effort=reasoning_effort)
    console.print(f"[green]Configured[/green] OpenCode provider [bold]{provider}[/bold] with model [bold]{model}[/bold].")


def current_config_panel() -> Panel:
    env = read_env()
    provider = env.get("OPENCODE_API_PROVIDER", "gemini")
    model = env.get("OPENCODE_MODEL", "(not set)")
    key_name = API_KEY_ENV.get(provider, "")
    key_state = "present" if key_name and env.get(key_name) else "missing"

    body = Table.grid(padding=(0, 2))
    body.add_column(style="cyan", no_wrap=True)
    body.add_column(style="white")
    body.add_row("Engine", "OpenCode")
    body.add_row("Provider", provider)
    body.add_row("Model", model)
    body.add_row("API key", f"{key_name or 'unknown'}: {key_state}")
    body.add_row("Storage", "storage/")
    return Panel(body, title="Current Gateway Config", border_style="blue")


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def run_install_check() -> None:
    if not (FRONTEND_DIR / "node_modules").exists():
        console.print("[yellow]Frontend dependencies are missing.[/yellow]")
        if Confirm.ask("Install frontend dependencies now with npm install?", default=True):
            subprocess.check_call(["npm", "install"], cwd=FRONTEND_DIR)


def check_url(url: str, timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status < 500
    except urllib.error.HTTPError as exc:
        return exc.code < 500
    except Exception:
        return False


def start_backend() -> subprocess.Popen[str] | None:
    if check_url(f"{BACKEND_URL}/api/health"):
        console.print(f"[yellow]Backend already reachable at[/yellow] {BACKEND_URL}. Reusing it.")
        return None

    env = os.environ.copy()
    env.setdefault("PYTHONPATH", str(ROOT))
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", DEFAULT_BACKEND_PORT, "--reload"],
        cwd=ROOT,
        env=env,
        text=True,
    )


def start_frontend() -> subprocess.Popen[str] | None:
    if check_url(FRONTEND_URL):
        console.print(f"[yellow]Frontend already reachable at[/yellow] {FRONTEND_URL}. Reusing it.")
        return None

    env = os.environ.copy()
    env["VITE_API_BASE_URL"] = f"{BACKEND_URL}/api"
    env["VITE_BACKEND_URL"] = BACKEND_URL
    env["VITE_WS_URL"] = "ws://localhost:8101/api/ws"
    return subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", DEFAULT_FRONTEND_PORT],
        cwd=FRONTEND_DIR,
        env=env,
        text=True,
    )


def print_live_panel() -> None:
    env = read_env()
    provider = env.get("OPENCODE_API_PROVIDER", "gemini")
    model = env.get("OPENCODE_MODEL", "(not set)")

    body = Table.grid(padding=(0, 2))
    body.add_column(style="cyan", no_wrap=True)
    body.add_column(style="white")
    body.add_row("Frontend", FRONTEND_URL)
    body.add_row("Backend", BACKEND_URL)
    body.add_row("API health", f"{BACKEND_URL}/api/health")
    body.add_row("Engine", "OpenCode")
    body.add_row("Provider", provider)
    body.add_row("Model", model)
    body.add_row("Storage", str(ROOT / "storage"))
    console.print(Panel(body, title="Gateway Live", border_style="green", box=box.ROUNDED))


def terminate_processes(processes: Iterable[subprocess.Popen[str] | None]) -> None:
    for process in processes:
        if process and process.poll() is None:
            process.terminate()
    for process in processes:
        if process and process.poll() is None:
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()


def start_gateway(no_browser: bool = False) -> int:
    run_install_check()

    console.print("[cyan]Starting backend and frontend through Oriplex Data Gateway...[/cyan]")
    backend = start_backend()
    frontend = start_frontend()
    time.sleep(2)
    print_live_panel()
    if not no_browser:
        webbrowser.open(FRONTEND_URL)

    console.print("[bold]Press Ctrl+C to stop gateway-owned servers.[/bold]")
    try:
        while True:
            owned = [process for process in (backend, frontend) if process is not None]
            if owned and any(process.poll() is not None for process in owned):
                console.print("[red]A gateway-owned process exited. Shutting down the remaining process.[/red]")
                return 1
            time.sleep(1)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping Oriplex Data Gateway...[/yellow]")
        terminate_processes((backend, frontend))
        console.print("[green]Gateway stopped.[/green]")
        return 0


def run_gateway(no_browser: bool = False, force_setup: bool = False) -> int:
    gateway_banner()
    if ENV_PATH.exists() and not force_setup:
        console.print(current_config_panel())
        if not Confirm.ask("Use this local configuration?", default=True):
            configure_gateway()
    else:
        configure_gateway()
    return start_gateway(no_browser=no_browser)


def run_doctor() -> int:
    gateway_banner()
    checks = Table(title="Gateway Doctor", box=box.SIMPLE_HEAVY)
    checks.add_column("Check", style="cyan")
    checks.add_column("Status", style="white")
    checks.add_column("Detail", style="dim")

    checks.add_row("Python", "ok", sys.version.split()[0])
    checks.add_row("Node", "ok" if command_exists("node") else "missing", shutil.which("node") or "Install Node.js")
    checks.add_row("npm", "ok" if command_exists("npm") else "missing", shutil.which("npm") or "Install npm")
    checks.add_row("OpenCode", "ok" if command_exists(read_env().get("OPENCODE_COMMAND", "opencode")) else "missing", read_env().get("OPENCODE_COMMAND", "opencode"))
    checks.add_row(".env", "ok" if ENV_PATH.exists() else "missing", str(ENV_PATH))
    checks.add_row("frontend/node_modules", "ok" if (FRONTEND_DIR / "node_modules").exists() else "missing", str(FRONTEND_DIR / "node_modules"))
    checks.add_row("Backend health", "live" if check_url(f"{BACKEND_URL}/api/health") else "offline", f"{BACKEND_URL}/api/health")
    checks.add_row("Frontend", "live" if check_url(FRONTEND_URL) else "offline", FRONTEND_URL)
    console.print(checks)
    if ENV_PATH.exists():
        console.print(current_config_panel())
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="oriplex-data",
        description="Oriplex Data Gateway for the open-source Data Extraction Agent.",
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=("gateway", "start", "setup", "doctor", "models"),
        default="gateway",
        help="gateway starts the guided setup and local servers.",
    )
    parser.add_argument("--setup", action="store_true", help="Force the provider/model/key setup flow before starting.")
    parser.add_argument("--no-browser", action="store_true", help="Start the gateway without opening the browser.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    if args.command == "models":
        gateway_banner()
        show_model_catalog()
        return 0

    if args.command == "doctor":
        return run_doctor()

    if args.command == "setup":
        gateway_banner()
        configure_gateway()
        return 0

    if args.command == "start":
        gateway_banner()
        if not ENV_PATH.exists():
            console.print("[red].env is missing. Run `oriplex-data setup` first.[/red]")
            return 1
        return start_gateway(no_browser=args.no_browser)

    return run_gateway(no_browser=args.no_browser, force_setup=args.setup)


if __name__ == "__main__":
    raise SystemExit(main())
