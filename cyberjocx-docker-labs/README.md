# CyberJocx Docker Labs — Starter

A lightweight, local-only starter for CyberJocx training machines.

## What's included

- **Ubuntu 24.04 target** running Nginx.
- **Ubuntu attacker workspace** with Nmap, curl, ping, netcat, DNS utilities, Python 3, and Git.
- A private Docker bridge network with stable internal IPs:
  - Target: `172.30.0.10`
  - Attacker: `172.30.0.20`
- Basic CPU and memory limits.

> This is a starter environment, not a vulnerable challenge yet. The target only serves a basic web page.

## Requirements

- Docker Engine and the Docker Compose plugin, or Docker Desktop.
- About 1–2 GB of free disk space is a comfortable starting allowance for downloaded images and build cache; actual usage varies by platform and image cache.

## Start

From this directory:

```bash
docker compose up -d --build
```

Open a shell in the attacker workspace:

```bash
docker exec -it cjx-attacker-01 bash
```

Check the target from the attacker container:

```bash
ping -c 2 172.30.0.10
nmap -sV -p 80 172.30.0.10
curl http://172.30.0.10
```

Stop and remove the lab containers and network:

```bash
docker compose down
```

## Network and safety notes

- The lab network is marked `internal: true`; it is intended for local lab-to-lab traffic and has no direct external network access.
- The target IP is a **Docker-private IP**, not a public Internet IP. It is reachable from containers attached to this lab network, not automatically from a learner's personal computer or from the Internet.
- Do not publish this setup to the Internet as-is. A multi-user service needs a properly designed lab manager, per-user isolation, quotas, authentication, timeouts, monitoring, and a controlled VPN or browser-based access gateway.
- Never mount the Docker socket into learner containers or run untrusted learner code with host privileges.
- Only test systems you own or have explicit permission to assess.

## Project layout

```text
cyberjocx-docker-labs/
├── compose.yaml
├── target/
│   ├── Dockerfile
│   └── index.html
└── attacker/
    └── Dockerfile
```

## Extending the starter

Add tools to `attacker/Dockerfile` and rebuild. Keep challenge-specific vulnerable applications in separate target images so the common attacker workspace can remain small and reusable.
