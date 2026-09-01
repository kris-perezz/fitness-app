#!/usr/bin/env python3
"""Phase 1 -- harvest schema.org Recipe JSON-LD from the three Filipino recipe sites.

Stdlib only. Three stages, each resumable:

  python harvest.py urls     -> urls.txt        (sitemap enumeration)
  python harvest.py fetch    -> cache/*.html    (polite, cached, resumable)
  python harvest.py extract  -> corpus.jsonl    (JSON-LD Recipe blocks only)

Only the JSON-LD fields are kept: name, recipeIngredient, recipeYield, and the
published nutrition block -- the last one as a Phase 5 sanity bound, never an input.
"""
import gzip, hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser

SITES = {
    "panlasangpinoy.com": "https://panlasangpinoy.com/sitemap_index.xml",
    "kawalingpinoy.com": "https://www.kawalingpinoy.com/sitemap_index.xml",
    "foxyfolksy.com": "https://www.foxyfolksy.com/sitemap_index.xml",
}
UA = "fitness-app-catalog/0.1 (personal nutrition database; contact kristianperez.0927@gmail.com)"
DELAY = 1.5           # seconds between requests to the same host
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")

SKIP_SITEMAP = re.compile(r"(category|tag|author|attachment|web-stor|page-sitemap)", re.I)
SKIP_URL = re.compile(r"/(category|tag|author|wp-admin|web-stories)/|\?", re.I)


def get(url, retries=3):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Encoding": "gzip", "Accept": "*/*"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return raw
        except urllib.error.HTTPError as e:
            if e.code in (404, 410, 403):
                raise
            time.sleep(3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("giving up on " + url)


def locs(xml):
    return re.findall(rb"<loc>\s*([^<\s]+)\s*</loc>", xml)


def stage_urls():
    out = []
    for host, index in SITES.items():
        try:
            idx = get(index)
        except Exception as e:
            print(f"! {host}: {e}", file=sys.stderr)
            continue
        subs = [u.decode() for u in locs(idx)]
        subs = [u for u in subs if not SKIP_SITEMAP.search(u)]
        print(f"{host}: {len(subs)} sub-sitemaps")
        for s in subs:
            time.sleep(DELAY)
            try:
                body = get(s)
            except Exception as e:
                print(f"  ! {s}: {e}", file=sys.stderr)
                continue
            if s.endswith(".gz"):
                body = gzip.decompress(body)
            urls = [u.decode() for u in locs(body)]
            urls = [u for u in urls if not SKIP_URL.search(u) and u.count("/") > 3]
            print(f"  {s} -> {len(urls)}")
            out += urls
    out = sorted(set(out))
    with open(os.path.join(HERE, "urls.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"total {len(out)} URLs -> urls.txt")


def cache_path(url):
    return os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".html")


def stage_fetch():
    urls = [l.strip() for l in open(os.path.join(HERE, "urls.txt"), encoding="utf-8") if l.strip()]
    todo = [u for u in urls if not os.path.exists(cache_path(u))]
    print(f"{len(urls)} URLs, {len(urls) - len(todo)} cached, {len(todo)} to fetch", flush=True)
    last = {}
    for i, u in enumerate(todo, 1):
        host = urllib.parse.urlparse(u).netloc
        wait = DELAY - (time.time() - last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        last[host] = time.time()
        try:
            body = get(u)
        except Exception as e:
            print(f"! {u}: {e}", file=sys.stderr)
            body = b""
        with open(cache_path(u), "wb") as f:
            f.write(body)
        if i % 100 == 0:
            print(f"  {i}/{len(todo)}", flush=True)
    print("fetch done")


class LDExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks, self._grab, self._buf = [], False, []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type", "").strip() == "application/ld+json":
            self._grab, self._buf = True, []

    def handle_data(self, data):
        if self._grab:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._grab:
            self.blocks.append("".join(self._buf))
            self._grab = False


def walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


def is_recipe(d):
    t = d.get("@type")
    return t == "Recipe" or (isinstance(t, list) and "Recipe" in t)


def stage_extract():
    urls = [l.strip() for l in open(os.path.join(HERE, "urls.txt"), encoding="utf-8") if l.strip()]
    kept = empty = norecipe = broken = 0
    with open(os.path.join(HERE, "corpus.jsonl"), "w", encoding="utf-8") as out:
        for u in urls:
            p = cache_path(u)
            if not os.path.exists(p) or os.path.getsize(p) == 0:
                empty += 1
                continue
            html = open(p, "rb").read().decode("utf-8", "replace")
            ex = LDExtractor()
            try:
                ex.feed(html)
            except Exception:
                broken += 1
                continue
            recipe = None
            for b in ex.blocks:
                try:
                    data = json.loads(b)
                except Exception:
                    continue
                for d in walk(data):
                    if is_recipe(d):
                        recipe = d
                        break
                if recipe:
                    break
            if not recipe:
                norecipe += 1
                continue
            ing = recipe.get("recipeIngredient") or recipe.get("ingredients") or []
            if isinstance(ing, str):
                ing = [ing]
            if not ing:
                norecipe += 1
                continue
            out.write(json.dumps({
                "url": u,
                "site": u.split("/")[2],
                "name": recipe.get("name"),
                "category": recipe.get("recipeCategory"),
                "cuisine": recipe.get("recipeCuisine"),
                "ingredients": ing,
                "yield": recipe.get("recipeYield"),
                "published_nutrition": recipe.get("nutrition"),
            }, ensure_ascii=False) + "\n")
            kept += 1
    print(f"recipes {kept} | no-recipe {norecipe} | uncached/empty {empty} | unparsable {broken}")


if __name__ == "__main__":
    os.makedirs(CACHE, exist_ok=True)
    stage = sys.argv[1] if len(sys.argv) > 1 else "urls"
    {"urls": stage_urls, "fetch": stage_fetch, "extract": stage_extract}[stage]()
