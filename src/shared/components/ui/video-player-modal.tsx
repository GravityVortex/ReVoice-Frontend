"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { usePausedVideoPrefetch } from "@/shared/hooks/use-paused-video-prefetch";


export interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  videoUrlCandidates?: string[];
  title: string;
}

export function VideoPlayerModal({
  isOpen,
  onClose,
  videoUrl,
  videoUrlCandidates,
  title,
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [finalUrl, setFinalUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);

  usePausedVideoPrefetch(videoRef, {
    enabled: isOpen && Boolean(finalUrl),
    minBufferedAheadSeconds: 10,
  });

  const candidates = (videoUrlCandidates && videoUrlCandidates.length > 0 ? videoUrlCandidates : [videoUrl]).filter(
    (it) => typeof it === "string" && it.trim().length > 0
  );
  const activeCandidate = candidates[candidateIndex] || "";

  // Reset candidate selection when the source changes / modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setCandidateIndex(0);
  }, [isOpen, videoUrl, videoUrlCandidates]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchUrl = async () => {
      if (!activeCandidate) {
        setFinalUrl("");
        return;
      }
      if (activeCandidate.startsWith("http")) {
        setFinalUrl(activeCandidate);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/storage/privater2-url?key=${encodeURIComponent(activeCandidate)}`);
        const data = await res.json();
        if (data.code === 0) {
          console.log('获取私桶预览地址--->', data.data.url)
          setFinalUrl(data.data.url);
          return;
        }
      } catch (error) {
        console.error("Failed to fetch video URL:", error);
      } finally {
        setLoading(false);
      }

      // If signing fails (or key is missing), fall back to the next candidate.
      if (candidateIndex + 1 < candidates.length) {
        setFinalUrl("");
        setCandidateIndex((prev) => prev + 1);
      } else {
        setFinalUrl("");
      }
    };

    fetchUrl();
  }, [isOpen, activeCandidate]);

  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      setFinalUrl("");
    }
  }, [isOpen]);

  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.8)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -right-2 -top-12 flex size-10 items-center justify-center rounded-full bg-[rgba(255,255,255,0.1)] text-white backdrop-blur-sm transition-colors hover:bg-[rgba(255,255,255,0.2)]"
          aria-label="关闭"
        >
          <X className="size-6" />
        </button>

        {/* 视频标题 */}
        <div className="mb-3 text-center">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
        </div>

        {/* 视频播放器 */}
        <div className="overflow-hidden rounded-lg bg-black shadow-2xl">
          {loading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <Loader2 className="size-12 animate-spin text-white" />
            </div>
          ) : finalUrl ? (
            <video
              ref={videoRef}
              src={finalUrl}
              controls
              autoPlay
              className="min-h-[50vh] max-h-[calc(100vh-200px)] w-full"
              controlsList="nodownload"
              preload="auto"
              onError={() => {
                // Try the next candidate on failure (old tasks may not have 480p objects).
                if (candidateIndex + 1 < candidates.length) {
                  setFinalUrl("");
                  setCandidateIndex((prev) => prev + 1);
                }
              }}
            >
              您的浏览器不支持视频播放。
            </video>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default VideoPlayerModal;
