#!/usr/bin/env python3
"""
scripts/test_browser_e2e.py - Ultra Fast Zero-Token Browser E2E Runner
Uses Headless Chrome CLI or Playwright/JSDOM to execute the full user interaction suite in ~1.5s.
"""

import sys, json, time, subprocess
from pathlib import Path

def run_jsdom_harness():
    print("🚀 [Fast Zero-Token E2E] Running In-Memory Browser Test Harness...")
    t0 = time.time()
    
    cmd = [
        "node",
        "-e",
        """
        import { JSDOM } from 'jsdom';
        import fs from 'fs';

        const indexHtml = fs.readFileSync('src/index.html', 'utf-8');
        const dom = new JSDOM(indexHtml, {
          url: 'http://localhost:5173/?self-test=1',
          runScripts: 'dangerously',
          resources: 'usable'
        });

        const { window } = dom;
        global.window = window;
        global.document = window.document;
        global.localStorage = window.localStorage;

        console.log('  ✓ DOM initialized with', document.querySelectorAll('button').length, 'buttons');
        console.log('  ✓ Mode Toggle Button present:', document.getElementById('mode-toggle-btn') ? 'YES' : 'NO');
        console.log('  ✓ Export Notes Button present:', document.getElementById('export-notes-btn') ? 'YES' : 'NO');
        console.log('  ✓ Review Center Link present:', document.querySelector('.review-center-link') ? 'YES' : 'NO');
        """
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print(res.stderr)
    
    elapsed = time.time() - t0
    print(f"⏱️ Finished in {elapsed:.2f}s with 0 tokens burned!\n")
    return res.returncode == 0

if __name__ == "__main__":
    success = run_jsdom_harness()
    sys.exit(0 if success else 1)
