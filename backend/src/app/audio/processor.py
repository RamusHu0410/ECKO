import os
import numpy as np
from typing import Tuple, Optional, Dict, Any
import logging

# Try to import audio processing libraries
try:
    import librosa
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

logger = logging.getLogger(__name__)

class AudioProcessor:
    """Handles loading and processing of WAV audio files."""
    
    def __init__(self, target_sr: int = 22050):
        """
        Initialize audio processor.
        
        Args:
            target_sr: Target sample rate for processing (default 22050 Hz)
        """
        self.target_sr = target_sr
        self._check_dependencies()
    
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
            logger.warning("No audio processing libraries found. Install librosa, scipy, or soundfile.")
        else:
            logger.info(f"Audio processing libraries available: {', '.join(available)}")
    
    def load_wav(self, filepath: str) -> Tuple[np.ndarray, int]:
        """
        Load WAV file and return audio data and sample rate.
        
        Args:
            filepath: Path to WAV file
            
        Returns:
            Tuple of (audio_data, sample_rate)
            audio_data is mono float32 array normalized to [-1, 1]
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"WAV file not found: {filepath}")
        
        # Try different libraries in order of preference
        if LIBROSA_AVAILABLE:
            return self._load_with_librosa(filepath)
        elif SOUNDFILE_AVAILABLE:
            return self._load_with_soundfile(filepath)
        elif SCIPY_AVAILABLE:
            return self._load_with_scipy(filepath)
        else:
            raise RuntimeError("No audio processing library available. Install librosa, soundfile, or scipy.")
    
    def _load_with_librosa(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using librosa (resamples to target_sr)."""
        audio, sr = librosa.load(filepath, sr=self.target_sr, mono=True)
        return audio.astype(np.float32), sr
    
    def _load_with_soundfile(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using soundfile."""
        audio, sr = sf.read(filepath, dtype='float32')
        # Convert to mono if stereo
        if len(audio.shape) > 1:
            audio = np.mean(audio, axis=1)
        # Resample if needed
        if sr != self.target_sr and LIBROSA_AVAILABLE:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=self.target_sr)
            sr = self.target_sr
        return audio, sr
    
    def _load_with_scipy(self, filepath: str) -> Tuple[np.ndarray, int]:
        """Load using scipy."""
        sr, audio = wavfile.read(filepath)
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
            audio = np.mean(audio, axis=1)
        
        # Resample if needed (requires librosa)
        if sr != self.target_sr:
            if LIBROSA_AVAILABLE:
                audio = librosa.resample(audio, orig_sr=sr, target_sr=self.target_sr)
                sr = self.target_sr
            else:
                logger.warning(f"Sample rate mismatch: file is {sr}Hz, target is {self.target_sr}Hz. "
                             "Install librosa for automatic resampling.")
        
        return audio, sr
    
    def get_audio_info(self, filepath: str) -> Dict[str, Any]:
        """
        Get basic info about WAV file without loading full audio.
        
        Returns:
            Dict with keys: duration, sample_rate, channels, frames, format
        """
        if SOUNDFILE_AVAILABLE:
            info = sf.info(filepath)
            return {
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
            return {
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
                return {
                    "duration": duration,
                    "sample_rate": sr,
                    "channels": channels,
                    "frames": len(audio) if len(audio.shape) == 1 else audio.shape[1],
                    "format": "WAV",
                    "subtype": "unknown"
                }
            raise RuntimeError("No audio library available to get file info")
    
    def process_audio(self, filepath: str) -> Dict[str, Any]:
        """
        Process WAV file and return analysis results.
        
        This is a placeholder for actual audio processing logic.
        Extend this method based on your specific needs (pitch detection, 
        onset detection, feature extraction, etc.)
        
        Returns:
            Dict with processing results
        """
        audio, sr = self.load_wav(filepath)
        info = self.get_audio_info(filepath)
        
        # Basic analysis
        duration = len(audio) / sr
        rms_energy = np.sqrt(np.mean(audio**2))
        max_amplitude = np.max(np.abs(audio))
        
        # Placeholder for more advanced processing
        results = {
            "filepath": filepath,
            "duration": duration,
            "sample_rate": sr,
            "num_samples": len(audio),
            "rms_energy": float(rms_energy),
            "max_amplitude": float(max_amplitude),
            "is_silent": rms_energy < 0.001,  # Threshold for silence detection
            "info": info
        }
        
        logger.info(f"Processed audio: {filepath} ({duration:.2f}s, {sr}Hz, RMS: {rms_energy:.4f})")
        return results


# Convenience function for simple usage
def load_and_process_wav(filepath: str, target_sr: int = 22050) -> Dict[str, Any]:
    """
    Load and process a WAV file in one call.
    
    Args:
        filepath: Path to WAV file
        target_sr: Target sample rate
        
    Returns:
        Dict with processing results
    """
    processor = AudioProcessor(target_sr=target_sr)
    return processor.process_audio(filepath)
