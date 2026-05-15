import hashlib
import requests
import feedparser  # type: ignore
import nltk  # type: ignore
from datetime import datetime, timezone
import time
import random
from typing import List, Dict, Tuple
from ledger_manager import load_ledger, save_ledger

nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)

LEDGER_FILE: str = "ledger.json"
MAX_RUNTIME_SEC: int = 45 * 60

HEADERS: Dict[str, str] = {
    "User-Agent": "AxiomEngineBot/2.0 (https://github.com/; axiom-engine@example.com) python-requests/2.x"
}

# Expanded seed list for dynamic Wikipedia exploration
WIKI_SEEDS: List[Tuple[str, str]] = [
    ("Eminem", "Eminem"),
    ("Hip_hop_music", "Hip Hop History"),
    ("Dr._Dre", "Hip Hop History"),
    ("50_Cent", "Hip Hop History"),
    ("The_Marshall_Mathers_LP", "Eminem"),
    ("The_Eminem_Show", "Eminem"),
    ("Recovery_(Eminem_album)", "Eminem"),
    ("Rap_God", "Eminem"),
    ("Lose_Yourself", "Eminem"),
    ("Tupac_Shakur", "Hip Hop History"),
    ("The_Notorious_B.I.G.", "Hip Hop History"),
    ("Snoop_Dogg", "Hip Hop History"),
    ("Detroit_hip_hop", "Hip Hop History"),
    ("Aftermath_Entertainment", "Hip Hop Business"),
    ("Interscope_Records", "Hip Hop Business"),
    ("Billboard_200", "Charts"),
    ("RIAA_certification", "Industry Stats"),
    ("Grammy_Award_for_Best_Rap_Album", "Awards"),
    ("N.W.A", "Hip Hop History"),
    ("Jay-Z", "Hip Hop History"),
]

RSS_TARGETS: List[Tuple[str, str]] = [
    (
        "Google News Hip Hop",
        "https://news.google.com/rss/search?q=hip+hop+music+news&hl=en-US&gl=US&ceid=US:en",
    ),
    ("HipHopDX", "https://hiphopdx.com/rss/news"),
    ("Billboard Hip-Hop", "https://www.billboard.com/c/music/rb-hip-hop/feed/"),
    ("Rolling Stone", "https://www.rollingstone.com/music/feed/"),
    ("HotNewHipHop", "https://www.hotnewhiphop.com/feed/"),
    ("Pitchfork", "https://pitchfork.com/rss/news/"),
    ("AllHipHop", "https://allhiphop.com/feed/"),
]


def get_previous_hash(ledger: List[Dict[str, str]]) -> str:
    if not ledger:
        return "0000000000000000000000000000000000000000000000000000000000000000"
    return ledger[0]["hash"]


def verify_ledger_integrity(ledger: List[Dict[str, str]]) -> bool:
    """
    Validates the integrity of the ledger by re-calculating hashes
    and checking the link between blocks.
    """
    for i in range(len(ledger) - 1):
        current_block: Dict[str, str] = ledger[i]
        next_block: Dict[str, str] = ledger[i + 1]

        payload: str = (
            f"{current_block['timestamp']}|{current_block['source']}|"
            f"{current_block['topic']}|{current_block['fact']}|"
            f"{current_block['image_url']}|{current_block['source_url']}|"
            f"{current_block['prev_hash']}"
        )
        calculated_hash: str = hashlib.sha256(payload.encode("utf-8")).hexdigest()

        if calculated_hash != current_block["hash"]:
            return False

        if current_block["prev_hash"] != next_block["hash"]:
            return False

    return True


def create_block(
    fact_text: str,
    source: str,
    topic: str,
    prev_hash: str,
    image_url: str = "",
    source_url: str = "",
) -> Dict[str, str]:
    timestamp = datetime.now(timezone.utc).isoformat()
    payload = (
        f"{timestamp}|{source}|{topic}|{fact_text}|{image_url}|{source_url}|{prev_hash}"
    )
    block_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    return {
        "timestamp": timestamp,
        "source": source,
        "topic": topic,
        "fact": fact_text,
        "image_url": image_url,
        "source_url": source_url,
        "prev_hash": prev_hash,
        "hash": block_hash,
    }


def fetch_wikipedia_facts(title: str, topic: str) -> Tuple[List[str], str, str, str]:
    url = f"https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&explaintext=1&titles={title}&pithumbsize=800&format=json"
    source_url = f"https://en.wikipedia.org/wiki/{title}"
    facts: List[str] = []
    image_url: str = ""

    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()

        pages = data.get("query", {}).get("pages", {})
        if not pages:
            return facts, "Wikipedia", image_url, source_url

        page_data = list(pages.values())[0]
        text = page_data.get("extract", "")
        image_url = page_data.get("thumbnail", {}).get("source", "")

        if not text:
            return facts, "Wikipedia", image_url, source_url

        sentences = nltk.tokenize.sent_tokenize(text)
        keywords = [
            "million",
            "billion",
            "certified",
            "Grammy",
            "Billboard",
            "Tour",
            "released",
            "sold",
            "record",
            "platinum",
            "debut",
            "born",
            "track",
            "song",
        ]

        for sentence in sentences:
            if 40 <= len(sentence) <= 220 and any(kw in sentence for kw in keywords):
                clean_fact = sentence.replace("\n", " ").strip()
                facts.append(clean_fact)
                if len(facts) >= 15:
                    break

    except Exception as e:
        print(f"⚠️ Error fetching Wikipedia ({title}): {e}")

    return facts, "Wikipedia", image_url, source_url


def run_engine_cycle(ledger: List[Dict[str, str]]) -> Tuple[int, List[Dict[str, str]]]:
    new_facts: List[Dict[str, str]] = []

    # Discovery Mode: Pick 4 random targets
    current_wiki_batch = random.sample(WIKI_SEEDS, k=min(4, len(WIKI_SEEDS)))

    print(
        f"Scraping Wikipedia (Discovery Mode: {', '.join([t[0] for t in current_wiki_batch])})..."
    )
    for title, topic in current_wiki_batch:
        facts, source, img_url, src_url = fetch_wikipedia_facts(title, topic)
        for fact in facts:
            new_facts.append(
                {
                    "fact": fact,
                    "source": source,
                    "topic": topic,
                    "image_url": img_url,
                    "source_url": src_url,
                }
            )
        time.sleep(1)

    print("Scraping RSS Feeds (Discovery Mode)...")
    for source_name, rss_url in RSS_TARGETS:
        try:
            feed = feedparser.parse(rss_url, agent=HEADERS["User-Agent"])
            for entry in feed.entries[:15]:
                title = entry.get("title", "")
                discovery_keywords = [
                    "eminem",
                    "rap",
                    "hip hop",
                    "dre",
                    "album",
                    "music",
                    "chart",
                    "concert",
                ]
                if any(kw in title.lower() for kw in discovery_keywords):
                    img_url = ""
                    src_url = entry.get("link", "")

                    # FIXED: Added safe get() calls to prevent Pitchfork/RSS 'url' errors
                    if "media_content" in entry and len(entry.media_content) > 0:
                        img_url = entry.media_content[0].get("url", "")
                    elif "links" in entry:
                        for link in entry.links:
                            if "image" in link.get("type", ""):
                                img_url = link.get("href", "")
                                break

                    new_facts.append(
                        {
                            "fact": title,
                            "source": source_name,
                            "topic": "Trending News",
                            "image_url": img_url,
                            "source_url": src_url,
                        }
                    )
        except Exception as e:
            print(f"⚠️ Error fetching RSS ({source_name}): {e}")
        time.sleep(1)

    existing_facts = set(block["fact"] for block in ledger)
    added = 0

    for item in reversed(new_facts):
        if item["fact"] not in existing_facts:
            prev_hash = get_previous_hash(ledger)
            block = create_block(
                item["fact"],
                item["source"],
                item["topic"],
                prev_hash,
                item.get("image_url", ""),
                item.get("source_url", ""),
            )
            ledger.insert(0, block)
            existing_facts.add(item["fact"])
            added += 1

    return added, ledger


if __name__ == "__main__":
    print(
        f"🚀 Starting Axiom Engine. Programmed to run for {MAX_RUNTIME_SEC / 60:.1f} minutes..."
    )
    start_time: float = time.time()
    ledger: List[Dict[str, str]] = load_ledger()

    cycle: int = 1
    while True:
        elapsed: float = time.time() - start_time
        if elapsed > MAX_RUNTIME_SEC:
            print("🛑 Max runtime reached. Saving final ledger and shutting down.")
            save_ledger(ledger)
            break

        print(f"\n--- Starting Cycle {cycle} ---")
        added, ledger = run_engine_cycle(ledger)
        save_ledger(ledger)

        print(f"✅ Cycle {cycle} Complete. Added {added} new verified blocks.")

        sleep_duration: float = 15.0 * 60.0
        sleep_duration += random.randint(1, 30)

        if (time.time() - start_time) + sleep_duration > MAX_RUNTIME_SEC:
            sleep_duration = float(MAX_RUNTIME_SEC) - (time.time() - start_time)

        if sleep_duration > 0:
            print(
                f"💤 Sleeping for {sleep_duration / 60:.1f} minutes before next cycle..."
            )
            time.sleep(sleep_duration)

        cycle += 1
