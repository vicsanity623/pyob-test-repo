import hashlib
import requests
import json
from datetime import datetime, timezone
import time
import re
import random
from typing import List, Dict, Any
from ledger_manager import load_ledger, save_ledger

REDDIT_SUBS = ["UFOs", "UAP", "Aliens", "UFObelievers", "UFOdocumentaries", "UFOscience", "Mufon", "Experiencers"]
FOURCHAN_BOARD = "x"

POSITIVE_KEYWORDS = ["ufo", "uap", "orb", "saucer", "tic tac", "tic-tac", "triangle", "sighting", "craft", "phenomenon"]
NEGATIVE_KEYWORDS = ["furry", "ai generated", "aiart", "ai", "deepfake", "psyop", "meme", "fake", "debunk", "cgi", "vfx", "blender", "movie", "game", "art", "drawing", "tattoo", "fiction", "joke", "project blue beam"]

def get_previous_hash(ledger: List[Dict[str, Any]]) -> str:
    if not ledger:
        return "0000000000000000000000000000000000000000000000000000000000000000"
    return ledger[0]["hash"]

def create_block(
    source: str, author: str, title: str, description: str,
    media_url: str, thumbnail_url: str, media_type: str, source_url: str, prev_hash: str, score: int = 0
) -> Dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat()
    # We include the score in the hash payload so popularity is also cryptographically sealed
    payload = f"{timestamp}|{source}|{title}|{media_url}|{score}|{prev_hash}"
    block_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    return {
        "timestamp": timestamp,
        "source": source,
        "author": author,
        "title": title,
        "description": description[:800], 
        "media_url": media_url,
        "thumbnail_url": thumbnail_url,
        "media_type": media_type,
        "source_url": source_url,
        "prev_hash": prev_hash,
        "hash": block_hash,
        "score": score
    }

def is_high_quality(title: str, text: str) -> bool:
    content = (title + " " + text).lower()
    has_positive = any(kw in content for kw in POSITIVE_KEYWORDS)
    has_negative = any(kw in content for kw in NEGATIVE_KEYWORDS)
    return has_positive and not has_negative

def fetch_reddit_sightings() -> List[Dict[str, Any]]:
    results = []
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/114.0 Firefox/114.0",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.google.com/",
        "DNT": "1",
    })

    try:
        session.get("https://www.reddit.com/", timeout=10)
        time.sleep(random.uniform(2, 4))
    except:
        pass

    for sub in REDDIT_SUBS:
        print(f"Scraping Reddit: /r/{sub} (Hot)...")
        url = f"https://www.reddit.com/r/{sub}/hot.json?limit=25&raw_json=1&t={int(time.time())}"
        
        try:
            res = session.get(url, timeout=15)
            if res.status_code != 200:
                print(f"⚠️ Reddit blocked request for /r/{sub} (Status: {res.status_code})")
                continue

            data = res.json()
            posts = data.get("data", {}).get("children", [])
            
            for post in posts:
                p = post["data"]
                title = p.get("title", "")
                
                if p.get("score", 0) < 40: continue
                if not is_high_quality(title, p.get("selftext", "")): continue
                
                media_url, thumbnail_url, media_type = "", "", ""
                
                if p.get("is_video") and p.get("media") and p["media"].get("reddit_video"):
                    media_url = p["media"]["reddit_video"].get("fallback_url", "")
                    thumbnail_url = p.get("thumbnail", "")
                    media_type = "video"
                
                elif p.get("preview") and p["preview"].get("images"):
                    img_data = p["preview"]["images"][0]
                    media_url = img_data["source"]["url"]
                    resolutions = img_data.get("resolutions", [])
                    thumbnail_url = resolutions[2]["url"] if len(resolutions) > 2 else media_url
                    media_type = "image"
                    
                    if "variants" in img_data and "mp4" in img_data["variants"]:
                        media_url = img_data["variants"]["mp4"]["source"]["url"]
                        media_type = "video"

                if thumbnail_url in ["self", "default", "nsfw", "spoiler", ""]:
                    thumbnail_url = media_url

                if media_url and thumbnail_url:
                    results.append({
                        "source": f"Reddit (/r/{sub})",
                        "author": p.get("author", "Anonymous"),
                        "title": title,
                        "description": p.get("selftext", ""),
                        "media_url": media_url,
                        "thumbnail_url": thumbnail_url,
                        "media_type": media_type,
                        "source_url": f"https://reddit.com{p.get('permalink', '')}",
                        "score": p.get("score", 0) # <--- SECTION 1: Extracting score from Reddit
                    })
        except Exception as e:
            print(f"⚠️ Error parsing /r/{sub}: {e}")
        
        time.sleep(random.uniform(4, 7))
        
    return results

def fetch_4chan_sightings() -> List[Dict[str, Any]]:
    results = []
    print(f"Scraping 4chan: /{FOURCHAN_BOARD}/...")
    try:
        res = requests.get(f"https://a.4cdn.org/{FOURCHAN_BOARD}/catalog.json", timeout=10)
        if res.status_code != 200: return results
        
        for page in res.json():
            for thread in page.get("threads", []):
                title = thread.get("sub", "")
                comment = re.sub(r'<[^>]+>', ' ', thread.get("com", ""))
                
                if thread.get("replies", 0) < 5: continue

                if is_high_quality(title, comment) and "tim" in thread:
                    tim = thread["tim"]
                    ext = thread["ext"]
                    media_url = f"https://i.4cdn.org/{FOURCHAN_BOARD}/{tim}{ext}"
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
                        "source_url": f"https://boards.4channel.org/{FOURCHAN_BOARD}/thread/{thread.get('no')}",
                        "score": 0 # <--- SECTION 2: 4chan has no upvotes, so we use 0
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
            
        # SECTION 3: Passing the score from the dictionary into the create_block function
        block = create_block(
            source=sighting["source"], 
            author=sighting["author"],
            title=sighting["title"], 
            description=sighting["description"],
            media_url=sighting["media_url"], 
            thumbnail_url=sighting["thumbnail_url"],
            media_type=sighting["media_type"], 
            source_url=sighting["source_url"],
            prev_hash=get_previous_hash(ledger),
            score=sighting.get("score", 0) # <--- Grab the score here
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