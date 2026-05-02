# Oracle 07 — Varlock + TruffleHog

## Decision summary
Use **Varlock as the preventive layer** and **TruffleHog as the last-line detection layer**, but keep the TruffleHog integration on the **documented pre-commit/CI path** for v1. I did **not** find evidence of an official, maintained **TruffleHog MCP server** in the gathered sources, so MCP-based TruffleHog integration should be treated as unverified and non-blocking. ([Varlock secrets guide](https://varlock.dev/guides/secrets), [TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md), [TruffleHog pre-commit hook yaml](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/.pre-commit-hooks.yaml))

## Researched answers

### 1) What does Varlock clearly support?
Varlock documents:
- explicit secret marking with **`@sensitive`** and **`@defaultSensitive`**,
- plugin-based loading from external secret managers,
- `exec()` fallback for custom secret loading,
- bulk injection via **`@setValuesBulk()`**,
- a **`varlock scan`** command,
- and automatic pre-commit hook installation with `varlock scan --install-hook`. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 2) Which external secret systems does Varlock integrate with?
The gathered Varlock docs explicitly list official plugins for **1Password**, **AWS Secrets Manager / Parameter Store**, **Azure Key Vault**, **Bitwarden**, **Google Secret Manager**, **HashiCorp Vault**, **Infisical**, **Pass**, and **Proton Pass**. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 3) Does Varlock provide leak scanning?
Yes. The docs say `varlock scan` resolves sensitive values and searches project files for plaintext occurrences, with modes for **all files**, **include ignored**, and **staged only**. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 4) Is Varlock production-ready?
The gathered docs show a mature-looking feature set and plugin ecosystem, but I did **not** find an explicit support/GA statement, SLA statement, or “production-ready” claim in the evidence set. So the honest answer is: **capable, but production-readiness is not proven by the current sources alone**. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 5) What happens when Varlock is not running?
I did **not** find a documented fail-open/fail-closed startup contract in the gathered Varlock docs. That is a real implementation gap for this project and should be treated as **unknown until tested**. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 6) Does Varlock expose an MCP server?
I did **not** find evidence in the gathered docs that Varlock itself exposes an official MCP server. The documented integration surface in the evidence set is CLI / env-file / plugin based. ([Varlock secrets guide](https://varlock.dev/guides/secrets))

### 7) What exactly is TruffleHog’s documented pre-commit path?
The TruffleHog docs show a documented pre-commit workflow using `trufflehog git file://.`. The shipped pre-commit hook yaml uses:
`trufflehog git file://. --since-commit HEAD --results=verified --fail --trust-local-git-config`. ([TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md), [TruffleHog pre-commit hook yaml](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/.pre-commit-hooks.yaml))

### 8) What does TruffleHog scan in that documented path?
The documented hook runs against the **git repo view** rooted at `file://.` and commonly scopes to changes **since `HEAD`** in pre-commit usage. That makes it a good fit for staged-change detection, but it is still a **detection-after-write** control, not a prevention-before-write control. ([TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md), [TruffleHog pre-commit hook yaml](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/.pre-commit-hooks.yaml))

### 9) Is there an official TruffleHog MCP server?
I did **not** find an official TruffleHog MCP server repo or official doc page in the gathered evidence. Treat any MCP claim here as **unverified** until you have a specific repo and maintenance signal. ([TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md))

### 10) What is the clean division of responsibility?
- **Varlock** is the **prevention / secret-source discipline** tool: secrets stay out of plaintext project files and are intentionally marked as sensitive. ([Varlock secrets guide](https://varlock.dev/guides/secrets))
- **TruffleHog** is the **detection / last-line gate** that catches leaks before commit (and can also run in CI with the same CLI patterns). ([TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md), [TruffleHog pre-commit hook yaml](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/.pre-commit-hooks.yaml))

## RECOMMENDATION
Adopt this v1 pattern:
1. **Varlock** for `.env.schema` discipline and external secret resolution. ([Varlock secrets guide](https://varlock.dev/guides/secrets))
2. **Varlock scan** as an early leak check where it fits your workflow. ([Varlock secrets guide](https://varlock.dev/guides/secrets))
3. **TruffleHog pre-commit** as the mandatory last local gate, using the documented hook entry. ([TruffleHog pre-commit hook yaml](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/.pre-commit-hooks.yaml))
4. **No TruffleHog MCP dependency** in v1 unless you later verify an official, maintained server. ([TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md))

That gives you one prevention control and one detection control without adding speculative MCP plumbing.

## Confidence level
**Medium.** The concrete TruffleHog pre-commit path is well-supported by docs. Varlock’s capabilities are well-documented too, but several operational questions that matter for a Aegis — especially fail-open/fail-closed behavior and MCP-specific integration semantics — are still unresolved in the current evidence set. ([Varlock secrets guide](https://varlock.dev/guides/secrets), [TruffleHog PreCommit docs](https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/PreCommit.md))

## OPEN questions
1. Does Varlock fail **closed** when secret resolution fails, or can the agent continue unsafely?
2. Is Varlock acceptable as the **only preventive secret layer**, or do you also want wrapper-level startup checks?
3. Do you want TruffleHog only **pre-commit**, or also **pre-push / CI** by default?
