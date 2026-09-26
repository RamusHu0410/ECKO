import os
import sys
import numpy as np
from typing import Tuple, Optional, Dict, Any, List
import logging
import time
from accompanist.generate import generate_accompaniment

# Try to import audio processing libraries
try:
    import librosa
    import librosa.feature
    import librosa.onset
    import librosa.beat

    LIBROSA_avaliable = True
except ImportError:
    LIBROSA_avaliable = False

try:
    from scipy.io import wavfile

    SCIPY_avaliable = True
except ImportError:
    SCIPY_avaliable = False

try:
    import soundfile as sf

    SOUNDFILE_avaliable = True
except ImportError:
    SOUNDFILE_avaliable = False

# Configure logging to output to console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def console_print(message: str, level: str = "INFO"):
    """Print to console with timestamp and flush immediately."""
    timestamp = time.strftime("%H:%M:%S")
    prefix = {
        "INFO": "ℹ️",
        "DEBUG": "🔍",
        "WARNING": "⚠️",
        "ERROR": "❌",
        "SUCCESS": "✅",
        "PROCESS": "⚙️",
    }.get(level, "📝")
    print(f"[{timestamp}] {prefix} {message}", flush=True)


class AudioProcessor:
    """Handles loading and processing of WAV audio files."""

    def __init__(
        self,
        target_sr: int = 22050,
        hop_length: int = 512,
        frame_length: int = 2048,
        debug: bool = False,
    ):
        """
        Initialize audio processor.

        Args:
            target_sr: Target sample rate for processing (default 22050 Hz)
            hop_length: Number of samples between successive frames
            frame_length: Length of the FFT window
            debug: Enable debug print statements
        """
        self.target_sr = target_sr
        self.hop_length = hop_length
        self.frame_length = frame_length
        self.debug = debug
        self._check_dependencies()

    def _debug_print(self, message: str, level: str = "DEBUG"):
        """Print debug message if debug mode is enabled."""
        if self.debug:
            console_print(message, level)
            logger.debug(message)

    def _check_dependencies(self):
        """Check which audio libraries are available."""
        available = []
        if LIBROSA_avaliable:
            available.append("librosa")
        if SCIPY_avaliable:
            available.append("scipy")
        if SOUNDFILE_avaliable:
            available.append("soundfile")

        if not available:
            msg = "No audio processing libraries found. Install librosa, scipy, or soundfile."
            logger.warning(msg)
            console_print(msg, "WARNING")
        else:
            msg = f"Audio processing libraries available: {', '.join(available)}"
            logger.info(msg)
            if self.debug:
                console_print(msg, "SUCCESS")

    def load_wav(self, filepath: str) -> Tuple[np.ndarray, int]:
        """
        Load WAV file and return audio data and sample rate.

        Args:
            filepath: Path to WAV file

        Returns:
            Tuple of (audio_data, sample_rate)
            audio_data is mono float32 array normalized to [-1, 1]
        """
        self._debug_print(f"Loading WAV file: {filepath}", "PROCESS")
        start_time = time.time()

        if not os.path.exists(filepath):
            error_msg = f"WAV file not found: {filepath}"
            self._debug_print(f"ERROR: {error_msg}", "ERROR")
            raise FileNotFoundError(error_msg)

        # Try different libraries in order of preference
        if LIBROSA_avaliable:
            audio, sr = self._load_with_librosa(filepath)
        elif SOUNDFILE_avaliable:
            audio, sr = self._load_with_soundfile(filepath)
        elif SCIPY_avaliable:
            audio, sr = self._load_with_scipy(filepath)
        else:
            error_msg = "No audio processing library available. Install librosa, soundfile, or scipy."
            self._debug_print(f"ERROR: {error_msg}", "ERROR")
            raise RuntimeError(error_msg)

        load_time = time.time() - start_time
        self._debug_print(
            f"Loaded audio: {len(audio)} samples, {sr}Hz, duration: {len(audio) / sr:.2f}s (took {load_time:.3f}s)",
            "SUCCESS",
        )
        self._debug_print(
            f"Audio stats: min={np.min(audio):.4f}, max={np.max(audio):.4f}, mean={np.mean(audio):.4f}, std={np.std(audio):.4f}"
        )

        return audio, sr

    def _load_with_librosa(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using librosa (resamples to target_sr)."""
        self._debug_print("Loading with librosa...")
        audio, sr = librosa.load(filepath, sr=self.target_sr, mono=True)
        return audio.astype(np.float32), sr

    def _load_with_soundfile(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using soundfile."""
        self._debug_print("Loading with soundfile...")
        audio, sr = sf.read(filepath, dtype="float32")
        # Convert to mono if stereo
        if len(audio.shape) > 1:
            self._debug_print(f"Converting stereo to mono: {audio.shape} -> ", end="")
            audio = np.mean(audio, axis=1)
            self._debug_print(f"{audio.shape}")
        # Resample if needed
        if sr != self.target_sr and LIBROSA_avaliable:
            self._debug_print(f"Resampling from {sr}Hz to {self.target_sr}Hz")
            audio = librosa.resample(audio, orig_sr=sr, target_sr=self.target_sr)
            sr = self.target_sr
        return audio, sr

    def _load_with_scipy(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using scipy."""
        self._debug_print("Loading with scipy...")
        sr, audio = wavfile.read(filepath)
        self._debug_print(
            f"Raw audio: dtype={audio.dtype}, shape={audio.shape}, sr={sr}"
        )
        # Convert to float32 and normalize
        if audio.dtype == np.int16:
            audio = audio.astype(np.float32) / 32768.0
        elif audio.dtype == np.int32:
            audio = audio.astype(np.float32) / 2147483648.0
        elif audio.dtype == np.uint8:
            audio = (audio.astype(np.float32) - 128) / 128.0
        else:
            audio = audio.astype(np.float32)

        # Convert to mono if stereo
        if len(audio.shape) > 1:
            self._debug_print(f"Converting stereo to mono: {audio.shape} -> ", end="")
            audio = np.mean(audio, axis=1)
            self._debug_print(f"{audio.shape}")

        # Resample if needed (requires librosa)
        if sr != self.target_sr:
            if LIBROSA_avaliable:
                self._debug_print(f"Resampling from {sr}Hz to {self.target_sr}Hz")
                audio = librosa.resample(audio, orig_sr=sr, target_sr=self.target_sr)
                sr = self.target_sr
            else:
                msg = f"Sample rate mismatch: file is {sr}Hz, target is {self.target_sr}Hz. Install librosa for automatic resampling."
                logger.warning(msg)
                self._debug_print(f"WARNING: {msg}", "WARNING")

        return audio, sr

    def get_audio_info(self, filepath: str) -> Dict[str, Any]:
        """
        Get basic info about WAV file without loading full audio.

        Returns:
            Dict with keys: duration, sample_rate, channels, frames, format
        """
        self._debug_print(f"Getting audio info for: {filepath}")

        if SOUNDFILE_avaliable:
            info = sf.info(filepath)
            result = {
                "duration": info.duration,
                "sample_rate": info.samplerate,
                "channels": info.channels,
                "frames": info.frames,
                "format": info.format,
                "subtype": info.subtype,
            }
        elif SCIPY_avaliable:
            sr, audio = wavfile.read(filepath)
            duration = len(audio) / sr
            channels = 1 if len(audio.shape) == 1 else audio.shape[1]
            result = {
                "duration": duration,
                "sample_rate": sr,
                "channels": channels,
                "frames": len(audio),
                "format": "WAV",
                "subtype": str(audio.dtype),
            }
        else:
            # Fallback: load with librosa to get info
            if LIBROSA_avaliable:
                audio, sr = librosa.load(filepath, sr=None, mono=False)
                duration = (
                    len(audio) / sr if len(audio.shape) == 1 else audio.shape[1] / sr
                )
                channels = 1 if len(audio.shape) == 1 else audio.shape[0]
                result = {
                    "duration": duration,
                    "sample_rate": sr,
                    "channels": channels,
                    "frames": len(audio) if len(audio.shape) == 1 else audio.shape[1],
                    "format": "WAV",
                    "subtype": "unknown",
                }
            else:
                error_msg = "No audio library available to get file info"
                self._debug_print(f"ERROR: {error_msg}", "ERROR")
                raise RuntimeError(error_msg)

        self._debug_print(f"Audio info: {result}")
        return result

    def detect_sound_segments(
        self, audio: np.ndarray, sr: int, top_db: float = 30, min_duration: float = 0.1
    ) -> List[Dict[str, float]]:
        """
        Detect segments where sound is present (non-silent regions).

        Args:
            audio: Audio signal
            sr: Sample rate
            top_db: Threshold in decibels below reference to consider as silence
            min_duration: Minimum duration of a sound segment in seconds

        Returns:
            List of dicts with 'start', 'end', 'duration' for each sound segment
        """
        self._debug_print(
            f"Detecting sound segments (top_db={top_db}, min_duration={min_duration}s)",
            "PROCESS",
        )

        if not LIBROSA_avaliable:
            msg = "librosa not available, cannot detect sound segments"
            logger.warning(msg)
            self._debug_print(f"WARNING: {msg}", "WARNING")
            return [{"start": 0.0, "end": len(audio) / sr, "duration": len(audio) / sr}]

        # Use librosa's silence detection
        intervals = librosa.effects.split(
            audio,
            top_db=top_db,
            frame_length=self.frame_length,
            hop_length=self.hop_length,
        )

        self._debug_print(
            f"Found {len(intervals)} raw intervals from librosa.effects.split"
        )

        # Convert frame indices to time
        segments = []
        for i, (start_frame, end_frame) in enumerate(intervals):
            start_time = start_frame / sr
            end_time = end_frame / sr
            duration = end_time - start_time

            self._debug_print(
                f"  Interval {i}: frames {start_frame}-{end_frame} -> {start_time:.3f}s-{end_time:.3f}s (duration: {duration:.3f}s)"
            )

            if duration >= min_duration:
                segments.append(
                    {
                        "start": float(start_time),
                        "end": float(end_time),
                        "duration": float(duration),
                    }
                )
            else:
                self._debug_print(f"    -> Filtered out (duration < {min_duration}s)")

        total_sound = sum(s["duration"] for s in segments)
        self._debug_print(
            f"Final segments: {len(segments)}, total sound duration: {total_sound:.3f}s",
            "SUCCESS",
        )

        return segments

    def extract_pitch(
        self, audio: np.ndarray, sr: int, fmin: float = 80.0, fmax: float = 800.0
    ) -> Dict[str, Any]:
        """
        Extract fundamental frequency (pitch) using PYIN algorithm.

        Args:
            audio: Audio signal
            sr: Sample rate
            fmin: Minimum frequency to detect
            fmax: Maximum frequency to detect

        Returns:
            Dict with pitch information
        """
        self._debug_print(f"Extracting pitch (fmin={fmin}Hz, fmax={fmax}Hz)", "PROCESS")

        if not LIBROSA_avaliable:
            msg = "librosa not available, cannot extract pitch"
            logger.warning(msg)
            self._debug_print(f"WARNING: {msg}", "WARNING")
            return {"frequencies": [], "times": [], "mean_hz": 0.0, "median_hz": 0.0}

        # Use PYIN for pitch detection
        self._debug_print("Running librosa.pyin...")
        start_time = time.time()
        f0, voiced_flag, voiced_probs = librosa.pyin(
            audio,
            fmin=fmin,
            fmax=fmax,
            sr=sr,
            frame_length=self.frame_length,
            hop_length=self.hop_length,
        )
        pyin_time = time.time() - start_time
        self._debug_print(f"PYIN completed in {pyin_time:.3f}s")

        # Get time stamps for each frame
        times = librosa.frames_to_time(
            np.arange(len(f0)), sr=sr, hop_length=self.hop_length
        )

        # Filter only voiced frames
        voiced_f0 = f0[voiced_flag]
        voiced_times = times[voiced_flag]

        self._debug_print(
            f"Total frames: {len(f0)}, Voiced frames: {np.sum(voiced_flag)} ({100 * np.sum(voiced_flag) / len(f0):.1f}%)"
        )
        if len(voiced_f0) > 0:
            self._debug_print(
                f"Pitch range: {np.nanmin(voiced_f0):.1f}Hz - {np.nanmax(voiced_f0):.1f}Hz"
            )
            self._debug_print(
                f"Mean pitch: {np.nanmean(voiced_f0):.1f}Hz, Median: {np.nanmedian(voiced_f0):.1f}Hz"
            )

        result = {
            "frequencies": f0.tolist(),
            "times": times.tolist(),
            # ``ndarray.tolist()`` can preserve NumPy boolean scalar types in
            # some NumPy versions; convert explicitly for JSON API consumers.
            "voiced_flag": [bool(flag) for flag in voiced_flag],
            "voiced_probabilities": voiced_probs.tolist(),
            "mean_hz": float(np.nanmean(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "median_hz": float(np.nanmedian(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "min_hz": float(np.nanmin(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "max_hz": float(np.nanmax(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "voiced_duration": float(np.sum(voiced_flag) * self.hop_length / sr),
            "total_frames": len(f0),
            "voiced_frames": int(np.sum(voiced_flag)),
        }

        return result

    def extract_volume_envelope(self, audio: np.ndarray, sr: int) -> Dict[str, Any]:
        """
        Extract volume (amplitude) envelope using RMS energy.

        Args:
            audio: Audio signal
            sr: Sample rate

        Returns:
            Dict with volume envelope information
        """
        self._debug_print("Extracting volume envelope (RMS energy)", "PROCESS")

        if not LIBROSA_avaliable:
            msg = "librosa not available, cannot extract volume envelope"
            logger.warning(msg)
            self._debug_print(f"WARNING: {msg}", "WARNING")
            # Fallback: simple RMS per frame
            frame_length = min(self.frame_length, len(audio))
            hop_length = min(self.hop_length, frame_length // 4)
            rms_values = []
            times = []
            for i in range(0, len(audio) - frame_length, hop_length):
                frame = audio[i : i + frame_length]
                rms = np.sqrt(np.mean(frame**2))
                rms_values.append(float(rms))
                times.append(float(i / sr))
            return {
                "rms_values": rms_values,
                "times": times,
                "mean_rms": float(np.mean(rms_values)) if rms_values else 0.0,
                "max_rms": float(np.max(rms_values)) if rms_values else 0.0,
            }

        # Compute RMS energy
        self._debug_print("Computing RMS with librosa.feature.rms...")
        rms = librosa.feature.rms(
            y=audio, frame_length=self.frame_length, hop_length=self.hop_length
        )[0]

        # Convert to dB
        rms_db = librosa.amplitude_to_db(rms, ref=np.max)

        # Get time stamps
        times = librosa.frames_to_time(
            np.arange(len(rms)), sr=sr, hop_length=self.hop_length
        )

        self._debug_print(
            f"RMS frames: {len(rms)}, time range: {times[0]:.3f}s - {times[-1]:.3f}s"
        )
        self._debug_print(
            f"RMS stats: mean={np.mean(rms):.6f}, max={np.max(rms):.6f}, min={np.min(rms):.6f}"
        )
        self._debug_print(
            f"RMS dB stats: mean={np.mean(rms_db):.1f}dB, max={np.max(rms_db):.1f}dB, min={np.min(rms_db):.1f}dB"
        )

        return {
            "rms_values": rms.tolist(),
            "rms_db": rms_db.tolist(),
            "times": times.tolist(),
            "mean_rms": float(np.mean(rms)),
            "max_rms": float(np.max(rms)),
            "mean_db": float(np.mean(rms_db)),
            "max_db": float(np.max(rms_db)),
            "dynamic_range_db": float(np.max(rms_db) - np.min(rms_db)),
        }

    def extract_spectral_features(self, audio: np.ndarray, sr: int) -> Dict[str, Any]:
        """
        Extract additional spectral features.

        Args:
            audio: Audio signal
            sr: Sample rate

        Returns:
            Dict with spectral features
        """
        self._debug_print("Extracting spectral features", "PROCESS")

        if not LIBROSA_avaliable:
            return {}

        # Spectral centroid (brightness)
        self._debug_print("Computing spectral centroid...")
        centroid = librosa.feature.spectral_centroid(
            y=audio, sr=sr, hop_length=self.hop_length
        )[0]

        # Spectral rolloff
        self._debug_print("Computing spectral rolloff...")
        rolloff = librosa.feature.spectral_rolloff(
            y=audio, sr=sr, hop_length=self.hop_length
        )[0]

        # Spectral bandwidth
        self._debug_print("Computing spectral bandwidth...")
        bandwidth = librosa.feature.spectral_bandwidth(
            y=audio, sr=sr, hop_length=self.hop_length
        )[0]

        # Zero crossing rate
        self._debug_print("Computing zero crossing rate...")
        zcr = librosa.feature.zero_crossing_rate(
            audio, frame_length=self.frame_length, hop_length=self.hop_length
        )[0]

        times = librosa.frames_to_time(
            np.arange(len(centroid)), sr=sr, hop_length=self.hop_length
        )

        result = {
            "spectral_centroid": {
                "values": centroid.tolist(),
                "times": times.tolist(),
                "mean": float(np.mean(centroid)),
                "std": float(np.std(centroid)),
            },
            "spectral_rolloff": {
                "values": rolloff.tolist(),
                "mean": float(np.mean(rolloff)),
                "std": float(np.std(rolloff)),
            },
            "spectral_bandwidth": {
                "values": bandwidth.tolist(),
                "mean": float(np.mean(bandwidth)),
                "std": float(np.std(bandwidth)),
            },
            "zero_crossing_rate": {
                "values": zcr.tolist(),
                "mean": float(np.mean(zcr)),
                "std": float(np.std(zcr)),
            },
        }

        self._debug_print(
            f"Spectral centroid: mean={result['spectral_centroid']['mean']:.1f}Hz"
        )
        self._debug_print(
            f"Spectral rolloff: mean={result['spectral_rolloff']['mean']:.1f}Hz"
        )
        self._debug_print(
            f"Spectral bandwidth: mean={result['spectral_bandwidth']['mean']:.1f}Hz"
        )
        self._debug_print(
            f"Zero crossing rate: mean={result['zero_crossing_rate']['mean']:.4f}"
        )

        return result

    def process_audio(
        self,
        filepath: str,
        detect_segments: bool = True,
        extract_pitch: bool = True,
        extract_volume: bool = True,
        extract_spectral: bool = True,
    ) -> Dict[str, Any]:
        """
        Process WAV file and return comprehensive analysis results.

        Args:
            filepath: Path to WAV file
            detect_segments: Whether to detect sound/silence segments
            extract_pitch: Whether to extract pitch (fundamental frequency)
            extract_volume: Whether to extract volume envelope
            extract_spectral: Whether to extract spectral features

        Returns:
            Dict with processing results in a consistent structure
        """
        if self.debug:
            console_print(f"{'=' * 60}")
            console_print(f"PROCESSING AUDIO: {filepath}")
            console_print(f"{'=' * 60}")
        total_start = time.time()

        # Load audio
        load_start = time.time()
        audio, sr = self.load_wav(filepath)
        self.audio = audio
        self.sr = sr
        info = self.get_audio_info(filepath)
        self._debug_print(f"Load + info took {time.time() - load_start:.3f}s")

        # Basic analysis
        duration = len(audio) / sr
        rms_energy: float = np.sqrt(np.mean(audio**2))
        max_amplitude: float = np.max(np.abs(audio))

        # Build results dictionary with consistent structure
        results = {
            "file": {
                "path": filepath,
                "duration": float(duration),
                "sample_rate": sr,
                "num_samples": len(audio),
                "rms_energy": float(rms_energy),
                "max_amplitude": float(max_amplitude),
                "is_silent": rms_energy < 0.001,
                "info": info,
            },
            "segments": [],
            "pitch": {},
            "volume": {},
            "spectral": {},
            "processing_time": 0.0,
        }

        self._debug_print(
            f"Basic stats: duration={duration:.2f}s, RMS={rms_energy:.6f}, max_amp={max_amplitude:.4f}, silent={results['file']['is_silent']}"
        )

        # Detect sound segments (onset/offset)
        if detect_segments:
            seg_start = time.time()
            segments = self.detect_sound_segments(audio, sr)
            total_sound_duration = sum(s["duration"] for s in segments)
            results["segments"] = segments
            results["file"]["total_sound_duration"] = float(total_sound_duration)
            results["file"]["silence_ratio"] = (
                float(1.0 - total_sound_duration / duration) if duration > 0 else 1.0
            )
            results["file"]["num_segments"] = len(segments)
            self._debug_print(f"Segment detection took {time.time() - seg_start:.3f}s")

        # Extract pitch
        if extract_pitch:
            pitch_start = time.time()
            pitch_data = self.extract_pitch(audio, sr)
            results["pitch"] = pitch_data
            self._debug_print(f"Pitch extraction took {time.time() - pitch_start:.3f}s")

        # Extract volume envelope
        if extract_volume:
            vol_start = time.time()
            volume_data = self.extract_volume_envelope(audio, sr)
            results["volume"] = volume_data
            self._debug_print(f"Volume extraction took {time.time() - vol_start:.3f}s")

        # Extract spectral features
        if extract_spectral:
            spec_start = time.time()
            spectral_data = self.extract_spectral_features(audio, sr)
            results["spectral"] = spectral_data
            self._debug_print(
                f"Spectral extraction took {time.time() - spec_start:.3f}s"
            )

        total_time = time.time() - total_start
        results["processing_time"] = round(total_time, 3)

        if self.debug:
            console_print(f"{'=' * 60}")
            console_print(f"TOTAL PROCESSING TIME: {total_time:.3f}s")
            console_print(f"{'=' * 60}")

        logger.info(
            f"Processed audio: {filepath} ({duration:.2f}s, {sr}Hz, RMS: {rms_energy:.4f})"
        )
        return results


# =============================================================================
# PUBLIC API FUNCTIONS
# =============================================================================


_PITCH_CLASS_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
_MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def _estimate_key_and_mode(audio: np.ndarray, sr: int) -> tuple[str, str]:
    """Estimate the tonic and mode from a chroma profile."""
    if not LIBROSA_avaliable or audio.size == 0 or np.allclose(audio, 0):
        return "C", "major"

    profile = np.mean(librosa.feature.chroma_cqt(y=audio, sr=sr), axis=1)
    if not np.any(profile):
        return "C", "major"

    candidates = [
        (float(np.dot(profile, np.roll(template, tonic))), tonic, mode)
        for template, mode in ((_MAJOR_PROFILE, "major"), (_MINOR_PROFILE, "minor"))
        for tonic in range(12)
    ]
    _, tonic, mode = max(candidates, key=lambda candidate: candidate[0])
    return _PITCH_CLASS_NAMES[tonic], mode


def _estimate_tempo(audio: np.ndarray, sr: int) -> float:
    """Estimate tempo in BPM, returning 0.0 when it cannot be determined."""
    if not LIBROSA_avaliable or audio.size == 0 or np.allclose(audio, 0):
        return 0.0
    try:
        tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
        tempo_arr = np.asarray(tempo).reshape(-1)
        if tempo_arr.size == 0:
            return 0.0
        return round(float(tempo_arr[0]), 2)
    except Exception:
        return 0.0


def _build_melody(analysis: Dict[str, Any]) -> List[Dict[str, float]]:
    """Convert detected sound segments into the MIDI-note API melody format."""
    pitch = analysis.get("pitch", {})
    if not isinstance(pitch, dict):
        return []
    times = np.asarray(pitch.get("times", []), dtype=float)
    frequencies = np.asarray(pitch.get("frequencies", []), dtype=float)
    voiced = np.asarray(pitch.get("voiced_flag", []), dtype=bool)
    melody = []

    for segment in analysis.get("segments", []):
        start, end = float(segment["start"]), float(segment["end"])
        values = frequencies[(times >= start) & (times <= end) & voiced]
        values = values[np.isfinite(values) & (values > 0)]
        if values.size:
            frequency_hz = float(np.median(values))
            melody.append(
                {
                    # The accompaniment API historically calls this field ``hz``,
                    # but its public contract uses MIDI note numbers (60 = C4).
                    "hz": round(float(librosa.hz_to_midi(frequency_hz)), 2)
                    if LIBROSA_avaliable
                    else round(69 + 12 * np.log2(frequency_hz / 440.0), 2),
                    "start": round(start, 3),
                    "duration": round(float(segment["duration"]), 3),
                }
            )
    return melody


def analyze_audio_file(
    filepath: str,
    target_sr: int = 22050,
    detect_segments: bool = True,
    extract_pitch: bool = True,
    extract_volume: bool = True,
    extract_spectral: bool = True,
    debug: bool = False,
) -> Dict[str, Any]:
    """Analyze a WAV file and return melody, key, mode, and tempo.

    The returned payload is JSON-ready and has this shape::

        {
            "melody": [{"hz": float, "start": float, "duration": float}],
            "key": "C",
            "mode": "major",
            "tempo": 100.0,
        }

    ``hz`` follows the accompaniment API's established convention: it contains
    a MIDI note number (for example, 60 for middle C). Silence and unpitched
    segments are omitted from ``melody``.
    """
    processor = AudioProcessor(target_sr=target_sr, debug=debug)
    analysis = processor.process_audio(
        filepath=filepath,
        detect_segments=detect_segments,
        extract_pitch=extract_pitch,
        extract_volume=extract_volume,
        extract_spectral=extract_spectral,
    )
    # Reuse audio already loaded by process_audio instead of loading twice
    audio = processor.audio
    sr = processor.sr
    key, mode = _estimate_key_and_mode(audio, sr)
    return {
        "melody": _build_melody(analysis),
        "key": key,
        "mode": mode,
        "tempo": _estimate_tempo(audio, sr),
    }


def quick_analyze(filepath: str, target_sr: int = 22050) -> Dict[str, Any]:
    """
    Quick analysis with default settings (minimal output, no debug).

    Args:
        filepath: Path to WAV file
        target_sr: Target sample rate

    Returns:
        Simplified dictionary with key metrics only
    """
    processor = AudioProcessor(target_sr=target_sr, debug=False)
    full_result = processor.process_audio(
        filepath=filepath,
        detect_segments=True,
        extract_pitch=True,
        extract_volume=True,
        extract_spectral=False,  # Skip spectral for speed
    )

    # Return simplified summary
    return {
        "file": full_result["file"],
        "segments": full_result["segments"],
        "pitch_summary": {
            "mean_hz": full_result["pitch"].get("mean_hz", 0),
            "median_hz": full_result["pitch"].get("median_hz", 0),
            "min_hz": full_result["pitch"].get("min_hz", 0),
            "max_hz": full_result["pitch"].get("max_hz", 0),
            "voiced_frames": full_result["pitch"].get("voiced_frames", 0),
        },
        "volume_summary": {
            "mean_rms": full_result["volume"].get("mean_rms", 0),
            "max_rms": full_result["volume"].get("max_rms", 0),
            "dynamic_range_db": full_result["volume"].get("dynamic_range_db", 0),
        },
        "processing_time": full_result["processing_time"],
    }


def extract_notes(
    filepath: str,
    target_sr: int = 22050,
    top_db: float = 30,
    min_note_duration: float = 0.05,
    merge_gap: float = 0.05,
    debug: bool = False,
) -> list[dict[str, Any]]:
    """
    Extract individual notes from a WAV file.

    Each note contains: start, end, duration, volume (RMS), pitch_hz (median).

    Args:
        filepath: Path to WAV file
        target_sr: Target sample rate
        top_db: Silence threshold for segment detection
        min_note_duration: Minimum note duration in seconds
        merge_gap: Merge notes separated by less than this gap (seconds)
        debug: Enable debug output

    Returns:
        List of note dicts with keys: start, end, duration, volume, pitch_hz
    """
    # Run full analysis
    processor = AudioProcessor(target_sr=target_sr, debug=debug)
    result = processor.process_audio(
        filepath=filepath,
        detect_segments=True,
        extract_pitch=True,
        extract_volume=True,
        extract_spectral=False,
    )

    segments = result.get("segments", [])
    pitch_data = result.get("pitch", {})
    volume_data = result.get("volume", {})

    if not segments:
        if debug:
            console_print("No sound segments found", "WARNING")
        return []

    # Get pitch and volume time series
    pitch_times = np.array(pitch_data.get("times", []))
    pitch_freqs = np.array(pitch_data.get("frequencies", []))
    pitch_voiced = np.array(pitch_data.get("voiced_flag", []))

    vol_times = np.array(volume_data.get("times", []))
    vol_rms = np.array(volume_data.get("rms_values", []))

    notes = []

    for seg in segments:
        seg_start = seg["start"]
        seg_end = seg["end"]
        seg_dur = seg["duration"]

        if seg_dur < min_note_duration:
            continue

        # --- Pitch: median of voiced frames within segment ---
        pitch_mask = (
            (pitch_times >= seg_start) & (pitch_times <= seg_end) & pitch_voiced
        )
        seg_pitches = pitch_freqs[pitch_mask]
        note_pitch = float(np.nanmedian(seg_pitches)) if len(seg_pitches) > 0 else 0.0

        # --- Volume: mean RMS within segment ---
        vol_mask = (vol_times >= seg_start) & (vol_times <= seg_end)
        seg_volumes = vol_rms[vol_mask]
        note_volume = float(np.mean(seg_volumes)) if len(seg_volumes) > 0 else 0.0

        notes.append(
            {
                "start": round(seg_start, 3),
                "end": round(seg_end, 3),
                "duration": round(seg_dur, 3),
                "volume": round(note_volume, 6),
                "pitch_hz": round(note_pitch, 1),
            }
        )

    # Merge notes that are very close together (same pitch-ish)
    if merge_gap > 0 and len(notes) > 1:
        merged = []
        current = notes[0]
        for next_note in notes[1:]:
            gap = next_note["start"] - current["end"]
            pitch_diff = abs(next_note["pitch_hz"] - current["pitch_hz"])
            # Merge if gap is small AND pitch is similar (within 5% or 30Hz)
            if gap < merge_gap and (
                pitch_diff < 30 or pitch_diff / max(current["pitch_hz"], 1) < 0.05
            ):
                current["end"] = next_note["end"]
                current["duration"] = round(current["end"] - current["start"], 3)
                # Average volume and pitch
                current["volume"] = round(
                    (current["volume"] + next_note["volume"]) / 2, 6
                )
                current["pitch_hz"] = round(
                    (current["pitch_hz"] + next_note["pitch_hz"]) / 2, 1
                )
            else:
                merged.append(current)
                current = next_note
        merged.append(current)
        notes = merged

    if debug:
        console_print(f"Extracted {len(notes)} notes", "SUCCESS")
        for i, n in enumerate(notes):
            console_print(
                f"  Note {i}: {n['start']:.2f}s-{n['end']:.2f}s "
                f"dur={n['duration']:.2f}s vol={n['volume']:.4f} pitch={n['pitch_hz']:.1f}Hz"
            )
    return notes


# Backward compatibility
def load_and_process_wav(
    filepath: str, target_sr: int = 22050, debug: bool = False, **kwargs
) -> Dict[str, Any]:
    """Backward compatibility wrapper."""
    return analyze_audio_file(filepath, target_sr, debug=debug, **kwargs)


# Standalone test function
def test_audio_processor(filepath: str) -> Dict[str, Any]:
    """Test function to verify the processor works."""
    console_print(f"Testing audio processor with: {filepath}", "PROCESS")
    result = analyze_audio_file(filepath, debug=True)
    console_print("Test completed successfully!", "SUCCESS")
    return result


if __name__ == "__main__":
    # Allow running as script: python -m backend.src.app.audio.processor <file.wav>
    if len(sys.argv) > 1:
        test_audio_processor(sys.argv[1])
    else:
        console_print(
            "Usage: python -m backend.src.app.audio.processor <path_to_wav_file>",
            "INFO",
        )
