// core/phase5/mind-tab.mjs — waking the mind (Phase 5, claim M3). The one module on this site that names another host:
// WebLLM's library from esm.run, and through it the model's weights from Hugging Face and its compiled library from
// raw.githubusercontent.com. Nothing here runs until the visitor presses the button that calls wake(). After that the
// model runs in this browser, and its every reply goes through the mind's door (core/mind.mjs) before the page uses it.
import { chatOf, OPTIONS } from '../mind.mjs';

export const LIBRARY = 'https://esm.run/@mlc-ai/web-llm@0.2.79';
export const MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
let engine = null, waking = null;

/** Load the library and the model (the first time, about 700 MB, kept in this browser's cache). onProgress({ progress, text }). */
export function wake(onProgress) {
  if (engine) return Promise.resolve(true);
  if (waking) return waking;
  waking = (async () => {
    const { CreateMLCEngine } = await import(LIBRARY);
    engine = await CreateMLCEngine(MODEL, { initProgressCallback: (p) => { if (typeof onProgress === 'function') onProgress(p); } });
    return true;
  })();
  waking.catch(() => { waking = null; });
  return waking;
}
export const awake = () => engine !== null;

/** One message to the model with the sealed prompt and options. → the model's reply, as text (or null). */
export async function ask(routes, text) {
  if (!engine) return null;
  const r = await engine.chat.completions.create({ messages: chatOf(routes, text), temperature: OPTIONS.temperature, max_tokens: OPTIONS.maxTokens, seed: OPTIONS.seed, response_format: OPTIONS.json ? { type: 'json_object' } : undefined });
  const c = r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : null;
  return typeof c === 'string' ? c : null;
}
