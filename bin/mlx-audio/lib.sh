#!/usr/bin/env bash
# Shared functions for mlx-audio CLI tools

source "$(dirname "${BASH_SOURCE[0]}")/constants.sh"

# Check if mlx-audio server is running and responsive
mlx_audio_server_is_running() {
    curl -s -f "http://localhost:${MLX_AUDIO_PORT}/v1/models" >/dev/null 2>&1
}

# Start mlx-audio server if not running
mlx_audio_server_ensure() {
    if mlx_audio_server_is_running; then
        return 0
    fi

    # Check if port is occupied by another process
    if lsof -i ":${MLX_AUDIO_PORT}" >/dev/null 2>&1; then
        echo "Error: Port ${MLX_AUDIO_PORT} is occupied by another process." >&2
        return 1
    fi

    echo "Starting mlx_audio.server on port ${MLX_AUDIO_PORT}..." >&2
    nohup mlx_audio.server --port "${MLX_AUDIO_PORT}" > "${MLX_AUDIO_LOG}" 2>&1 &
    disown

    # Wait for server to be ready
    local count=0
    while ! mlx_audio_server_is_running; do
        sleep 1
        count=$((count + 1))
        if [[ $count -ge $MLX_AUDIO_TIMEOUT ]]; then
            echo "Error: mlx_audio.server failed to start on port ${MLX_AUDIO_PORT}." >&2
            [[ -f "${MLX_AUDIO_LOG}" ]] && tail -n 20 "${MLX_AUDIO_LOG}" >&2
            return 1
        fi
    done
    echo "Server is ready." >&2
}

# Cleanup function (optional usage in scripts)
mlx_audio_cleanup() {
    local temp_file=$1
    [[ -n "$temp_file" && -f "$temp_file" ]] && rm -f "$temp_file"
}
