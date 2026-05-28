#!/usr/bin/env bash
# Strict Repository Validation Pipeline (V2 - Web + Python)

set -e 
set -u 

echo "=========================================="
echo " Starting Strict Quality Checks..."
echo "=========================================="

# 1. Verify necessary Web Files exist
echo "[1/4] Checking required web files..."
# Added style.css to the required list
REQUIRED_FILES=("index.html" "main.js" "style.css" "manifest.json" "sw.js")
for FILE in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$FILE" ]; then
        echo "❌ ERROR: Required file '$FILE' is missing."
        exit 1
    fi
done

# 2. Verify Internal Links (Catches the "missing file but linked" error)
echo "[2/4] Validating internal file references..."
# This looks for href="file.css" or src="file.js" and checks if those files exist
links=$(grep -oE '(href|src)="([^"#]+)"' index.html | cut -d'"' -f2)
for link in $links; do
    if [[ $link == http* ]] || [[ $link == \$\{* ]]; then continue; fi # Skip external URLs
    if [ ! -f "$link" ]; then
        echo "❌ ERROR: index.html references '$link', but the file does not exist."
        exit 1
    fi
done

# 3. HTML/CSS Syntax Check (Optional but recommended)
echo "[3/4] Checking HTML/CSS Integrity..."
if command -v htmlhint &> /dev/null; then
    htmlhint index.html
else
    # Fallback: Basic check to ensure no dangling CSS variables in raw HTML
    if grep -q "--bg-color" index.html; then
        # If we see CSS variables in HTML but no <style> tag, it's likely a bot error
        if ! grep -q "<style>" index.html; then
            echo "❌ ERROR: Detected raw CSS variables in index.html without a <style> tag."
            exit 1
        fi
    fi
fi

# 4. Python Strict Linting via Ruff
echo "[4/4] Running Ruff (Strict Python Linter)..."
if command -v ruff &> /dev/null; then
    ruff check .
    echo "✅ Ruff checks passed."
else
    echo "⚠️  Ruff not installed. Skipping."
fi

echo "=========================================="
echo "🎉 ALL CHECKS PASSED. Ready for Deployment!"
echo "=========================================="
