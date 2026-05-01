# Oracle 04 — Local Model Serving

## Decision summary
Use **Ollama as the primary local-model backend**. It is the strongest fit in the gathered evidence because **Pi has first-party Ollama setup**, **OpenCode supports local OpenAI-compatible providers including Ollama**, and Ollama documents both **`/v1/chat/completions`** and **`/v1/responses`** compatibility; by contrast, **Claude Code’s documented gateway path expects Anthropic/Bedrock/Vertex-style APIs**, so plain OpenAI-compatible local endpoints are not a drop-in for Claude Code. ([Pi + Ollama docs](https://docs.ollama.com/integrations/pi), [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [OpenCode providers](https://opencode.ai/docs/providers/), [Claude LLM gateway docs](https://code.claude.com/docs/en/llm-gateway.md))

## Researched answers

### 1) Which local runtimes are explicitly documented here?
- **Ollama**: yes, with direct OpenAI-compatible API docs and a Pi-specific integration path. ([Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [Pi + Ollama docs](https://docs.ollama.com/integrations/pi))
- **llama.cpp**: yes, via OpenCode’s local provider configuration using `llama-server`. ([OpenCode providers](https://opencode.ai/docs/providers/))
- **LM Studio**: yes, via OpenCode’s local provider configuration. ([OpenCode providers](https://opencode.ai/docs/providers/))
- I did **not** find equivalent official support docs in the gathered set for **Claude Code + Ollama/llama.cpp/LM Studio directly**. ([Claude LLM gateway docs](https://code.claude.com/docs/en/llm-gateway.md), [Claude model config](https://code.claude.com/docs/en/model-config.md))

### 2) OpenCode compatibility
OpenCode explicitly says it supports **75+ providers** and **running local models**, and its provider docs show local configuration examples for **llama.cpp** and **LM Studio** using an OpenAI-compatible API adapter. The broader provider page also includes **Ollama** in the provider directory. ([OpenCode models](https://opencode.ai/docs/models/), [OpenCode providers](https://opencode.ai/docs/providers/))

### 3) Pi compatibility
Pi has official Ollama docs with `ollama launch pi`, and its manual setup shows a provider block pointing Pi at `http://localhost:11434/v1` using the **openai-completions** API style. Pi also ships with core tools (`read`, `write`, `edit`, `bash`) independently of the model backend. ([Pi + Ollama docs](https://docs.ollama.com/integrations/pi))

### 4) Claude Code compatibility
Claude Code’s documented gateway requirements are not “any OpenAI-compatible API.” The gateway must expose at least one of the following formats: **Anthropic Messages**, **Bedrock InvokeModel**, or **Vertex rawPredict**, and it must preserve/forward Anthropic-specific headers or body fields. That means a plain Ollama OpenAI-compatible endpoint is **not** the documented direct path for Claude Code. ([Claude LLM gateway docs](https://code.claude.com/docs/en/llm-gateway.md))

### 5) What Ollama compatibility is documented?
Ollama documents support for **`/v1/chat/completions`**, **`/v1/responses`**, tools/function calling, streaming, reasoning controls for thinking models, and embeddings. It also documents how to alias local models to expected OpenAI-style model IDs and how to create a new model with a different context size using a `Modelfile`. ([Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility))

### 6) Context-window implications
- **Ollama** does not set context size through the OpenAI API itself; instead, it documents using a **`Modelfile`** with `PARAMETER num_ctx` to create a variant with a larger context window. ([Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility))
- **OpenCode** local-provider examples allow you to declare explicit `limit.context` and `limit.output` values for local backends such as `llama.cpp`. ([OpenCode providers](https://opencode.ai/docs/providers/))
- **Claude Code** model aliases and context behavior are tied to Anthropic/Bedrock/Vertex model semantics, not directly to generic OpenAI-compatible local runtimes. ([Claude model config](https://code.claude.com/docs/en/model-config.md))

### 7) Privacy trade-off
A **local model** keeps inference local, which is the strongest privacy story in this comparison. But if you pair the local model with a **remote execution backend** like E2B or Cloudflare Sandbox, then code, files, or outputs used by those execution backends still leave the machine even though model inference does not. ([Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [E2B pricing](https://e2b.dev/pricing), [Cloudflare Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/))

### 8) Can local models still work with the security stack?
Yes in principle, because tools like **Semgrep**, **TruffleHog**, sandbox routing, and permission gates are external orchestration features rather than intrinsic LLM provider features. The real variable is not API compatibility but whether the chosen local model is good enough at tool selection, instruction following, and long-context reasoning for your workflows. The gathered docs establish the tool/runtime wiring, but they do **not** provide comparable quality benchmarks for local models in this security-harness use case. ([Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [OpenCode providers](https://opencode.ai/docs/providers/), [Pi + Ollama docs](https://docs.ollama.com/integrations/pi))

### 9) Latency benchmarks across combinations
I did **not** find official benchmark data in the gathered docs comparing **Ollama vs llama.cpp vs LM Studio** across **Claude Code / OpenCode / Pi** combinations. That needs to be measured locally. ([OpenCode providers](https://opencode.ai/docs/providers/), [Pi + Ollama docs](https://docs.ollama.com/integrations/pi), [Claude LLM gateway docs](https://code.claude.com/docs/en/llm-gateway.md))

## RECOMMENDATION
Choose **Ollama** as the default local-model runtime and make **OpenCode + Pi** your first-class local-model platforms. If Claude Code must support local models too, do it through a **gateway that speaks Anthropic-compatible semantics**, not by assuming its documented integration path accepts a raw OpenAI-compatible Ollama endpoint. ([Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [Pi + Ollama docs](https://docs.ollama.com/integrations/pi), [OpenCode providers](https://opencode.ai/docs/providers/), [Claude LLM gateway docs](https://code.claude.com/docs/en/llm-gateway.md))

## Confidence level
**High** on the wiring/integration conclusion. **Medium** on end-user quality/performance because the gathered evidence set does not contain side-by-side local-model reliability benchmarks for tool-heavy security tasks. ([Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [OpenCode providers](https://opencode.ai/docs/providers/), [Pi + Ollama docs](https://docs.ollama.com/integrations/pi))

## OPEN questions
1. Is **Claude Code local-model support** a hard requirement, or is local mode acceptable only on OpenCode/Pi?
2. Which exact local models meet your **tool-calling** and **long-context** quality bar?
3. What hardware floor do you want to support for local deployment?
