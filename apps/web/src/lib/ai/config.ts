
export async function loadAiConfig(_accountId: string, ..._rest: unknown[]) {
  return { provider: "openai", apiKey: "", model: "gpt-4o-mini" }
}
export async function loadEmbeddingsKey(_accountId: string, ..._rest: unknown[]) {
  return null
}
export default loadAiConfig
