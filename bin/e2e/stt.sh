#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STT_BIN="${ROOT_DIR}/bin/stt"
TTS_BIN="${ROOT_DIR}/bin/tts"

FIXTURE_DIR="${ROOT_DIR}/bin/e2e/fixtures"
SHORT_AUDIO_FIXTURE="${FIXTURE_DIR}/stt_hello_world.wav"
SHORT_EXPECTED_TEXT="${FIXTURE_DIR}/stt_hello_world.txt"
TTS_INPUT_TEXT_FIXTURE="${FIXTURE_DIR}/tts_roundtrip_input.txt"

LONG_VIDEO_URL="https://x.com/andreasklinger/status/2022339447769977134"
LONG_VIDEO_FIXTURE="${FIXTURE_DIR}/x_andreasklinger_status_2022339447769977134_low.mp4"
LONG_AUDIO_FIXTURE="${FIXTURE_DIR}/x_andreasklinger_status_2022339447769977134_low_mono.mp3"
YT_DLP_FORMAT="http-256/hls-81+hls-audio-32000-Audio/worst"

TMP_DIR="$(mktemp -d /tmp/stt-e2e.XXXXXX)"
mkdir -p "${FIXTURE_DIR}"

if [[ -z "${MLX_AUDIO_PORT:-}" ]]; then
  export MLX_AUDIO_PORT="$((19000 + RANDOM % 2000))"
fi

export MLX_AUDIO_LOG="${TMP_DIR}/mlx_audio_server.log"
export MLX_AUDIO_TIMEOUT="${MLX_AUDIO_TIMEOUT:-120}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"

  if [[ "${haystack}" != *"${needle}"* ]]; then
    fail "expected '${haystack}' to contain '${needle}'"
  fi
}

normalize_text() {
  tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:][:space:]' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//'
}

word_count() {
  wc -w | awk '{print $1}'
}

assert_word_count_at_least() {
  local text_file="$1"
  local min_words="$2"
  local actual_words

  actual_words="$(word_count < "${text_file}")"
  if ((actual_words < min_words)); then
    fail "expected at least ${min_words} words in ${text_file}, got ${actual_words}"
  fi
}

cleanup() {
  if command -v lsof >/dev/null 2>&1; then
    while IFS= read -r pid; do
      if ps -p "${pid}" -o command= 2>/dev/null | rg -q "mlx_audio\.server"; then
        kill "${pid}" >/dev/null 2>&1 || true
      fi
    done < <(lsof -ti tcp:"${MLX_AUDIO_PORT}" 2>/dev/null || true)
  fi

  rm -rf "${TMP_DIR}"
}

ensure_short_audio_fixture() {
  if [[ -s "${SHORT_AUDIO_FIXTURE}" ]]; then
    return
  fi

  require_command say

  echo "[stt-e2e] generating short audio fixture"
  local short_aiff_fixture phrase
  short_aiff_fixture="${TMP_DIR}/stt_hello_world.aiff"
  phrase="$(cat "${SHORT_EXPECTED_TEXT}")"

  say -v Samantha -o "${short_aiff_fixture}" "${phrase}" || fail "failed to generate short audio with say"
  ffmpeg -y -loglevel error \
    -i "${short_aiff_fixture}" \
    -ac 1 \
    -ar 16000 \
    "${SHORT_AUDIO_FIXTURE}" || fail "failed to convert short audio fixture to wav"
}

ensure_long_video_fixture() {
  if [[ -f "${LONG_VIDEO_FIXTURE}" ]]; then
    return
  fi

  echo "[stt-e2e] downloading long video fixture (low quality)"
  yt-dlp \
    --no-progress \
    --format "${YT_DLP_FORMAT}" \
    --merge-output-format mp4 \
    --output "${LONG_VIDEO_FIXTURE}" \
    "${LONG_VIDEO_URL}" || fail "failed to download long video fixture"
}

ensure_long_audio_fixture() {
  if [[ -f "${LONG_AUDIO_FIXTURE}" && "${LONG_AUDIO_FIXTURE}" -nt "${LONG_VIDEO_FIXTURE}" ]]; then
    return
  fi

  echo "[stt-e2e] extracting long audio fixture from video"
  ffmpeg -y -loglevel error \
    -i "${LONG_VIDEO_FIXTURE}" \
    -vn \
    -ac 1 \
    -ar 16000 \
    -b:a 48k \
    "${LONG_AUDIO_FIXTURE}" || fail "failed to create long audio fixture"
}

trap cleanup EXIT

require_command ffmpeg
require_command ffprobe
require_command yt-dlp
require_command rg

[[ -x "${STT_BIN}" ]] || fail "missing executable: ${STT_BIN}"
[[ -x "${TTS_BIN}" ]] || fail "missing executable: ${TTS_BIN}"
[[ -f "${SHORT_EXPECTED_TEXT}" ]] || fail "missing expected text fixture: ${SHORT_EXPECTED_TEXT}"
[[ -f "${TTS_INPUT_TEXT_FIXTURE}" ]] || fail "missing tts input fixture: ${TTS_INPUT_TEXT_FIXTURE}"

if lsof -i ":${MLX_AUDIO_PORT}" >/dev/null 2>&1; then
  fail "port ${MLX_AUDIO_PORT} is busy; set MLX_AUDIO_PORT to a free port"
fi

ensure_short_audio_fixture
expected_short="$(normalize_text < "${SHORT_EXPECTED_TEXT}")"

echo "[stt-e2e] short file input"
short_file_output="$(${STT_BIN} "${SHORT_AUDIO_FIXTURE}" --language en)"
short_file_output_normalized="$(printf '%s' "${short_file_output}" | normalize_text)"
assert_contains "${short_file_output_normalized}" "hello world"
assert_contains "${short_file_output_normalized}" "speech to text"

if [[ "${short_file_output_normalized}" != "${expected_short}" ]]; then
  echo "[stt-e2e] warning: short transcript differs from fixture text"
  echo "  expected: ${expected_short}"
  echo "  actual:   ${short_file_output_normalized}"
fi

echo "[stt-e2e] short stdin input"
short_stdin_output="$(cat "${SHORT_AUDIO_FIXTURE}" | ${STT_BIN} --language en)"
short_stdin_output_normalized="$(printf '%s' "${short_stdin_output}" | normalize_text)"
assert_contains "${short_stdin_output_normalized}" "hello world"
assert_contains "${short_stdin_output_normalized}" "speech to text"

echo "[stt-e2e] short --output file"
short_output_file="${TMP_DIR}/short_transcript.txt"
short_stdout="$(${STT_BIN} "${SHORT_AUDIO_FIXTURE}" --language en --output "${short_output_file}")"
[[ -z "${short_stdout}" ]] || fail "expected no stdout when --output is set"
[[ -f "${short_output_file}" ]] || fail "expected output file to be created"
short_output_file_text_normalized="$(normalize_text < "${short_output_file}")"
assert_contains "${short_output_file_text_normalized}" "hello world"
assert_contains "${short_output_file_text_normalized}" "speech to text"

echo "[stt-e2e] missing file error"
set +e
missing_stderr="$(${STT_BIN} "${TMP_DIR}/does-not-exist.wav" 2>&1 >/dev/null)"
missing_status=$?
set -e
[[ ${missing_status} -ne 0 ]] || fail "expected missing-file invocation to fail"
missing_stderr_normalized="$(printf '%s' "${missing_stderr}" | normalize_text)"
assert_contains "${missing_stderr_normalized}" "not found"

echo "[stt-e2e] tts -> stt roundtrip example"
tts_audio_fixture="${TMP_DIR}/tts_roundtrip.mp3"
${TTS_BIN} --input "${TTS_INPUT_TEXT_FIXTURE}" --speed 1.2 --output "${tts_audio_fixture}" >/dev/null
[[ -f "${tts_audio_fixture}" ]] || fail "tts output fixture was not created"

roundtrip_output="$(${STT_BIN} "${tts_audio_fixture}" --language en)"
roundtrip_output_normalized="$(printf '%s' "${roundtrip_output}" | normalize_text)"
assert_contains "${roundtrip_output_normalized}" "ship"
assert_contains "${roundtrip_output_normalized}" "boring"
assert_contains "${roundtrip_output_normalized}" "software"

echo "[stt-e2e] long video fixture setup"
ensure_long_video_fixture
ensure_long_audio_fixture

video_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${LONG_VIDEO_FIXTURE}" | awk '{print int($1)}')"
audio_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${LONG_AUDIO_FIXTURE}" | awk '{print int($1)}')"

((video_duration >= 600)) || fail "long video fixture duration too short (${video_duration}s)"
((audio_duration >= 600)) || fail "long audio fixture duration too short (${audio_duration}s)"

echo "[stt-e2e] long video transcription with chunking"
long_video_transcript="${TMP_DIR}/long_video_transcript.txt"
long_video_stderr="${TMP_DIR}/long_video_stderr.log"
${STT_BIN} "${LONG_VIDEO_FIXTURE}" --language en --chunk-seconds 180 --output "${long_video_transcript}" 2>"${long_video_stderr}"
[[ -f "${long_video_transcript}" ]] || fail "missing long video transcript output"
assert_word_count_at_least "${long_video_transcript}" 250
assert_contains "$(normalize_text < "${long_video_stderr}")" "chunking audio into"

long_video_text_normalized="$(normalize_text < "${long_video_transcript}")"
assert_contains "${long_video_text_normalized}" "software development"
assert_contains "${long_video_text_normalized}" "ai models"

echo "[stt-e2e] long audio transcription with chunking"
long_audio_transcript="${TMP_DIR}/long_audio_transcript.txt"
long_audio_stderr="${TMP_DIR}/long_audio_stderr.log"
${STT_BIN} "${LONG_AUDIO_FIXTURE}" --language en --chunk-seconds 180 --output "${long_audio_transcript}" 2>"${long_audio_stderr}"
[[ -f "${long_audio_transcript}" ]] || fail "missing long audio transcript output"
assert_word_count_at_least "${long_audio_transcript}" 250
assert_contains "$(normalize_text < "${long_audio_stderr}")" "chunking audio into"

long_audio_text_normalized="$(normalize_text < "${long_audio_transcript}")"
assert_contains "${long_audio_text_normalized}" "software development"
assert_contains "${long_audio_text_normalized}" "ai models"

echo "[stt-e2e] PASS"
