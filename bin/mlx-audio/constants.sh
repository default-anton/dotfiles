#!/usr/bin/env bash
# Shared constants for mlx-audio CLI tools

MLX_AUDIO_PORT="${MLX_AUDIO_PORT:-9876}"
MLX_AUDIO_LOG="${MLX_AUDIO_LOG:-/tmp/mlx_audio_server.log}"
MLX_AUDIO_PID_FILE="${MLX_AUDIO_PID_FILE:-/tmp/mlx_audio_server.pid}"
MLX_AUDIO_TIMEOUT="${MLX_AUDIO_TIMEOUT:-30}"  # seconds to wait for server

# Default models
DEFAULT_TTS_MODEL="mlx-community/Kokoro-82M-bf16"
DEFAULT_STT_MODEL="mlx-community/parakeet-tdt-0.6b-v2"
DEFAULT_TTS_VOICE="af_heart"
DEFAULT_TTS_SPEED="1.0"
