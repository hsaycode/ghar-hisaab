"""Make noisy copies of recordings (TV / kitchen background) at given SNRs using ffmpeg.

  python evals/make_noisy.py --noise path/to/tv_noise.wav --snr 20 10 5 0

Writes evals/audio/noisy_<snr>db/<speaker>/<clip>.wav and appends rows (kind=noisy_<snr>) to
evals/audio/recordings.jsonl so run_voice_eval.py picks them up with the same expected labels.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path

from evallib import EVALS, load_jsonl

AUDIO = EVALS / "audio"


def mean_volume_db(path: Path) -> float:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "mean_volume" in line:
            return float(line.split("mean_volume:")[1].split("dB")[0])
    return -30.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--noise", required=True)
    ap.add_argument("--snr", type=float, nargs="+", default=[10])
    args = ap.parse_args()
    noise = Path(args.noise)
    noise_db = mean_volume_db(noise)
    recs = [r for r in load_jsonl(AUDIO / "recordings.jsonl") if not r.get("kind", "").startswith("noisy")]
    new_rows = []
    for snr in args.snr:
        for r in recs:
            src = AUDIO / r["audio"]
            sig_db = mean_volume_db(src)
            gain = sig_db - snr - noise_db                     # dB to apply to noise for target SNR
            out = AUDIO / f"noisy_{int(snr)}db" / r["audio"]
            out = out.with_suffix(".wav")
            out.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-stream_loop", "-1", "-i", str(noise),
                            "-filter_complex", f"[1:a]volume={math.pow(10, gain / 20):.5f}[n];[0:a][n]amix=inputs=2:duration=first:normalize=0",
                            "-ac", "1", "-ar", "16000", str(out)], check=True)
            new_rows.append({**r, "audio": out.relative_to(AUDIO).as_posix(), "kind": f"noisy_{int(snr)}"})
    with open(AUDIO / "recordings.jsonl", "a", encoding="utf-8") as f:
        for row in new_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"made {len(new_rows)} noisy clips")


if __name__ == "__main__":
    main()
