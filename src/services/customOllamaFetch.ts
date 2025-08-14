import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export async function getInstalledModelsAsync(): Promise<string[]> {
    const { stdout } = await execAsync('ollama list');
    const lines = stdout.trim().split('\n');
    return lines.slice(1).map((l) => l.trim().split(/\s+/)[0]);
}

/**
 * Helper that turns an async iterator over data (the stream that
 * Ollama emits) into a ReadableStream that the SDK can consume.
 */
function ollamaStreamToSdkStream(ollamaBody: ReadableStream<any>): ReadableStream<any> {
  const reader = ollamaBody.getReader();

  // The SDK will consume the stream as a readable byte stream.
  // We'll push a new line‑delimited JSON chunk for every piece of
  // text that Ollama sends.
  const pull = async (controller: ReadableStreamDefaultController) => {
    const { done, value } = await reader.read();
    if (done) {
      controller.close();
      return;
    }

    const chunk = new TextDecoder().decode(value).trim();

    let parsed;
    try {
      parsed = JSON.parse(chunk);
    } catch {
      // If the line is not a valid JSON we skip it
      return;
    }

    const sdkChunk = {
      id: parsed.id ?? `ollama-stream-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: parsed.model ?? 'ollama',
      choices: [
        {
          delta: {
            role: 'assistant',
            content: parsed.content,
          },
          index: 0,
          finish_reason: null,
        },
      ],
    };

    // Push the chunk as a string followed by a newline (used by SDK)
    controller.enqueue(new TextEncoder().encode(JSON.stringify(sdkChunk) + '\n'));
  };

  return new ReadableStream({ pull });
}

/**
 * Custom fetch used by `createOpenAI()` when you want to talk to
 * a local Ollama instance instead of the real OpenAI endpoint.
 */
export async function customOllamaFetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit,
): Promise<Response> {
  console.log(`customOllamaFetch: ${input}`)
  const req =
    typeof input === 'string' ? new Request(input, init) : new Request(input, init);

  /* ----------------- Chat / Completion ----------------- */
  if (
    req.url.endsWith('/v1/chat/completions') ||
    req.url.endsWith('/v1/completions')
  ) {
    const body = req.body ? await req.json() : {};

    const {
      model,
      messages,
      prompt,
      temperature,
      stream,
    } = body as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
      prompt?: string;
      temperature?: number;
      stream?: boolean;
    };

    const ollamaBody: any = {
      model,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      stream: !!stream, // `true` will make Ollama stream back
    };

    // If the SDK passed a “messages” array we flatten it into a prompt
    if (Array.isArray(messages)) {
      ollamaBody.prompt = messages
        .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
        .join('\n');
    } else if (prompt) {
      ollamaBody.prompt = prompt;
    }

    const ollamaUrl = 'http://127.0.0.1:11434/api/generate';
    const ollamaRes = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody),
    });

    // If streaming, we forward the stream straight back.
    if (ollamaRes.body && ollamaRes.headers.get('content-type')?.includes('json')) {
      const ollamaJson = await ollamaRes.json();

      return new Response(
        JSON.stringify({
          ok: ollamaRes.ok,
          status: ollamaRes.status,
          statusText: ollamaRes.statusText,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            id: `ollama-${model}-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            usage: {
              prompt_tokens: ollamaJson.prompt?.tokens ?? 0,
              completion_tokens: ollamaJson.response?.tokens ?? 0,
            },
            choices: [
              {
                message: { role: 'assistant', content: ollamaJson.response },
                finish_reason: 'stop',
                index: 0,
              },
            ],
          }),
          text: async () =>
            JSON.stringify({
              id: `ollama-${model}-${Date.now()}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model,
              usage: {
                prompt_tokens: ollamaJson.prompt?.tokens ?? 0,
                completion_tokens: ollamaJson.response?.tokens ?? 0,
              },
              choices: [
                {
                  message: { role: 'assistant', content: ollamaJson.response },
                  finish_reason: 'stop',
                  index: 0,
                },
              ],
            }),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    // Streaming case: forward the raw stream and re‑wrap it
    const sdkStream = ollamaStreamToSdkStream(ollamaRes.body!);

    return new Response(sdkStream, {
      status: 200,
      headers: { 'content-type': 'text/plain' }, // the SDK expects text chunks
    });
  }

  /* ----------------- `/v1/models` ----------------- */
  if (req.url.endsWith('/v1/models')) {
    const modelNames = await getInstalledModelsAsync();

    const data = modelNames.map((name) => ({
      id: name,
      object: 'model',
      created: 0,
      owned_by: 'ollama',
    }));

    return new Response(JSON.stringify({ object: 'list', data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  /* ----------------- `/v1/responses` (streaming) ----------------- */
  if (req.url.endsWith('/v1/responses')) {
    const body = req.body ? await req.json() : {};
    console.log(body)

    const {
      model,
      input,
      prompt,
      temperature,
      tool_choice,
      tools,
    } = body as {
      model?: string;
      input?: Array<{ role: string; content: string | Array<{type: string, text: string}> }>;
      prompt?: string;
      temperature?: number;
      tool_choice?: string;
      tools?: Array<any>;
    };

    // Build a stream‑enabled request for Ollama
    const ollamaBody: any = {
      model: "gpt-oss:20b",   // TODO
      temperature,
      tool_choice,
      tools,
      stream: true, // tell Ollama to stream
      messages: input?.map((row) => ({role: row.role, content: typeof row.content == 'string' ? row.content : row.content.map((c) => (c.text)).join("\n")})),
      prompt,
    };

    const ollamaUrl = 'http://127.0.0.1:11434/api/chat';
    const ollamaRes = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody),
    });

    console.log(`${JSON.stringify(ollamaBody)}`)
    if (!ollamaRes.ok) {
    return new Response(ollamaRes.body, {
        status: ollamaRes.status,
        headers: ollamaRes.headers,
    });

    }
    const sdkStream = ollamaStreamToSdkStream(ollamaRes.body!);

    return new Response(sdkStream, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
    });
  }

  /* ----------------- Anything else – just proxy it unchanged ----------------- */
  return fetch(req);
}