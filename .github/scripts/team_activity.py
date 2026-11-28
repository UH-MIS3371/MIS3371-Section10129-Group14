"""Builds Assets/team-activity.svg: commits per team member per week, for the whole project.

Run from the repository root:  python .github/scripts/team_activity.py
Commits by bots are skipped. Names that belong to one person are merged with ALIASES.
"""
import subprocess
from collections import defaultdict, Counter
from datetime import date, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

# Lower-case git author name -> the name shown on the graph.
ALIASES = {
    "austinnguyen1": "Austin Nguyen", "ausnguy": "Austin Nguyen", "austin nguyen": "Austin Nguyen",
    "smusetti-star": "Sophia Musetti", "sophia musetti": "Sophia Musetti",
    "agah duzenli": "Agah Duzenli", "agahdznl": "Agah Duzenli",
    "cloudycloudcloudy": "Benjamin Nguyen", "truecloudias": "Benjamin Nguyen", "benjamin n": "Benjamin Nguyen",
    "aryanairv": "Arya Nair", "arya nair": "Arya Nair",
    "shayaandawra": "Shayaan Dawra", "shayaan dawra": "Shayaan Dawra",
}

out = subprocess.check_output(
    ["git", "log", "--no-merges", "--date=short", "--pretty=format:%ad%x09%aN%x09%aE"]
).decode("utf-8", errors="replace")

records = []
for line in out.splitlines():
    parts = line.split("\t")
    if len(parts) != 3:
        continue
    day, name, email = parts
    if "bot" in name.lower() or "bot" in email.lower():
        continue
    person = ALIASES.get(name.strip().lower(), name.strip())
    records.append((date.fromisoformat(day), person))

if not records:
    raise SystemExit("No commits found.")


def monday(d):
    return d - timedelta(days=d.weekday())


first = min(r[0] for r in records)
last = max(r[0] for r in records)
start = monday(first)
weeks = (monday(last) - start).days // 7 + 1

per_week = defaultdict(Counter)
for d, person in records:
    per_week[person][(monday(d) - start).days // 7] += 1

people = sorted(per_week, key=lambda p: (-sum(per_week[p].values()), p))
total = len(records)
week_totals = [sum(per_week[p][w] for p in people) for w in range(weeks)]

cell_w, cell_h, gap = 30, 24, 4
step = cell_w + gap
left = 190
right = 250
top = 128
row_h = cell_h + 10
grid_w = weeks * step
width = left + grid_w + right
bars_y = top + len(people) * row_h + 14
height = bars_y + 86

LEVELS = [(1, 2, "#9be9a8"), (3, 5, "#40c463"), (6, 10, "#30a14e"), (11, 10**6, "#216e39")]


def level(count):
    for lo, hi, color in LEVELS:
        if lo <= count <= hi:
            return color
    return None


s = []
s.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="MarketStreet commits per team member per week">')
s.append("""<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #1f2328; }
  .card { fill: #ffffff; stroke: #d0d7de; }
  .muted { fill: #59636e; }
  .empty { fill: #eaeef2; }
  .num { fill: #ffffff; font-weight: 600; }
  .num.light { fill: #1f2328; }
  .bar { fill: #2da44e; }
  .track { fill: #eaeef2; }
  .wk { fill: #8c959f; }
  @media (prefers-color-scheme: dark) {
    text { fill: #e6edf3; }
    .card { fill: #0d1117; stroke: #30363d; }
    .muted { fill: #9198a1; }
    .empty { fill: #161b22; }
    .num.light { fill: #0d1117; }
    .track { fill: #161b22; }
    .wk { fill: #6e7681; }
  }
</style>""")
s.append(f'<rect class="card" x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" rx="12"/>')
s.append('<text x="24" y="38" font-size="22" font-weight="700">MarketStreet team activity</text>')
s.append(
    f'<text class="muted" x="24" y="60" font-size="13">{len(people)} contributors · {total} commits · '
    f'{first.strftime("%b %d")} – {last.strftime("%b %d, %Y")} · {weeks} weeks, nothing hidden</text>'
)

# Legend (top right).
lx = width - 24 - 5 * 18 - 70
s.append(f'<text class="muted" x="{lx}" y="40" font-size="11">Fewer</text>')
for i, color in enumerate(["#eaeef2"] + [c for _, _, c in LEVELS]):
    cls = ' class="empty"' if i == 0 else f' fill="{color}"'
    s.append(f'<rect x="{lx + 38 + i * 18}" y="29" width="14" height="14" rx="3"{cls}/>')
s.append(f'<text class="muted" x="{lx + 38 + 5 * 18 + 4}" y="40" font-size="11">More</text>')

# Month markers and week numbers.
seen = set()
for w in range(weeks):
    d = start + timedelta(weeks=w)
    x = left + w * step
    key = (d.year, d.month)
    if key not in seen:
        seen.add(key)
        s.append(f'<text x="{x}" y="96" font-size="12" font-weight="600">{d.strftime("%b")}</text>')
    s.append(f'<text class="wk" x="{x + cell_w / 2}" y="116" font-size="10" text-anchor="middle">{d.strftime("%d").lstrip("0")}</text>')
s.append(f'<text class="muted" x="{left - 12}" y="116" font-size="10" text-anchor="end">week of</text>')

for row, person in enumerate(people):
    y = top + row * row_h
    n = sum(per_week[person].values())
    s.append(f'<text x="24" y="{y + 16}" font-size="14" font-weight="600">{escape(person)}</text>')
    for w in range(weeks):
        c = per_week[person][w]
        x = left + w * step
        d = start + timedelta(weeks=w)
        tip = f'{person}, week of {d:%b %d}: {c} commit{"s" if c != 1 else ""}'
        if c == 0:
            s.append(f'<rect class="empty" x="{x}" y="{y}" width="{cell_w}" height="{cell_h}" rx="4"><title>{escape(tip)}</title></rect>')
        else:
            color = level(c)
            s.append(f'<rect x="{x}" y="{y}" width="{cell_w}" height="{cell_h}" rx="4" fill="{color}"><title>{escape(tip)}</title></rect>')
            cls = "num light" if color == "#9be9a8" else "num"
            s.append(f'<text class="{cls}" x="{x + cell_w / 2}" y="{y + 16}" font-size="12" text-anchor="middle">{c}</text>')
    bx = left + grid_w + 16
    bw = 120
    share = n / total
    pct = "&lt;1%" if share < 0.005 else f"{share * 100:.0f}%"
    s.append(f'<rect class="track" x="{bx}" y="{y + 6}" width="{bw}" height="12" rx="6"/>')
    s.append(f'<rect class="bar" x="{bx}" y="{y + 6}" width="{max(bw * share, 4):.1f}" height="12" rx="6"/>')
    s.append(f'<text x="{bx + bw + 10}" y="{y + 17}" font-size="13" font-weight="600">{n}</text>')
    s.append(f'<text class="muted" x="{bx + bw + 10 + 34}" y="{y + 17}" font-size="11">{pct}</text>')

# Team total per week.
s.append(f'<text class="muted" x="24" y="{bars_y + 30}" font-size="12">Team total per week</text>')
peak = max(week_totals) or 1
for w, t in enumerate(week_totals):
    x = left + w * step
    h = 44 * t / peak
    s.append(f'<rect class="bar" x="{x}" y="{bars_y + 50 - h:.1f}" width="{cell_w}" height="{max(h, 1):.1f}" rx="3"><title>Week of {(start + timedelta(weeks=w)):%b %d}: {t} commits</title></rect>')
    if t:
        s.append(f'<text class="muted" x="{x + cell_w / 2}" y="{bars_y + 46 - h:.1f}" font-size="10" text-anchor="middle">{t}</text>')

s.append("</svg>")
Path("Assets").mkdir(exist_ok=True)
Path("Assets/team-activity.svg").write_text("\n".join(s), encoding="utf-8")
print(f"Wrote Assets/team-activity.svg: {len(people)} people, {total} commits, {weeks} weeks")
