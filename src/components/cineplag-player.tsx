"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown, LoaderCircle, Maximize2, Minimize2,
  PictureInPicture2, Play, Pause, RotateCcw, RotateCw, Settings, Subtitles, Volume2,
  VolumeX, Volume1, Wifi, X, Film, AppWindow, Globe, Smartphone,
} from "lucide-react";
import { parseSrt, type SubtitleCue } from "@/lib/subtitles";
import type { DubLanguage } from "@/lib/catalog-data";

export interface CaptionTrack {
  id: string;
  lan: string;
  lanName: string;
  url: string;
}

export interface PlayerProps {
  title: string;
  unitLabel: string;
  streamUrl: string;
  isHls?: boolean;
  captions?: CaptionTrack[];
  languages?: DubLanguage[];
  activeLanguageSubjectId?: string;
  onLanguageChange?: (subjectId: string, langName: string) => void;
  availableQualities?: string[];
  currentQuality?: string;
  onQualityChange?: (quality: string) => void;
  detectedBandwidth?: string;
  onClose: () => void;
  onProgressUpdate?: (percent: number) => void;
  initialPercent?: number;
  onToggleMiniPlayer?: () => void;
  isMiniPlayer?: boolean;
}

const DEFAULT_SUBTITLE_OPTIONS = [
  { id: "off", label: "Désactivé", desc: "Aucun sous-titre" },
  { id: "fr", label: "Français", desc: "Complet / VOSTFR" },
  { id: "fr-cc", label: "Français (CC)", desc: "Sourds et malentendants" },
  { id: "en", label: "English", desc: "Full English Subtitles" },
  { id: "es", label: "Español", desc: "Subtítulos en español" },
];

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CineplagPlayer({
  title,
  unitLabel,
  streamUrl,
  isHls = false,
  captions = [],
  languages = [],
  activeLanguageSubjectId,
  onLanguageChange,
  availableQualities = ["1080p", "720p", "480p", "360p"],
  currentQuality = "auto",
  onQualityChange,
  detectedBandwidth = "1080p",
  onClose,
  onProgressUpdate,
  initialPercent = 0,
  onToggleMiniPlayer,
  isMiniPlayer = false,
}: PlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedQuality, setSelectedQuality] = useState(currentQuality);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);

  // Double click ripple feedback on screen
  const [doubleClickEffect, setDoubleClickEffect] = useState<"left" | "right" | null>(null);

  // Popover menus state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const [languagesOpen, setLanguagesOpen] = useState(false);

  // Subtitle state
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("off");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [activeCueText, setActiveCueText] = useState<string>("");

  // Timeline hover
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Current active dub / audio language name
  const currentDub = useMemo(() => {
    if (!languages.length) return "Audio d'origine";
    const found = languages.find((l) => l.subjectId === activeLanguageSubjectId);
    return found ? found.name : languages[0].name;
  }, [languages, activeLanguageSubjectId]);

  // Initialize playback source with dashjs or hls.js or native HTML5 video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let dashPlayer: any = null;
    let hlsPlayer: any = null;

    setIsBuffering(true);

    const isDash = streamUrl.includes(".mpd") || streamUrl.includes("/dash/");
    const isM3u8 = streamUrl.includes(".m3u8") || isHls;

    if (isDash) {
      import("dashjs").then((dashjs) => {
        try {
          dashPlayer = dashjs.MediaPlayer().create();
          dashPlayer.initialize(video, streamUrl, true);
          dashPlayer.updateSettings({
            streaming: {
              buffer: {
                fastSwitchEnabled: true,
              },
            },
          });
        } catch {
          video.src = streamUrl;
        }
      });
    } else if (isM3u8) {
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          hlsPlayer = new Hls({ enableWorker: true });
          hlsPlayer.loadSource(streamUrl);
          hlsPlayer.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = streamUrl;
        }
      });
    } else {
      video.src = streamUrl;
    }

    return () => {
      if (dashPlayer) {
        try {
          dashPlayer.reset();
        } catch {}
      }
      if (hlsPlayer) {
        try {
          hlsPlayer.destroy();
        } catch {}
      }
    };
  }, [streamUrl, isHls]);

  // Set initial resume time if provided
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      if (initialPercent > 0 && initialPercent < 100 && video.duration) {
        const resumeSec = (initialPercent / 100) * video.duration;
        video.currentTime = resumeSec;
      }
      setIsBuffering(false);
      video.play().catch(() => {});
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [initialPercent]);

  // Fetch and parse active subtitle track
  useEffect(() => {
    if (selectedSubtitleId === "off") {
      setCues([]);
      setActiveCueText("");
      return;
    }

    const track = captions.find((c) => c.id === selectedSubtitleId || c.lan === selectedSubtitleId);
    if (!track || !track.url) {
      setCues([]);
      return;
    }

    let active = true;
    fetch(track.url)
      .then((res) => res.text())
      .then((text) => {
        if (!active) return;
        const parsed = parseSrt(text);
        setCues(parsed);
      })
      .catch(() => {
        if (active) setCues([]);
      });

    return () => {
      active = false;
    };
  }, [selectedSubtitleId, captions]);

  // Default to French subtitles if available
  useEffect(() => {
    if (captions.length > 0 && selectedSubtitleId === "off") {
      const fr = captions.find((c) => c.lan === "fr" || c.lan.toLowerCase().includes("fr"));
      if (fr) {
        setSelectedSubtitleId(fr.id || fr.lan);
      }
    }
  }, [captions, selectedSubtitleId]);

  // Handle video time update
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const cur = video.currentTime;
    setCurrentTime(cur);

    // Update active subtitle cue
    if (cues.length > 0) {
      const matching = cues.find((c) => cur >= c.start && cur <= c.end);
      setActiveCueText(matching ? matching.text : "");
    }

    // Update buffered progress
    if (video.buffered.length > 0 && video.duration > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBufferedPercent((bufferedEnd / video.duration) * 100);
    }

    // Report progress percent
    if (video.duration > 0 && onProgressUpdate) {
      const pct = Math.round((cur / video.duration) * 100);
      onProgressUpdate(pct);
    }
  };

  // Play/Pause toggle
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Seek relative
  const seekBy = useCallback((offset: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + offset));
  }, []);

  // Screen Gesture Handler: Double click left (-10s), Double click right (+10s), Single click (Play/Pause)
  const handleScreenClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;

    if (clickTimerRef.current) {
      // Double Click detected!
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;

      if (clickX < width * 0.4) {
        // Double click on LEFT side -> -10s
        seekBy(-10);
        setDoubleClickEffect("left");
        setTimeout(() => setDoubleClickEffect(null), 600);
      } else if (clickX > width * 0.6) {
        // Double click on RIGHT side -> +10s
        seekBy(10);
        setDoubleClickEffect("right");
        setTimeout(() => setDoubleClickEffect(null), 600);
      } else {
        // Double click on CENTER -> toggle fullscreen
        toggleFullscreen();
      }
    } else {
      // First click: wait 240ms before treating as single click
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        togglePlay();
      }, 240);
    }
  };

  // Screen Rotation Handler
  const handleRotateScreen = async () => {
    if (typeof window === "undefined") return;
    const orientation = (screen as any).orientation;
    if (orientation) {
      try {
        if (orientation.type.includes("portrait")) {
          await orientation.lock?.("landscape");
        } else {
          await orientation.lock?.("portrait");
        }
      } catch {
        // Fallback: trigger fullscreen
        toggleFullscreen();
      }
    } else {
      toggleFullscreen();
    }
  };

  // Handle timeline seek click/drag
  const handleTimelineSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const timeline = timelineRef.current;
    const video = videoRef.current;
    if (!timeline || !video || !video.duration) return;

    const rect = timeline.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    video.currentTime = pos * video.duration;
  };

  // Timeline hover preview
  const handleTimelineMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const timeline = timelineRef.current;
    const video = videoRef.current;
    if (!timeline || !video || !video.duration) return;

    const rect = timeline.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * video.duration);
  };

  const handleTimelineMouseLeave = () => {
    setHoverTime(null);
  };

  // Volume & Mute
  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
      video.muted = true;
    } else if (isMuted) {
      setIsMuted(false);
      video.muted = false;
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      video.volume = volume || 0.5;
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Picture in picture / Pop-up mode
  const handleTogglePiP = async () => {
    const video = videoRef.current;
    if (document.pictureInPictureEnabled && video) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
          return;
        }
      } catch {}
    }
    if (onToggleMiniPlayer) {
      onToggleMiniPlayer();
    }
  };

  // Auto-hide controls
  const handleUserActivity = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);

    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (!settingsOpen && !subtitlesOpen && !languagesOpen) {
          setControlsVisible(false);
        }
      }, 2500);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekBy(-10);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekBy(10);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        handleVolumeChange(Math.min(1, volume + 0.1));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        handleVolumeChange(Math.max(0, volume - 0.1));
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === "KeyP") {
        e.preventDefault();
        handleTogglePiP();
      } else if (e.code === "KeyR") {
        e.preventDefault();
        handleRotateScreen();
      } else if (e.code === "Escape") {
        if (settingsOpen || subtitlesOpen || languagesOpen) {
          setSettingsOpen(false);
          setSubtitlesOpen(false);
          setLanguagesOpen(false);
        } else if (isFullscreen) {
          document.exitFullscreen?.().catch(() => {});
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, seekBy, volume, isMuted, isFullscreen, settingsOpen, subtitlesOpen, languagesOpen, onClose]);

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Render Mini Floating Pop-up Window
  if (isMiniPlayer) {
    return (
      <aside className="player-mini-popup" role="dialog" aria-label={`Mini-lecteur ${title}`}>
        <div className="mini-player-header">
          <div className="mini-player-title">
            <strong>{title}</strong>
            <small>{unitLabel} • {currentDub}</small>
          </div>
          <div className="mini-player-actions">
            <button
              className="mini-btn"
              onClick={onToggleMiniPlayer}
              title="Agrandir en plein écran"
              aria-label="Plein écran"
            >
              <Maximize2 size={15} />
            </button>
            <button
              className="mini-btn close"
              onClick={onClose}
              title="Fermer la lecture"
              aria-label="Fermer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="mini-player-video">
          <video
            ref={videoRef}
            className="player-video-element"
            playsInline
            autoPlay
            controls
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>
      </aside>
    );
  }

  // Fullscreen / Native Player View
  return (
    <div
      ref={containerRef}
      className={`cineplag-custom-player ${
        controlsVisible || !isPlaying ? "controls-visible" : "controls-hidden"
      }`}
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
    >
      {/* Screen Click Area with Double-Click Gestures (-10s / +10s) */}
      <div className="player-gesture-screen" onClick={handleScreenClick}>
        <video
          ref={videoRef}
          className="player-video-element"
          playsInline
          autoPlay
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onTimeUpdate={handleTimeUpdate}
        />

        {/* Double-Click Left Feedback (-10s) */}
        {doubleClickEffect === "left" && (
          <div className="seek-ripple-overlay left">
            <div className="seek-ripple-content">
              <RotateCcw size={36} />
              <span>-10 s</span>
            </div>
          </div>
        )}

        {/* Double-Click Right Feedback (+10s) */}
        {doubleClickEffect === "right" && (
          <div className="seek-ripple-overlay right">
            <div className="seek-ripple-content">
              <RotateCw size={36} />
              <span>+10 s</span>
            </div>
          </div>
        )}
      </div>

      {/* Subtitles Overlay */}
      {activeCueText && (
        <div className="custom-subtitles-overlay" aria-live="polite">
          <p className="subtitle-text">{activeCueText}</p>
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="player-buffering-indicator">
          <LoaderCircle size={44} className="spin" />
        </div>
      )}

      {/* Center Play Indicator */}
      {!isPlaying && !isBuffering && (
        <button
          className="center-play-button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          aria-label="Lecture"
        >
          <Play size={38} fill="currentColor" />
        </button>
      )}

      {/* Top Header Overlay Bar */}
      <div className="player-top-overlay">
        <button className="player-top-back-btn" onClick={onClose} aria-label="Retour">
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>

        <div className="player-top-meta">
          <strong>{title}</strong>
          <span>{unitLabel} • {currentDub}</span>
        </div>

        <div className="player-top-actions">
          {/* Screen Rotation Button */}
          <button
            className="player-top-action-btn"
            onClick={handleRotateScreen}
            title="Rotation d'écran (Paysage / Portrait)"
            aria-label="Rotation d'écran"
          >
            <Smartphone size={18} />
          </button>

          {/* Pop-up Mode Button */}
          <button
            className="player-top-action-btn"
            onClick={handleTogglePiP}
            title="Mode Pop-up / Fenêtre flottante"
            aria-label="Mode Pop-up"
          >
            <PictureInPicture2 size={19} />
          </button>

          {/* Close Player */}
          <button className="player-top-action-btn close" onClick={onClose} aria-label="Fermer le lecteur">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div
        className="player-bottom-controls"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Interactive Timeline Track */}
        <div
          ref={timelineRef}
          className="player-timeline-wrapper"
          onClick={handleTimelineSeek}
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={handleTimelineMouseLeave}
        >
          <div className="timeline-track">
            <div className="timeline-buffered" style={{ width: `${bufferedPercent}%` }} />
            <div className="timeline-played" style={{ width: `${currentPercent}%` }}>
              <span className="timeline-scrubber-handle" />
            </div>
          </div>

          {hoverTime !== null && (
            <div className="timeline-hover-tooltip" style={{ left: `${hoverPosition}%` }}>
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Controls Button Row */}
        <div className="player-controls-row">
          <div className="controls-left">
            <button className="ctrl-btn play-toggle" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Lecture"}>
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>

            <button className="ctrl-btn" onClick={() => seekBy(-10)} title="Reculer de 10 secondes" aria-label="Reculer de 10s">
              <RotateCcw size={18} />
              <span className="skip-label">10</span>
            </button>

            <button className="ctrl-btn" onClick={() => seekBy(10)} title="Avancer de 10 secondes" aria-label="Avancer de 10s">
              <RotateCw size={18} />
              <span className="skip-label">10</span>
            </button>

            {/* Volume Control */}
            <div className="volume-control-group">
              <button className="ctrl-btn" onClick={toggleMute} aria-label={isMuted ? "Activer le son" : "Couper le son"}>
                {isMuted || volume === 0 ? <VolumeX size={19} /> : volume < 0.5 ? <Volume1 size={19} /> : <Volume2 size={19} />}
              </button>
              <input
                type="range"
                className="volume-slider"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                aria-label="Volume audio"
              />
            </div>

            {/* Time Stamp */}
            <div className="player-time-display">
              <span className="time-current">{formatTime(currentTime)}</span>
              <span className="time-sep">/</span>
              <span className="time-total">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="controls-right">
            {/* Audio Language / Dubbing Selector */}
            {languages.length > 0 && (
              <div className="ctrl-menu-anchor">
                <button
                  className={`ctrl-btn ${languagesOpen ? "active" : ""}`}
                  onClick={() => {
                    setLanguagesOpen(!languagesOpen);
                    setSettingsOpen(false);
                    setSubtitlesOpen(false);
                  }}
                  title="Langue audio & Doublage"
                  aria-label="Langue audio"
                >
                  <Globe size={19} />
                  <span className="ctrl-badge dub-badge">
                    {currentDub.includes("Original") ? "VO" : "DUB"}
                  </span>
                </button>

                {/* Audio Dub Popover */}
                {languagesOpen && (
                  <div className="ctrl-popover languages-popover">
                    <div className="popover-title">
                      <span>Langue audio & Doublage</span>
                      <button onClick={() => setLanguagesOpen(false)} aria-label="Fermer"><X size={14} /></button>
                    </div>
                    <div className="popover-items-list">
                      {languages.map((lang) => {
                        const active = lang.subjectId === activeLanguageSubjectId || (!activeLanguageSubjectId && lang.isOriginal);
                        return (
                          <button
                            key={lang.subjectId}
                            className={`popover-row ${active ? "active" : ""}`}
                            onClick={() => {
                              setLanguagesOpen(false);
                              if (onLanguageChange) {
                                onLanguageChange(lang.subjectId, lang.name);
                              }
                            }}
                          >
                            <div className="row-text">
                              <strong>{lang.name}</strong>
                              <small>{lang.isOriginal ? "Piste originale d'origine" : "Version doublée"}</small>
                            </div>
                            {active && <Check size={15} className="check-icon" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Subtitles Menu */}
            <div className="ctrl-menu-anchor">
              <button
                className={`ctrl-btn ${selectedSubtitleId !== "off" ? "active-badge" : ""} ${subtitlesOpen ? "active" : ""}`}
                onClick={() => {
                  setSubtitlesOpen(!subtitlesOpen);
                  setSettingsOpen(false);
                  setLanguagesOpen(false);
                }}
                title="Sous-titres"
                aria-label="Sélectionner les sous-titres"
              >
                <Subtitles size={19} />
                {selectedSubtitleId !== "off" && (
                  <span className="ctrl-badge">
                    {captions.find((c) => c.id === selectedSubtitleId || c.lan === selectedSubtitleId)?.lan.toUpperCase() || "FR"}
                  </span>
                )}
              </button>

              {/* Subtitles Popover */}
              {subtitlesOpen && (
                <div className="ctrl-popover subtitles-popover">
                  <div className="popover-title">
                    <span>Sous-titres</span>
                    <button onClick={() => setSubtitlesOpen(false)} aria-label="Fermer"><X size={14} /></button>
                  </div>
                  <div className="popover-items-list">
                    <button
                      className={`popover-row ${selectedSubtitleId === "off" ? "active" : ""}`}
                      onClick={() => {
                        setSelectedSubtitleId("off");
                        setSubtitlesOpen(false);
                      }}
                    >
                      <div className="row-text">
                        <strong>Désactivé</strong>
                        <small>Aucun sous-titre affiché</small>
                      </div>
                      {selectedSubtitleId === "off" && <Check size={15} className="check-icon" />}
                    </button>

                    {captions.length > 0
                      ? captions.map((cap) => {
                          const active = selectedSubtitleId === cap.id || selectedSubtitleId === cap.lan;
                          return (
                            <button
                              key={cap.id || cap.lan}
                              className={`popover-row ${active ? "active" : ""}`}
                              onClick={() => {
                                setSelectedSubtitleId(cap.id || cap.lan);
                                setSubtitlesOpen(false);
                              }}
                            >
                              <div className="row-text">
                                <strong>{cap.lanName || cap.lan.toUpperCase()}</strong>
                                <small>Piste synchronisée ({cap.lan.toUpperCase()})</small>
                              </div>
                              {active && <Check size={15} className="check-icon" />}
                            </button>
                          );
                        })
                      : DEFAULT_SUBTITLE_OPTIONS.filter((s) => s.id !== "off").map((sub) => {
                          const active = selectedSubtitleId === sub.id;
                          return (
                            <button
                              key={sub.id}
                              className={`popover-row ${active ? "active" : ""}`}
                              onClick={() => {
                                setSelectedSubtitleId(sub.id);
                                setSubtitlesOpen(false);
                              }}
                            >
                              <div className="row-text">
                                <strong>{sub.label}</strong>
                                <small>{sub.desc}</small>
                              </div>
                              {active && <Check size={15} className="check-icon" />}
                            </button>
                          );
                        })}
                  </div>
                </div>
              )}
            </div>

            {/* Quality & Speed Settings Menu */}
            <div className="ctrl-menu-anchor">
              <button
                className={`ctrl-btn ${settingsOpen ? "active" : ""}`}
                onClick={() => {
                  setSettingsOpen(!settingsOpen);
                  setSubtitlesOpen(false);
                  setLanguagesOpen(false);
                }}
                title="Paramètres de lecture"
                aria-label="Paramètres"
              >
                <Settings size={19} />
              </button>

              {/* Settings Popover */}
              {settingsOpen && (
                <div className="ctrl-popover settings-popover">
                  <div className="popover-title">
                    <span>Paramètres de lecture</span>
                    <button onClick={() => setSettingsOpen(false)} aria-label="Fermer"><X size={14} /></button>
                  </div>

                  {/* Quality Selection connected to API */}
                  <div className="settings-section">
                    <span className="section-label">Qualité vidéo (API)</span>
                    <div className="quality-grid">
                      {[
                        { id: "auto", label: `Auto (${detectedBandwidth})`, hint: "Réseau" },
                        { id: "4k", label: "4K UHD", hint: "2160p" },
                        { id: "1080p", label: "1080p FHD", hint: "Optimal" },
                        { id: "720p", label: "720p HD", hint: "Standard" },
                        { id: "480p", label: "480p SD", hint: "Éco" },
                      ].map((opt) => {
                        const active = selectedQuality === opt.id;
                        return (
                          <button
                            key={opt.id}
                            className={`quality-opt-btn ${active ? "active" : ""}`}
                            onClick={() => {
                              setSelectedQuality(opt.id);
                              if (onQualityChange) {
                                onQualityChange(opt.id);
                              }
                            }}
                          >
                            <span>{opt.label}</span>
                            {active && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Speed Selection */}
                  <div className="settings-section">
                    <span className="section-label">Vitesse de lecture</span>
                    <div className="speed-pills-row">
                      {[0.75, 1, 1.25, 1.5, 2].map((s) => {
                        const active = playbackSpeed === s;
                        return (
                          <button
                            key={s}
                            className={`speed-pill-btn ${active ? "active" : ""}`}
                            onClick={() => {
                              const video = videoRef.current;
                              if (video) video.playbackRate = s;
                              setPlaybackSpeed(s);
                            }}
                          >
                            {s}x
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="settings-footer-info">
                    <Wifi size={13} />
                    <span>Audio actif : <strong>{currentDub}</strong></span>
                  </div>
                </div>
              )}
            </div>

            {/* Pop-up Mode / PiP */}
            <button
              className="ctrl-btn"
              onClick={handleTogglePiP}
              title="Mode Pop-up / Picture-in-Picture"
              aria-label="Mode Pop-up"
            >
              <PictureInPicture2 size={19} />
            </button>

            {/* Native Fullscreen Toggle */}
            <button
              className="ctrl-btn fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
              aria-label="Plein écran"
            >
              {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
