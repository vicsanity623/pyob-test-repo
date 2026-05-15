import json
import os
from typing import List, Dict
import sys

LEDGER_FILE: str = "ledger.json"


def load_ledger() -> List[Dict[str, str]]:
    if os.path.exists(LEDGER_FILE):
        try:
            with open(LEDGER_FILE, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except json.JSONDecodeError:
            pass
    return []


def save_ledger(ledger: List[Dict[str, str]]) -> None:
    temp_file: str = f"{LEDGER_FILE}.tmp"
    with open(temp_file, "w") as f:
        json.dump(ledger, f, indent=2)
    os.replace(temp_file, LEDGER_FILE)


def flag_block(block_hash: str, status: str) -> bool:
    """
    Interactive Feature: Allows users to flag a block as 'verified' or 'disputed'.
    """
    ledger = load_ledger()
    for block in ledger:
        if block.get("hash") == block_hash:
            block["status"] = status
            save_ledger(ledger)
            return True
    return False


def interactive_flag_block() -> None:
    """
    Prompt the user to enter a block hash and a status, then flag the block.
    """
    ledger: List[Dict[str, str]] = load_ledger()
    if not ledger:
        print("Ledger is empty or missing.", file=sys.stderr)
        return

    block_hash: str = input("Enter block hash to flag: ").strip()
    if not any(b.get("hash") == block_hash for b in ledger):
        print(f"No block found with hash: {block_hash}", file=sys.stderr)
        return

    status: str = ""
    while status not in ("verified", "disputed"):
        status_input: str = (
            input("Set status ('verified' or 'disputed'): ").strip().lower()
        )
        if status_input in ("verified", "disputed"):
            status = status_input
        else:
            print("Invalid status. Please enter 'verified' or 'disputed'.")

    if flag_block(block_hash, status):
        print(f"Block {block_hash} flagged as {status}.")
    else:
        print(f"Failed to flag block {block_hash}.", file=sys.stderr)


if __name__ == "__main__":
    interactive_flag_block()
