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
MIN_VIDEO_BYTES = 80 * 1024            # Reject stubs / corrupt files < 80 KB
MIN_SCORE       = 15                   # Minimum Reddit upvotes to accept

os.makedirs(MEDIA_FOLDER, exist_ok=True)

REDDIT_SUBS = [
    "UFOs", "UAP", "Aliens", "UFObelievers", "UFOdocumentaries",
    "UFOscience", "Mufon", "Experiencers", "TheUAPReport", "Skies_Above",
    "ufo", "NHI", "DisclosureFiles", "Paranormal", "conspiracy",
    "StrangeEarth", "UnexplainedPhenomena"
]

FOURCHAN_BOARD = "x"

SEARCH_POOL = [
    "ufo sighting video", "uap footage",
    "unidentified aerial phenomenon video", "strange lights in sky",
    "tic tac ufo", "triangle craft sighting",
    "orb sighting video", "night vision ufo",
    "military uap encounter", "pilot ufo sighting",
    "dashcam ufo footage", "security camera uap",
    "pentagon uap video", "clear ufo footage",
    "black triangle aircraft", "fravor tic tac",
    "skinwalker ranch video", "mexico ufo footage",
    "chile uap encounter", "navy ufo radar",
    "real ufo caught on camera", "uap government footage",
    "craft hovering silent", "sphere anomalous aerial",
    "ufo fleet formation", "fast moving light uap"
]

LOCATIONS   = [
    "Arizona", "Nevada", "California", "Texas", "Brazil", "London",
    "Canada", "Australia", "New Mexico", "Florida", "Ohio", "Chile",
    "Mexico", "UK", "Japan", "Turkey", "Israel", "Poland", "Peru", "Argentina"
]
CRAFT_TYPES = ["Disc", "Orb", "Triangle", "Tic Tac", "Cigar", "Light", "Sphere", "Chevron", "Cylinder", "Rectangle"]

POSITIVE_KEYWORDS = [
    "ufo", "uap", "orb", "saucer", "tic tac", "tic-tac", "triangle",
    "sighting", "craft", "phenomenon", "footage", "video", "nhi",
    "unidentified", "aerial", "anomalous", "encounter",
    "unknown object", "lights in the sky", "hovering"
]
NEGATIVE_KEYWORDS = [
    "furry", "meme", "cgi", "vfx", "blender", "movie", "game", "art",
    "drawing", "tattoo", "fiction", "joke", "animation", "render",
    "skyrim", "minecraft", "parody", "satire", "deepfake", "photoshop"
]

HEADERS = {
    "User-Agent": (
        "AxiomUAPArchivist/1.0 (https://github.com/your-username/your-repo-name); " # <--- IMPORTANT: CUSTOMIZE THIS
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
    """
    Convert a Reddit DASH video URL to its audio track URL.
    https://v.redd.it/XXXXX/DASH_1080.mp4?source=fallback
    → https://v.redd.it/XXXXX/DASH_audio.mp4
    """
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
            # Audio not available — keep video-only
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
# SCRAPERS — VIDEO ONLY
# ─────────────────────────────────────────────────────────────────────────────

def _passes_filter(title: str, body: str, score: int) -> bool:
    if score < MIN_SCORE:
        return False
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

        # ── Reddit native video ──────────────────────────────────────────────
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

        # ── Preview MP4 / animated GIF variant ──────────────────────────────
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


def fetch_all_sources() -> List[Dict]:
    results: List[Dict] = []
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0"
    })

    # ── Subreddits ──────────────────────────────────────────────────────────
    subs = REDDIT_SUBS.copy()
    random.shuffle(subs)
    for sub in subs[:8]:
        sort  = random.choice(["hot", "rising", "new", "top"])
        extra = "&t=week" if sort == "top" else ""
        print(f"  📡 /r/{sub}  [{sort}]")
        try:
            url = (f"https://www.reddit.com/r/{sub}/{sort}.json"
                   f"?limit=20&raw_json=1{extra}")
            r = session.get(url, timeout=15)
            # Check for successful HTTP status and non-empty response
            if r.status_code == 200 and r.text.strip():
                results.extend(_extract_reddit_videos(r.json(), f"Reddit /r/{sub}"))
            else:
                print(f"     skip: HTTP {r.status_code} or empty response. URL: {url} | Content: {r.text[:100]}...")
        except json.JSONDecodeError as jde:
            print(f"     skip: JSON decode error: {jde}. URL: {url} | Raw response: {r.text[:100]}...")
        except requests.exceptions.RequestException as re_exc:
            print(f"     skip: Network/Request error: {re_exc}. URL: {url}")
        except Exception as e:
            print(f"     skip: Unexpected error: {e}. URL: {url}")
        time.sleep(random.uniform(2.0, 4.0))

    # ── Search queries ───────────────────────────────────────────────────────
    queries = random.sample(SEARCH_POOL, 5)
    queries += [
        f"{random.choice(LOCATIONS)} {random.choice(CRAFT_TYPES).lower()} sighting",
        f"ufo {random.choice(CRAFT_TYPES).lower()} footage {random.choice(LOCATIONS)}"
    ]
    for q in queries:
        sort = random.choice(["new", "relevance"])
        print(f"  🔍 search [{sort}]: \"{q}\"")
        try:
            url = (f"https://www.reddit.com/search.json"
                   f"?q={requests.utils.quote(q)}&sort={sort}&limit=15&raw_json=1")
            r = session.get(url, timeout=15)
            if r.status_code == 200 and r.text.strip():
                results.extend(_extract_reddit_videos(r.json(), "Reddit Search"))
            else:
                print(f"     skip: HTTP {r.status_code} or empty response. URL: {url} | Content: {r.text[:100]}...")
        except json.JSONDecodeError as jde:
            print(f"     skip: JSON decode error: {jde}. URL: {url} | Raw response: {r.text[:100]}...")
        except requests.exceptions.RequestException as re_exc:
            print(f"     skip: Network/Request error: {re_exc}. URL: {url}")
        except Exception as e:
            print(f"     skip: Unexpected error: {e}. URL: {url}")
        time.sleep(random.uniform(2.0, 4.0))

    # ── 4chan /x/ ────────────────────────────────────────────────────────────
    # ── 4chan /x/ ────────────────────────────────────────────────────────────
print(f"  🍀 4chan /x/")
try:
    catalog_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json"
    r = requests.get(catalog_url, timeout=10)
    if r.status_code == 200 and r.text.strip():
        catalog = r.json()
    else:
        print(f"  ✗ 4chan catalog failed: HTTP {r.status_code} or empty response. URL: {catalog_url} | Content: {r.text[:100]}...")
        catalog = [] # Ensure catalog is empty to prevent further errors

    random.shuffle(catalog)
    processed_threads = 0
    for page in catalog[:4]: # Limit to first 4 pages to avoid too many requests
        for thread in page.get("threads", []):
            thread_no = thread.get("no")
            if not thread_no: continue

            # Check for video extensions
            if thread.get("ext") not in (".webm", ".mp4"):
                # print(f"     skip 4ch thread {thread_no}: No .webm/.mp4 main file.") # Uncomment for verbose debugging
                continue

            # Check minimum replies
            if thread.get("replies", 0) < 5:
                # print(f"     skip 4ch thread {thread_no}: Less than 5 replies.") # Uncomment for verbose debugging
                continue

            comment  = re.sub(r"<[^>]+>", " ", thread.get("com", ""))
            combined = (thread.get("sub", "") + " " + comment).lower()

            # Keyword filtering
            if not any(kw in combined for kw in POSITIVE_KEYWORDS):
                # print(f"     skip 4ch thread {thread_no}: No positive keywords.") # Uncomment for verbose debugging
                continue
            if any(kw in combined for kw in NEGATIVE_KEYWORDS):
                # print(f"     skip 4ch thread {thread_no}: Contains negative keywords.") # Uncomment for verbose debugging
                continue

            tid, ext = thread["tim"], thread["ext"]
            results.append({
                "source":    "4chan /x/",
                "author":    thread.get("name", "Anonymous"),
                "title":     thread.get("sub") or comment[:80] or f"UAP Thread {thread_no}",
                "description": comment[:800],
                "media_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tid}{ext}",
                "thumbnail_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tid}s.jpg",
                "media_type": "video",
                "audio_url": "",
                "source_url": f"https://boards.4channel.org/{FOURCHAN_BOARD}/thread/{thread_no}",
                "score":     0, # 4chan doesn't have a direct 'score' like Reddit
                "platform":  "4chan"
            })
            processed_threads += 1
            # Add a small delay for each thread processed to avoid hammering 4chan's servers
            time.sleep(0.1) # Small delay per thread

    print(f"     Found {processed_threads} potential 4chan videos.")

except json.JSONDecodeError as jde:
    print(f"  ✗ 4chan catalog JSON decode error: {jde}. Raw response: {r.text[:100]}...")
except requests.exceptions.RequestException as re_exc:
    print(f"  ✗ 4chan network/request error: {re_exc}. URL: {catalog_url}")
except Exception as e:
    print(f"  ✗ Unexpected 4chan error: {e}")

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
    print("🛸  AXIOM UAP — Video Archivist\n")
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
            print(f"    {s['source']} | score: {s['score']} | {s['platform']}")

            if s["platform"] == "reddit_native":
                archived = merge_reddit_video(s["media_url"], s["audio_url"], final_path)
            else:
                archived = _download(s["media_url"], final_path)
                if archived and not _valid(final_path):
                    print(f"   ✗ File too small — discarding.")
                    try: os.remove(final_path)
                    except: pass
                    archived = False

            # If local archival failed, fall back to CDN URL (may expire)
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

    save_ledger(ledger) # Always save the ledger, even if no new items were added or if it's empty

    check_and_zip_if_full()
    print(f"\n✅  Done — {added} new video sightings archived.")


if __name__ == "__main__":
    build_ledger()
