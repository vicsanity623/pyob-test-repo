#!/bin/bash

echo "====================================="
echo "   Starting Idle Pal RPG Check...    "
echo "====================================="

# Define the required PWA game files
FILES=("index.html, train_headless.py, brain_module.py")
ERRORS=0

# Loop through each file and verify it exists and is not empty
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        # -s checks if the file has a size greater than 0
        if [ -s "$file" ]; then
            echo "✅ OK: $file found and contains data."
        else
            echo "❌ ERROR: $file exists but is completely EMPTY!"
            ERRORS=1
        fi
    else
        echo "❌ ERROR: Missing required file: $file"
        ERRORS=1
    fi
done

echo "====================================="
if [ $ERRORS -eq 1 ]; then
    echo "💥 Check Failed! Please fix the errors above."
    exit 1
else
    echo "🎉 All PWA Game files are present and valid. Check Passed!"
    exit 0
fi
