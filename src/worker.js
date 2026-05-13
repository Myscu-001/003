// 文件头部 import 保持不变
import {
  DEFAULT_MODEL,
  MODELS,
  PROMPT_1,
  PROMPT_2,
  PROMPT_3
} from "./config.js";

// 其余辅助函数（resp、isAllowedModel、builtinPromptForModel、clientConfigJs）保持不变

async function handleChat(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return resp("Bad JSON", "text/plain; charset=utf-8", 400);
  }

  const requestedModel = payload?.model;
  const model = isAllowedModel(requestedModel) ? requestedModel : DEFAULT_MODEL;

  const useBuiltinPersona = payload?.use_builtin_persona !== false;
  const customSystemPrompt =
    typeof payload?.custom_system_prompt === "string"
      ? payload.custom_system_prompt.trim()
      : "";

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const upstreamMessages = [];

  if (useBuiltinPersona) {
    upstreamMessages.push({
      role: "system",
      content: builtinPromptForModel(model)
    });
  } else if (customSystemPrompt) {
    upstreamMessages.push({
      role: "system",
      content: customSystemPrompt
    });
  }

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    upstreamMessages.push({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : ""
    });
  }

  // 修改：使用 SILICONFLOW_API_KEY
  if (!env.SILICONFLOW_API_KEY) {
    return resp(
      "Missing SILICONFLOW_API_KEY (please set it with wrangler secret).",
      "text/plain; charset=utf-8",
      500
    );
  }

  // 修改：API 地址改为硅基流动
  const upstream = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.SILICONFLOW_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: upstreamMessages
    })
  });

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "");
    return resp(
      `Upstream error ${upstream.status}: ${errorText}`,
      "text/plain; charset=utf-8",
      502
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/config.js") {
      return resp(clientConfigJs(), "text/javascript; charset=utf-8");
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(request, env);
    }
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return resp(
      "Static assets binding 'ASSETS' is missing. Please configure [assets] in wrangler.toml.",
      "text/plain; charset=utf-8",
      500
    );
  }
};
