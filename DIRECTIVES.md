# HUMAN DIRECTIVES (CRITICAL)
1. This repository uses extremely strict CI checks via `check.sh`.
2. BEFORE you finalize any code changes, you MUST ensure they pass Ruff formatting and Mypy strict typing.
3. If you add new third-party imports that cause Mypy `[no-any-unimported]` errors, you MUST append `# type: ignore[import-untyped]` to the import line.
4. Run `./check.sh` locally in your sandbox to verify your changes before committing.
5. FRONTEND ARCHITECTURE (SPA Logic): 
   - UI INTEGRITY: Maintain 100% functionality for all interactive elements: Search (must auto-blur/hide keyboard on mobile), Category Chips, and Sidebar Tabs (Home, Favorites, History).
   - GRID GROUPING LOGIC: In the Grid View, consolidate facts visually. All items sharing a "Source" and "Topic" must display the "Main Topic" as the primary thumbnail text/image.
   - DATA ENCAPSULATION: The Grid acts as a "Topic Hub." Clicking a thumbnail must trigger the "Watch View" to display the specific individual fact, its unique cryptographic hash, and the previous block hash.
   - VERIFICATION UI: The Detail/Watch view must clearly render all metadata fields: Source URL, Timestamp, Topic, and the full Block Payload to preserve the "Ledger" aesthetic.
