# Flashwork project harness

This folder is a Flashwork project. Use `rag/` for project knowledge and `history/` for task, flow, and run history.

## Code knowledge graph (Graphify)

Flashwork builds a code-only Graphify graph in `graphify-out/` at the project root (local AST, no API key) and wires the `graphify` MCP server into every agent CLI it starts (Claude Code, Codex, OpenCode, Gemini).

- Use the graphify MCP tools first (`query_graph`, `get_node`, `shortest_path`, ...) for codebase questions.
- Without MCP, run `graphify query "<question>"`; use `graphify path "<A>" "<B>"` and `graphify explain "<concept>"` for focused lookups. Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review.
- After changing code, run `graphify update .` to refresh the graph (AST only, no API cost).
- `graphify-out/` is generated output; keep it out of commits (add it to your own `.gitignore` if needed).

## Shared run board

During a Run SPEC, every agent of the run shares `.flashwork/runs/<runId>/board.md`. Read it before starting, claim your task there, and write progress and results back, so no two agents duplicate work.
