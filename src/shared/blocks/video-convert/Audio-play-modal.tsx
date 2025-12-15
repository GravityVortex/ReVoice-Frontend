'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Slider } from '@/shared/components/ui/slider';
import { Button } from '@/shared/components/ui/button';
import { Play, Pause } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { iso } from 'zod';

interface AudioPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitleAudioUrl: string;
  backgroundAudioUrl: string;
}

export function AudioPlayModal({
  isOpen,
  onClose,
  subtitleAudioUrl,
  backgroundAudioUrl,
}: AudioPlayModalProps) {
  const t = useTranslations('video_convert.projectDetail.audio');
  const [activeTab, setActiveTab] = useState('subtitle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number>(0);

  const currentUrl = activeTab === 'subtitle' ? subtitleAudioUrl : backgroundAudioUrl;

  // 更新进度条动画
  const updateProgress = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  };

  // 清理动画帧
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // tab切换或URL变化时重头播放并绑定事件
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentUrl) return;

    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    // 重置状态
    setCurrentTime(0);
    setIsPlaying(false);
    
    // 加载新音频
    audio.load();
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [currentUrl]);

  // 处理播放/暂停
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().then(() => {
        animationRef.current = requestAnimationFrame(updateProgress);
      });
    } else {
      audioRef.current.pause();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  // 弹框关闭时重置状态
  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  }, [isOpen]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        updateProgress();
      }).catch(error => {
        console.error('播放失败:', error);
      });
    }
  };

  const handleSliderChange = (value: number[]) => {
    if (!audioRef.current) return;
    const newTime = value[0];
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    
    // 如果正在播放，确保进度条继续更新
    if (isPlaying && !animationRef.current) {
      updateProgress();
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('preview')}</DialogTitle>
        </DialogHeader>

        <audio ref={audioRef} src={currentUrl} className="hidden" />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="subtitle">{t('download')}</TabsTrigger>
            <TabsTrigger value="background">{t('downloadBg')}</TabsTrigger>
          </TabsList>

          <TabsContent value="subtitle" className="space-y-4">
            <div className="flex items-center gap-4 mt-6">
              <Button size="icon" variant="outline" onClick={togglePlay}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex-1 space-y-2">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSliderChange}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="background" className="space-y-4">
            <div className="flex items-center gap-4 mt-6">
              <Button size="icon" variant="outline" onClick={togglePlay}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex-1 space-y-2">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSliderChange}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
