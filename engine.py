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
from typing import List, Dict, Any
from moviepy import VideoFileClip, AudioFileClip
from ledger_manager import load_ledger, save_ledger

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
MEDIA_FOLDER = "media"
MAX_FILE_BYTES   = 100 * 1024 * 1024
REPO_WARN_BYTES  = 950 * 1024 * 1024
ZIP_PREFIX       = "media_archive"

if not os.path.exists(MEDIA_FOLDER):
    os.makedirs(MEDIA_FOLDER)

REDDIT_SUBS = ["UFOs", "UAP", "Aliens", "UFObelievers", "UFOdocumentaries", "UFOscience", "Mufon", "Experiencers", "TheUAPReport", "Skies_Above"]
FOURCHAN_BOARD  = "x"
SEARCH_POOL = [
    "ufo sighting video", "uap footage", "unidentified aerial", "strange lights sky",
    "tic tac ufo", "triangle craft", "orb sighting", "night vision ufo",
    "military uap encounter", "pilot ufo sighting", "dashcam ufo", "security camera uap",
    "pentagon uap video", "clear ufo footage", "black triangle sky", "fravor tic tac",
    "skinwalker ranch sighting", "mexico ufo video", "chile uap footage", "navy ufo radar"
]
LOCATIONS = ["Arizona", "Nevada", "California", "Texas", "Brazil", "London", "Canada", "Australia", "New Mexico"]
CRAFT_TYPES = ["Disc", "Orb", "Triangle", "Tic Tac", "Cigar", "Light"]
POSITIVE_KEYWORDS = ["ufo", "uap", "orb", "saucer", "tic tac", "tic-tac", "triangle", "sighting", "craft", "phenomenon", "footage", "video"]
NEGATIVE_KEYWORDS = ["furry", "psyop", "meme", "fake", "debunk", "cgi", "vfx", "blender", "movie", "game", "art", "drawing", "tattoo", "fiction", "joke", "project blue beam"]

# ---------------------------------------------------------------------------
# VIDEO MERGING (With the AAC + Bitrate Fix)
# ---------------------------------------------------------------------------

def merge_reddit_video(video_url, audio_url, final_path):
    v_temp = final_path + ".v.mp4"
    a_temp = final_path + ".a.mp4"
    try:
        # Download tracks
        for url, p in [(video_url, v_temp), (audio_url, a_temp)]:
            r = requests.get(url, stream=True, timeout=20)
            if r.status_code == 200:
                with open(p, 'wb') as f:
                    for chunk in r.iter_content(8192): f.write(chunk)

        if os.path.exists(a_temp):
            # MOVIEPY v2.0 SYNTAX
            video_clip = VideoFileClip(v_temp)
            audio_clip = AudioFileClip(a_temp)
            
            # Change 'set_audio' to 'with_audio'
            final_clip = video_clip.with_audio(audio_clip)
            
            print(f"🎬 Processing Video + Audio: {final_path}")
            
            # Standard Web-Ready Export
            final_clip.write_videofile(
                final_path, 
                fps=30, 
                codec="libx264", 
                audio_codec="aac", 
                audio_bitrate="192k", 
                logger=None
            )
            
            video_clip.close()
            audio_clip.close()
        else:
            # Fallback if no audio found
            os.rename(v_temp, final_path)
            
    except Exception as e:
        print(f"   ⚠️ Merge Error: {e}")
    finally:
        if os.path.exists(v_temp): os.remove(v_temp)
        if os.path.exists(a_temp): os.remove(a_temp)

# ---------------------------------------------------------------------------
# SCRAPERS
# ---------------------------------------------------------------------------

def process_reddit_data(data, label):
    results = []
    for post in data.get("data", {}).get("children", []):
        p = post["data"]
        title = p.get("title", "")
        content = (title + p.get("selftext", "")).lower()
        
        if p.get("score", 0) < 10: continue
        if not any(kw in content for kw in POSITIVE_KEYWORDS): continue
        if any(kw in content for kw in NEGATIVE_KEYWORDS): continue

        media_url, thumb_url, m_type, audio_url = "", "", "", ""
        
        if p.get("is_video") and p.get("media") and p["media"].get("reddit_video"):
            media_url = p["media"]["reddit_video"]["fallback_url"]
            thumb_url = p.get("thumbnail", "")
            m_type = "video"
            audio_url = re.sub(r"(v.redd.it/\w+/)(\w+)(\.mp4)", r"\1DASH_audio\3", media_url).split('?')[0]
        elif p.get("preview") and p["preview"].get("images"):
            img = p["preview"]["images"][0]
            media_url = img["source"]["url"]
            res = img.get("resolutions", [])
            thumb_url = res[2]["url"] if len(res) > 2 else media_url
            m_type = "image"
            if "variants" in img and "mp4" in img["variants"]:
                media_url = img["variants"]["mp4"]["source"]["url"]
                m_type = "video"

        if media_url:
            results.append({
                "source": label, "author": p.get("author", "Anonymous"),
                "title": title, "description": p.get("selftext", ""),
                "media_url": media_url, "thumbnail_url": thumb_url,
                "media_type": m_type, "audio_url": audio_url,
                "source_url": f"https://reddit.com{p['permalink']}", "score": p["score"]
            })
    return results

def fetch_all_sources():
    results = []
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/114.0 Firefox/114.0"})
    
    subs_to_check = REDDIT_SUBS.copy()
    random.shuffle(subs_to_check)

    for sub in subs_to_check[:6]:
        sort_method = random.choice(["hot", "rising", "new", "top"])
        time_filter = "&t=week" if sort_method == "top" else ""
        
        print(f"🎲 Random Sort: /r/{sub} ({sort_method})...")
        try:
            url = f"https://www.reddit.com/r/{sub}/{sort_method}.json?limit=15&raw_json=1{time_filter}"
            r = s.get(url, timeout=15)
            results.extend(process_reddit_data(r.json(), f"Reddit (/r/{sub})"))
        except: pass
        time.sleep(random.uniform(2, 4))

    random_queries = random.sample(SEARCH_POOL, 3)
    
    dynamic_query_1 = f"{random.choice(LOCATIONS)} {random.choice(CRAFT_TYPES)} Sighting"
    dynamic_query_2 = f"{random.choice(CRAFT_TYPES)} Footage {random.choice(LOCATIONS)}"
    random_queries.extend([dynamic_query_1, dynamic_query_2])

    for q in random_queries:
        sort_type = random.choice(["new", "relevance"])
        print(f"🔍 Dynamic Search ({sort_type}): '{q}'...")
        try:
            url = f"https://www.reddit.com/search.json?q={q}&sort={sort_type}&limit=15&raw_json=1"
            r = s.get(url, timeout=15)
            results.extend(process_reddit_data(r.json(), "Reddit Discovery"))
        except: pass
        time.sleep(random.uniform(2, 4))

    print("Scraping 4chan /x/...")
    try:
        r4 = requests.get(f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json", timeout=10)
        catalog = r4.json()
        random.shuffle(catalog)
        for page in catalog[:3]:
            for thread in page.get("threads", []):
                comment = re.sub(r"<[^>]+>", " ", thread.get("com", ""))
                if thread.get("replies", 0) > 8 and any(kw in (thread.get("sub","")+comment).lower() for kw in POSITIVE_KEYWORDS):
                    if "tim" in thread:
                        results.append({
                            "source": "4chan (/x/)", "author": thread.get("name", "Anonymous"),
                            "title": thread.get("sub") or "UAP Intel", "description": comment,
                            "media_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{thread['tim']}{thread['ext']}",
                            "thumbnail_url": f"https://i.4cdn.org/{FOURCHAN_BOARD}/{thread['tim']}s.jpg",
                            "media_type": "video" if thread["ext"] in [".webm", ".mp4"] else "image",
                            "audio_url": "", "source_url": f"https://boards.4channel.org/{FOURCHAN_BOARD}/thread/{thread['no']}", "score": 0
                        })
    except: pass
    
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
    new_data = fetch_all_sources()
    added = 0

    for s in new_data:
        if s["source_url"] in existing: continue
        
        file_id = hashlib.md5(s["media_url"].encode()).hexdigest()
        ext = ".mp4" if s["media_type"] == "video" else ".jpg"
        final_path = os.path.join(MEDIA_FOLDER, f"{file_id}{ext}")
        thumb_path = os.path.join(MEDIA_FOLDER, f"{file_id}_thumb.jpg")

        if not os.path.exists(final_path):
            print(f"📦 Archiving: {s['title'][:40]}...")
            if s["media_type"] == "video" and "v.redd.it" in s["media_url"]:
                merge_reddit_video(s["media_url"], s["audio_url"], final_path)
            else:
                r = requests.get(s["media_url"], stream=True)
                with open(final_path, 'wb') as f:
                    for chunk in r.iter_content(8192): f.write(chunk)
            
            rt = requests.get(s["thumbnail_url"], stream=True)
            with open(thumb_path, 'wb') as f:
                for chunk in rt.iter_content(8192): f.write(chunk)

        timestamp = datetime.now(timezone.utc).isoformat()
        payload = f"{timestamp}|{s['source']}|{s['title']}|{s['media_url']}|{s['score']}"
        
        ledger.insert(0, {
            "timestamp": timestamp, "source": s["source"], "author": s["author"],
            "title": s["title"], "description": s["description"][:800],
            "media_url": f"./media/{file_id}{ext}",
            "thumbnail_url": f"./media/{file_id}_thumb.jpg",
            "media_type": s["media_type"], "source_url": s["source_url"],
            "hash": hashlib.sha256(payload.encode()).hexdigest(), "score": s["score"]
        })
        added += 1

    if added > 0: save_ledger(ledger)
    check_and_zip_if_full()
    print(f"✅ Finished. {added} sightings added.")

if __name__ == "__main__":
    build_ledger()