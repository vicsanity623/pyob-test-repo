import json
import hashlib
import requests
import feedparser
from bs4 import BeautifulSoup
import nltk
from datetime import datetime, timezone
import os

# Download NLTK tokenizer models (Updated to include 'punkt_tab')
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

LEDGER_FILE = "ledger.json"

# Proper User-Agent to prevent Wikipedia & RSS feeds from blocking the GitHub Actions IP
HEADERS = {
    "User-Agent": "AxiomEngineBot/1.0 (https://github.com/; axiom-engine@example.com) python-requests/2.x"
}

def get_previous_hash(ledger):
    if not ledger:
        return "0000000000000000000000000000000000000000000000000000000000000000" # Genesis block
    return ledger[0]['hash'] # Top of the list is the most recent

def create_block(fact_text, source, topic, prev_hash):
    timestamp = datetime.now(timezone.utc).isoformat()
    # Create the data payload to be hashed
    payload = f"{timestamp}|{source}|{topic}|{fact_text}|{prev_hash}"
    block_hash = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    
    return {
        "timestamp": timestamp,
        "source": source,
        "topic": topic,
        "fact": fact_text,
        "prev_hash": prev_hash,
        "hash": block_hash
    }

def fetch_wikipedia_facts(title, topic):
    url = f"https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles={title}&format=json"
    facts = []
    
    try:
        # Pass the headers to satisfy Wikipedia's bot policy
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status() # Raise error if HTTP status is not 200 OK
        data = response.json()
        
        pages = data.get('query', {}).get('pages', {})
        if not pages:
            return facts, "Wikipedia"
            
        text = list(pages.values())[0].get('extract', '')
        if not text:
            return facts, "Wikipedia"
        
        sentences = nltk.tokenize.sent_tokenize(text)
        
        # NLP Filter: Only keep sentences containing verifiable metrics/keywords
        keywords = ['million', 'billion', 'certified', 'Grammy', 'Billboard', 'released', 'sold', 'record']
        
        for sentence in sentences:
            if len(sentence) < 40 or len(sentence) > 200:
                continue # Skip too short or too long sentences
            if any(kw in sentence for kw in keywords):
                # Clean up newlines in the text
                clean_fact = sentence.replace('\n', ' ').strip()
                facts.append(clean_fact)
                if len(facts) >= 20: # Limit per source
                    break
                    
    except Exception as e:
        print(f"⚠️ Error fetching Wikipedia ({title}): {e}")
        
    return facts, "Wikipedia"

def generate_ledger():
    # Load existing ledger
    if os.path.exists(LEDGER_FILE):
        try:
            with open(LEDGER_FILE, 'r') as f:
                ledger = json.load(f)
        except json.JSONDecodeError:
            ledger = []
    else:
        ledger = []

    new_facts = []
    
    # 1. Scrape Wikipedia (Eminem & Hip Hop)
    print("Scraping Wikipedia...")
    wiki_targets = [("Eminem", "Eminem"), ("Hip_hop_music", "Hip Hop History")]
    for title, topic in wiki_targets:
        facts, source = fetch_wikipedia_facts(title, topic)
        for fact in facts:
            new_facts.append({"fact": fact, "source": source, "topic": topic})

    # 2. Scrape RSS Feeds
    print("Scraping RSS Feeds...")
    try:
        rss_url = "https://hiphopdx.com/rss/news"
        feed = feedparser.parse(rss_url, agent=HEADERS["User-Agent"])
        for entry in feed.entries[:15]:
            title = entry.title
            if 'eminem' in title.lower() or 'rap' in title.lower() or 'hip hop' in title.lower():
                new_facts.append({"fact": title, "source": "HipHopDX RSS", "topic": "Trending"})
    except Exception as e:
        print(f"⚠️ Error fetching RSS: {e}")

    # Filter out duplicates against existing ledger
    existing_facts = set(block['fact'] for block in ledger)
    
    # Seal new facts into the ledger
    added = 0
    # Process from bottom to top so newest scraped items end up at the top
    for item in reversed(new_facts):
        if item['fact'] not in existing_facts:
            prev_hash = get_previous_hash(ledger)
            block = create_block(item['fact'], item['source'], item['topic'], prev_hash)
            ledger.insert(0, block) # Insert at the beginning (newest first)
            existing_facts.add(item['fact'])
            added += 1

    # Keep only top 500 facts to prevent file bloat on GitHub pages
    ledger = ledger[:500]

    # Save Ledger
    with open(LEDGER_FILE, 'w') as f:
        json.dump(ledger, f, indent=2)

    print(f"✅ Axiom Engine Run Complete. Added {added} new verified blocks.")

if __name__ == "__main__":
    generate_ledger()
