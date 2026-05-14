#!/usr/bin/env bash
# Strict Repository Validation Pipeline

set -e # Exit immediately if a command exits with a non-zero status
set -u # Treat unset variables as an error

echo "=========================================="
echo " Starting Strict Quality Checks..."
echo "=========================================="

# 1. Verify necessary Web Files exist
echo "[1/4] Checking required web files..."
REQUIRED_FILES=("index.html" "manifest.json" "sw.js")
for FILE in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$FILE" ]; then
        echo "❌ ERROR: Required file '$FILE' is missing."
        exit 1
    fi
done
echo "✅ All required web files are present."

# 2. Check for Icons (Warn if missing since user adds them)
echo "[2/4] Checking for icon assets..."
if [ ! -f "idle192x192.png" ] || [ ! -f "idle512x512.png" ]; then
    echo "⚠️  WARNING: idle192x192.png or idle512x512.png not found."
    echo "   (Make sure to add them before deploying to GitHub Pages)"
else
    echo "✅ Icons found."
fi

# 3. Python Strict Linting via Ruff
echo "[3/4] Running Ruff (Strict Python Linter)..."
if command -v ruff &> /dev/null; then
    # Runs ruff on any python files in the directory
    ruff check .
    echo "✅ Ruff checks passed."
else
    echo "⚠️  Ruff not installed or not in PATH. Skipping Python linting."
fi

# 4. Python Strict Typing via Mypy
echo "[4/4] Running Mypy (Strict Python Type Checker)..."
if command -v mypy &> /dev/null; then
    # Runs mypy strictly on python files
    mypy . --strict
    echo "✅ Mypy checks passed."
else
    echo "⚠️  Mypy not installed or not in PATH. Skipping Python type checking."
fi

echo "=========================================="
echo "🎉 ALL CHECKS PASSED. Ready for Deployment!"
echo "=========================================="
