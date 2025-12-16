'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { Pause, Play, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Slider } from '@/shared/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';

interface AudioPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitleAudioUrl: string;
  backgroundAudioUrl: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isLoading: boolean;
}

const AudioPlayModal = forwardRef<HTMLAudioElement, AudioPlayModalProps>(({ 
  isOpen, 
  onClose, 
  subtitleAudioUrl, 
  backgroundAudioUrl,
  audioRef,
  isLoading = true
}, ref) => {
  const t = useTranslations('video_convert.projectDetail.audio');
  const [activeTab, setActiveTab] = useState('subtitle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // const [isLoading, setIsLoading] = useState(isLoading);
  const animationRef = useRef<number>(0);

  

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
    if (!isOpen || isLoading) return;

    // setCurrentUrl(currentUrl);

    const audio = audioRef.current;
    console.log('audio--->', audio);
    if (!audio) return;

    const updateDuration = () => {
      console.log('audio.duration--->', audio.duration);
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    // 重置状态
    setCurrentTime(0);
    setIsPlaying(false);

    const currentUrl = activeTab === 'subtitle' ? subtitleAudioUrl : backgroundAudioUrl;
    // 设置音频源并加载
    audio.src = currentUrl;
    audio.load();

    // 添加事件监听器
    audio.addEventListener('loadedmetadata', updateDuration, { once: true });
    audio.addEventListener('ended', handleEnded);

    // 如果音频已经可以播放，直接更新时长
    if (audio.readyState > 0) {
      updateDuration();
    }

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [activeTab, isOpen, audioRef.current, isLoading]);

  // 处理播放/暂停
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().then(() => {
        animationRef.current = requestAnimationFrame(updateProgress);
      }).catch(error => {
        console.error('播放失败:', error);
        setIsPlaying(false);
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
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          updateProgress();
        })
        .catch((error) => {
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

        {/* Audio element is now in the parent component */}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="subtitle" disabled={isLoading}>{t('download')}</TabsTrigger>
            <TabsTrigger value="background" disabled={isLoading}>{t('downloadBg')}</TabsTrigger>
          </TabsList>

          <TabsContent value="subtitle" className="space-y-4">
            {isLoading ? (
              <div className="mt-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
                  <div className="flex justify-between">
                    <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-4">
                <Button size="icon" variant="outline" onClick={togglePlay}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <div className="flex-1 space-y-2">
                  <Slider value={[currentTime]} max={duration || 100} step={0.1} onValueChange={handleSliderChange} />
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="background" className="space-y-4">
            {isLoading ? (
              <div className="mt-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
                  <div className="flex justify-between">
                    <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-4">
                <Button size="icon" variant="outline" onClick={togglePlay}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <div className="flex-1 space-y-2">
                  <Slider value={[currentTime]} max={duration || 100} step={0.1} onValueChange={handleSliderChange} />
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
});

AudioPlayModal.displayName = 'AudioPlayModal';
export { AudioPlayModal };
