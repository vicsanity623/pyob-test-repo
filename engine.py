import hashlib
import requests
import json
import os
import zipfile
import shutil
from datetime import datetime, timezone
import random
# import praw # PRAW is for authenticated Reddit API. Not used for unauthenticated scraping.
import time
import re
from typing import List, Dict, Any, Optional
from moviepy import VideoFileClip, AudioFileClip
from ledger_manager import load_ledger, save_ledger

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
MEDIA_FOLDER = "media"
MAX_FILE_BYTES = 100 * 1024 * 1024
REPO_WARN_BYTES = 950 * 1024 * 1024
ZIP_PREFIX = "media_archive"
MIN_VIDEO_BYTES = 80 * 1024  # Reject stubs / corrupt files < 80 KB
MIN_SCORE = 15               # Minimum Reddit upvotes to accept (might be ignored due to blocks)

if not os.path.exists(MEDIA_FOLDER):
    os.makedirs(MEDIA_FOLDER)

REDDIT_SUBS = ["UFOs", "UAP", "Aliens", "UFObelievers", "UFOdocumentaries", "UFOscience", "Mufon", "Experiencers", "TheUAPReport", "Skies_Above", "ufo", "NHI", "DisclosureFiles", "Paranormal", "conspiracy", "StrangeEarth", "UnexplainedPhenomena"]
FOURCHAN_BOARD = "x"
SEARCH_POOL = [
    "ufo sighting video", "uap footage", "unidentified aerial", "strange lights sky",
    "tic tac ufo", "triangle craft", "orb sighting", "night vision ufo",
    "military uap encounter", "pilot ufo sighting", "dashcam ufo", "security camera uap",
    "pentagon uap video", "clear ufo footage", "black triangle sky", "fravor tic tac",
    "skinwalker ranch sighting", "mexico ufo video", "chile uap footage", "navy ufo radar"
]
LOCATIONS = ["Arizona", "Nevada", "California", "Texas", "Brazil", "London", "Canada", "Australia", "New Mexico", "Florida", "Ohio", "Chile", "Mexico", "UK", "Japan", "Turkey", "Israel", "Poland", "Peru", "Argentina"]
CRAFT_TYPES = ["Disc", "Orb", "Triangle", "Tic Tac", "Cigar", "Light", "Sphere", "Chevron", "Cylinder", "Rectangle"]
POSITIVE_KEYWORDS = ["ufo", "uap", "orb", "saucer", "tic tac", "tic-tac", "triangle", "sighting", "craft", "phenomenon", "footage", "video", "nhi", "unidentified", "aerial", "anomalous", "encounter", "unknown object", "lights in the sky", "hovering"]
NEGATIVE_KEYWORDS = ["furry", "psyop", "meme", "fake", "debunk", "cgi", "vfx", "blender", "movie", "game", "art", "drawing", "tattoo", "fiction", "joke", "project blue beam", "animation", "render", "skyrim", "minecraft", "parody", "satire", "deepfake", "photoshop"]

# --- Sophisticated Bot Detection Bypass: User-Agent Pool & Dynamic Headers ---
USER_AGENT_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.84 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

def get_random_headers(url: str = None) -> Dict[str, str]:
    headers = {
        "User-Agent": random.choice(USER_AGENT_POOL),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
    }
    # Add Referer for specific domains if applicable, e.g., coming from google search
    if url and "reddit.com" in url:
        headers["Referer"] = f"https://www.google.com/search?q={random.choice(SEARCH_POOL).replace(' ', '+')}"
    return headers

# ---------------------------------------------------------------------------
# DOWNLOAD HELPERS (Updated to use dynamic headers and retry logic)
# ---------------------------------------------------------------------------

def _download(url: str, dest: str, max_bytes: int = MAX_FILE_BYTES) -> bool:
    """Stream-download url → dest. Returns True on success."""
    retries = 3
    for attempt in range(retries):
        try:
            current_headers = get_random_headers(url)
            r = requests.get(url, stream=True, timeout=25, headers=current_headers)

            if r.status_code == 429: # Too Many Requests
                print(f"   ⚠️ HTTP 429 - Too Many Requests. Retrying in {2**(attempt+1)}s...")
                time.sleep(2**(attempt+1) + random.uniform(0, 1)) # Exponential backoff with jitter
                continue # Try again

            if r.status_code != 200:
                print(f"   ✗ HTTP {r.status_code} — {url[:70]} | UA: {current_headers['User-Agent']}")
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
            print(f"   ✗ Timeout (attempt {attempt+1}/{retries}): {url[:70]}")
            time.sleep(2**(attempt+1) + random.uniform(0, 1))
        except Exception as e:
            print(f"   ✗ Download error (attempt {attempt+1}/{retries}): {e} - {url[:70]}")
            time.sleep(2**(attempt+1) + random.uniform(0, 1))
    return False # All retries failed


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
    # Ensure this regex works correctly for various DASH formats
    audio_url = re.sub(r"/DASH_(\d+|audio)\.mp4$", "/DASH_audio.mp4", base)
    if "DASH_audio.mp4" not in audio_url: # Fallback if original didn't match
        audio_url = base.rsplit('/', 1)[0] + "/DASH_audio.mp4"
    return audio_url

# ---------------------------------------------------------------------------
# VIDEO MERGING (With the AAC + Bitrate Fix)
# ---------------------------------------------------------------------------

def merge_reddit_video(video_url: str, audio_url: str, final_path: str) -> bool:
    v_temp = final_path + ".v.mp4"
    a_temp = final_path + ".a.mp4"
    ok = False
    try:
        print(f"   ↓ video track …")
        if not _download(video_url, v_temp) or not _valid(v_temp):
            return False

        print(f"   ↓ audio track …")
        has_audio = _download(audio_url, a_temp) and _valid(a_temp)

        if has_audio:
            video_clip = VideoFileClip(v_temp)
            audio_clip = AudioFileClip(a_temp)
            
            # Use with_audio for MoviePy v2.0+
            final_clip = video_clip.with_audio(audio_clip)
            
            print(f"   ⚙  merging A/V …")
            
            # Standard Web-Ready Export
            final_clip.write_videofile(
                final_path, 
                fps=30, 
                codec="libx264", 
                audio_codec="aac", 
                audio_bitrate="192k", 
                logger=None # Suppress verbose MoviePy logs
            )
            
            video_clip.close()
            audio_clip.close()
        else:
            print(f"   ⚠️ No audio track found or downloaded. Keeping video-only.")
            shutil.copy(v_temp, final_path)
            
        ok = _valid(final_path)
    except Exception as e:
        print(f"   ✗ Merge Error: {e}")
    finally:
        for p in (v_temp, a_temp):
            if os.path.exists(p):
                try: os.remove(p)
                except: pass
    return ok

# ---------------------------------------------------------------------------
# SCRAPERS
# ---------------------------------------------------------------------------

def _passes_filter(title: str, body: str, score: int) -> bool:
    # Use global MIN_SCORE
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
        p = post.get("data", {}) # Use .get() for safety
        title = p.get("title", "")
        body  = p.get("selftext", "")
        score = p.get("score", 0)

        if not _passes_filter(title, body, score):
            continue

        media_url, thumb_url, m_type, audio_url = "", "", "", ""
        
        # ── Reddit native video ──────────────────────────────────────────────
        if p.get("is_video") and p.get("media", {}).get("reddit_video"):
            rv = p["media"]["reddit_video"]
            media_url = rv.get("fallback_url", "").split("?")[0]
            thumb_url = p.get("thumbnail", "")
            m_type = "video"
            audio_url = _reddit_audio_url(media_url) # Use helper function

            if not media_url: continue # Skip if main media URL is missing

        # ── Preview MP4 / animated GIF variant ──────────────────────────────
        elif p.get("preview", {}).get("images"):
            img = p["preview"]["images"][0]
            if "variants" in img and "mp4" in img["variants"]:
                media_url = img["variants"]["mp4"]["source"]["url"]
                res       = img.get("resolutions", [])
                thumb_url = res[-1]["url"] if res else img["source"]["url"] # Use last resolution or source
                m_type = "video"
                # Preview videos typically don't have separate audio
                audio_url = ""

            # Fallback for images if no video preview
            else:
                media_url = img["source"]["url"]
                res = img.get("resolutions", [])
                thumb_url = res[-1]["url"] if res else img["source"]["url"]
                m_type = "image"
                # We are not archiving images
                if not media_url.endswith((".mp4", ".webm")): # Only process if it's actually a video
                    continue


        if media_url and m_type == "video": # Only add if it's a video and has a URL
            results.append({
                "source":    label,
                "author":    p.get("author", "Anonymous"),
                "title":     title,
                "description": body,
                "media_url": media_url,
                "thumbnail_url": thumb_url,
                "media_type": m_type,
                "audio_url": audio_url,
                "source_url": f"https://reddit.com{p['permalink']}",
                "score":     score
            })
    return results

def fetch_all_sources() -> List[Dict]:
    results: List[Dict] = []
    session = requests.Session()
    # No longer setting a fixed User-Agent for the session.
    # get_random_headers() will be called for each request inside the loops.

    # ── Subreddits ──────────────────────────────────────────────────────────
    subs = REDDIT_SUBS.copy()
    random.shuffle(subs)
    for sub in subs[:8]: # Check fewer subreddits if blocks are severe
        sort_method = random.choice(["hot", "rising", "new", "top"])
        time_filter = "&t=week" if sort_method == "top" else ""
        
        print(f"  📡 /r/{sub}  [{sort_method}]")
        url = (f"https://www.reddit.com/r/{sub}/{sort_method}.json"
               f"?limit=20&raw_json=1{time_filter}")
        
        for attempt in range(3): # Retry mechanism for Reddit API calls
            try:
                current_headers = get_random_headers(url)
                r = session.get(url, timeout=20, headers=current_headers)

                if r.status_code == 429:
                    print(f"     ⚠️ Reddit 429 - Too Many Requests. Retrying in {2**(attempt+1)}s...")
                    time.sleep(2**(attempt+1) + random.uniform(0, 1))
                    continue
                elif r.status_code == 403:
                    print(f"     ✗ Reddit 403 Forbidden. Likely IP/UA block. Content: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
                    break # Break out of retries for 403, unlikely to succeed
                elif r.status_code != 200:
                    print(f"     ✗ HTTP {r.status_code} - {url} | Content: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
                    break
                
                if r.text.strip(): # Check for empty content
                    results.extend(_extract_reddit_videos(r.json(), f"Reddit (/r/{sub})"))
                    break # Success, break retry loop
                else:
                    print(f"     ✗ Empty response for {url}. Attempt {attempt+1}/{3}.")
                    time.sleep(random.uniform(3, 6)) # Longer sleep for empty responses
            except json.JSONDecodeError as jde:
                print(f"     ✗ JSON decode error (attempt {attempt+1}/{3}): {jde}. URL: {url} | Raw response: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
                time.sleep(random.uniform(3, 6))
            except requests.exceptions.RequestException as re_exc:
                print(f"     ✗ Network/Request error (attempt {attempt+1}/{3}): {re_exc}. URL: {url} | UA: {current_headers['User-Agent']}")
                time.sleep(random.uniform(3, 6))
            except Exception as e:
                print(f"     ✗ Unexpected error (attempt {attempt+1}/{3}): {e}. URL: {url} | UA: {current_headers['User-Agent']}")
                time.sleep(random.uniform(3, 6))
        time.sleep(random.uniform(5.0, 10.0)) # Longer general delay between Reddit subreddits

    # ── Search queries ───────────────────────────────────────────────────────
    queries = random.sample(SEARCH_POOL, 5)
    queries += [
        f"{random.choice(LOCATIONS)} {random.choice(CRAFT_TYPES).lower()} sighting",
        f"ufo {random.choice(CRAFT_TYPES).lower()} footage {random.choice(LOCATIONS)}"
    ]
    for q in queries:
        sort_type = random.choice(["new", "relevance"])
        print(f"  🔍 search [{sort_type}]: \"{q}\"")
        url = (f"https://www.reddit.com/search.json"
               f"?q={requests.utils.quote(q)}&sort={sort_type}&limit=15&raw_json=1")
        
        for attempt in range(3): # Retry mechanism for Reddit Search
            try:
                current_headers = get_random_headers(url)
                r = session.get(url, timeout=20, headers=current_headers)

                if r.status_code == 429:
                    print(f"     ⚠️ Reddit 429 - Too Many Requests. Retrying in {2**(attempt+1)}s...")
                    time.sleep(2**(attempt+1) + random.uniform(0, 1))
                    continue
                elif r.status_code == 403:
                    print(f"     ✗ Reddit 403 Forbidden. Likely IP/UA block. Content: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
                    break # Break out of retries for 403
                elif r.status_code != 200:
                    print(f"     ✗ HTTP {r.status_code} - {url} | Content: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
                    break
                
                if r.text.strip():
                    results.extend(_extract_reddit_videos(r.json(), "Reddit Discovery"))
                    break # Success, break retry loop
                else:
                    print(f"     ✗ Empty response for {url}. Attempt {attempt+1}/{3}.")
                    time.sleep(random.uniform(3, 6))
            except json.JSONDecodeError as jde:
                print(f"     ✗ JSON decode error (attempt {attempt+1}/{3}): {jde}. URL: {url} | Raw response: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
                time.sleep(random.uniform(3, 6))
            except requests.exceptions.RequestException as re_exc:
                print(f"     ✗ Network/Request error (attempt {attempt+1}/{3}): {re_exc}. URL: {url} | UA: {current_headers['User-Agent']}")
                time.sleep(random.uniform(3, 6))
            except Exception as e:
                print(f"     ✗ Unexpected error (attempt {attempt+1}/{3}): {e}. URL: {url} | UA: {current_headers['User-Agent']}")
                time.sleep(random.uniform(3, 6))
        time.sleep(random.uniform(5.0, 10.0)) # Longer general delay between Reddit searches


    # ── 4chan /x/ ────────────────────────────────────────────────────────────
    print(f"  🍀 4chan /x/")
    try:
        catalog_url = f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json"
        current_headers = get_random_headers(catalog_url) # Get headers for 4chan
        r = requests.get(catalog_url, timeout=15, headers=current_headers) # Increased timeout for 4chan

        if r.status_code == 200 and r.text.strip():
            catalog = r.json()
        else:
            print(f"  ✗ 4chan catalog failed: HTTP {r.status_code} or empty response. URL: {catalog_url} | Content: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
            catalog = []

        random.shuffle(catalog)
        processed_threads = 0
        # Iterate through more pages (adjust as needed, 4chan has about 10-15 pages)
        for page in catalog[:6]: # Check up to 6 pages for more variety
            for thread in page.get("threads", []):
                thread_no = thread.get("no")
                if not thread_no: continue

                # More relaxed filtering for 4chan to find more content
                # Only check for video extensions (webm/mp4)
                if thread.get("ext") not in (".webm", ".mp4"):
                    continue

                comment = re.sub(r"<[^>]+>", " ", thread.get("com", "")).lower()
                subject = thread.get("sub", "").lower()

                # At least one positive keyword in subject or comment
                if not any(kw in (subject + " " + comment) for kw in POSITIVE_KEYWORDS):
                    # print(f"     skip 4ch thread {thread_no}: No positive keywords. Sub:'{subject[:30]}', Com:'{comment[:30]}'")
                    continue

                # No negative keywords in subject or comment
                if any(kw in (subject + " " + comment) for kw in NEGATIVE_KEYWORDS):
                    # print(f"     skip 4ch thread {thread_no}: Contains negative keywords. Sub:'{subject[:30]}', Com:'{comment[:30]}'")
                    continue

                # Consider lowering or removing min replies if it's too strict
                # if thread.get("replies", 0) < 3: # Lowered minimum replies
                    # print(f"     skip 4ch thread {thread_no}: Less than 3 replies.")
                    # continue


                tid, ext = thread["tim"], thread["ext"]
                media_url = f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tid}{ext}"
                thumbnail_url = f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tid}s.jpg"

                # Check if media_url is actually accessible and valid before adding
                # This is an expensive check, only uncomment if you find many broken links
                # try:
                #     head_response = requests.head(media_url, timeout=5, headers=get_random_headers(media_url))
                #     if head_response.status_code != 200:
                #         print(f"     skip 4ch thread {thread_no}: Media URL {media_url} not accessible (HTTP {head_response.status_code}).")
                #         continue
                # except requests.exceptions.RequestException:
                #     print(f"     skip 4ch thread {thread_no}: Media URL {media_url} network error.")
                #     continue


                results.append({
                    "source":    "4chan (/x/)",
                    "author":    thread.get("name", "Anonymous"),
                    "title":     thread.get("sub") or comment[:80] or f"UAP Thread {thread_no}",
                    "description": comment[:800],
                    "media_url": media_url,
                    "thumbnail_url": thumbnail_url,
                    "media_type": "video",
                    "audio_url": "", # 4chan WebMs typically have embedded audio
                    "source_url": f"https://boards.4channel.org/{FOURCHAN_BOARD}/thread/{thread_no}",
                    "score":     0
                })
                processed_threads += 1
                time.sleep(random.uniform(0.1, 0.5)) # Small randomized delay per thread

        print(f"     Found {processed_threads} potential 4chan videos from main posts.")

    except json.JSONDecodeError as jde:
        print(f"  ✗ 4chan catalog JSON decode error: {jde}. Raw response: {r.text[:100]}... | UA: {current_headers['User-Agent']}")
    except requests.exceptions.RequestException as re_exc:
        print(f"  ✗ 4chan network/request error: {re_exc}. URL: {catalog_url} | UA: {current_headers['User-Agent']}")
    except Exception as e:
        print(f"  ✗ Unexpected 4chan error: {e}")

    random.shuffle(results)
    return results

# ---------------------------------------------------------------------------
# STORAGE & LEDGER
# ---------------------------------------------------------------------------

def check_and_zip_if_full():
    total = sum(os.path.getsize(os.path.join(MEDIA_FOLDER, f)) for f in os.listdir(MEDIA_FOLDER) if os.path.isfile(os.path.join(MEDIA_FOLDER, f)))
    if total < REPO_WARN_BYTES: return
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    zip_name = f"{ZIP_PREFIX}_{ts}.zip"
    print(f"🗜️ Threshold reached. Zipping to {zip_name}...")
    with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in os.listdir(MEDIA_FOLDER): zf.write(os.path.join(MEDIA_FOLDER, f), arcname=f)
    shutil.rmtree(MEDIA_FOLDER)
    os.makedirs(MEDIA_FOLDER)

def build_ledger():
    print("🛸 Initializing High-Discovery Archivist...")
    ledger = load_ledger()
    existing = { b["source_url"] for b in ledger }
    new_data = fetch_all_sources() # This will always return a list (possibly empty)
    added = 0

    for s in new_data:
        if s["source_url"] in existing: continue
        
        file_id = hashlib.md5(s["media_url"].encode()).hexdigest()
        
        # Only process if media_type is explicitly 'video'
        if s.get("media_type") == "video":
            ext = ".mp4" # Assume MP4 for simplicity after merge/download
            final_path = os.path.join(MEDIA_FOLDER, f"{file_id}{ext}")
            ledger_media_url = f"./media/{file_id}{ext}"
            
            if not os.path.exists(final_path):
                print(f"📦 Archiving Video: {s['title'][:40]}...")
                if s.get("platform") == "reddit_native" and s.get("audio_url"): # Ensure platform is reddit_native and audio_url exists
                    archived = merge_reddit_video(s["media_url"], s["audio_url"], final_path)
                else: # Generic download for other videos (e.g., 4chan, Reddit preview videos without separate audio)
                    archived = _download(s["media_url"], final_path)
                
                if archived and not _valid(final_path):
                    print(f"   ✗ File too small after download/merge ({os.path.getsize(final_path)} bytes) — discarding.")
                    try: os.remove(final_path)
                    except: pass
                    archived = False
            else: # File already exists locally
                archived = True

            # If local archival failed, fall back to CDN URL (may expire)
            if not archived:
                ledger_media_url = s["media_url"]
        else:
            # If not a video, use original media_url (e.g., if it's an image that wasn't filtered)
            ledger_media_url = s["media_url"]
            # And we are explicitly not archiving non-video types to local media folder
            # So, ensure media_type is correctly set if you decide to keep images later.
            # For now, it means it won't be saved locally if it's not a video.

        ledger_thumb_url = s["thumbnail_url"] # Keep original thumbnail URL

        timestamp = datetime.now(timezone.utc).isoformat()
        payload = f"{timestamp}|{s['source']}|{s['title']}|{s['media_url']}|{s['score']}"
        
        ledger.insert(0, {
            "timestamp": timestamp, "source": s["source"], "author": s["author"],
            "title": s["title"], "description": s["description"][:800],
            "media_url": ledger_media_url, # This will be local if archived, CDN if not.
            "thumbnail_url": ledger_thumb_url,
            "media_type": s["media_type"],
            "source_url": s["source_url"],
            "hash": hashlib.sha256(payload.encode()).hexdigest(), "score": s["score"],
            "platform": s.get("platform", "unknown") # Ensure platform is passed through
        })
        added += 1

    save_ledger(ledger) # Always save the ledger
    check_and_zip_if_full()
    print(f"✅ Finished. {added} sightings added.")

if __name__ == "__main__":
    build_ledger()