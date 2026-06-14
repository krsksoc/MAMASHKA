#!/bin/bash
LOG="/tmp/mamashka.log"
WATCHDOG_LOG="/tmp/mamashka-watchdog.log"

# Kill any existing bot on port 3000
pkill -f "bun src/index" 2>/dev/null
lsof -ti:3000 | xargs -r kill -9 2>/dev/null
sleep 1

restart_bot() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Mamashka..." >> $LOG
    cd /home/hermes/mamashka
    export BOT_TOKEN=$(cat ~/.hermes/secrets/mamashka_bot_token)
    export ADMIN_SECRET=618ad4e7de032adea4108bdb7439f7e2743a17812ec5e586
    export WORM_KEY=3b046efdc08b1198808177c473a9a3eb976acd6ce879bb939f456688882dd06c
    export WORM_ENDPOINT=https://ai.wormsoft.ru/api/gpt/v1
    export PORT=3000
    export DB_PATH=data.db
    /home/hermes/.bun/bin/bun src/index.ts >> $LOG 2>&1
}

while true; do
    restart_bot
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot died, restarting in 5s..." >> $WATCHDOG_LOG
    sleep 5
done