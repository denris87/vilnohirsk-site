#!/usr/bin/env python3
"""Графік світла: сьогоднішній лишається до кінця доби.

Коли в data/svitlo.yaml публікують графік на наступний день (дата updated стала
пізнішою), попередній вміст файлу зберігаємо в data/svitlo-prev.yaml. Сайт показує
його вкладкою «Сьогодні», поки триває та доба; опівночі він стає непотрібним сам.
Правки графіка на ту саму дату (коли змінюється лише час чи revised) копію не чіпають.

Запуск (у роботі .github/workflows/svitlo-today.yml):
    BEFORE=<коміт до пушу> python3 .github/scripts/svitlo_prev.py
"""
import datetime
import os
import re
import subprocess
import sys

SRC = "data/svitlo.yaml"
DST = "data/svitlo-prev.yaml"


def schedule_day(text):
    """Дата графіка з рядка updated: "ДД.ММ.РРРР" (None, якщо її немає)."""
    m = re.search(r'^updated:\s*["\']?(\d{1,2})\.(\d{1,2})\.(\d{4})', text or "", re.M)
    if not m:
        return None
    try:
        return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def main():
    before = os.environ.get("BEFORE", "").strip()
    if not before or set(before) == {"0"}:
        print("Немає попереднього коміту — нічого зберігати")
        return 0
    try:
        old = subprocess.run(["git", "show", f"{before}:{SRC}"], check=True,
                             capture_output=True, text=True).stdout
    except subprocess.CalledProcessError:
        print("Попередньої версії графіка немає — нічого зберігати")
        return 0
    with open(SRC, encoding="utf-8") as fh:
        new = fh.read()

    old_day, new_day = schedule_day(old), schedule_day(new)
    print(f"Було: графік на {old_day}, стало: на {new_day}")
    if not old_day or not new_day or new_day <= old_day:
        print("Дата графіка не перейшла на наступний день — копію не чіпаємо")
        return 0

    head = (
        f"# ⚙️ Автоматична копія графіка на {old_day:%d.%m.%Y}. Її зберіг GitHub, коли вийшов графік\n"
        f"#    на {new_day:%d.%m.%Y}, щоб сайт показував сьогоднішній графік до кінця доби\n"
        f"#    (вкладка «Сьогодні»). Редагувати не потрібно. Якщо ж треба виправити час\n"
        f"#    на сьогодні, коли в svitlo.yaml уже графік на завтра, — правте тут.\n\n"
    )
    with open(DST, "w", encoding="utf-8") as fh:
        fh.write(head + old)
    print(f"Збережено {DST}: графік на {old_day:%d.%m.%Y}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
