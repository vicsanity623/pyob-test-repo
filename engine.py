import hashlib
import json
import os
import zipfile
import shutil
from datetime import datetime, timezone
import random
import time
import re
from typing import List, Dict, Optional
from moviepy import VideoFileClip, AudioFileClip
from ledger_manager import load_ledger, save_ledger

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
MEDIA_FOLDER = "media"
MAX_FILE_BYTES = 100 * 1024 * 1024
REPO_WARN_BYTES = 950 * 1024 * 1024
ZIP_PREFIX = "media_archive"
MIN_VIDEO_BYTES = 40 * 1024
MIN_SCORE = 10
os.makedirs(MEDIA_FOLDER, exist_ok=True)

REDDIT_SUBS = [
    "UFOs", "UAP", "Aliens", "UFObelievers", "UFOdocumentaries",
    "UFOscience", "Mufon", "Experiencers", "TheUAPReport", "Skies_Above",
    "ufo", "NHI", "DisclosureFiles", "Paranormal", "conspiracy",
    "StrangeEarth", "UnexplainedPhenomena"
]

LEMMY_INSTANCES = ["https://lemmy.world", "https://lemmy.ml"]
LEMMY_COMMUNITIES = ["ufos", "aliens", "uap", "strangeearth", "paranormal", "conspiracy"]
FOURCHAN_BOARD = "x"

POSITIVE_KEYWORDS = ["ufo", "uap", "orb", "saucer", "tic tac", "tic-tac", "triangle", "sighting", "craft", "phenomenon", "footage", "video", "nhi", "unidentified", "aerial", "anomalous", "encounter", "lights in the sky"]
NEGATIVE_KEYWORDS = ["furry", "meme", "cgi", "vfx", "blender", "movie", "game", "art", "drawing", "tattoo", "fiction", "joke", "animation", "render", "satire", "deepfake", "photoshop", "minecraft"]

# ─────────────────────────────────────────────────────────────────────────────
# PLAYWRIGHT STEALTH REDDIT SCRAPER (v2.x compatible)
# ─────────────────────────────────────────────────────────────────────────────
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

def fetch_reddit_sources_playwright() -> List[Dict]:
    results = []
    subs = REDDIT_SUBS.copy()
    random.shuffle(subs)
    selected_subs = subs[:2]  # Very low load

    with Stealth().use_sync(sync_playwright()) as p:  # Modern v2 API
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
            ]
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=random.choice([
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0"
            ]),
            locale="en-US",
            timezone_id="America/New_York"
        )
        page = context.new_page()

        for sub in selected_subs:
            print(f" 📡 Playwright Stealth → /r/{sub}")
            try:
                sort = random.choice(["hot", "new", "rising"])
                url = f"https://www.reddit.com/r/{sub}/{sort}/"
                page.goto(url, wait_until="networkidle", timeout=60000)

                # Human-like behavior
                time.sleep(random.uniform(2, 4))
                page.evaluate("window.scrollBy(0, 700)")
                time.sleep(random.uniform(1.5, 3.5))
                page.evaluate("window.scrollBy(0, 900)")

                # Extract posts
                posts = page.evaluate("""() => {
                    const posts = [];
                    document.querySelectorAll('shreddit-post, div[data-testid="post-container"]').forEach(post => {
                        const titleEl = post.querySelector('h3, [slot="title"]');
                        const scoreEl = post.querySelector('[id^="vote-arrows"] span, .score');
                        const link = post.querySelector('a');
                        if (titleEl && link) {
                            const title = titleEl.innerText.trim();
                            let score = 0;
                            if (scoreEl) {
                                const scoreText = scoreEl.innerText.replace(/[^0-9k]/g, '');
                                score = scoreText.includes('k') ? parseFloat(scoreText) * 1000 : parseInt(scoreText);
                            }
                            const permalink = link.href;
                            const isVideo = post.querySelector('video') || permalink.includes('v.redd.it') || title.toLowerCase().includes('video');
                            if (isVideo && score >= 10) {
                                posts.push({title, score, permalink, url: permalink});
                            }
                        }
                    });
                    return posts.slice(0, 6);
                }""")

                for post in posts:
                    title = post["title"]
                    body = ""
                    if not any(kw in (title + body).lower() for kw in POSITIVE_KEYWORDS):
                        continue
                    if any(kw in (title + body).lower() for kw in NEGATIVE_KEYWORDS):
                        continue

                    results.append({
                        "source": f"Reddit /r/{sub}",
                        "author": "Anonymous",
                        "title": title,
                        "description": body,
                        "media_url": post["url"],
                        "thumbnail_url": "",
                        "media_type": "video",
                        "audio_url": "",
                        "source_url": post["permalink"],
                        "score": post["score"],
                        "platform": "reddit_playwright"
                    })
                print(f" ✅ Extracted {len(posts)} candidates from /r/{sub}")
            except Exception as e:
                print(f" ✗ Playwright error on /r/{sub}: {e}")
            time.sleep(random.uniform(10, 20))  # Long cooldown

        browser.close()
    return results

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS (Download, Merge, etc.)
# ─────────────────────────────────────────────────────────────────────────────
def _download(url: str, dest: str, max_bytes: int = MAX_FILE_BYTES) -> bool:
    import requests
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"}
    try:
        r = requests.get(url, stream=True, timeout=40, headers=headers)
        if r.status_code == 200:
            with open(dest, "wb") as f:
                for chunk in r.iter_content(16384):
                    f.write(chunk)
                    if f.tell() > max_bytes:
                        return False
            return True
    except Exception as e:
        print(f" ✗ Download failed: {e}")
    return False

def _valid(path: str) -> bool:
    return os.path.exists(path) and os.path.getsize(path) >= MIN_VIDEO_BYTES

def _reddit_audio_url(video_url: str) -> str:
    base = video_url.split("?")[0]
    return re.sub(r"/DASH_[^/]+\.mp4$", "/DASH_audio.mp4", base)

def merge_reddit_video(video_url: str, audio_url: str, final_path: str) -> bool:
    v_tmp = final_path + ".v.tmp"
    a_tmp = final_path + ".a.tmp"
    try:
        print(f" ↓ video track …")
        if not _download(video_url, v_tmp) or not _valid(v_tmp):
            return False
        print(f" ↓ audio track …")
        has_audio = _download(audio_url, a_tmp) and _valid(a_tmp)
        if has_audio:
            vc = VideoFileClip(v_tmp)
            ac = AudioFileClip(a_tmp)
            print(f" ⚙ merging …")
            vc.with_audio(ac).write_videofile(final_path, fps=30, codec="libx264", audio_codec="aac", audio_bitrate="192k", logger=None)
            vc.close(); ac.close()
        else:
            shutil.copy(v_tmp, final_path)
        return _valid(final_path)
    except Exception as e:
        print(f" ✗ Merge error: {e}")
        return False
    finally:
        for p in (v_tmp, a_tmp):
            if os.path.exists(p):
                try: os.remove(p)
                except: pass

def fetch_lemmy_sources() -> List[Dict]:
    results = []
    for community in LEMMY_COMMUNITIES:
        success = False
        for instance in LEMMY_INSTANCES:
            print(f" 📡 Lemmy c/{community} via {instance}")
            headers = get_random_headers()
            try:
                url = f"{instance}/api/v3/post/list?community_name={community}&sort=New&limit=20"
                time.sleep(random.uniform(1.5, 4))
                r = requests.get(url, headers=headers, timeout=18)
                if r.status_code == 200:
                    data = r.json()
                    for item in data.get("posts", []):
                        post_data = item.get("post", {})
                        title = post_data.get("name", "")
                        body = post_data.get("body", "")
                        media_url = post_data.get("url", "")
                        if not media_url or not (media_url.lower().endswith((".mp4", ".webm", ".mov", ".gifv")) or "v.redd.it" in media_url):
                            continue
                        score = item.get("counts", {}).get("score", 0)
                        if not _passes_filter(title, body, score):
                            continue
                        creator = item.get("creator", {})
                        audio_url = ""
                        platform = "lemmy_direct"
                        if "v.redd.it" in media_url:
                            media_url = media_url.split("?")[0]
                            if not media_url.endswith(".mp4"):
                                media_url = f"{media_url}/DASH_720.mp4"
                            audio_url = _reddit_audio_url(media_url)
                            platform = "reddit_native"
                        results.append({
                            "source": f"Lemmy c/{community}",
                            "author": creator.get("name", "Anonymous"),
                            "title": title,
                            "description": body,
                            "media_url": media_url,
                            "thumbnail_url": post_data.get("thumbnail_url") or "",
                            "media_type": "video",
                            "audio_url": audio_url,
                            "source_url": post_data.get("ap_id") or f"{instance}/post/{post_data.get('id')}",
                            "score": max(0, score),
                            "platform": platform
                        })
                    success = True
                    break
            except Exception as e:
                print(f" Lemmy error: {e}")
            time.sleep(random.uniform(2, 5))
    return results

def fetch_4chan_sources() -> List[Dict]:
    print(f" 🍀 4chan /{FOURCHAN_BOARD}/ Deep-Thread Scan")
    results = []
    try:
        catalog_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json"
        r = requests.get(catalog_url, headers=get_random_headers(), timeout=12)
        if r.status_code != 200:
            return []
        catalog = r.json()
        target_threads = []
        for page in catalog[:6]:
            for thread in page.get("threads", []):
                comment = re.sub(r"<[^>]+>", " ", thread.get("com", ""))
                title = thread.get("sub", "")
                combined = (title + " " + comment).lower()
                if any(kw in combined for kw in POSITIVE_KEYWORDS) and not any(neg in combined for neg in NEGATIVE_KEYWORDS):
                    target_threads.append(thread.get("no"))
        target_threads = list(set(target_threads))[:5]
        processed = 0
        for thread_no in target_threads:
            try:
                thread_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/thread/{thread_no}.json"
                tr = requests.get(thread_url, headers=get_random_headers(), timeout=10)
                if tr.status_code != 200:
                    continue
                posts = tr.json().get("posts", [])
                for post in posts:
                    ext = post.get("ext", "")
                    if ext in (".webm", ".mp4"):
                        comment = re.sub(r"<[^>]+>", " ", post.get("com", ""))
                        post_title = post.get("sub") or comment[:80] or f"4chan reply {thread_no}"
                        tid = post["tim"]
                        results.append({
                            "source": f"4chan /{FOURCHAN_BOARD}/",
                            "author": post.get("name", "Anonymous"),
                            "title": post_title,
                            "description": comment,
                            "media_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tid}{ext}",
                            "thumbnail_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tid}s.jpg",
                            "media_type": "video",
                            "audio_url": "",
                            "source_url": f"https://boards.4channel.org/{FOURCHAN_BOARD}/thread/{thread_no}#p{post.get('no')}",
                            "score": 0,
                            "platform": "4chan"
                        })
                        processed += 1
            except:
                continue
            time.sleep(random.uniform(1.2, 3))
        print(f" 4chan scan found {processed} videos")
    except Exception as e:
        print(f" 4chan error: {e}")
    return results

def fetch_all_sources() -> List[Dict]:
    results = []
    try:
        results.extend(fetch_reddit_sources_playwright())
    except Exception as e:
        print(f"⚠️ Reddit Playwright error: {e}")
    try:
        results.extend(fetch_lemmy_sources())
    except Exception as e:
        print(f"⚠️ Lemmy error: {e}")
    try:
        results.extend(fetch_4chan_sources())
    except Exception as e:
        print(f"⚠️ 4chan error: {e}")
    random.shuffle(results)
    return results

# Archival functions (copy from your original)
def _zip_media_folder():
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = f"{ZIP_PREFIX}_{ts}.zip"
    print(f"🗜 Archiving → {out}")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in os.listdir(MEDIA_FOLDER):
            zf.write(os.path.join(MEDIA_FOLDER, f), arcname=f)
    shutil.rmtree(MEDIA_FOLDER)
    os.makedirs(MEDIA_FOLDER)

def check_and_zip_if_full():
    total = sum(os.path.getsize(os.path.join(MEDIA_FOLDER, f)) for f in os.listdir(MEDIA_FOLDER) if os.path.isfile(os.path.join(MEDIA_FOLDER, f)))
    if total >= REPO_WARN_BYTES:
        _zip_media_folder()

def build_ledger():
    print("🛸 AXIOM UAP — Playwright Stealth Edition\n")
    ledger = load_ledger()
    existing = {b["source_url"] for b in ledger}
    new_data = fetch_all_sources()
    added = 0
    for s in new_data:
        if s["source_url"] in existing:
            continue
        file_id = hashlib.md5(s["media_url"].encode()).hexdigest()
        final_path = os.path.join(MEDIA_FOLDER, f"{file_id}.mp4")
        local_url = f"./media/{file_id}.mp4"
        if not os.path.exists(final_path):
            print(f"\n📦 {s['title'][:60]}")
            if "reddit_playwright" in s.get("platform", ""):
                archived = merge_reddit_video(s["media_url"], s.get("audio_url", ""), final_path)
            else:
                archived = _download(s["media_url"], final_path)
            if not archived or not _valid(final_path):
                local_url = s["media_url"]
        # Save to ledger (same as before)
        timestamp = datetime.now(timezone.utc).isoformat()
        payload = f"{timestamp}|{s['source']}|{s['title']}|{s['media_url']}|{s['score']}"
        ledger.insert(0, {
            "timestamp": timestamp, "source": s["source"], "author": s["author"],
            "title": s["title"], "description": s["description"][:800],
            "media_url": local_url, "thumbnail_url": s.get("thumbnail_url", ""),
            "media_type": "video", "source_url": s["source_url"],
            "hash": hashlib.sha256(payload.encode()).hexdigest(),
            "score": s["score"], "platform": s.get("platform", "unknown")
        })
        existing.add(s["source_url"])
        added += 1
        time.sleep(random.uniform(4, 10))
    save_ledger(ledger)
    check_and_zip_if_full()
    print(f"\n✅ Done — {added} new sightings.")

if __name__ == "__main__":
    build_ledger()
