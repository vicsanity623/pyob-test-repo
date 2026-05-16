import hashlib
import requests
import json
from datetime import datetime, timezone
import time
import re
from html import unescape
from typing import List, Dict, Any
from ledger_manager import load_ledger, save_ledger

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json"
}


REDDIT_SUBS = ["UFOs", "UAP", "UFObelievers", "UFOdocumentaries"]
FOURCHAN_BOARD = "x"

POSITIVE_KEYWORDS = ["ufo", "uap", "uso", "orb", "saucer", "tic tac", "tic-tac", "triangle", "sighting", "craft", "phenomenon"]
NEGATIVE_KEYWORDS = ["furry", "ai", "psyop", "generated", "ai generated" "meme", "fake", "debunk", "cgi", "vfx", "blender", "movie", "game", "art", "drawing", "tattoo", "fiction", "joke", "project blue beam"]

def get_previous_hash(ledger: List[Dict[str, Any]]) -> str:
    if not ledger:
        return "0000000000000000000000000000000000000000000000000000000000000000"
    return ledger[0]["hash"]

def create_block(
    source: str, author: str, title: str, description: str,
    media_url: str, thumbnail_url: str, media_type: str, source_url: str, prev_hash: str
) -> Dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat()
    payload = f"{timestamp}|{source}|{title}|{media_url}|{prev_hash}"
    block_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    return {
        "timestamp": timestamp,
        "source": source,
        "author": author,
        "title": title,
        "description": description[:800], # Keep it concise
        "media_url": media_url,
        "thumbnail_url": thumbnail_url,
        "media_type": media_type,
        "source_url": source_url,
        "prev_hash": prev_hash,
        "hash": block_hash,
    }

def is_high_quality(title: str, text: str) -> bool:
    content = (title + " " + text).lower()
    has_positive = any(kw in content for kw in POSITIVE_KEYWORDS)
    has_negative = any(kw in content for kw in NEGATIVE_KEYWORDS)
    return has_positive and not has_negative

def fetch_reddit_sightings() -> List[Dict[str, Any]]:
    results = []
    for sub in REDDIT_SUBS:
        print(f"Scraping Reddit: /r/{sub} (Hot)...")
        url = f"https://www.reddit.com/r/{sub}/hot.json?limit=30"
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            if res.status_code != 200:
                print(f"⚠️ Reddit blocked request for /r/{sub} (Status: {res.status_code}).")
                continue

            posts = res.json().get("data", {}).get("children", [])
            for post in posts:
                p = post["data"]
                title = unescape(p.get("title", ""))
                
                if p.get("score", 0) < 50:
                    continue
                
                if not is_high_quality(title, p.get("selftext", "")):
                    continue
                
                media_url = ""
                thumbnail_url = ""
                media_type = ""
                
                if p.get("is_video") and p.get("media") and p["media"].get("reddit_video"):
                    media_url = p["media"]["reddit_video"].get("fallback_url", "")
                    thumbnail_url = p.get("thumbnail", "")
                    media_type = "video"
                
                elif p.get("preview") and p["preview"].get("images"):
                    img_data = p["preview"]["images"][0]
                    media_url = unescape(img_data["source"]["url"])
                    
                    resolutions = img_data.get("resolutions", [])
                    if len(resolutions) > 2:
                        thumbnail_url = unescape(resolutions[2]["url"])
                    else:
                        thumbnail_url = media_url
                    
                    media_type = "image"
                    if "mp4" in p.get("url", "") or "gifv" in p.get("url", ""):
                        if "variants" in img_data and "mp4" in img_data["variants"]:
                            media_url = unescape(img_data["variants"]["mp4"]["source"]["url"])
                            media_type = "video"

                if thumbnail_url in ["self", "default", "nsfw", "spoiler"]:
                    thumbnail_url = media_url

                if media_url and thumbnail_url:
                    results.append({
                        "source": f"Reddit (/r/{sub})",
                        "author": p.get("author", "Anonymous"),
                        "title": title,
                        "description": unescape(p.get("selftext", "")),
                        "media_url": media_url,
                        "thumbnail_url": thumbnail_url,
                        "media_type": media_type,
                        "source_url": f"https://reddit.com{p.get('permalink', '')}"
                    })
        except Exception as e:
            print(f"⚠️ Error parsing /r/{sub}: {e}")
        time.sleep(6)
    return results

def fetch_4chan_sightings() -> List[Dict[str, Any]]:
    results = []
    print(f"Scraping 4chan: /{FOURCHAN_BOARD}/...")
    try:
        res = requests.get(f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json", headers=HEADERS, timeout=10)
        if res.status_code != 200: return results
        
        for page in res.json():
            for thread in page.get("threads", []):
                title = unescape(thread.get("sub", ""))
                comment = unescape(re.sub(r'<[^>]+>', ' ', thread.get("com", "")))
                
                # Quality control: Must have some replies to be relevant
                if thread.get("replies", 0) < 5:
                    continue

                if is_high_quality(title, comment) and "tim" in thread:
                    tim = thread["tim"]
                    ext = thread["ext"]
                    
                    media_url = f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tim}{ext}"
                    # 4chan generates dedicated thumbnails with 's.jpg'
                    thumbnail_url = f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tim}s.jpg"
                    media_type = "video" if ext in [".webm", ".mp4"] else "image"
                    
                    results.append({
                        "source": f"4chan (/{FOURCHAN_BOARD}/)",
                        "author": thread.get("name", "Anonymous"),
                        "title": title if title else "UAP Sighting Data",
                        "description": comment,
                        "media_url": media_url,
                        "thumbnail_url": thumbnail_url,
                        "media_type": media_type,
                        "source_url": f"https://boards.4channel.org/{FOURCHAN_BOARD}/thread/{thread.get('no')}"
                    })
    except Exception as e:
        print(f"⚠️ Error with 4chan: {e}")
    return results

def build_uap_ledger() -> None:
    print("🛸 Initializing Strict Axiom UAP Tracker...")
    ledger = load_ledger()
    existing_urls = { b["media_url"] for b in ledger }
    added_count = 0

    new_sightings = fetch_reddit_sightings() + fetch_4chan_sightings()
    
    for sighting in new_sightings:
        if sighting["media_url"] in existing_urls: continue
            
        block = create_block(
            source=sighting["source"], author=sighting["author"],
            title=sighting["title"], description=sighting["description"],
            media_url=sighting["media_url"], thumbnail_url=sighting["thumbnail_url"],
            media_type=sighting["media_type"], source_url=sighting["source_url"],
            prev_hash=get_previous_hash(ledger)
        )
        ledger.insert(0, block)
        existing_urls.add(sighting["media_url"])
        added_count += 1

    if added_count > 0:
        print(f"\n💾 Encrypted {added_count} high-quality sightings into ledger.")
        save_ledger(ledger)
    else:
        print("\n📭 No new high-quality sightings found. Ledger is up to date.")

if __name__ == "__main__":
    build_uap_ledger()