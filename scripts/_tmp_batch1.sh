#!/bin/bash
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions
python3 scripts/run_pramana2_batch.py --range 2-4 > /tmp/pramana2_batch1.log 2>&1
echo "BATCH1_EXIT=$?"
grep -c "count mismatch" /tmp/pramana2_batch1.log | xargs echo "total mismatches:"
tail -4 /tmp/pramana2_batch1.log
