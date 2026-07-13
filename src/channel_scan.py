"""channel_scan.py

Wi‑Fi kanal analiz aracı (Windows).

Bu script iki modda çalışabilir:
- Tek sefer (`python -m src.channel_scan`)
- Daemon (sürekli) modu (`python -m src.channel_scan --daemon [--interval N]`)
  Bu modda her N saniyede bir tarama yapılır ve sonuçlar
  `logs/channel_scan.log` dosyasına zaman damgasıyla eklenir.
"""

import subprocess
import re
import argparse
import time
from collections import Counter
from typing import Tuple
from pathlib import Path

LOG_FILE = Path(__file__).resolve().parents[1] / "logs" / "channel_scan.log"

def _run_netsh() -> str:
    """`netsh wlan show networks mode=bssid` komutunu çalıştırır ve çıktısını döndürür.
    Windows dışındaki ortamda çalışmaz.
    """
    result = subprocess.run(
        ["netsh", "wlan", "show", "networks", "mode=bssid"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout

def _extract_channels(netsh_output: str) -> Counter:
    """Netsh çıktısındaki `Channel` satırlarını bulur ve kanal sayılarını sayar."""
    pattern = re.compile(r"Channel\s*:\s*(\d+)", re.IGNORECASE)
    channels = []
    for line in netsh_output.splitlines():
        m = pattern.search(line)
        if m:
            channels.append(int(m.group(1)))
    return Counter(channels)

def _best_of_common(ch_counts: Counter, candidates: Tuple[int, ...] = (1, 6, 11)) -> Tuple[int, int]:
    """Aday kanallar (1,6,11) içinde en az AP'ye sahip olanı döndürür.
    Eğer aday yoksa tüm kanallar arasından en düşük sayıyı seçer.
    """
    candidate_counts = {ch: ch_counts.get(ch, 0) for ch in candidates}
    best = min(candidate_counts, key=lambda ch: (candidate_counts[ch], ch))
    return best, candidate_counts[best]

def _log(message: str) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    LOG_FILE.write_text(f"{timestamp} | {message}\n", encoding="utf-8", append=True)

def run_once() -> str:
    output = _run_netsh()
    if not output:
        return "netsh komutu çalıştırılamadı ya da çıktı alınamadı."
    counts = _extract_channels(output)
    if not counts:
        return "Mevcut Wi‑Fi ağları bulunamadı."
    best_ch, ap_cnt = _best_of_common(counts)
    lines = [
        f"En iyi kanal: {best_ch} ({ap_cnt} AP)",
        "Kanal dağılımı (AP sayısı):",
    ]
    for ch in sorted(counts):
        lines.append(f"  {ch}: {counts[ch]}")
    return "\n".join(lines)

def run_daemon(interval: int = 300) -> None:
    while True:
        try:
            result = run_once()
            _log(result)
        except Exception as e:  # pragma: no cover – safety net
            _log(f"Hata: {e}")
        time.sleep(interval)

def main() -> None:
    parser = argparse.ArgumentParser(description="Wi‑Fi kanal tarama aracı")
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Sürekli çalıştır ve log dosyasına ekle",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=300,
        help="Daemon modunda tarama periyodu (saniye)",
    )
    args = parser.parse_args()
    if args.daemon:
        run_daemon(args.interval)
    else:
        print(run_once())

if __name__ == "__main__":
    main()
