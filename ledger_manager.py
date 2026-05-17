import json
import os
from typing import List, Dict, Any

LEDGER_FILE: str = "ledger.json"

def load_ledger() -> List[Dict[str, Any]]:
    if os.path.exists(LEDGER_FILE):
        try:
            with open(LEDGER_FILE, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except json.JSONDecodeError:
            pass
    return []

def save_ledger(ledger: List[Dict[str, Any]]) -> None:
    # Cap at 5000 sightings to keep the JSON payload fast for the frontend browser
    optimized_ledger = ledger[:5000]
    with open(LEDGER_FILE, "w") as f:
        json.dump(optimized_ledger, f, indent=2)

def flag_block(block_hash: str, status: str) -> bool:
    """
    Interactive Feature: Allows researchers to flag a sighting as 'debunked' or 'verified'.
    """
    ledger = load_ledger()
    for block in ledger:
        if block.get("hash") == block_hash:
            block["status"] = status
            save_ledger(ledger)
            return True
    return False