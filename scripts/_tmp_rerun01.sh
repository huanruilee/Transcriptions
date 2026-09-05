#!/bin/bash
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions
rm -f courses/釋量論第二品/sessions/session_01.json
python3 scripts/calibrate_pramana2_session.py --session 01 > /tmp/pramana2_cal_01c.log 2>&1
echo "EXIT=$?"
echo "MISMATCH=$(grep -c 'count mismatch' /tmp/pramana2_cal_01c.log)"
tail -3 /tmp/pramana2_cal_01c.log
