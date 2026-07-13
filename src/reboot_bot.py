"""reboot_bot.py

Modem otomatik yeniden başlatma botu (Windows, Selenium).

Bu script iki modda çalışabilir:
- Tek sefer (`python -m src.reboot_bot --once`)
- Daemon (`python -m src.reboot_bot --daemon`)
  Daemon modunda her 7 gün (haftada bir) modem arayüzüne girerek reboot butonuna
  tıklar ve `logs/reboot_bot.log` dosyasına zaman damgasıyla kaydeder.

Kullanıcı adı ve şifre **çevre değişkenleri** üzerinden okunur:
    MODEM_USER, MODEM_PASS, MODEM_URL
Aksi takdirde script interaktif olarak sorar.
"""

import os
import time
import argparse
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager

LOG_FILE = Path(__file__).resolve().parents[1] / "logs" / "reboot_bot.log"
DEFAULT_INTERVAL = 7 * 24 * 60 * 60  # 1 week in seconds

def _log(message: str) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    LOG_FILE.write_text(f"{timestamp} | {message}\n", encoding="utf-8", append=True)

def _get_credentials():
    user = os.getenv("MODEM_USER")
    pwd = os.getenv("MODEM_PASS")
    url = os.getenv("MODEM_URL")
    if not all([user, pwd, url]):
        # fallback to prompt (simple input) – note that this will block if run as daemon
        print("Modem erişim bilgileri bulunamadı. Çevre değişkenlerini (MODEM_USER, MODEM_PASS, MODEM_URL) ayarlayın.")
        raise RuntimeError("Modem credentials missing")
    return user, pwd, url

def _reboot_once() -> None:
    user, pwd, url = _get_credentials()
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=options)
    try:
        driver.get(url)
        # örnek login akışı – kullanıcı adı ve şifre alanları ID veya name ile bulunabilir
        # Bu kısım modem arayüzüne göre özelleştirilmeli.
        driver.find_element(By.NAME, "username").send_keys(user)
        driver.find_element(By.NAME, "password").send_keys(pwd)
        driver.find_element(By.XPATH, "//button[contains(text(),'Login')]").click()
        time.sleep(2)  # login sonrası bekle
        # reboot butonu – örnek XPath, gerçek arayüze göre değiştirilecek
        reboot_btn = driver.find_element(By.XPATH, "//button[contains(text(),'Reboot')]")
        reboot_btn.click()
        _log("Modem reboot komutu gönderildi.")
    except Exception as e:
        _log(f"Reboot hatası: {e}")
    finally:
        driver.quit()

def run_daemon(interval: int = DEFAULT_INTERVAL) -> None:
    while True:
        try:
            _reboot_once()
        except Exception as e:
            _log(f"Daemon hata: {e}")
        time.sleep(interval)

def main() -> None:
    parser = argparse.ArgumentParser(description="Modem otomatik reboot botu")
    parser.add_argument("--daemon", action="store_true", help="Sürekli çalıştır (haftalık)")
    parser.add_argument("--once", action="store_true", help="Tek sefer reboot yap")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL, help="Daemon periyodu (saniye)")
    args = parser.parse_args()
    if args.once:
        _reboot_once()
    elif args.daemon:
        run_daemon(args.interval)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
