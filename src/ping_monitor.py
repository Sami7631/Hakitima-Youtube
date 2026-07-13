"""ping_monitor.py

Wi‑Fi / internet ping izleme aracı (Windows).

Bu script iki modda çalışabilir:
- Tek sefer (`python -m src.ping_monitor`)
- Daemon (`python -m src.ping_monitor --daemon [--interval N]`)
  Her N saniyede bir hedef IP’ye ping atar, ortalama RTT ve paket kaybını
  `logs/ping_monitor.log` dosyasına zaman damgasıyla ekler.
"""

import subprocess
import time
import argparse
from pathlib import Path

LOG_FILE = Path(__file__).resolve().parents[1] / "logs" / "ping_monitor.log"
TARGET = "8.8.8.8"  # Google DNS – değiştirilebilir

def _run_ping() -> str:
    """Windows `ping -n 4 <target>` komutunu çalıştırır ve çıktıyı döndürür."""
    result = subprocess.run(["ping", "-n", "4", TARGET], capture_output=True, text=True, check=False)
    return result.stdout

def _parse_ping(output: str) -> str:
    """Ping çıktısından ortalama RTT ve kayıp yüzdesini ayıklar.
    Çıktı örneği (tr):
        Paket: 0 gönderildi, 0 alındı, %100 kayıp
        Ortalama = 4ms
    """
    loss = "?"
    avg = "?"
    for line in output.splitlines():
        if "kayıp" in line.lower() and "%" in line:
            # örnek: "%100 kayıp"
            parts = line.replace("%", " %").split()
            for i, p in enumerate(parts):
                if p.startswith("%"):
                    loss = parts[i - 1]
        if "ortalama" in line.lower() and "=" in line:
            # örnek: "Ortalama = 4ms"
            try:
                avg = line.split("=")[1].strip().split()[0]
            except Exception:
                pass
    return f"Ping {TARGET}: loss={loss}%, avg={avg}"

def _log(message: str) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    LOG_FILE.write_text(f"{timestamp} | {message}\n", encoding="utf-8", append=True)

def run_once() -> str:
    out = _run_ping()
    if not out:
        return "Ping komutu çalışmadı."
    return _parse_ping(out)

def run_daemon(interval: int = 60) -> None:
    while True:
        try:
            msg = run_once()
            _log(msg)
        except Exception as e:
            _log(f"Hata: {e}")
        time.sleep(interval)

def main() -> None:
    parser = argparse.ArgumentParser(description="Ping izleme aracı")
    parser.add_argument("--daemon", action="store_true", help="Sürekli çalıştır ve loga ekle")
    parser.add_argument("--interval", type=int, default=60, help="Daemon periyodu (saniye)")
    args = parser.parse_args()
    if args.daemon:
        run_daemon(args.interval)
    else:
        print(run_once())

if __name__ == "__main__":
    main()
