#!/bin/bash
LOG="/tmp/mamashka.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Mamashka..." >> $LOG
cd /home/hermes/mamashka
/home/hermes/.bun/bin/bun src/index.ts >> $LOG 2>&1
