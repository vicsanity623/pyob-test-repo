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
import requests
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

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

# Removed dead subs, added HighStrangeness
REDDIT_SUBS = [
    "UFOs", "UAP", "Aliens", "UFObelievers", "HighStrangeness", 
    "UFOdocumentaries", "UFOscience", "Experiencers", "ufo", 
    "NHI", "DisclosureFiles", "Paranormal", "conspiracy", "StrangeEarth"
]

LEMMY_INSTANCES = ["https://lemmy.world", "https://lemmy.ml"]
LEMMY_COMMUNITIES = ["ufos", "aliens", "uap", "strangeearth", "paranormal", "conspiracy"]
FOURCHAN_BOARD = "x"

# Expanded keywords slightly
POSITIVE_KEYWORDS = ["ufo", "uap", "orb", "saucer", "tic tac", "tic-tac", "triangle", "sighting", "craft", "phenomenon", "footage", "video", "nhi", "unidentified", "aerial", "anomalous", "encounter", "lights in the sky", "alien", "sphere", "glowing", "cylinder"]
NEGATIVE_KEYWORDS = ["furry", "meme", "cgi", "vfx", "blender", "movie", "game", "art", "drawing", "tattoo", "fiction", "joke", "animation", "render", "satire", "deepfake", "photoshop", "minecraft"]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
]

def get_random_headers() -> Dict[str, str]:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
    }

def _passes_filter(title: str, body: str, score: int = MIN_SCORE) -> bool:
    combined = (title + " " + body).lower()
    if not any(kw in combined for kw in POSITIVE_KEYWORDS):
        return False
    if any(kw in combined for kw in NEGATIVE_KEYWORDS):
        return False
    return score >= MIN_SCORE

# ─────────────────────────────────────────────────────────────────────────────
# PLAYWRIGHT SCRAPERS (Reddit & Lemmy)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_reddit_sources(context) -> List[Dict]:
    results = []
    subs = REDDIT_SUBS.copy()
    random.shuffle(subs)
    selected_subs = subs[:4] # Checking 4 active subs instead of 2

    page = context.new_page()

    for sub in selected_subs:
        print(f" 📡 Reddit → /r/{sub}")
        try:
            sort = random.choice(["hot", "new", "top"])
            url = f"https://www.reddit.com/r/{sub}/{sort}/"
            page.goto(url, wait_until="networkidle", timeout=60000)

            for _ in range(4):
                time.sleep(random.uniform(1.5, 3))
                page.evaluate("window.scrollBy(0, 1500)")

            posts = page.evaluate("""() => {
                const posts = [];
                document.querySelectorAll('shreddit-post').forEach(post => {
                    const title = post.getAttribute('post-title') || '';
                    const permalink = post.getAttribute('permalink') || '';
                    const score = parseInt(post.getAttribute('score')) || 0;
                    const contentHref = post.getAttribute('content-href') || '';
                    
                    const isVideo = post.hasAttribute('is-video') || 
                                    contentHref.includes('v.redd.it') || 
                                    contentHref.includes('.mp4');
                                    
                    if (isVideo) {
                        posts.push({
                            title: title, score: score,
                            permalink: 'https://www.reddit.com' + permalink,
                            url: contentHref || ('https://www.reddit.com' + permalink)
                        });
                    }
                });
                return posts;
            }""")

            for post in posts:
                if not _passes_filter(post["title"], "", post["score"]):
                    continue

                results.append({
                    "source": f"Reddit /r/{sub}", "author": "Anonymous",
                    "title": post["title"], "description": "",
                    "media_url": post["url"], "thumbnail_url": "",
                    "media_type": "video", "audio_url": "",
                    "source_url": post["permalink"], "score": post["score"],
                    "platform": "reddit_playwright"
                })
            print(f"   ↳ ✅ Extracted {len(results)} matching videos")
        except Exception as e:
            print(f"   ↳ ✗ Error: {e}")
        time.sleep(random.uniform(5, 10))

    page.close()
    return results

def fetch_lemmy_sources(context) -> List[Dict]:
    results = []
    page = context.new_page()
    
    for community in LEMMY_COMMUNITIES:
        for instance in LEMMY_INSTANCES:
            print(f" 📡 Lemmy → c/{community} ({instance})")
            try:
                url = f"{instance}/api/v3/post/list?community_name={community}&sort=New&limit=20"
                # Using stealth browser to completely bypass Cloudflare
                page.goto(url, wait_until="networkidle", timeout=30000)
                
                # Extract the raw text from the browser body
                raw_content = page.locator("body").inner_text()
                
                if "cloudflare" in raw_content.lower() or "just a moment" in raw_content.lower():
                    print("   ↳ ✗ Cloudflare blocked the browser. Skipping.")
                    continue
                    
                data = json.loads(raw_content)
                posts_found = 0
                
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
                        
                    platform = "lemmy_direct"
                    audio_url = ""
                    if "v.redd.it" in media_url:
                        media_url = media_url.split("?")[0]
                        if not media_url.endswith(".mp4"):
                            media_url = f"{media_url}/DASH_720.mp4"
                        audio_url = _reddit_audio_url(media_url)
                        platform = "reddit_native"
                        
                    results.append({
                        "source": f"Lemmy c/{community}", "author": item.get("creator", {}).get("name", "Anonymous"),
                        "title": title, "description": body,
                        "media_url": media_url, "thumbnail_url": post_data.get("thumbnail_url") or "",
                        "media_type": "video", "audio_url": audio_url,
                        "source_url": post_data.get("ap_id") or f"{instance}/post/{post_data.get('id')}",
                        "score": max(0, score), "platform": platform
                    })
                    posts_found += 1
                
                if posts_found > 0:
                    print(f"   ↳ ✅ Extracted {posts_found} videos")
                break # Move to next community if instance worked
            except json.JSONDecodeError:
                print("   ↳ ✗ Failed to parse JSON (Possible block).")
            except Exception as e:
                print(f"   ↳ ✗ Network error: {e}")
            time.sleep(random.uniform(2, 5))
            
    page.close()
    return results

# ─────────────────────────────────────────────────────────────────────────────
# 4CHAN SCRAPER (Uses standard requests, 4chan doesn't block GitHub IPs)
# ─────────────────────────────────────────────────────────────────────────────
def fetch_4chan_sources() -> List[Dict]:
    print(f" 🍀 4chan → /{FOURCHAN_BOARD}/ Deep-Thread Scan")
    results = []
    try:
        catalog_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json"
        r = requests.get(catalog_url, headers=get_random_headers(), timeout=12)
        if r.status_code != 200:
            return []
        catalog = r.json()
        target_threads = []
        
        for page in catalog:
            for thread in page.get("threads", []):
                combined = (thread.get("sub", "") + " " + re.sub(r"<[^>]+>", " ", thread.get("com", ""))).lower()
                if any(kw in combined for kw in POSITIVE_KEYWORDS) and not any(neg in combined for neg in NEGATIVE_KEYWORDS):
                    target_threads.append(thread.get("no"))
                    
        target_threads = list(set(target_threads))[:8] 
        print(f"   ↳ Found {len(target_threads)} potential threads.")
        
        for thread_no in target_threads:
            try:
                thread_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/thread/{thread_no}.json"
                tr = requests.get(thread_url, headers=get_random_headers(), timeout=10)
                if tr.status_code != 200:
                    continue
                for post in tr.json().get("posts", []):
                    ext = post.get("ext", "")
                    if ext in (".webm", ".mp4"):
                        comment = re.sub(r"<[^>]+>", " ", post.get("com", ""))
                        results.append({
                            "source": f"4chan /{FOURCHAN_BOARD}/", "author": post.get("name", "Anonymous"),
                            "title": post.get("sub") or comment[:80] or f"4chan reply {thread_no}",
                            "description": comment, "media_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{post['tim']}{ext}",
                            "thumbnail_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{post['tim']}s.jpg",
                            "media_type": "video", "audio_url": "",
                            "source_url": f"https://boards.4channel.org/{FOURCHAN_BOARD}/thread/{thread_no}#p{post.get('no')}",
                            "score": 0, "platform": "4chan"
                        })
            except:
                continue
            time.sleep(random.uniform(1.2, 3))
            
        print(f"   ↳ ✅ Extracted {len(results)} videos")
    except Exception as e:
        print(f"   ↳ ✗ 4chan error: {e}")
    return results

# ─────────────────────────────────────────────────────────────────────────────
# MANAGER & DOWNLOAD HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def _download(url: str, dest: str, max_bytes: int = MAX_FILE_BYTES) -> bool:
    try:
        r = requests.get(url, stream=True, timeout=40, headers=get_random_headers())
        if r.status_code == 200:
            with open(dest, "wb") as f:
                for chunk in r.iter_content(16384):
                    f.write(chunk)
                    if f.tell() > max_bytes:
                        return False
            return True
    except: pass
    return False

def _valid(path: str) -> bool:
    return os.path.exists(path) and os.path.getsize(path) >= MIN_VIDEO_BYTES

def _reddit_audio_url(video_url: str) -> str:
    return re.sub(r"/DASH_[^/]+\.mp4$", "/DASH_audio.mp4", video_url.split("?")[0])

def merge_reddit_video(video_url: str, audio_url: str, final_path: str) -> bool:
    v_tmp = final_path + ".v.tmp"
    a_tmp = final_path + ".a.tmp"
    try:
        if not _download(video_url, v_tmp) or not _valid(v_tmp): return False
        if _download(audio_url, a_tmp) and _valid(a_tmp):
            vc, ac = VideoFileClip(v_tmp), AudioFileClip(a_tmp)
            vc.with_audio(ac).write_videofile(final_path, fps=30, codec="libx264", audio_codec="aac", logger=None)
            vc.close(); ac.close()
        else:
            shutil.copy(v_tmp, final_path)
        return _valid(final_path)
    except: return False
    finally:
        for p in (v_tmp, a_tmp):
            if os.path.exists(p): os.remove(p)

def _zip_media_folder():
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = f"{ZIP_PREFIX}_{ts}.zip"
    print(f"🗜 Archiving → {out}")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in os.listdir(MEDIA_FOLDER):
            zf.write(os.path.join(MEDIA_FOLDER, f), arcname=f)
    shutil.rmtree(MEDIA_FOLDER)
    os.makedirs(MEDIA_FOLDER)

def build_ledger():
    print("🛸 AXIOM UAP — Unified Stealth Edition\n")
    ledger = load_ledger()
    existing = {b["source_url"] for b in ledger}
    results = []

    # Launch Playwright once to handle Reddit AND Lemmy
    with Stealth().use_sync(sync_playwright()) as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
        context = browser.new_context(viewport={"width": 1920, "height": 1080}, user_agent=random.choice(USER_AGENTS))
        
        results.extend(fetch_reddit_sources(context))
        results.extend(fetch_lemmy_sources(context))
        browser.close()

    # 4chan doesn't need Playwright
    results.extend(fetch_4chan_sources())
    
    random.shuffle(results)
    added = 0
    
    for s in results:
        if s["source_url"] in existing: continue
        file_id = hashlib.md5(s["media_url"].encode()).hexdigest()
        final_path = os.path.join(MEDIA_FOLDER, f"{file_id}.mp4")
        local_url = f"./media/{file_id}.mp4"
        
        if not os.path.exists(final_path):
            print(f"\n📦 Saving: {s['title'][:50]}...")
            if "reddit" in s.get("platform", ""):
                archived = merge_reddit_video(s["media_url"], s.get("audio_url", ""), final_path)
            else:
                archived = _download(s["media_url"], final_path)
                
            if not archived or not _valid(final_path):
                local_url = s["media_url"]
                
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
        time.sleep(random.uniform(2, 5))
        
    save_ledger(ledger)
    total_bytes = sum(os.path.getsize(os.path.join(MEDIA_FOLDER, f)) for f in os.listdir(MEDIA_FOLDER) if os.path.isfile(os.path.join(MEDIA_FOLDER, f)))
    if total_bytes >= REPO_WARN_BYTES: _zip_media_folder()
    
    print(f"\n✅ Done — Added {added} new sightings to ledger.")

if __name__ == "__main__":
    build_ledger()
