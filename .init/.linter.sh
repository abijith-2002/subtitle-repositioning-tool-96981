#!/bin/bash
cd /home/kavia/workspace/code-generation/subtitle-repositioning-tool-96981/subtitle_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

