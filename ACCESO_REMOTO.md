# Guía de Acceso Remoto y Conexión — YZAI (Minisforum X1 Pro AI)

Este documento contiene toda la información de red, credenciales de SSH, puertos y endpoints para conectarse al Mini PC **YZAI** localmente o desde cualquier parte del mundo.

---

## 1. Conexión SSH (Acceso por Terminal)

En tu Mac (`~/.ssh/config`) existen 3 alias configurados para conectarte al Mini PC según la ubicación:

### 🌐 A. Acceso Global Remoto vía Cloudflare Tunnel (Recomendado fuera de casa)
Funciona desde cualquier lugar con conexión a internet, sin importar si estás en WiFi pública, datos móviles o fuera de la red local.

```bash
ssh yzai-cf
```

* Configuración interna en `~/.ssh/config`:
  ```sshconfig
  Host yzai-cf
      HostName ssh.yzai.yepzhi.com
      User yepzhi
      ProxyCommand cloudflared access ssh --hostname %h
      IdentityFile ~/.ssh/id_ed25519
      StrictHostKeyChecking no
  ```

---

### 🔒 B. Acceso Remoto vía Tailscale Mesh VPN
Para conectarte cuando tienes la app de Tailscale activa en tu Mac o iPhone.

```bash
ssh yzai
```

* IP de Tailscale: `100.91.157.110` (o `100.x.x.x`)
* Usuario: `yepzhi`
* Configuración interna en `~/.ssh/config`:
  ```sshconfig
  Host yzai
      HostName 100.91.157.110
      User yepzhi
      IdentityFile ~/.ssh/id_ed25519
      ProxyCommand nc -X 5 -x localhost:1055 %h %p
      StrictHostKeyChecking no
  ```

---

### 🏠 C. Acceso en Red Local (LAN / WiFi de Casa)
Para conectarte cuando estés en la misma red WiFi/LAN local.

```bash
ssh yzai-local
```

* Host local: `yzai.local` (o IP `192.168.1.230`)
* Usuario: `yepzhi`

---

## 2. Endpoints y URLs de Servicios Web

### 🌐 Dominio Público (Cloudflare Tunnel)
| Servicio | URL Pública | Descripción |
|---|---|---|
| **YZAI Web UI** | `http://yzai.yepzhi.com` | Interfaz Nginx liviana |
| **Open WebUI** | `http://webui.yzai.yepzhi.com` | Selector principal, RAG y Audio |
| **Ollama API** | `http://api-yzai.yepzhi.com` | API REST para Qwen3.6-35B |
| **ComfyUI** | `http://img-yzai.yepzhi.com` | Generación de imágenes/video (FLUX.2 Klein) |
| **Search Proxy** | `http://search-yzai.yepzhi.com` | Proxy de búsqueda DuckDuckGo |
| **SSH Tunnel** | `ssh.yzai.yepzhi.com` | Enrutamiento SSH vía Cloudflare |

### 🏠 Red Local / SSH Directo
| Servicio | Puerto Local | URL Local |
|---|---|---|
| Open WebUI | `8080` | `http://yzai-local:8080` |
| YZAI UI | `8081` | `http://yzai-local:8081` |
| Ollama API | `11434` | `http://yzai-local:11434` |
| ComfyUI | `8188` | `http://yzai-local:8188` |
| OpenedAI Speech (TTS) | `8000` | `http://yzai-local:8000/v1` |
| DuckDuckGo MCP | `8001` | `http://yzai-local:8001` |
| Crawl4AI Scraper | `11235` | `http://yzai-local:11235/mcp/sse` |
| Search Proxy | `11435` | `http://yzai-local:11435` |

---

## 3. Servidor Sandbox MCP (`yzai-mcp-sandbox`)

Para ejecutar código y manipular archivos de forma segura sin vulnerar el sistema:

* **Ubicación en el Mini PC**: `/home/yepzhi/Desktop/yzai-mcp-sandbox`
* **Workspace Permitido**: `/home/yepzhi/yzai-workspace`
* **Configuración MCP**: `/home/yepzhi/Desktop/yzai-mcp-sandbox/mcp_client_config.json`
* **Herramientas Disponibles**:
  1. `execute_python`: Corre Python en contenedor Docker `python:3.12-slim` sin red.
  2. `list_files` / `read_file`: Lectura segura del workspace.
  3. `propose_write`: Guarda propuestas de edición en `.staging/`.
* **Aprobación Humana**:
  ```bash
  ssh yzai-cf "cd ~/Desktop/yzai-mcp-sandbox && bash apply-staged.sh <staging_id>"
  ```

---

## 4. Parámetros del Hardware y Motor LLM

* **Modelo Activo**: `Qwen3.6-35B-A3B-Uncensored` (34.7B MoE cuantizado a `Q2_K`).
* **VRAM Dedicada (UMA)**: **24.0 GB** configurados en BIOS.
* **Configuración Ollama (`/etc/systemd/system/ollama.service.d/override.conf`)**:
  ```ini
  [Service]
  Environment="OLLAMA_ORIGINS=*"
  Environment="OLLAMA_HOST=0.0.0.0:11434"
  Environment="OLLAMA_KEEP_ALIVE=-1"
  Environment="OLLAMA_NUM_PARALLEL=2"
  Environment="OLLAMA_CONTEXT_LENGTH=16384"
  Environment="OLLAMA_NO_MMAP=1"
  Environment="HSA_OVERRIDE_GFX_VERSION=11.0.3"
  ```
* **Swap en NVMe**: 16 GB activos (`/swapfile`).

---

## 5. Chequeo Rápido de Estado

Si necesitas verificar que todo esté corriendo remotamente:

```bash
ssh yzai-cf "systemctl status ollama cloudflared ddg-mcp --no-pager && free -h && swapon --show"
```
