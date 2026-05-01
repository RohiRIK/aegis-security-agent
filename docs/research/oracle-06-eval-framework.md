# Oracle 06 — Eval / Testing Framework

## Decision summary
Use **CyberSecEval 4 as the primary external benchmark base** and build a **small custom regression harness** around it for your actual controls: secret handling, prompt injection resistance, sandbox escape prevention, and human-approval flow correctness. **AgentBench is useful as a realism/agent-function check, but it is not the right primary security benchmark** because it is focused on general agent task performance, not security-harness behavior. ([PurpleLlama CyberSecEval README](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/README.md), [AgentBench README](https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md), [prompt_injection dataset](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/datasets/prompt_injection/prompt_injection.json), [interpreter dataset](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/datasets/interpreter/interpreter.json))

## Researched answers

### 1) What existing benchmark suites fit this problem best?
- **CyberSecEval 4** is the strongest direct fit in the gathered set because it already includes **prompt injection**, **code interpreter abuse**, **autonomous offensive operations**, **MITRE compliance / false refusal**, and **AutoPatch/CyberSOCEval** defensive benchmarks. ([PurpleLlama CyberSecEval README](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/README.md))
- **AgentBench** evaluates LLMs as agents across operating-system, database, knowledge-graph, shopping, browsing, and other environments. That is useful for measuring “can the agent still do work under constraints?”, but it is not primarily a security benchmark. ([AgentBench README](https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md))

### 2) What concrete test data already exists for likely attack classes?
- The **prompt injection** dataset contains direct prompt-injection test cases aimed at overriding the model’s task and exposing hidden data. ([prompt_injection dataset](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/datasets/prompt_injection/prompt_injection.json))
- The **interpreter** dataset includes cases about sandbox escape, privilege escalation, persistence, and malicious code-execution behavior. ([interpreter dataset](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/datasets/interpreter/interpreter.json))

### 3) What should you measure for this harness?
The public benchmark suites tell you what attack families matter; they do **not** give you all the product-level metrics you need. For this harness, the useful top-line metrics are:
- **secret leakage rate**,
- **prompt-injection success rate**,
- **sandbox escape / host-touch success rate**,
- **false-positive block rate** for safe actions,
- **false-negative allow rate** for dangerous actions,
- **time-to-human-approval** and **approval completion rate** for gated tasks.

Those are **recommended harness metrics**, not claims taken from the benchmark docs.

### 4) How do you test Varlock specifically?
I did **not** find an off-the-shelf benchmark that proves “Varlock prevented secrets from entering the model context.” That part needs custom tests, for example:
- seeded secrets in external stores,
- `.env.schema`-only repo fixtures,
- prompts that try to coerce the agent to reveal secret values,
- transcript/assertion checks that secret material never appears in tool outputs or model context.

This is a custom addition beyond CyberSecEval. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 5) How do you test TruffleHog specifically?
The official TruffleHog evidence in the gathered set covers **pre-commit integration** and a default hook that scans the repo using `trufflehog git file://. --since-commit HEAD --results=verified --fail --trust-local-git-config`. That is enough to build deterministic regression tests around **staged-change detection**, but I did **not** find a turnkey evaluation suite for it. ([TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md), [TruffleHog pre-commit hook yaml](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/.pre-commit-hooks.yaml))

### 6) How do you test the sandbox itself?
The best fit in the gathered public suites is CyberSecEval’s **interpreter** benchmark, because it already includes sandbox-escape / malicious code-execution style cases. For your product, you should add host-side canaries as well, such as files or sockets that must remain untouched after every run. ([PurpleLlama CyberSecEval README](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/README.md), [interpreter dataset](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/datasets/interpreter/interpreter.json))

### 7) Is there a ready-made “security harness regression suite”?
I did **not** find one in the gathered evidence. The public pieces exist, but the product-specific regression harness still has to be assembled. ([PurpleLlama CyberSecEval README](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/README.md), [AgentBench README](https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md))

### 8) What about Semgrep false-positive rates?
No Semgrep false-positive benchmark or rule-quality number was established in the gathered evidence set. That needs to be measured with your own target repos and rule pack.

### 9) What about HITL gateway effectiveness?
I did **not** find a standard benchmark for approval-flow quality in the gathered sources. That should be measured internally with workflow metrics like approval latency, timeout rate, escalation rate, and successful completion rate after approval.

### 10) What role should AgentBench play?
Use it as a **secondary check** that the agent remains useful under your controls. AgentBench FC is containerized and covers tasks like OS interaction and DB work, so it is useful for “guardrails did not destroy utility.” It is not the right benchmark for secret leakage, prompt injection, or sandbox escape. ([AgentBench README](https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md))

## RECOMMENDATION
Use a **two-part evaluation stack**:
1. **External benchmark layer**: CyberSecEval 4, especially the **prompt injection** and **interpreter** families. ([PurpleLlama CyberSecEval README](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/README.md), [prompt_injection dataset](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/datasets/prompt_injection/prompt_injection.json), [interpreter dataset](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/datasets/interpreter/interpreter.json))
2. **Product regression layer**: custom fixtures for Varlock, TruffleHog, sandbox canaries, and approval workflows. ([Varlock secrets guide](https://varlock.dev/guides/secrets), [TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md))

Then add **AgentBench** only as a utility/regression check after the security controls are in place. ([AgentBench README](https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md))

## Confidence level
**Medium-high.** The benchmark fit is clear, but the most important layer for this project — the product-specific regression suite — still has to be designed by you because no public suite maps perfectly to the harness. ([PurpleLlama CyberSecEval README](https://raw.githubusercontent.com/facebookresearch/PurpleLlama/main/CybersecurityBenchmarks/README.md), [AgentBench README](https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md))

## OPEN questions
1. What exact **release gates** do you want: pass/fail thresholds, trend deltas, or both?
2. Which secrets, hosts, and approval actions should be part of your **golden regression corpus**?
3. Do you need the eval stack to run fully **locally**, or is cloud execution acceptable for some suites?
