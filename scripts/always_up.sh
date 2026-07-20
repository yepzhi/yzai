#!/bin/bash
# ==============================================================================
# yZAI — Script de Alta Disponibilidad (ALWAYS UP)
# Ollama + Gemma 4 26B MoE + OpenClaw Gateway
# Ejecutar en la Mini PC para garantizar disponibilidad 24/7
# ==============================================================================

set -e

echo "🚀 Configurando servicios en modo ALWAYS UP..."

# ── 1. Ollama ─────────────────────────────────────────────────────────────────
sudo tee /etc/systemd/system/ollama.service > /dev/null << 'EOF'
[Unit]
Description=Ollama Service (24/7 Always Up)
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_HOST=0.0.0.0:11434"

[Install]
WantedBy=multi-user.target
EOF

echo "⚙️ Habilitando Ollama..."
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl restart ollama

# ── 2. Esperar Ollama ─────────────────────────────────────────────────────────
echo "⏳ Esperando que Ollama responda..."
until curl -s http://localhost:11434/api/tags > /dev/null; do
  sleep 1
done

# ── 3. Precargar Gemma 4 en VRAM ─────────────────────────────────────────────
echo "🧠 Precargando Gemma 4 26B MoE en VRAM (keep_alive: -1)..."
curl -s http://localhost:11434/api/generate -d '{"model":"gemma4-26b-MoE:latest", "keep_alive":-1}' > /dev/null

# ── 4. OpenClaw Gateway ───────────────────────────────────────────────────────
# OpenClaw es el agente de WhatsApp (RichmondBot). Muy bajo consumo de RAM (~200MB).
# Solo orquesta llamadas a Ollama — el modelo ya está en VRAM, OpenClaw no lo carga.
OPENCLAW_BIN="/home/yepzhi/.npm-global/lib/node_modules/openclaw/dist/index.js"
OPENCLAW_USER="yepzhi"

sudo tee /etc/systemd/system/openclaw.service > /dev/null << EOF
[Unit]
Description=OpenClaw Gateway (WhatsApp Bot)
After=network-online.target ollama.service
Wants=ollama.service

[Service]
ExecStart=/usr/bin/node ${OPENCLAW_BIN} gateway --port 18789
User=${OPENCLAW_USER}
WorkingDirectory=/home/${OPENCLAW_USER}
Restart=always
RestartSec=5
Environment="NODE_ENV=production"
Environment="PATH=/usr/bin:/home/${OPENCLAW_USER}/.npm-global/bin:/usr/local/bin"

[Install]
WantedBy=multi-user.target
EOF

echo "⚙️ Habilitando OpenClaw Gateway..."
sudo systemctl daemon-reload
sudo systemctl enable openclaw
sudo systemctl restart openclaw

echo "=============================================================================="
echo "✅ ¡Configuración completada con éxito!"
echo "• Ollama:    Gemma 4 26B MoE en VRAM permanente (NUM_PARALLEL=4, FLASH_ATTN)"
echo "• OpenClaw:  Gateway activo en puerto 18789 (WhatsApp bot)"
echo "• Reinicio:  systemd reinicia ambos servicios automáticamente en 3-5s"
echo "=============================================================================="
