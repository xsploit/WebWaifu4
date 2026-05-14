#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_OVERRIDE_KEYS=(
  STREAM_WIDTH
  STREAM_HEIGHT
  STREAM_OUTPUT_WIDTH
  STREAM_OUTPUT_HEIGHT
  STREAM_FPS
  STREAM_VIDEO_BITRATE
  STREAM_AUDIO_BITRATE
  STREAM_X264_PRESET
  STREAM_FFMPEG_THREADS
  STREAM_RESTART_DELAY
  STREAM_LOOP
  STREAM_START_APP
  STREAM_BUILD
  STREAM_CHROME_ARGS
  STREAM_CHROME_GL_ARGS
  STREAM_CHROME_PROFILE
  STREAM_CHROME_CACHE_DIR
  STREAM_CHROME_CPUSET
  STREAM_FFMPEG_CPUSET
  STREAM_CHROME_NICE
  STREAM_FFMPEG_NICE
  STREAM_DISABLE_DEV_SHM_USAGE
  STREAM_XVFB_DEPTH
  STREAM_TEST_SECONDS
  OVERLAY_PORT
  OVERLAY_URL
  RTMP_BASE
  PULSE_SINK
  PULSE_SINK_DESCRIPTION
  STREAM_DISPLAY
  STREAM_MONITOR_AUDIO
  STREAM_MONITOR_SINK
  STREAM_CLEANUP_GRACE_SECONDS
)

declare -A ENV_OVERRIDES=()

capture_env_overrides() {
  local key

  for key in "${ENV_OVERRIDE_KEYS[@]}"; do
    if [[ -v "$key" ]]; then
      ENV_OVERRIDES["$key"]="${!key}"
    fi
  done
}

restore_env_overrides() {
  local key

  for key in "${!ENV_OVERRIDES[@]}"; do
    export "$key=${ENV_OVERRIDES[$key]}"
  done
}

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0

  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
}

capture_env_overrides
load_env_file "$ROOT_DIR/.env"
load_env_file "$ROOT_DIR/.env.stream"
restore_env_overrides

STREAM_WIDTH="${STREAM_WIDTH:-1280}"
STREAM_HEIGHT="${STREAM_HEIGHT:-720}"
STREAM_OUTPUT_WIDTH="${STREAM_OUTPUT_WIDTH:-$STREAM_WIDTH}"
STREAM_OUTPUT_HEIGHT="${STREAM_OUTPUT_HEIGHT:-$STREAM_HEIGHT}"
STREAM_FPS="${STREAM_FPS:-60}"
STREAM_VIDEO_BITRATE="${STREAM_VIDEO_BITRATE:-4500k}"
STREAM_AUDIO_BITRATE="${STREAM_AUDIO_BITRATE:-160k}"
STREAM_X264_PRESET="${STREAM_X264_PRESET:-superfast}"
STREAM_FFMPEG_THREADS="${STREAM_FFMPEG_THREADS:-2}"
STREAM_RESTART_DELAY="${STREAM_RESTART_DELAY:-5}"
STREAM_LOOP="${STREAM_LOOP:-true}"
STREAM_START_APP="${STREAM_START_APP:-true}"
STREAM_BUILD="${STREAM_BUILD:-false}"
STREAM_CHROME_ARGS="${STREAM_CHROME_ARGS:-}"
STREAM_CHROME_GL_ARGS="${STREAM_CHROME_GL_ARGS:---enable-webgl --ignore-gpu-blocklist --use-gl=angle}"
STREAM_CHROME_PROFILE="${STREAM_CHROME_PROFILE:-/tmp/yourwifey-chrome-profile}"
STREAM_CHROME_CACHE_DIR="${STREAM_CHROME_CACHE_DIR:-/tmp/yourwifey-chrome-cache}"
STREAM_CHROME_CPUSET="${STREAM_CHROME_CPUSET:-0-5}"
STREAM_FFMPEG_CPUSET="${STREAM_FFMPEG_CPUSET:-6-7}"
STREAM_CHROME_NICE="${STREAM_CHROME_NICE:-0}"
STREAM_FFMPEG_NICE="${STREAM_FFMPEG_NICE:-10}"
STREAM_DISABLE_DEV_SHM_USAGE="${STREAM_DISABLE_DEV_SHM_USAGE:-false}"
STREAM_XVFB_DEPTH="${STREAM_XVFB_DEPTH:-16}"
STREAM_TEST_SECONDS="${STREAM_TEST_SECONDS:-}"

OVERLAY_PORT="${OVERLAY_PORT:-4173}"
OVERLAY_URL="${OVERLAY_URL:-http://127.0.0.1:${OVERLAY_PORT}/?routelet=1}"
RTMP_BASE="${RTMP_BASE:-rtmp://live.twitch.tv/app}"
PULSE_SINK="${PULSE_SINK:-yourwifey_stream}"
PULSE_SINK_DESCRIPTION="${PULSE_SINK_DESCRIPTION:-YourWifey_Stream}"
STREAM_DISPLAY="${STREAM_DISPLAY:-${DISPLAY:-:99}}"
STREAM_MONITOR_AUDIO="${STREAM_MONITOR_AUDIO:-false}"
STREAM_MONITOR_SINK="${STREAM_MONITOR_SINK:-@DEFAULT_SINK@}"
STREAM_CLEANUP_GRACE_SECONDS="${STREAM_CLEANUP_GRACE_SECONDS:-3}"

APP_PID=""
XVFB_PID=""
CHROME_PID=""
SINK_MODULE_ID=""
LOOPBACK_MODULE_ID=""

log() {
  printf '[routelet] %s\n' "$*"
}

die() {
  printf '[routelet] ERROR: %s\n' "$*" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  has_command "$1" || die "Missing required command: $1"
}

process_tree_pids() {
  local root_pid="$1"
  local pid

  printf '%s\n' "$root_pid"
  for pid in $(pgrep -P "$root_pid" 2>/dev/null || true); do
    process_tree_pids "$pid"
  done
}

tune_process_tree() {
  local root_pid="$1"
  local nice_value="$2"
  local cpuset="$3"
  local pid

  for pid in $(process_tree_pids "$root_pid" | sort -u); do
    if [[ -n "$cpuset" ]] && has_command taskset; then
      taskset -pc "$cpuset" "$pid" >/dev/null 2>&1 || true
    fi

    if [[ -n "$nice_value" ]] && has_command renice; then
      if (( nice_value < 0 )); then
        sudo -n renice -n "$nice_value" -p "$pid" >/dev/null 2>&1 || true
      else
        renice -n "$nice_value" -p "$pid" >/dev/null 2>&1 || true
      fi
    fi
  done
}

terminate_process_tree() {
  local root_pid="$1"
  local label="$2"
  local grace_seconds="$STREAM_CLEANUP_GRACE_SECONDS"
  local pid
  local waited=0
  local alive=0
  local pids=()

  [[ -n "$root_pid" ]] || return 0
  kill -0 "$root_pid" >/dev/null 2>&1 || return 0

  if ! [[ "$grace_seconds" =~ ^[0-9]+$ ]]; then
    grace_seconds=3
  fi

  mapfile -t pids < <(process_tree_pids "$root_pid" | sort -urn)
  [[ "${#pids[@]}" -gt 0 ]] || return 0

  log "Stopping $label process tree (${#pids[@]} process(es))."
  for pid in "${pids[@]}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done

  while (( waited < grace_seconds )); do
    alive=0
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        alive=1
        break
      fi
    done

    (( alive == 0 )) && break
    sleep 1
    waited=$((waited + 1))
  done

  for pid in "${pids[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -KILL "$pid" >/dev/null 2>&1 || true
    fi
  done

  wait "$root_pid" >/dev/null 2>&1 || true
}

prefix_command() {
  local nice_value="$1"
  local cpuset="$2"
  shift 2

  local command=("$@")
  if [[ -n "$nice_value" ]] && has_command nice && (( nice_value >= 0 )); then
    command=(nice -n "$nice_value" "${command[@]}")
  fi
  if [[ -n "$cpuset" ]] && has_command taskset; then
    command=(taskset -c "$cpuset" "${command[@]}")
  fi

  "${command[@]}"
}

find_chrome() {
  if [[ -n "${CHROME_BIN:-}" ]]; then
    printf '%s\n' "$CHROME_BIN"
    return
  fi

  for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
    if has_command "$candidate"; then
      command -v "$candidate"
      return
    fi
  done

  die "Missing Chromium/Chrome. Set CHROME_BIN or install google-chrome/chromium."
}

rtmp_output_url() {
  if [[ -n "${STREAM_OUTPUT_URL:-}" ]]; then
    printf '%s\n' "$STREAM_OUTPUT_URL"
    return
  fi

  if [[ -n "${RTMP_URL:-}" ]]; then
    printf '%s\n' "$RTMP_URL"
    return
  fi

  [[ -n "${TWITCH_STREAM_KEY:-}" ]] || die "Set TWITCH_STREAM_KEY or RTMP_URL."
  printf '%s/%s\n' "${RTMP_BASE%/}" "$TWITCH_STREAM_KEY"
}

wait_for_url() {
  local url="$1"
  local max_seconds="${2:-45}"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    if (( "$(date +%s)" - started_at >= max_seconds )); then
      return 1
    fi

    sleep 1
  done
}

start_app_if_needed() {
  if wait_for_url "$OVERLAY_URL" 2; then
    log "Overlay already responding at $OVERLAY_URL"
    return
  fi

  [[ "$STREAM_START_APP" == "true" ]] || die "Overlay is not responding at $OVERLAY_URL and STREAM_START_APP=false."

  require_command npm
  require_command curl

  if [[ "$STREAM_BUILD" == "true" ]]; then
    log "Building production overlay and server."
    (
      cd "$ROOT_DIR"
      VITE_AUTO_RESUME_AUDIO="${VITE_AUTO_RESUME_AUDIO:-true}" \
      VITE_DIRECT_TWITCH_CHAT="${VITE_DIRECT_TWITCH_CHAT:-true}" \
        VITE_STREAM_BOT_WS_ENABLED="${VITE_STREAM_BOT_WS_ENABLED:-false}" \
        VITE_AI_PROXY_ENABLED="${VITE_AI_PROXY_ENABLED:-true}" \
        npm run build
    )
  fi

  log "Starting overlay and AI proxy with npm run start:stream."
  (cd "$ROOT_DIR" && npm run start:stream) &
  APP_PID="$!"

  wait_for_url "$OVERLAY_URL" 60 || die "Overlay did not become ready at $OVERLAY_URL."
}

start_display_if_needed() {
  local xvfb_display="${STREAM_DISPLAY%%.*}"
  local xvfb_depth="$STREAM_XVFB_DEPTH"

  if has_command xdpyinfo && DISPLAY="$STREAM_DISPLAY" xdpyinfo >/dev/null 2>&1; then
    log "Using existing X display $STREAM_DISPLAY"
    return
  fi

  require_command Xvfb
  log "Starting Xvfb on $xvfb_display at ${STREAM_WIDTH}x${STREAM_HEIGHT}x${xvfb_depth}."
  Xvfb "$xvfb_display" -screen 0 "${STREAM_WIDTH}x${STREAM_HEIGHT}x${xvfb_depth}" -nolisten tcp &
  XVFB_PID="$!"
  export DISPLAY="$xvfb_display"
  sleep 1
}

start_pulse_if_needed() {
  require_command pactl

  if has_command pulseaudio; then
    pulseaudio --check >/dev/null 2>&1 || pulseaudio --start --exit-idle-time=-1 >/dev/null 2>&1 || true
  fi

  if ! pactl info >/dev/null 2>&1; then
    die "PulseAudio/PipeWire pulse server is not available. Start pipewire-pulse or pulseaudio."
  fi

  if pactl list short sinks | awk '{print $2}' | grep -Fxq "$PULSE_SINK"; then
    log "Using existing audio sink $PULSE_SINK"
  else
    SINK_MODULE_ID="$(
      pactl load-module module-null-sink \
        sink_name="$PULSE_SINK" \
        "sink_properties=device.description=${PULSE_SINK_DESCRIPTION}" \
    )"
    log "Created audio sink $PULSE_SINK"
  fi

  pactl set-default-sink "$PULSE_SINK" >/dev/null 2>&1 || true

  if [[ "$STREAM_MONITOR_AUDIO" == "true" ]]; then
    LOOPBACK_MODULE_ID="$(
      pactl load-module module-loopback \
        source="${PULSE_SINK}.monitor" \
        sink="$STREAM_MONITOR_SINK" \
        latency_msec=50
    )"
    log "Looping stream audio monitor to $STREAM_MONITOR_SINK"
  fi
}

cleanup_run() {
  terminate_process_tree "$CHROME_PID" "Chromium"
  CHROME_PID=""
}

cleanup_all() {
  cleanup_run

  if [[ -n "$LOOPBACK_MODULE_ID" ]]; then
    pactl unload-module "$LOOPBACK_MODULE_ID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$SINK_MODULE_ID" ]]; then
    pactl unload-module "$SINK_MODULE_ID" >/dev/null 2>&1 || true
  fi
  terminate_process_tree "$XVFB_PID" "Xvfb"
  terminate_process_tree "$APP_PID" "overlay app"
}

start_chromium() {
  local chrome_bin="$1"
  local profile_dir="$STREAM_CHROME_PROFILE"
  local chrome_shm_args=()

  if [[ "$STREAM_DISABLE_DEV_SHM_USAGE" == "true" ]]; then
    chrome_shm_args=(--disable-dev-shm-usage)
  fi

  mkdir -p "$profile_dir" "$STREAM_CHROME_CACHE_DIR"
  log "Starting Chromium at $OVERLAY_URL"
  log "Chromium profile=$profile_dir cache=$STREAM_CHROME_CACHE_DIR cpuset=${STREAM_CHROME_CPUSET:-all} nice=$STREAM_CHROME_NICE"

  PULSE_SINK="$PULSE_SINK" DISPLAY="$STREAM_DISPLAY" XDG_CACHE_HOME="$STREAM_CHROME_CACHE_DIR" \
  prefix_command "" "$STREAM_CHROME_CPUSET" "$chrome_bin" \
    --no-sandbox \
    --no-first-run \
    --no-default-browser-check \
    --disable-default-apps \
    "${chrome_shm_args[@]}" \
    --disable-features=Translate,BackForwardCache,ChromeWhatsNewUI \
    --disable-background-media-suspend \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --autoplay-policy=no-user-gesture-required \
    --window-position=0,0 \
    --window-size="${STREAM_WIDTH},${STREAM_HEIGHT}" \
    --user-data-dir="$profile_dir" \
    --disk-cache-dir="$STREAM_CHROME_CACHE_DIR" \
    --media-cache-dir="$STREAM_CHROME_CACHE_DIR/media" \
    $STREAM_CHROME_GL_ARGS \
    --kiosk "$OVERLAY_URL" \
    $STREAM_CHROME_ARGS &
  CHROME_PID="$!"

  sleep "${STREAM_CHROME_WARMUP_SECONDS:-8}"
  tune_process_tree "$CHROME_PID" "$STREAM_CHROME_NICE" "$STREAM_CHROME_CPUSET"
}

run_ffmpeg() {
  local output_url="$1"
  local display_input="$STREAM_DISPLAY"
  local duration_args=()

  if [[ "$display_input" != *.* ]]; then
    display_input="${display_input}.0"
  fi

  if [[ -n "$STREAM_TEST_SECONDS" ]]; then
    duration_args=(-t "$STREAM_TEST_SECONDS")
    log "Smoke-test duration: ${STREAM_TEST_SECONDS}s."
  fi

  log "Starting FFmpeg. Video map: 0:v:0 from $display_input. Audio map: 1:a:0 from ${PULSE_SINK}.monitor."

  local scale_args=()
  if [[ "$STREAM_OUTPUT_WIDTH" != "$STREAM_WIDTH" || "$STREAM_OUTPUT_HEIGHT" != "$STREAM_HEIGHT" ]]; then
    scale_args=(-vf "scale=${STREAM_OUTPUT_WIDTH}:${STREAM_OUTPUT_HEIGHT}:flags=fast_bilinear")
    log "Upscaling FFmpeg output from ${STREAM_WIDTH}x${STREAM_HEIGHT} to ${STREAM_OUTPUT_WIDTH}x${STREAM_OUTPUT_HEIGHT}."
  fi

  prefix_command "$STREAM_FFMPEG_NICE" "$STREAM_FFMPEG_CPUSET" \
  ffmpeg -hide_banner -nostdin -loglevel info \
    -f x11grab -draw_mouse 0 -video_size "${STREAM_WIDTH}x${STREAM_HEIGHT}" -framerate "$STREAM_FPS" -i "${display_input}+0,0" \
    -f pulse -i "${PULSE_SINK}.monitor" \
    -map 0:v:0 -map 1:a:0 \
    "${duration_args[@]}" \
    "${scale_args[@]}" \
    -c:v libx264 -preset "$STREAM_X264_PRESET" -tune zerolatency -pix_fmt yuv420p \
    -threads "$STREAM_FFMPEG_THREADS" \
    -r "$STREAM_FPS" -g "$((STREAM_FPS * 2))" \
    -b:v "$STREAM_VIDEO_BITRATE" -maxrate "$STREAM_VIDEO_BITRATE" -bufsize "$STREAM_VIDEO_BITRATE" \
    -c:a aac -b:a "$STREAM_AUDIO_BITRATE" -ar 48000 -ac 2 \
    -f flv "$output_url"
}

main() {
  ulimit -n "${STREAM_NOFILE_LIMIT:-8192}" >/dev/null 2>&1 || true

  require_command ffmpeg
  local chrome_bin
  chrome_bin="$(find_chrome)"
  local output_url
  output_url="$(rtmp_output_url)"

  trap cleanup_all EXIT INT TERM

  start_app_if_needed
  start_display_if_needed
  start_pulse_if_needed

  while true; do
    start_chromium "$chrome_bin"
    set +e
    run_ffmpeg "$output_url"
    local ffmpeg_status="$?"
    set -e
    cleanup_run

    if [[ "$STREAM_LOOP" != "true" ]]; then
      return "$ffmpeg_status"
    fi

    log "FFmpeg exited with status $ffmpeg_status. Restarting in ${STREAM_RESTART_DELAY}s."
    sleep "$STREAM_RESTART_DELAY"
  done
}

main "$@"
