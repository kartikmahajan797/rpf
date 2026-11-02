#!/usr/bin/env python3
"""Local meeting transcriber (does NOT join the meeting).

Records your mic ("You") and system audio ("Others") separately,
then transcribes both locally with faster-whisper.
"""

import argparse
import platform
import signal
import sys
import time
import wave
from datetime import datetime
from pathlib import Path

import sounddevice as sd


class WavSink:
    """Writes 16-bit PCM to WAV and pads silence gaps so streams stay aligned."""

    def __init__(self, path, channels, rate):
        self.channels = channels
        self.rate = rate
        self.frames = 0
        self.t0 = time.monotonic()
        self.w = wave.open(str(path), "wb")
        self.w.setnchannels(channels)
        self.w.setsampwidth(2)
        self.w.setframerate(rate)

    def _pad_to(self, target_frames):
        missing = target_frames - self.frames
        if missing > 0:
            self.w.writeframes(b"\x00" * (missing * 2 * self.channels))
            self.frames += missing

    def write(self, data: bytes):
        n = len(data) // (2 * self.channels)
        elapsed = int((time.monotonic() - self.t0) * self.rate)
        if elapsed - self.frames - n > self.rate // 5:
            self._pad_to(elapsed - n)
        self.w.writeframes(data)
        self.frames += n

    def close(self):
        self._pad_to(int((time.monotonic() - self.t0) * self.rate))
        self.w.close()


def start_input(path, device):
    info = sd.query_devices(device, "input")
    rate = int(info["default_samplerate"])
    channels = max(1, min(int(info["max_input_channels"]), 2))
    sink = WavSink(path, channels, rate)

    def callback(indata, frames, t, status):
        sink.write(bytes(indata))

    stream = sd.RawInputStream(
        samplerate=rate,
        channels=channels,
        dtype="int16",
        device=device,
        callback=callback,
    )
    stream.start()

    def stop():
        stream.stop()
        stream.close()

    print(f"  capturing: {info['name']} ({rate} Hz, {channels} ch)")
    return stop, sink


def start_windows_loopback(path):
    import pyaudiowpatch as pyaudio

    p = pyaudio.PyAudio()
    wasapi = p.get_host_api_info_by_type(pyaudio.paWASAPI)
    speakers = p.get_device_info_by_index(wasapi["defaultOutputDevice"])

    if not speakers.get("isLoopbackDevice"):
        for lb in p.get_loopback_device_info_generator():
            if speakers["name"] in lb["name"]:
                speakers = lb
                break
        else:
            raise RuntimeError("No loopback device found for your default speakers.")

    rate = int(speakers["defaultSampleRate"])
    channels = int(speakers["maxInputChannels"])
    sink = WavSink(path, channels, rate)

    def callback(in_data, frame_count, time_info, status):
        sink.write(in_data)
        return (None, pyaudio.paContinue)

    stream = p.open(
        format=pyaudio.paInt16,
        channels=channels,
        rate=rate,
        frames_per_buffer=1024,
        input=True,
        input_device_index=speakers["index"],
        stream_callback=callback,
    )

    def stop():
        stream.stop_stream()
        stream.close()
        p.terminate()

    print(f"  capturing: {speakers['name']} ({rate} Hz, {channels} ch)")
    return stop, sink


def fmt_time(seconds):
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def transcribe_files(jobs, model_size, language=None, multilingual=False, prompt=None):
    from faster_whisper import WhisperModel

    print(f"Loading Whisper model '{model_size}' (first run downloads it)...")
    model = WhisperModel(model_size, device="auto", compute_type="auto")

    lines = []
    for path, label in jobs:
        print(f"Transcribing {label}...")
        kwargs = dict(vad_filter=True, beam_size=5)
        if language:
            kwargs["language"] = language
        elif multilingual:
            kwargs["multilingual"] = True
        if prompt:
            kwargs["initial_prompt"] = prompt
        segments, _info = model.transcribe(str(path), **kwargs)
        for seg in segments:
            text = seg.text.strip()
            if text:
                lines.append((seg.start, label, text))

    lines.sort(key=lambda x: x[0])
    return lines


def parse_device(value):
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return value


def main():
    ap = argparse.ArgumentParser(description="Local meeting recorder + transcriber")
    ap.add_argument("--list-devices", action="store_true", help="show audio devices and exit")
    ap.add_argument("--mic-device", help="microphone name or index (default: system default)")
    ap.add_argument("--system-device", help="system-audio device (required on macOS/Linux)")
    ap.add_argument("--model", default="small", help="tiny/base/small/medium/large-v3")
    ap.add_argument("--out", default="storage/meetings", help="output folder")
    ap.add_argument("--language", help="force a language: hi, pa, en ...")
    ap.add_argument("--multilingual", action="store_true", help="detect language per segment (mixed languages)")
    ap.add_argument("--prompt", help="optional hint text for style/script")
    ap.add_argument("--duration", type=float, help="record for N seconds, then stop automatically")
    ap.add_argument("--no-input", action="store_true", help="do not wait for Enter; exit when terminated")
    args = ap.parse_args()

    if args.list_devices:
        print(sd.query_devices())
        return

    folder = Path(args.out) / datetime.now().strftime("meeting_%Y-%m-%d_%H-%M-%S")
    folder.mkdir(parents=True, exist_ok=True)
    mic_path = folder / "mic.wav"
    sys_path = folder / "system.wav"

    stop_mic = stop_sys = None
    mic_sink = sys_sink = None

    def shutdown():
        nonlocal stop_mic, stop_sys, mic_sink, sys_sink
        if stop_mic is not None:
            try:
                stop_mic()
            except Exception:
                pass
            stop_mic = None
        if stop_sys is not None:
            try:
                stop_sys()
            except Exception:
                pass
            stop_sys = None
        if mic_sink is not None:
            try:
                mic_sink.close()
            except Exception:
                pass
            mic_sink = None
        if sys_sink is not None:
            try:
                sys_sink.close()
            except Exception:
                pass
            sys_sink = None

    def handle_shutdown(signum, frame):
        print("\nStopping recording due to termination signal...")
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    print("Starting capture...")
    stop_mic, mic_sink = start_input(mic_path, parse_device(args.mic_device))

    if args.system_device is None and platform.system() == "Windows":
        stop_sys, sys_sink = start_windows_loopback(sys_path)
    elif args.system_device is not None:
        stop_sys, sys_sink = start_input(sys_path, parse_device(args.system_device))
    else:
        print("  no --system-device given: recording mic only. On macOS use BlackHole (Linux: a 'monitor' source) to capture others.")

    if args.duration is not None:
        print(f"\nRecording for {args.duration:.1f} seconds...")
        try:
            time.sleep(args.duration)
        except KeyboardInterrupt:
            pass
    elif not args.no_input:
        print("\nRecording. Press Enter when the meeting ends...")
        try:
            input()
        except KeyboardInterrupt:
            pass
    else:
        print("\nRecording started. Waiting for termination signal...")
        try:
            while True:
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass

    print("Stopping...")
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.default_int_handler)
    has_system = sys_sink is not None
    shutdown()

    jobs = [(mic_path, "You")]
    if has_system:
        jobs.append((sys_path, "Others"))
    lines = transcribe_files(
        jobs,
        args.model,
        args.language,
        args.multilingual,
        args.prompt,
    )

    transcript_path = folder / "transcript.txt"
    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write(f"Meeting transcript - {datetime.now():%Y-%m-%d %H:%M}\n\n")
        for start, label, text in lines:
            f.write(f"[{fmt_time(start)}] {label}: {text}\n")

    print(f"\nDone. Transcript saved to:\n  {transcript_path}")


if __name__ == "__main__":
    main()
