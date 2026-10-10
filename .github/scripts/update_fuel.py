#!/usr/bin/env python3
"""Автооновлення цін на пальне «Укрнафти» у data/fuel.yaml.

Джерело — index.minfin.com.ua, таблиця «цены операторов» по Дніпропетровській
області, рядок UKRNAFTA (дані «Консалтингової групи А-95»). Офіційний сайт
«Укрнафти» на запити з серверів GitHub відповідає 403, тож звідти брати не можна.

Щоб бот не воював із ручними правками:
  • auto: false у файлі — бот файл не чіпає взагалі;
  • дата даних має бути СТРОГО новішою за updated у файлі. Якщо дата у файлі
    така сама чи новіша, там свіжіша інформація (найпевніше, внесена руками),
    і бот її не перетирає;
  • якщо сторінка змінилась або ціна підозріла (стрибок понад 20 %, не схоже
    на ціну), файл лишається як був, а запуск падає з поясненням — GitHub
    надішле лист.
  • якщо джерело просто недоступне, бот тихо чекає наступного запуску, і
    лише коли ціни у файлі старші за STALE_DAYS днів — падає, щоб про це
    дізналась людина.

Запуск:  update_fuel.py data/fuel.yaml [--html сторінка.html] [--dry-run]
"""
import argparse
import datetime as dt
import html
import re
import sys
import urllib.request
from pathlib import Path

import yaml

SOURCE = "https://index.minfin.com.ua/markets/fuel/reg/dnepropetrovskaya/"
OPERATOR = "UKRNAFTA"
# Колонка таблиці (кирилична «А») → назва пального в data/fuel.yaml
COLUMNS = [("А 95+", "95E"), ("А 95", "95"), ("А 92", "92"),
           ("ДТ", "ДП"), ("Газ", "Газ")]
MAX_JUMP = 0.20      # більший стрибок за раз — найпевніше, з'їхали колонки
STALE_DAYS = 4       # скільки днів мовчання джерела терпимо без тривоги
USER_AGENT = "Mozilla/5.0 (compatible; vilnohirsk-fuel-bot/1.0; +https://vilnohirsk.online)"


class SourceError(Exception):
    """Джерело недоступне — тимчасово, наступний запуск спробує знову."""


class FormatError(Exception):
    """Сторінка змінилась або дані підозрілі — потрібна увага людини."""


def kyiv_today():
    # Київ: UTC+2 узимку, UTC+3 улітку. Для «скільки днів тому» точності в
    # годину досить, тож беремо +2 і не тягнемо tzdata.
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=2)).date()


def clean(fragment):
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = html.unescape(text).replace(" ", " ").replace("­", "")
    return re.sub(r"\s+", " ", text).strip()


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "uk,ru;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", "replace")
    except Exception as exc:  # мережа, 4xx/5xx, таймаут — усе це «тимчасово»
        raise SourceError(f"{url}: {exc}") from exc


def parse_prices(page):
    """→ (дата даних, {"95E": "88.90", ...}) з таблиці операторів області."""
    for table in re.findall(r"(?is)<table\b.*?</table>", page):
        rows = []
        for tr in re.findall(r"(?is)<tr\b.*?</tr>", table):
            cells = [clean(c) for c in re.findall(r"(?is)<t[hd]\b[^>]*>(.*?)</t[hd]>", tr)]
            if cells:
                rows.append(cells)
        if not rows or rows[0][0] != "Оператор":
            continue

        # Ціни — завжди останні п'ять клітинок. Між назвою оператора й цінами
        # буває порожня клітинка під логотип, а в інших операторів порожніми
        # бувають і самі ціни (у WOG нема А-92), тож відкидати порожні НЕ можна:
        # колонки з'їдуть і газ опиниться в дизелі.
        head = rows[0][-len(COLUMNS):]
        if head != [col for col, _ in COLUMNS]:
            raise FormatError(f"заголовки колонок змінились: {rows[0]}")

        caption = re.search(r"(?is)<caption\b[^>]*>(.*?)</caption>", table)
        caption = clean(caption.group(1)) if caption else ""
        m = re.search(r"на\s+(\d{1,2})\.(\d{1,2})\.(\d{4})", caption)
        if not m:
            raise FormatError(f"не знайшов дату в підписі таблиці: {caption!r}")
        day = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))

        for row in rows[1:]:
            if row[0].strip().upper() != OPERATOR:
                continue
            prices = {}
            for (col, name), value in zip(COLUMNS, row[-len(COLUMNS):]):
                if not re.fullmatch(r"\d{2,3}[.,]\d{2}", value):
                    raise FormatError(f"«{col}» не схоже на ціну: {value!r} (рядок {row})")
                number = float(value.replace(",", "."))
                if not 20 <= number <= 250:
                    raise FormatError(f"«{col}» = {number} — поза межами розумного")
                prices[name] = f"{number:.2f}"
            return day, prices
        raise FormatError(f"у таблиці операторів нема рядка {OPERATOR}")
    raise FormatError("не знайшов на сторінці таблицю операторів")


def auto_enabled(value):
    """auto пишуть руками, тож розуміємо не лише булеве false: «"false"» у
    лапках, «ні», «no», «off», «0» — теж «вимкнено». Нема рядка — увімкнено."""
    if value is None or isinstance(value, bool):
        return value is not False
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() not in {"false", "no", "off", "0", "ні", "нi", "нет", "вимк", "вимкнено"}


def parse_day(value):
    m = re.fullmatch(r"\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*", str(value or ""))
    if not m:
        return None
    try:
        return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def rewrite(text, day, prices):
    """Міняє лише рядки price і updated — коментарі, кольори й порядок лишаються."""
    out, current, seen = [], None, set()
    for line in text.split("\n"):
        item = re.match(r'^\s*-\s*name:\s*"([^"]*)"', line)
        if item:
            current = item.group(1)
        elif re.match(r"^\s*-\s", line):
            current = None
        price = re.match(r'^(\s*price:\s*)"[^"]*"(.*)$', line)
        if price and current in prices:
            line = f'{price.group(1)}"{prices[current]}"{price.group(2)}'
            seen.add(current)
        out.append(line)
    text = "\n".join(out)
    text, n = re.subn(r'(?m)^updated:\s*"[^"]*"', f'updated: "{day:%d.%m.%Y}"', text, count=1)
    if n != 1:
        raise FormatError('у файлі нема рядка updated: "..."')
    return text, seen


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("file", type=Path)
    ap.add_argument("--html", type=Path, help="розібрати збережену сторінку замість завантаження")
    ap.add_argument("--dry-run", action="store_true", help="лише показати, що змінилось б")
    args = ap.parse_args()

    original = args.file.read_text(encoding="utf-8")
    data = yaml.safe_load(original) or {}
    if not auto_enabled(data.get("auto")):
        print(f"auto: {data.get('auto')} — ціни ведуться вручну, файл не чіпаю")
        return 0
    have = parse_day(data.get("updated"))

    try:
        page = args.html.read_text(encoding="utf-8") if args.html else fetch(SOURCE)
    except SourceError as exc:
        age = (kyiv_today() - have).days if have else None
        if age is not None and age > STALE_DAYS:
            print(f"::error::Джерело недоступне, а ціни у файлі вже {age} дн. без оновлення: {exc}")
            return 1
        print(f"::warning::Джерело недоступне, спробую наступного разу: {exc}")
        return 0

    try:
        day, prices = parse_prices(page)
        if day > kyiv_today() + dt.timedelta(days=1):
            raise FormatError(f"дата даних {day} — у майбутньому")
        print(f"мінфін: {day:%d.%m.%Y}  " + "  ".join(f"{k} {v}" for k, v in prices.items()))
        print(f"у файлі: {data.get('updated')}")
        if have and day <= have:
            print("у файлі не старіші дані — не чіпаю")
            return 0

        old = {str(f.get("name")): f.get("price") for f in data.get("fuels") or [] if isinstance(f, dict)}
        for name, new in prices.items():
            try:
                before = float(str(old.get(name)).replace(",", "."))
            except ValueError:
                continue  # у файлі «—» чи порожньо — порівнювати нема з чим
            if before and abs(float(new) - before) / before > MAX_JUMP:
                raise FormatError(f"{name}: {before:.2f} → {new} — стрибок понад {MAX_JUMP:.0%}, схоже на помилку")

        updated, seen = rewrite(original, day, prices)
        check = yaml.safe_load(updated) or {}
        # Перевіряємо результат так само, як читатиме сайт: змінились лише
        # ціни й дата, а решта (show, auto, назви, кольори) — та сама.
        strip = lambda d: {**d, "updated": None, "fuels": [{**f, "price": None} for f in d.get("fuels") or []]}
        if strip(check) != strip(data):
            raise FormatError("після заміни змінилось щось, крім цін і дати — зупиняюсь")
        got = {str(f.get("name")): f.get("price") for f in check.get("fuels") or []}
        if any(got.get(n) != prices[n] for n in seen) or check.get("updated") != f"{day:%d.%m.%Y}":
            raise FormatError("після заміни ціни у файлі не ті, що мали бути")
    except FormatError as exc:
        print(f"::error::Ціни НЕ оновлено: {exc}")
        return 1

    missing = [n for n in prices if n not in seen]
    if missing:
        print("::notice::У файлі нема пального: " + ", ".join(missing) + " — пропущено")
    if updated == original:
        print("нічого не змінилось")
        return 0
    if args.dry_run:
        print("--dry-run: файл не записую")
        return 0
    args.file.write_text(updated, encoding="utf-8")
    print(f"записано: станом на {day:%d.%m.%Y}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
