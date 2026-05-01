Sisyphus MUST call @aegis when:

| Trigger | Condition | Aegis Task |
|---------|-----------|------------|
| **Plugin block** | Plugin blocked a command AND user overrode the block | `audit-override` |
| **Semgrep errors** | PostToolUse Semgrep found ≥3 ERROR findings in a single file | `deep-scan` |
| **Trivy CVE** | Plugin blocked a package install due to CVEs | `dependency-audit` |
| **Pre-commit gate** | User requests `/commit-push-pr` on a branch with >500 LOC changed | `pre-merge-review` |
| **New dependency** | Any new dependency added to `package.json`/`pyproject.toml` | `dependency-audit` |
| **Auth/crypto code** | File written contains auth/crypto patterns (`jwt`, `bcrypt`, `oauth`, `cipher`, `private_key`) | `auth-review` |
| **Infrastructure** | Dockerfile, docker-compose, k8s manifests, terraform files modified | `infra-review` |
| **User request** | User says "security review", "audit", "check security" | `full-audit` |

Sisyphus MUST NOT call @aegis for:
- Routine file edits (plugin handles via Semgrep)
- Package installs that pass Trivy (plugin already cleared them)
- Read-only operations (no security surface)
