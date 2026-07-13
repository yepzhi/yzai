# Local AI Server Implementation Plan (Minisforum PC)

Set up a local AI server on the Minisforum mini PC (`yepzhi@192.168.1.238` / Tailscale IP `100.91.157.110`) running Ubuntu 26.04 LTS.

## Architecture

```
                    ┌─────────────────────┐
   Mac (browser) ──▶│      Open WebUI      │  ← Tunnel: yepzhi.com/yzai
                    │  localhost:8080      │
                    └──────────┬───────────┘
                               │
        ┌──────────────┬───────┴────────┬──────────────┐
        ▼              ▼                ▼              ▼
   ┌─────────┐   ┌───────────┐   ┌─────────────┐  ┌──────────┐
   │ Ollama  │   │ ComfyUI   │   │ Whisper     │  │ openedai │
   │ :11434  │   │ :8188     │   │ (integrado) │  │ -speech  │
   │ (texto) │   │ (img/vid) │   │ (STT)       │  │ :8000    │
   └─────────┘   └───────────┘   └─────────────┘  └──────────┘
```

---

## Services Configured

### 1. Ollama (Host service)
* Installed on host.
* Configured via `/etc/systemd/system/ollama.service.d/override.conf` to bind to `0.0.0.0:11434`.
* Detected integrated AMD Radeon 890M GPU (GFX1150) with 14.2 GB VRAM allocation via ROCm.
* Models pulled:
  * `qwen3.6:27b` (17 GB)
  * `qwen3.5:9b` (6.6 GB)

### 2. Audio Pipeline (openedai-speech)
* Docker container running on port `8000`.
* Command:
  ```bash
  docker run -d -p 8000:8000 \
    -v voices:/app/voices -v config:/app/config \
    --name openedai-speech --restart always \
    ghcr.io/matatonic/openedai-speech-min
  ```

### 3. Frontend UI (Open WebUI)
* Docker container running on port `8080`.
* Command:
  ```bash
  docker run -d -p 8080:8080 \
    --add-host=host.docker.internal:host-gateway \
    -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
    -e WHISPER_MODEL=medium \
    -v open-webui:/app/backend/data \
    --name open-webui --restart always \
    ghcr.io/open-webui/open-webui:main
  ```

### 4. ComfyUI (Image & Video Generation)
* Since Ubuntu 26.04 uses Python 3.14 (incompatible with PyTorch nightly wheels), ComfyUI is dockerized using the official AMD ROCm PyTorch container.
* Command to run ComfyUI:
  ```bash
  docker run -d --name comfyui --restart always \
    -p 8188:8188 \
    --device=/dev/kfd --device=/dev/dri \
    --group-add video --group-add render \
    -v ~/ComfyUI:/app \
    -e HSA_OVERRIDE_GFX_VERSION=11.0.0 \
    -w /app \
    rocm/pytorch:latest \
    /bin/bash -c "pip install -r requirements.txt && python3 main.py --listen 0.0.0.0"
  ```
