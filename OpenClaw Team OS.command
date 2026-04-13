#!/bin/zsh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

printf '\033]0;%s\007' "OpenClaw Team OS Launcher"
clear
echo "OpenClaw Team OS"
echo "Local desktop launcher"
echo "----------------------------------------"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm 未安装。请先执行: npm install -g pnpm"
  echo ""
  osascript -e 'display alert "OpenClaw Team OS 启动失败" message "pnpm 未安装。请先执行: npm install -g pnpm" as critical' >/dev/null 2>&1
  read "?按 Enter 关闭..."
  exit 1
fi

pnpm start:local
status=$?

if [ "$status" -ne 0 ]; then
  echo ""
  echo "OpenClaw Team OS 启动失败。"
  read "?按 Enter 关闭..."
fi

exit "$status"
