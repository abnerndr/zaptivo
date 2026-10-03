#!/bin/bash
# PreToolUse (Bash) — bloqueia rm/mv destrutivo sobre harness Memory/ADR/session-log.
input=$(cat)

cmd=$(printf '%s' "$input" \
  | sed -e 's/.*"command"[[:space:]]*:[[:space:]]*"//' -e 's/"[[:space:]]*[,}].*$//')

PROTECTED='CLAUDE\.md|AGENTS\.md|\.claude/adr|\.claude/memory|docs/session-log\.md|\.cursor/rules/zaptivo-harness'
DESTRUTIVO='(^|[;&|[:space:]])(rm|mv|shred|truncate|dd)([[:space:]]|$)|>[[:space:]]*[^>]*(CLAUDE\.md|session-log\.md|MEMORY\.md)'

bloqueado=0
while IFS= read -r trecho; do
  [ -z "$trecho" ] && continue
  if printf '%s' "$trecho" | grep -Eq "$DESTRUTIVO" && printf '%s' "$trecho" | grep -Eq "$PROTECTED"; then
    bloqueado=1
    break
  fi
done < <(printf '%s\n' "$cmd" | sed -E 's/(&&|\|\|)/\n/g' | tr ';|' '\n\n')

if [ "$bloqueado" -eq 1 ]; then
  echo "Bloqueado: comando parece apagar/mover arquivo protegido do harness (CLAUDE.md, .claude/adr/, .claude/memory/, docs/session-log.md). Peça confirmação explícita ao humano." >&2
  exit 2
fi
exit 0
