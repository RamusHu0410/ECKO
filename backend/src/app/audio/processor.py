import os
import numpy as np
from typing import Tuple, Optional, Dict, Any, List
import logging
import time

# Try to import audio processing libraries
try:
    import librosa
    import librosa.feature
    import librosa.onset
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

try:
    from scipy.io import wavfile
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

try:
    import soundfile as sf
    SOUNDFILE_AVAILABLE = True
except ImportError:
    SOUNDFILE_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class AudioProcessor:
    """Handles loading and processing of WAV audio files."""
    
    def __init__(self, target_sr: int = 22050, hop_length: int = 512, frame_length: int = 2048, debug: bool = True):
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
    
    def _debug_print(self, message: str):
        """Print debug message if debug mode is enabled."""
        if self.debug:
            print(f"[AudioProcessor DEBUG] {message}")
            logger.debug(message)
    
    def _check_dependencies(self):
        """Check which audio libraries are available."""
        available = []
        if LIBROSA_AVAILABLE:
            available.append("librosa")
        if SCIPY_AVAILABLE:
            available.append("scipy")
        if SOUNDFILE_AVAILABLE:
            available.append("soundfile")
        
        if not available:
            msg = "No audio processing libraries found. Install librosa, scipy, or soundfile."
            logger.warning(msg)
            if self.debug:
                print(f"[AudioProcessor WARNING] {msg}")
        else:
            msg = f"Audio processing libraries available: {', '.join(available)}"
            logger.info(msg)
            if self.debug:
                print(f"[AudioProcessor INFO] {msg}")
    
    def load_wav(self, filepath: str) -> Tuple[np.ndarray, int]:
        """
        Load WAV file and return audio data and sample rate.
        
        Args:
            filepath: Path to WAV file
            
        Returns:
            Tuple of (audio_data, sample_rate)
            audio_data is mono float32 array normalized to [-1, 1]
        """
        self._debug_print(f"Loading WAV file: {filepath}")
        start_time = time.time()
        
        if not os.path.exists(filepath):
            error_msg = f"WAV file not found: {filepath}"
            self._debug_print(f"ERROR: {error_msg}")
            raise FileNotFoundError(error_msg)
        
        # Try different libraries in order of preference
        if LIBROSA_AVAILABLE:
            audio, sr = self._load_with_librosa(filepath)
        elif SOUNDFILE_AVAILABLE:
            audio, sr = self._load_with_soundfile(filepath)
        elif SCIPY_AVAILABLE:
            audio, sr = self._load_with_scipy(filepath)
        else:
            error_msg = "No audio processing library available. Install librosa, soundfile, or scipy."
            self._debug_print(f"ERROR: {error_msg}")
            raise RuntimeError(error_msg)
        
        load_time = time.time() - start_time
        self._debug_print(f"Loaded audio: {len(audio)} samples, {sr}Hz, duration: {len(audio)/sr:.2f}s (took {load_time:.3f}s)")
        self._debug_print(f"Audio stats: min={np.min(audio):.4f}, max={np.max(audio):.4f}, mean={np.mean(audio):.4f}, std={np.std(audio):.4f}")
        
        return audio, sr
    
    def _load_with_librosa(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using librosa (resamples to target_sr)."""
        self._debug_print("Loading with librosa...")
        audio, sr = librosa.load(filepath, sr=self.target_sr, mono=True)
        return audio.astype(np.float32), sr
    
    def _load_with_soundfile(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using soundfile."""
        self._debug_print("Loading with soundfile...")
        audio, sr = sf.read(filepath, dtype='float32')
        # Convert to mono if stereo
        if len(audio.shape) > 1:
            self._debug_print(f"Converting stereo to mono: {audio.shape} -> ", end="")
            audio = np.mean(audio, axis=1)
            self._debug_print(f"{audio.shape}")
        # Resample if needed
        if sr != self.target_sr and LIBROSA_AVAILABLE:
            self._debug_print(f"Resampling from {sr}Hz to {self.target_sr}Hz")
            audio = librosa.resample(audio, orig_sr=sr, target_sr=self.target_sr)
            sr = self.target_sr
        return audio, sr
    
    def _load_with_scipy(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using scipy."""
        self._debug_print("Loading with scipy...")
        sr, audio = wavfile.read(filepath)
        self._debug_print(f"Raw audio: dtype={audio.dtype}, shape={audio.shape}, sr={sr}")
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
            if LIBROSA_AVAILABLE:
                self._debug_print(f"Resampling from {sr}Hz to {self.target_sr}Hz")
                audio = librosa.resample(audio, orig_sr=sr, target_sr=self.target_sr)
                sr = self.target_sr
            else:
                msg = f"Sample rate mismatch: file is {sr}Hz, target is {self.target_sr}Hz. Install librosa for automatic resampling."
                logger.warning(msg)
                self._debug_print(f"WARNING: {msg}")
        
        return audio, sr
    
    def get_audio_info(self, filepath: str) -> Dict[str, Any]:
        """
        Get basic info about WAV file without loading full audio.
        
        Returns:
            Dict with keys: duration, sample_rate, channels, frames, format
        """
        self._debug_print(f"Getting audio info for: {filepath}")
        
        if SOUNDFILE_AVAILABLE:
            info = sf.info(filepath)
            result = {
                "duration": info.duration,
                "sample_rate": info.samplerate,
                "channels": info.channels,
                "frames": info.frames,
                "format": info.format,
                "subtype": info.subtype
            }
        elif SCIPY_AVAILABLE:
            sr, audio = wavfile.read(filepath)
            duration = len(audio) / sr
            channels = 1 if len(audio.shape) == 1 else audio.shape[1]
            result = {
                "duration": duration,
                "sample_rate": sr,
                "channels": channels,
                "frames": len(audio),
                "format": "WAV",
                "subtype": str(audio.dtype)
            }
        else:
            # Fallback: load with librosa to get info
            if LIBROSA_AVAILABLE:
                audio, sr = librosa.load(filepath, sr=None, mono=False)
                duration = len(audio) / sr if len(audio.shape) == 1 else audio.shape[1] / sr
                channels = 1 if len(audio.shape) == 1 else audio.shape[0]
                result = {
                    "duration": duration,
                    "sample_rate": sr,
                    "channels": channels,
                    "frames": len(audio) if len(audio.shape) == 1 else audio.shape[1],
                    "format": "WAV",
                    "subtype": "unknown"
                }
            else:
                error_msg = "No audio library available to get file info"
                self._debug_print(f"ERROR: {error_msg}")
                raise RuntimeError(error_msg)
        
        self._debug_print(f"Audio info: {result}")
        return result
    
    def detect_sound_segments(self, audio: np.ndarray, sr: int, 
                              top_db: float = 30, 
                              min_duration: float = 0.1) -> List[Dict[str, float]]:
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
        self._debug_print(f"Detecting sound segments (top_db={top_db}, min_duration={min_duration}s)")
        
        if not LIBROSA_AVAILABLE:
            msg = "librosa not available, cannot detect sound segments"
            logger.warning(msg)
            self._debug_print(f"WARNING: {msg}")
            return [{"start": 0.0, "end": len(audio) / sr, "duration": len(audio) / sr}]
        
        # Use librosa's silence detection
        intervals = librosa.effects.split(
            audio, 
            top_db=top_db,
            frame_length=self.frame_length,
            hop_length=self.hop_length
        )
        
        self._debug_print(f"Found {len(intervals)} raw intervals from librosa.effects.split")
        
        # Convert frame indices to time
        segments = []
        for i, (start_frame, end_frame) in enumerate(intervals):
            start_time = start_frame / sr
            end_time = end_frame / sr
            duration = end_time - start_time
            
            self._debug_print(f"  Interval {i}: frames {start_frame}-{end_frame} -> {start_time:.3f}s-{end_time:.3f}s (duration: {duration:.3f}s)")
            
            if duration >= min_duration:
                segments.append({
                    "start": float(start_time),
                    "end": float(end_time),
                    "duration": float(duration)
                })
            else:
                self._debug_print(f"    -> Filtered out (duration < {min_duration}s)")
        
        total_sound = sum(s["duration"] for s in segments)
        self._debug_print(f"Final segments: {len(segments)}, total sound duration: {total_sound:.3f}s")
        
        return segments
    
    def extract_pitch(self, audio: np.ndarray, sr: int,
                      fmin: float = 80.0, fmax: float = 800.0) -> Dict[str, Any]:
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
        self._debug_print(f"Extracting pitch (fmin={fmin}Hz, fmax={fmax}Hz)")
        
        if not LIBROSA_AVAILABLE:
            msg = "librosa not available, cannot extract pitch"
            logger.warning(msg)
            self._debug_print(f"WARNING: {msg}")
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
            hop_length=self.hop_length
        )
        pyin_time = time.time() - start_time
        self._debug_print(f"PYIN completed in {pyin_time:.3f}s")
        
        # Get time stamps for each frame
        times = librosa.frames_to_time(
            np.arange(len(f0)), 
            sr=sr, 
            hop_length=self.hop_length
        )
        
        # Filter only voiced frames
        voiced_f0 = f0[voiced_flag]
        voiced_times = times[voiced_flag]
        
        self._debug_print(f"Total frames: {len(f0)}, Voiced frames: {np.sum(voiced_flag)} ({100*np.sum(voiced_flag)/len(f0):.1f}%)")
        if len(voiced_f0) > 0:
            self._debug_print(f"Pitch range: {np.nanmin(voiced_f0):.1f}Hz - {np.nanmax(voiced_f0):.1f}Hz")
            self._debug_print(f"Mean pitch: {np.nanmean(voiced_f0):.1f}Hz, Median: {np.nanmedian(voiced_f0):.1f}Hz")
        
        result = {
            "frequencies": f0.tolist(),
            "times": times.tolist(),
            "voiced_flag": voiced_flag.tolist(),
            "voiced_probabilities": voiced_probs.tolist(),
            "mean_hz": float(np.nanmean(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "median_hz": float(np.nanmedian(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "min_hz": float(np.nanmin(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "max_hz": float(np.nanmax(voiced_f0)) if len(voiced_f0) > 0 else 0.0,
            "voiced_duration": float(np.sum(voiced_flag) * self.hop_length / sr),
            "total_frames": len(f0),
            "voiced_frames": int(np.sum(voiced_flag))
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
        self._debug_print("Extracting volume envelope (RMS energy)")
        
        if not LIBROSA_AVAILABLE:
            msg = "librosa not available, cannot extract volume envelope"
            logger.warning(msg)
            self._debug_print(f"WARNING: {msg}")
            # Fallback: simple RMS per frame
            frame_length = min(self.frame_length, len(audio))
            hop_length = min(self.hop_length, frame_length // 4)
            rms_values = []
            times = []
            for i in range(0, len(audio) - frame_length, hop_length):
                frame = audio[i:i + frame_length]
                rms = np.sqrt(np.mean(frame**2))
                rms_values.append(float(rms))
                times.append(float(i / sr))
            return {
                "rms_values": rms_values,
                "times": times,
                "mean_rms": float(np.mean(rms_values)) if rms_values else 0.0,
                "max_rms": float(np.max(rms_values)) if rms_values else 0.0
            }
        
        # Compute RMS energy
        self._debug_print("Computing RMS with librosa.feature.rms...")
        rms = librosa.feature.rms(
            y=audio,
            frame_length=self.frame_length,
            hop_length=self.hop_length
        )[0]
        
        # Convert to dB
        rms_db = librosa.amplitude_to_db(rms, ref=np.max)
        
        # Get time stamps
        times = librosa.frames_to_time(
            np.arange(len(rms)), 
            sr=sr, 
            hop_length=self.hop_length
        )
        
        self._debug_print(f"RMS frames: {len(rms)}, time range: {times[0]:.3f}s - {times[-1]:.3f}s")
        self._debug_print(f"RMS stats: mean={np.mean(rms):.6f}, max={np.max(rms):.6f}, min={np.min(rms):.6f}")
        self._debug_print(f"RMS dB stats: mean={np.mean(rms_db):.1f}dB, max={np.max(rms_db):.1f}dB, min={np.min(rms_db):.1f}dB")
        
        return {
            "rms_values": rms.tolist(),
            "rms_db": rms_db.tolist(),
            "times": times.tolist(),
            "mean_rms": float(np.mean(rms)),
            "max_rms": float(np.max(rms)),
            "mean_db": float(np.mean(rms_db)),
            "max_db": float(np.max(rms_db)),
            "dynamic_range_db": float(np.max(rms_db) - np.min(rms_db))
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
        self._debug_print("Extracting spectral features")
        
        if not LIBROSA_AVAILABLE:
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
            np.arange(len(centroid)), 
            sr=sr, 
            hop_length=self.hop_length
        )
        
        result = {
            "spectral_centroid": {
                "values": centroid.tolist(),
                "times": times.tolist(),
                "mean": float(np.mean(centroid)),
                "std": float(np.std(centroid))
            },
            "spectral_rolloff": {
                "values": rolloff.tolist(),
                "mean": float(np.mean(rolloff)),
                "std": float(np.std(rolloff))
            },
            "spectral_bandwidth": {
                "values": bandwidth.tolist(),
                "mean": float(np.mean(bandwidth)),
                "std": float(np.std(bandwidth))
            },
            "zero_crossing_rate": {
                "values": zcr.tolist(),
                "mean": float(np.mean(zcr)),
                "std": float(np.std(zcr))
            }
        }
        
        self._debug_print(f"Spectral centroid: mean={result['spectral_centroid']['mean']:.1f}Hz")
        self._debug_print(f"Spectral rolloff: mean={result['spectral_rolloff']['mean']:.1f}Hz")
        self._debug_print(f"Spectral bandwidth: mean={result['spectral_bandwidth']['mean']:.1f}Hz")
        self._debug_print(f"Zero crossing rate: mean={result['zero_crossing_rate']['mean']:.4f}")
        
        return result
    
    def process_audio(self, filepath: str, 
                      detect_segments: bool = True,
                      extract_pitch: bool = True,
                      extract_volume: bool = True,
                      extract_spectral: bool = True) -> Dict[str, Any]:
        """
        Process WAV file and return comprehensive analysis results.
        
        Args:
            filepath: Path to WAV file
            detect_segments: Whether to detect sound/silence segments
            extract_pitch: Whether to extract pitch (fundamental frequency)
            extract_volume: Whether to extract volume envelope
            extract_spectral: Whether to extract spectral features
            
        Returns:
            Dict with processing results
        """
        self._debug_print(f"{'='*60}")
        self._debug_print(f"PROCESSING AUDIO: {filepath}")
        self._debug_print(f"{'='*60}")
        total_start = time.time()
        
        # Load audio
        load_start = time.time()
        audio, sr = self.load_wav(filepath)
        info = self.get_audio_info(filepath)
        self._debug_print(f"Load + info took {time.time() - load_start:.3f}s")
        
        # Basic analysis
        duration = len(audio) / sr
        rms_energy = np.sqrt(np.mean(audio**2))
        max_amplitude = np.max(np.abs(audio))
        
        results = {
            "filepath": filepath,
            "duration": float(duration),
            "sample_rate": sr,
            "num_samples": len(audio),
            "rms_energy": float(rms_energy),
            "max_amplitude": float(max_amplitude),
            "is_silent": rms_energy < 0.001,
            "info": info
        }
        
        self._debug_print(f"Basic stats: duration={duration:.2f}s, RMS={rms_energy:.6f}, max_amp={max_amplitude:.4f}, silent={results['is_silent']}")
        
        # Detect sound segments (onset/offset)
        if detect_segments:
            seg_start = time.time()
            segments = self.detect_sound_segments(audio, sr)
            total_sound_duration = sum(s["duration"] for s in segments)
            results["sound_segments"] = segments
            results["total_sound_duration"] = float(total_sound_duration)
            results["silence_ratio"] = float(1.0 - total_sound_duration / duration) if duration > 0 else 1.0
            results["num_segments"] = len(segments)
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
            self._debug_print(f"Spectral extraction took {time.time() - spec_start:.3f}s")
        
        total_time = time.time() - total_start
        self._debug_print(f"{'='*60}")
        self._debug_print(f"TOTAL PROCESSING TIME: {total_time:.3f}s")
        self._debug_print(f"{'='*60}")
        
        logger.info(f"Processed audio: {filepath} ({duration:.2f}s, {sr}Hz, RMS: {rms_energy:.4f})")
        return results


# Convenience function for simple usage
def load_and_process_wav(filepath: str, target_sr: int = 22050, debug: bool = True, **kwargs) -> Dict[str, Any]:
    """
    Load and process a WAV file in one call.
    
    Args:
        filepath: Path to WAV file
        target_sr: Target sample rate
        debug: Enable debug output
        **kwargs: Additional arguments passed to process_audio()
        
    Returns:
        Dict with processing results
    """
    print(f"[load_and_process_wav] Starting processing of: {filepath}")
    processor = AudioProcessor(target_sr=target_sr, debug=debug)
    result = processor.process_audio(filepath, **kwargs)
    print(f"[load_and_process_wav] Completed processing: {filepath}")
    return result
