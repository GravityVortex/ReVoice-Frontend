"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";


export interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  title: string;
}

export function VideoPlayerModal({
  isOpen,
  onClose,
  videoUrl,
  title,
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // 关闭时暂停视频
  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -right-2 -top-12 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
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
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            autoPlay
            className="max-h-[calc(100vh-200px)] w-full"
            controlsList="nodownload"
          >
            您的浏览器不支持视频播放。
          </video>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayerModal;
