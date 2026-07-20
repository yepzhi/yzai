#!/bin/bash
# ==============================================================================
# yZAI — Script de Alta Disponibilidad (ALWAYS UP) para Ollama & Gemma 4 26B MoE
# Ejecutar este script en la Mini PC para garantizar disponibilidad 24/7
# ==============================================================================

set -e

echo "🚀 Configurando Ollama en modo ALWAYS UP para OpenClaw, yZAI y JóvenesSTEM Bot..."

# 1. Crear plantilla de servicio systemd optimizada
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
Environment="OLLAMA_NUM_PARALLEL=2"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_ORIGINS=*"

[Install]
WantedBy=multi-user.target
EOF

# 2. Recargar systemd y habilitar auto-inicio
echo "⚙️ Habilitando servicio systemd..."
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl restart ollama

# 3. Esperar que Ollama responda
echo "⏳ Esperando inicio de Ollama..."
until curl -s http://localhost:11434/api/tags > /dev/null; do
  sleep 1
done

# 4. Precargar permanentemente Gemma 4 26B MoE en VRAM
echo "🧠 Cargando modelo Gemma 4 26B MoE permanentemente en VRAM..."
curl -s http://localhost:11434/api/generate -d '{"model":"gemma4:26b", "keep_alive":-1}' > /dev/null

echo "=============================================================================="
echo "✅ ¡Configuración completada con éxito!"
echo "• Modelo: Gemma 4 26B MoE retenido permanentemente en memoria VRAM/RAM (-1)."
echo "• Reinicio automático: systemd reiniciará Ollama en 3s si sufre un fallo."
echo "• Concurrencia: Preparado para procesar peticiones de OpenClaw, yZAI y JóvenesSTEM."
echo "=============================================================================="
