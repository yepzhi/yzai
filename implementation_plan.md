# yzai — Plan de Implementación Completo
### Servidor local de IA en Minisforum X1 Pro AI (Ryzen AI 9 HX 370, 32GB RAM, 1TB NVMe)

Hardware real: GPU integrada Radeon 890M, **sin VRAM dedicada** — la VRAM se
reserva desde la BIOS (UMA Frame Buffer Size) restando directo de los 32GB de
RAM del sistema. Configuración actual recomendada: **16G para la iGPU / 16GB
para el sistema** — es el punto de equilibrio que evita los OOM crashes que
tuvimos al probar 24G (dejaba solo 8GB al sistema, insuficiente para cargar
modelos grandes). Los tiempos de generación de imagen/video van a ser más
lentos que en una GPU dedicada (RTX 4090, etc.) — esto ya está contemplado en
el plan.

⚠️ **Verifica antes de seguir:** confirma en la BIOS que el UMA Frame Buffer
Size esté en 16G, no en 24G (Advanced → AMD CBS → NBIO Common Options → GFX
Configuration → UMA Frame Buffer Size).

---

## Arquitectura

```
                    ┌─────────────────────┐
   Mac (browser) ──▶│      Open WebUI      │  ← selector único, todo por navegador
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

## FASE 1 — Modelos de texto (lineup final, curado)

**Importante:** si en algún momento se descargaron `llama3.1`, `qwen2.5:9b`,
`qwen2.5:32b`, `minicpm-v` o `llava:13b` (sugeridos por Antigravity), bórralos.
Son redundantes/inferiores frente al lineup de abajo — Qwen2.5 es la
generación anterior a Qwen3.5/3.6, y no necesitas un modelo de visión aparte
porque Qwen3.5 ya es multimodal nativo.

```bash
ollama rm llama3.1 qwen2.5:9b qwen2.5:32b minicpm-v llava:13b 2>/dev/null
```

**Lineup final — uno por categoría:**

```bash
ollama pull qwen3.5:4b     # Texto rápido — respuestas casi instantáneas
ollama pull qwen3.6:27b    # Texto Pro/Frontier — mejor calidad, uso diario real
ollama pull nomic-embed-text  # Utilidad para RAG — necesario si subes PDFs en Open WebUI
```

| Modelo | Rol | Tamaño | Notas |
|---|---|---|---|
| `qwen3.5:4b` | Texto rápido | ~2.5GB | Multimodal nativo (también entiende imágenes) |
| `qwen3.6:27b` | Texto Pro/Frontier | ~17GB | El que conecta a JóvenesSTEM/STEMBot |
| `nomic-embed-text` | RAG/embeddings | ~270MB | No es modelo de chat — habilita subir PDFs |

No se agrega un modelo de visión separado — ambos modelos de texto de arriba
ya procesan imágenes de forma nativa.

Nota sobre RAM: Ollama descarga modelos de memoria automáticamente cuando no
se usan (`keep_alive`), así que no vas a tener los 17GB + otros modelos
ocupados en RAM al mismo tiempo salvo que los uses en paralelo activamente.

---

## FASE 2 — Voz (STT + TTS)

**STT (voz→texto):** ya viene integrado en Open WebUI, no necesitas instalar nada.
Solo actívalo:
- Abre Open WebUI → ícono de tu usuario → **Admin Panel → Settings → Audio**
- STT Engine: deja el default (Whisper local)
- Si quieres mejor precisión en español, en el contenedor de Open WebUI agrega
  la variable de entorno `WHISPER_MODEL=medium` (default es `base`, más rápido
  pero menos preciso)

**TTS (texto→voz):** usa `openedai-speech` en modo mínimo (solo Piper, sin GPU):

```bash
sudo docker run -d -p 8000:8000 \
  -v voices:/app/voices -v config:/app/config \
  --name openedai-speech --restart always \
  ghcr.io/matatonic/openedai-speech-min
```

Luego en Open WebUI → **Admin Panel → Settings → Audio → TTS**:
- TTS Engine: `OpenAI`
- API Base URL: `http://localhost:8000/v1`
- API Key: `sk-111111111` (dummy, openedai-speech no valida esto, pero el
  campo no puede quedar vacío)
- TTS Voice: elige una de las voces Piper disponibles (hay opciones en
  español)

---

## FASE 3 — Imágenes (ComfyUI + FLUX.2 Klein)

```bash
cd ~
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m venv venv
source venv/bin/activate
pip install --pre torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/nightly/rocm6.2
pip install -r requirements.txt
```

Si el comando de arriba no detecta tu GPU (`torch.cuda.is_available()` da
`False` incluso en AMD — así reporta ROCm), no pasa nada, ComfyUI cae a modo
CPU automáticamente. Va a ser más lento (minutos en vez de segundos) pero
funciona, y ya dijiste que puedes esperar.

**Descarga los pesos de FLUX.2 Klein** (revisa en Hugging Face el nombre
exacto del archivo más reciente, cambia con cada release):

```bash
mkdir -p models/checkpoints
cd models/checkpoints
wget https://huggingface.co/black-forest-labs/FLUX.2-klein/resolve/main/flux2-klein-4b.safetensors
cd ../..
```

**Arranca ComfyUI:**

```bash
python main.py --listen 0.0.0.0 --port 8188
```

Prueba abriendo `http://ip-del-mini-pc:8188` desde tu Mac — deberías ver la
interfaz de nodos de ComfyUI.

**Conecta ComfyUI a Open WebUI:**
- Open WebUI → **Admin Panel → Settings → Images**
- Image Generation Engine: `ComfyUI`
- ComfyUI Base URL: `http://localhost:8188`
- Selecciona el checkpoint FLUX.2 Klein que descargaste

---

## FASE 4 — Video (HunyuanVideo 1.5, uso personal)

Mismo ComfyUI, diferente set de pesos. Aviso honesto: en tu hardware sin VRAM
dedicada, cada clip corto puede tardar **varios minutos, potencialmente más
de media hora** dependiendo de duración/resolución. Es viable para uso
personal ocasional, no para nada en tiempo real.

```bash
cd ~/ComfyUI
mkdir -p models/diffusion_models
cd models/diffusion_models
wget https://huggingface.co/tencent/HunyuanVideo-1.5/resolve/main/hunyuanvideo-1.5-8.3b.safetensors
cd ../..
```

Necesitarás el workflow de ComfyUI específico para HunyuanVideo (JSON de
nodos) — se descarga desde la página del modelo en Hugging Face o el repo
oficial de ComfyUI-Examples. Cárgalo en la interfaz de ComfyUI con
"Load Workflow".

---

## 🔬 FASE 4.5 — Colibri + GLM-5.2 (bonus experimental, NO interactivo)

**Qué es:** Colibrì es un motor de inferencia en C puro (lanzado el 10 de
julio 2026, github.com/JustVugg/colibri) que corre GLM-5.2 — un modelo MoE
de **744B parámetros** de Zhipu AI — manteniendo solo ~9.9GB en RAM y
transmitiendo los ~370GB de "expertos" restantes directo desde el NVMe según
se necesitan. No usa GPU, solo CPU + RAM + disco.

**Por qué es "bonus" y no tu modelo Pro/Frontier principal:** la velocidad
real reportada en hardware similar al tuyo (CPUs Ryzen de esta clase) es de
**0.05 a 0.3 tokens por segundo**. Eso significa que una respuesta de ~250
palabras puede tardar entre 15 minutos y más de una hora. El propio autor lo
describe como prueba de concepto, no como asistente práctico. `qwen3.6:27b`
sigue siendo tu modelo del día a día — esto es para curiosidad, no para chat.

**Requisitos:**
- ~370GB libres en el NVMe (revisa espacio antes de empezar)
- Mínimo 16GB de RAM disponible para el sistema (con tu BIOS en 16G de
  VRAM ya cumples el mínimo, aunque menos holgado que el ~25GB recomendado
  por el proyecto — si quieres correrlo con más margen, baja temporalmente
  el UMA Frame Buffer Size a 2-4G esa sesión, liberando ~28-30GB al sistema)
- gcc, OpenMP, soporte AVX2 (tu Ryzen AI 9 HX 370 lo tiene)
- Python solo para la conversión inicial del modelo (no en tiempo de
  inferencia)

**Instalación:** el repositorio cambia rápido (recién lanzado) y el proceso
completo de descarga/conversión del modelo de 744B no está 100% fijo todavía
— antes de correr comandos, pídeme que lea el README actual del repo
(`github.com/JustVugg/colibri`) y te paso los pasos exactos vigentes en ese
momento, en vez de comandos que podrían quedar desactualizados en días.

---

## FASE 5 — Que todo arranque solo (systemd)

Para que ComfyUI y los servicios sobrevivan reinicios sin que tengas que
correr comandos cada vez:

```bash
sudo tee /etc/systemd/system/comfyui.service << 'EOF'
[Unit]
Description=ComfyUI
After=network.target

[Service]
Type=simple
User=yepzhi
WorkingDirectory=/home/yepzhi/ComfyUI
ExecStart=/home/yepzhi/ComfyUI/venv/bin/python main.py --listen 0.0.0.0 --port 8188
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now comfyui
```

(Docker ya maneja el `--restart always` para Ollama, Open WebUI y
openedai-speech, así que esos no necesitan systemd aparte.)

---

## Resumen de acceso desde tu Mac

| Servicio | URL |
|---|---|
| Open WebUI (selector principal) | `http://ip-del-mini-pc:8080` |
| Cockpit (administración del sistema) | `https://ip-del-mini-pc:9090` |
| ComfyUI (directo, si necesitas ajustar workflows) | `http://ip-del-mini-pc:8188` |

## Checklist de verificación

- [ ] BIOS: UMA Frame Buffer Size en 16G (no 24G)
- [ ] Modelos extra de Antigravity eliminados (`llama3.1`, `qwen2.5:9b/32b`, `minicpm-v`, `llava:13b`)
- [ ] `ollama list` muestra qwen3.5:4b, qwen3.6:27b y nomic-embed-text
- [ ] `ollama run qwen3.6:27b` carga sin error de OOM/cudaMalloc
- [ ] Open WebUI: dropdown de modelos muestra qwen3.5:4b y qwen3.6:27b
- [ ] Audio → STT funciona (prueba grabando un mensaje de voz)
- [ ] Audio → TTS funciona (prueba que lea una respuesta en voz alta)
- [ ] Images → genera una imagen de prueba con FLUX.2 Klein
- [ ] (Opcional) Video → genera un clip corto de prueba, con paciencia
- [ ] `systemctl status comfyui` muestra activo tras reiniciar el Mini PC
- [ ] (Opcional/bonus) Colibri + GLM-5.2 — solo si decides que vale la pena la espera

---

## FASE 6 — Acceso remoto seguro (iPhone + Antigravity)

### 6.1 Instala Tailscale en el Mini PC

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Esto imprime un link — ábrelo en cualquier navegador y loguéate con tu cuenta
(Google/GitHub/email). Al terminar, corre:

```bash
tailscale ip -4
```

Esa IP (formato `100.x.x.x`) es la que vas a usar desde cualquier lado, WiFi
o datos móviles, sin abrir nada en el router de casa.

### 6.2 iPhone — acceso desde cualquier lugar

1. Instala **Tailscale** desde el App Store.
2. Inicia sesión con la misma cuenta que usaste en el Mini PC.
3. Desde Safari, entra a `http://100.x.x.x:8080` (la IP de Tailscale del
   paso anterior) — funciona igual estés en casa o en la calle.

### 6.3 Acceso para Antigravity — usuario propio, no tus credenciales

No compartas tu usuario/contraseña. Crea uno dedicado:

```bash
sudo adduser antigravity
sudo usermod -aG sudo antigravity
```

Pídele a Antigravity su llave pública SSH y agrégala:

```bash
sudo mkdir -p /home/antigravity/.ssh
echo "PEGA_AQUI_LA_LLAVE_PUBLICA_DE_ANTIGRAVITY" | sudo tee /home/antigravity/.ssh/authorized_keys
sudo chown -R antigravity:antigravity /home/antigravity/.ssh
sudo chmod 700 /home/antigravity/.ssh
sudo chmod 600 /home/antigravity/.ssh/authorized_keys
```

### 6.4 Compartir acceso Tailscale con Antigravity sin darle tu cuenta completa

En login.tailscale.com/admin/machines selecciona el Mini PC -> "Share" ->
ingresa el email de Antigravity. Esto le da acceso *solo a esa máquina*, no
a tu tailnet completo ni a tus otros dispositivos.

### 6.5 Mapa de acceso para Antigravity

| Servicio | Puerto | Para qué |
|---|---|---|
| SSH | 22 | Acceso a terminal, cambios de sistema |
| Open WebUI | 8080 | Configurar modelos, audio, imágenes |
| Cockpit | 9090 | Monitoreo del sistema (CPU, RAM, disco, logs) |
| ComfyUI | 8188 | Workflows de imagen/video |
| Ollama API | 11434 | Integración directa con JóvenesSTEM |

Todo esto queda accesible vía `ssh antigravity@100.x.x.x` o los URLs de
arriba con esa misma IP de Tailscale — sin necesidad de que tú estés
presente ni de compartir tu contraseña personal.
