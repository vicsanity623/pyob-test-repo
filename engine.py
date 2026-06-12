import hashlib
import requests
import json
import os
import zipfile
import shutil
from datetime import datetime, timezone
import random
import time
import re
from typing import List, Dict, Any, Optional
from moviepy import VideoFileClip, AudioFileClip
from ledger_manager import load_ledger, save_ledger

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
MEDIA_FOLDER    = "media"
MAX_FILE_BYTES  = 100 * 1024 * 1024   # 100 MB cap per file
REPO_WARN_BYTES = 950 * 1024 * 1024   # Zip folder when near 950 MB
ZIP_PREFIX      = "media_archive"
MIN_VIDEO_BYTES = 40 * 1024            # Reject corrupt files < 40 KB
MIN_SCORE       = 10                   # Minimum upvotes for validation

os.makedirs(MEDIA_FOLDER, exist_ok=True)

# Reddit targets via a robust pool of Redlib instances
REDDIT_SUBS = [
    "UFOs", "UAP", "Aliens", "UFObelievers", "UFOdocumentaries",
    "UFOscience", "Mufon", "Experiencers", "TheUAPReport", "Skies_Above",
    "ufo", "NHI", "DisclosureFiles", "Paranormal", "conspiracy",
    "StrangeEarth", "UnexplainedPhenomena"
]

REDLIB_INSTANCES = [
    "https://safereddit.com",
    "https://redlib.kittycat.homes",
    "https://redlib.vny.su",
    "https://redlib.ducks.party",
    "https://redlib.tux.im",
    "https://redlib.catsarch.com"
]

# Lemmy primary instances (Using high-capacity nodes to prevent 404s)
LEMMY_INSTANCES = ["https://lemmy.world", "https://lemmy.ml"]
LEMMY_COMMUNITIES = ["ufos", "aliens", "uap", "strangeearth", "paranormal", "conspiracy"]

# 4chan configuration
FOURCHAN_BOARD = "x"

SEARCH_POOL = [
    "ufo sighting video", "uap footage", "unidentified aerial",
    "tic tac ufo", "triangle craft", "orb sighting video"
]

POSITIVE_KEYWORDS = [
    "ufo", "uap", "orb", "saucer", "tic tac", "tic-tac", "triangle",
    "sighting", "craft", "phenomenon", "footage", "video", "nhi",
    "unidentified", "aerial", "anomalous", "encounter", "lights in the sky"
]
NEGATIVE_KEYWORDS = [
    "furry", "meme", "cgi", "vfx", "blender", "movie", "game", "art",
    "drawing", "tattoo", "fiction", "joke", "animation", "render",
    "satire", "deepfake", "photoshop", "minecraft"
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

# ─────────────────────────────────────────────────────────────────────────────
# DOWNLOAD HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _download(url: str, dest: str, max_bytes: int = MAX_FILE_BYTES) -> bool:
    """Stream-download url → dest. Returns True on success."""
    try:
        r = requests.get(url, stream=True, timeout=25, headers=HEADERS)
        if r.status_code != 200:
            print(f"   ✗ HTTP {r.status_code} — {url[:70]}")
            return False
        written = 0
        with open(dest, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
                written += len(chunk)
                if written > max_bytes:
                    print(f"   ✗ File too large, aborting.")
                    return False
        return True
    except requests.exceptions.Timeout:
        print(f"   ✗ Timeout: {url[:70]}")
    except Exception as e:
        print(f"   ✗ Download error: {e}")
    return False


def _valid(path: str) -> bool:
    """Return True if file exists and is at least MIN_VIDEO_BYTES."""
    return os.path.exists(path) and os.path.getsize(path) >= MIN_VIDEO_BYTES


def _reddit_audio_url(video_url: str) -> str:
    """Convert a Reddit DASH video URL to its audio track URL."""
    base = video_url.split("?")[0]
    return re.sub(r"/DASH_[^/]+\.mp4$", "/DASH_audio.mp4", base)

# ─────────────────────────────────────────────────────────────────────────────
# VIDEO MERGING
# ─────────────────────────────────────────────────────────────────────────────

def merge_reddit_video(video_url: str, audio_url: str, final_path: str) -> bool:
    """Download + merge Reddit's separated video/audio tracks into one MP4."""
    v_tmp = final_path + ".v.tmp"
    a_tmp = final_path + ".a.tmp"
    ok = False
    try:
        print(f"   ↓ video track …")
        if not _download(video_url, v_tmp) or not _valid(v_tmp):
            return False

        print(f"   ↓ audio track …")
        has_audio = _download(audio_url, a_tmp) and _valid(a_tmp)

        if has_audio:
            vc = VideoFileClip(v_tmp)
            ac = AudioFileClip(a_tmp)
            print(f"   ⚙  merging A/V …")
            vc.with_audio(ac).write_videofile(
                final_path, fps=30,
                codec="libx264", audio_codec="aac",
                audio_bitrate="192k", logger=None
            )
            vc.close(); ac.close()
        else:
            shutil.copy(v_tmp, final_path)

        ok = _valid(final_path)
    except Exception as e:
        print(f"   ✗ Merge error: {e}")
    finally:
        for p in (v_tmp, a_tmp):
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
    return ok

# ─────────────────────────────────────────────────────────────────────────────
# OPEN DATA SCRAPERS
# ─────────────────────────────────────────────────────────────────────────────

def _passes_filter(title: str, body: str, score: int = MIN_SCORE) -> bool:
    combined = (title + " " + body).lower()
    if not any(kw in combined for kw in POSITIVE_KEYWORDS):
        return False
    if any(kw in combined for kw in NEGATIVE_KEYWORDS):
        return False
    return True


def _extract_reddit_videos(data: dict, label: str) -> List[Dict]:
    results = []
    for post in data.get("data", {}).get("children", []):
        p = post.get("data", {})
        title = p.get("title", "")
        body  = p.get("selftext", "")
        score = p.get("score", 0)

        if not _passes_filter(title, body, score):
            continue

        # Reddit native video
        if p.get("is_video") and p.get("media", {}).get("reddit_video"):
            rv = p["media"]["reddit_video"]
            raw_url   = rv.get("fallback_url", "").split("?")[0]
            audio_url = _reddit_audio_url(raw_url)
            thumb_url = p.get("thumbnail", "")

            if not raw_url:
                continue

            results.append({
                "source":    label,
                "author":    p.get("author", "Anonymous"),
                "title":     title,
                "description": body,
                "media_url": raw_url,
                "thumbnail_url": thumb_url,
                "media_type": "video",
                "audio_url": audio_url,
                "source_url": f"https://reddit.com{p['permalink']}",
                "score":     score,
                "platform":  "reddit_native"
            })
            continue

        # Preview MP4 variant
        preview = p.get("preview", {})
        if preview.get("images"):
            img = preview["images"][0]
            if "variants" in img and "mp4" in img["variants"]:
                mp4_url   = img["variants"]["mp4"]["source"]["url"]
                res       = img.get("resolutions", [])
                thumb_url = res[-1]["url"] if res else img["source"]["url"]

                results.append({
                    "source":    label,
                    "author":    p.get("author", "Anonymous"),
                    "title":     title,
                    "description": body,
                    "media_url": mp4_url,
                    "thumbnail_url": thumb_url,
                    "media_type": "video",
                    "audio_url": "",
                    "source_url": f"https://reddit.com{p['permalink']}",
                    "score":     score,
                    "platform":  "reddit_preview"
                })

    return results


def fetch_reddit_sources() -> List[Dict]:
    """Scrapes Reddit threads utilizing a Redlib instance fallback chain."""
    results = []
    subs = REDDIT_SUBS.copy()
    random.shuffle(subs)
    
    # Try 4 random subreddits per execution run
    for sub in subs[:4]:
        success = False
        # Shuffle Redlib instance carousel to spread load
        instances = REDLIB_INSTANCES.copy()
        random.shuffle(instances)
        
        for instance in instances:
            sort = random.choice(["hot", "rising", "new"])
            url = f"{instance}/r/{sub}/{sort}.json?limit=15"
            try:
                r = requests.get(url, headers=HEADERS, timeout=12)
                if r.status_code == 200:
                    data = r.json()
                    extracted = _extract_reddit_videos(data, f"Reddit /r/{sub}")
                    if extracted:
                        results.extend(extracted)
                        success = True
                        break  # Stop checking other instances on success
            except Exception:
                continue  # Silent failover to next Redlib instance
                
        if not success:
            print(f"  📡 Reddit /r/{sub} — Carousel failover active (All endpoints blocked)")
            
    return results


def fetch_lemmy_sources() -> List[Dict]:
    """Scrapes community directories with instance failovers on lemmy.world."""
    results = []
    
    for community in LEMMY_COMMUNITIES:
        # Prioritize high-capacity instances to resolve community feeds reliably
        success = False
        for instance in LEMMY_INSTANCES:
            print(f"  📡 Lemmy c/{community} via {instance}")
            try:
                url = f"{instance}/api/v3/post/list?community_name={community}&sort=New&limit=25"
                r = requests.get(url, headers=HEADERS, timeout=15)
                if r.status_code == 404:
                    continue  # Failover to secondary node if index returns 404
                    
                if r.status_code == 200:
                    data = r.json()
                    for item in data.get("posts", []):
                        post_data = item.get("post", {})
                        title = post_data.get("name", "")
                        body = post_data.get("body", "")
                        media_url = post_data.get("url", "")
                        
                        if not media_url:
                            continue
                        
                        is_video = media_url.lower().endswith((".mp4", ".webm", ".mov", ".gifv")) or "v.redd.it" in media_url
                        if not is_video:
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
                print(f"     skip error: {e}")
                
        if not success:
            print(f"     c/{community} failed to resolve across primary instances.")
            
    return results


def fetch_4chan_sources() -> List[Dict]:
    """Scrapes 4chan /x/ catalog and scans replies inside matches to find videos."""
    print(f"  🍀 4chan /{FOURCHAN_BOARD}/ Deep-Thread Scan")
    results = []
    try:
        catalog_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json"
        r = requests.get(catalog_url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return []
            
        catalog = r.json()
        target_threads = []
        
        # Phase 1: Identify active threads mentioning positive keywords
        for page in catalog[:8]:
            for thread in page.get("threads", []):
                comment = re.sub(r"<[^>]+>", " ", thread.get("com", ""))
                title = thread.get("sub", "")
                
                # Check keywords in OP title or body
                combined_text = (title + " " + comment).lower()
                if any(kw in combined_text for kw in POSITIVE_KEYWORDS):
                    if not any(neg in combined_text for neg in NEGATIVE_KEYWORDS):
                        target_threads.append(thread.get("no"))
                        
        # Phase 2: Pull thread internals to extract uploaded .webm / .mp4 media inside replies
        target_threads = list(set(target_threads))[:6]  # Limit to top 6 active threads
        processed = 0
        
        for thread_no in target_threads:
            try:
                thread_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/thread/{thread_no}.json"
                tr = requests.get(thread_url, headers=HEADERS, timeout=10)
                if tr.status_code != 200:
                    continue
                    
                posts = tr.json().get("posts", [])
                for post in posts:
                    ext = post.get("ext", "")
                    if ext in (".webm", ".mp4"):
                        comment = re.sub(r"<[^>]+>", " ", post.get("com", ""))
                        # Fallback parsing for title
                        post_title = post.get("sub") or comment[:80] or f"Reply attachment on Thread {thread_no}"
                        
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
            except Exception:
                continue
            time.sleep(1.0)  # Politeness delay for 4chan API
            
        print(f"     Deep-Thread scan located {processed} matching videos inside active replies.")
    except Exception as e:
        print(f"  ✗ 4chan Deep-Thread Scan failed: {e}")
        
    return results


def fetch_all_sources() -> List[Dict]:
    results = []
    
    try:
        results.extend(fetch_reddit_sources())
    except Exception as e:
        print(f"⚠️ Reddit scrape error: {e}")

    try:
        results.extend(fetch_lemmy_sources())
    except Exception as e:
        print(f"⚠️ Lemmy scrape error: {e}")

    try:
        results.extend(fetch_4chan_sources())
    except Exception as e:
        print(f"⚠️ 4chan scrape error: {e}")

    random.shuffle(results)
    return results

# ─────────────────────────────────────────────────────────────────────────────
# ARCHIVAL
# ─────────────────────────────────────────────────────────────────────────────

def _zip_media_folder():
    ts  = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = f"{ZIP_PREFIX}_{ts}.zip"
    print(f"🗜  Threshold reached — archiving → {out}")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in os.listdir(MEDIA_FOLDER):
            zf.write(os.path.join(MEDIA_FOLDER, f), arcname=f)
    shutil.rmtree(MEDIA_FOLDER)
    os.makedirs(MEDIA_FOLDER)


def check_and_zip_if_full():
    total = sum(
        os.path.getsize(os.path.join(MEDIA_FOLDER, f))
        for f in os.listdir(MEDIA_FOLDER)
        if os.path.isfile(os.path.join(MEDIA_FOLDER, f))
    )
    if total >= REPO_WARN_BYTES:
        _zip_media_folder()


def build_ledger():
    print("🛸  AXIOM UAP — Core Video Archivist\n")
    ledger   = load_ledger()
    existing = {b["source_url"] for b in ledger}
    new_data = fetch_all_sources()
    added    = 0

    for s in new_data:
        if s["source_url"] in existing:
            continue

        file_id    = hashlib.md5(s["media_url"].encode()).hexdigest()
        final_path = os.path.join(MEDIA_FOLDER, f"{file_id}.mp4")
        local_url  = f"./media/{file_id}.mp4"

        if not os.path.exists(final_path):
            print(f"\n📦  {s['title'][:60]}")
            print(f"    {s['source']} | {s['platform']}")

            if s["platform"] == "reddit_native":
                archived = merge_reddit_video(s["media_url"], s["audio_url"], final_path)
            else:
                archived = _download(s["media_url"], final_path)
                if archived and not _valid(final_path):
                    print(f"   ✗ File corrupt or incomplete — discarding.")
                    try: os.remove(final_path)
                    except: pass
                    archived = False

            # If local processing failed, fallback to direct target URL
            if not archived:
                local_url = s["media_url"]

        timestamp = datetime.now(timezone.utc).isoformat()
        payload   = f"{timestamp}|{s['source']}|{s['title']}|{s['media_url']}|{s['score']}"

        ledger.insert(0, {
            "timestamp":     timestamp,
            "source":        s["source"],
            "author":        s["author"],
            "title":         s["title"],
            "description":   s["description"][:800],
            "media_url":     local_url,
            "thumbnail_url": s["thumbnail_url"],
            "media_type":    "video",
            "source_url":    s["source_url"],
            "hash":          hashlib.sha256(payload.encode()).hexdigest(),
            "score":         s["score"],
            "platform":      s.get("platform", "unknown")
        })
        existing.add(s["source_url"])
        added += 1

    save_ledger(ledger)
    check_and_zip_if_full()
    print(f"\n✅  Done — {added} new video sightings archived.")


if __name__ == "__main__":
    build_ledger()