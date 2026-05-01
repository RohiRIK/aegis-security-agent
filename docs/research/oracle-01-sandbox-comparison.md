# Oracle 01 — Sandbox Comparison

## Decision summary
Use **local Docker as the default v1 execution sandbox**, harden it with **rootless mode + default seccomp**, and keep **E2B as the hosted/managed fallback** for users who need cloud execution or long-lived remote sessions. **Do not use Cloudflare Workers itself as the code-execution sandbox** for this project: Workers runs JavaScript/Wasm in V8 isolates, not arbitrary shell workloads; if Cloudflare stays in scope, evaluate **Cloudflare Sandbox SDK / Containers**, not Workers runtime alone. ([Docker rootless](https://docs.docker.com/engine/security/rootless/), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/), [Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/), [Cloudflare Sandbox SDK commands](https://developers.cloudflare.com/sandbox/api/commands/))

## Researched answers

### 1) Isolation model
- **Local Docker** is still a container model, but Docker documents two strong baseline hardening controls that matter here: **rootless mode** runs both the daemon and containers as a non-root user, and the default **seccomp** profile blocks around **44 syscalls** as a least-privilege baseline. ([Docker rootless](https://docs.docker.com/engine/security/rootless/), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/))
- **E2B** documents per-sandbox network controls and public URL controls, and its public product material describes the runtime as Firecracker-backed; that makes it closer to a managed VM-style sandbox than a plain local container, but the Firecracker claim is coming from product/case-study material rather than the lower-level API docs, so confidence is lower there. ([E2B internet access](https://e2b.mintlify.app/docs/sandbox/internet-access.md), [E2B AI agents page](https://e2b.dev/ai-agents), [Manus case study](https://www.e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers))
- **Cloudflare Workers** uses **V8 isolates** and is explicitly positioned as an isolate runtime, not a shell/VM/container runtime. **Cloudflare Containers** says each container runs inside its own **VM**, and **Cloudflare Sandbox SDK** exposes `exec()`, background processes, files, env vars, and ports on top of that container layer. ([Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/), [Cloudflare Containers lifecycle](https://developers.cloudflare.com/containers/platform-details/architecture/), [Cloudflare Sandbox SDK commands](https://developers.cloudflare.com/sandbox/api/commands/))

### 2) Cold-start latency
- **Cloudflare Workers** says isolates eliminate the cold starts of the VM model and that an isolate can start around **100x faster than a Node process on a container or VM**. That is useful for request handlers, but it is not the same workload as a coding-agent shell sandbox. ([Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/))
- **Cloudflare Containers** documents typical cold starts in the **1–3 second** range, depending on image size and startup behavior. ([Cloudflare Containers lifecycle](https://developers.cloudflare.com/containers/platform-details/architecture/))
- **E2B** marketing materials claim around **150–200 ms** startup, but I did not find a low-level runtime doc in the gathered evidence set that gives the same figure as an API/platform guarantee, so treat that as directional rather than contractual. ([E2B AI agents page](https://e2b.dev/ai-agents), [Manus case study](https://www.e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers))
- I did **not** find an official, general-purpose **local Docker cold-start benchmark** in the gathered docs; for Docker, you should assume startup depends heavily on host state, image cache, and what the entrypoint does. ([Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/#gpu))

### 3) Can it run shell commands?
- **Docker**: yes, obviously, because it runs ordinary Linux containers. ([Docker rootless](https://docs.docker.com/engine/security/rootless/))
- **E2B**: yes; E2B exposes sandbox command execution and terminal-style workflows, and the docs explicitly support network and public URL behavior for running services. ([E2B internet access](https://e2b.mintlify.app/docs/sandbox/internet-access.md), [E2B AI agents page](https://e2b.dev/ai-agents))
- **Cloudflare Workers**: **no** for arbitrary shell execution; it runs JavaScript/Wasm in isolates. ([Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/))
- **Cloudflare Sandbox SDK**: yes; `exec()`, `execStream()`, `startProcess()`, and process log APIs are first-class. ([Cloudflare Sandbox SDK commands](https://developers.cloudflare.com/sandbox/api/commands/))

### 4) GPU support
- **Docker** supports GPU access through Docker’s GPU support plus the **NVIDIA Container Toolkit**. ([Docker GPU access](https://docs.docker.com/engine/containers/resource_constraints/#gpu), [NVIDIA Container Toolkit install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html))
- I did **not** find evidence in the gathered E2B or Cloudflare Sandbox/Containers docs that GPU access is currently a supported feature for this use case, so treat **GPU as unsupported/unverified** for those hosted options until proven otherwise. ([E2B pricing](https://e2b.dev/pricing), [Cloudflare Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/), [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/))

### 5) Cost model
- **E2B**: Hobby is **free + usage**, includes **$100 one-time credits**, up to **1-hour** session length, and up to **20** concurrent sandboxes; Pro is **$150/mo + usage**, up to **24-hour** sessions, and up to **100** concurrent sandboxes with paid expansion. ([E2B pricing](https://e2b.dev/pricing))
- **Cloudflare Sandbox SDK** pricing inherits from **Containers**, and you are also billed for **Workers** and **Durable Objects**. Containers pricing includes **25 GiB-hours/month**, **375 vCPU-minutes/month**, and **200 GB-hours/month** on Workers Paid, then metered overages. ([Cloudflare Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/), [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/))
- **Cloudflare Workers** alone has major platform limits such as **128 MB** memory per isolate and subrequest limits, which is another sign it is not the right primary execution substrate for general coding-agent jobs. ([Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/))
- **Local Docker** has no vendor runtime fee by itself; cost is your own machine or infra cost. That is operationally attractive for offline/private development, but you then own patching, hardening, cleanup, and UX. ([Docker rootless](https://docs.docker.com/engine/security/rootless/), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/))

### 6) Offline capability
- **Local Docker** works offline once the host, images, and packages you need are already local. ([Docker rootless](https://docs.docker.com/engine/security/rootless/))
- **E2B** and **Cloudflare** are cloud services, so they are not an offline path. ([E2B pricing](https://e2b.dev/pricing), [Cloudflare Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/))

### 7) Platform integration fit
- **Claude Code** has native hooks, a permission model, and OS-level sandboxing guidance; routing execution to Docker/E2B/Cloudflare Sandbox is therefore mostly an adapter problem. ([Claude hooks guide](https://code.claude.com/docs/en/hooks-guide), [Claude permissions](https://code.claude.com/docs/en/permissions.md), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing.md))
- **OpenCode** exposes permissions plus a plugin system with `tool.execute.before`/`after`, so it can also route execution through a sandbox wrapper. ([OpenCode permissions](https://opencode.ai/docs/permissions/), [OpenCode plugins](https://opencode.ai/docs/plugins/))
- **Pi** gives you extension events plus custom tool registration, but no comparable built-in permission model; that makes the sandbox adapter doable, but policy enforcement is more work. ([Pi Extension API](https://www.mintlify.com/badlogic/pi-mono/api/coding-agent/extension-api))

### 8) Privacy and data residency
- **Local Docker** keeps code execution local by default, which is the strongest privacy posture in this comparison. ([Docker rootless](https://docs.docker.com/engine/security/rootless/))
- **Cloudflare Workers/Containers** run on Cloudflare’s global network and may be placed in different locations for routing/startup reasons. ([Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/), [Cloudflare Containers lifecycle](https://developers.cloudflare.com/containers/platform-details/architecture/))
- **E2B** is also remote cloud execution, so prompt data, code, files, and outputs used inside the sandbox leave the local machine unless you self-host or BYOC via an enterprise path. The public materials confirm hosted usage and a self-hosting option, but exact residency guarantees were not established in the gathered evidence set. ([E2B AI agents page](https://e2b.dev/ai-agents), [Manus case study](https://www.e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers))

### 9) Is Cloudflare Workers architecturally appropriate here?
No. Workers is a great edge-function runtime, but this project needs shell commands, package installs, test runners, filesystem mutation, and sometimes long-lived processes. The Cloudflare product that maps to that need is **Sandbox SDK / Containers**, not Workers runtime itself. ([Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/), [Cloudflare Sandbox SDK commands](https://developers.cloudflare.com/sandbox/api/commands/), [Cloudflare Containers lifecycle](https://developers.cloudflare.com/containers/platform-details/architecture/))

### 10) Attack surface
- **Docker** has the broadest host-coupling risk because it is local, but rootless mode and seccomp materially reduce the blast radius. ([Docker rootless](https://docs.docker.com/engine/security/rootless/), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/))
- **E2B** and **Cloudflare Sandbox/Containers** reduce direct host exposure for the developer workstation, but they introduce remote control-plane trust, remote storage/egress concerns, and cloud placement/privacy trade-offs. ([E2B internet access](https://e2b.mintlify.app/docs/sandbox/internet-access.md), [Cloudflare Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/), [Cloudflare Containers lifecycle](https://developers.cloudflare.com/containers/platform-details/architecture/))

## RECOMMENDATION
Pick **local Docker** as the default v1 sandbox because it is the simplest option that satisfies shell execution, offline mode, GPU support, and strong local privacy, and then harden it with **rootless mode** and Docker’s default **seccomp** profile. Keep **E2B** as the optional managed backend for users who want hosted isolation and fast remote sandboxes, and treat **Cloudflare Sandbox SDK** as a separate future evaluation track only if Cloudflare platform alignment matters enough to justify the added product complexity. ([Docker rootless](https://docs.docker.com/engine/security/rootless/), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/), [E2B pricing](https://e2b.dev/pricing), [Cloudflare Sandbox SDK commands](https://developers.cloudflare.com/sandbox/api/commands/))

## Confidence level
**High** on the Docker and Cloudflare conclusions. **Medium** on E2B startup/isolation claims because some of the strongest numbers in the gathered set come from product pages and case-study material rather than lower-level runtime reference docs. ([Docker rootless](https://docs.docker.com/engine/security/rootless/), [Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/), [E2B AI agents page](https://e2b.dev/ai-agents))

## OPEN questions
1. What is the **measured** Docker startup time on your target hardware and image set?
2. Do you need **GPU** in the same execution path as the coding agent, or can GPU jobs stay outside the harness?
3. Is **hosted cloud execution** a product requirement, or just an optional deployment mode?
