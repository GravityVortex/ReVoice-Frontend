'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Play, Pause, Copy, Download } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useAppContext } from '@/shared/contexts/app';

interface CompareSrtModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  onDownBtnsClick?: (e: any, stepName: string) => void;
}

interface SubtitleItem {
  id: string;
  start: string;
  end: string;
  gen_txt: string;
  tra_txt: string;
}

export function CompareSrtModal({ isOpen, onClose, taskId, onDownBtnsClick }: CompareSrtModalProps) {
  const { user } = useAppContext();
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<{ id: string; type: 'gen' | 'tra' } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onDownBtnsClickRef = useRef(onDownBtnsClick);
  const [preUrl, setPreUrl] = useState<string>();
  const [env, setEnv] = useState<string>();

  useEffect(() => {
    if (isOpen && taskId) {
      fetchSubtitles();
    }
  }, [isOpen, taskId]);

  const fetchSubtitles = async () => {
    setLoading(true);
    try {
      // let tempId = 'b09ff18a-c03d-4a27-9f41-6fa5d33fdb9b';
      const response = await fetch(`/api/video-task/getCompareSrtList?taskId=${taskId}`);
      // const response = await fetch(`/api/video-task/getCompareSrtList?taskId=${tempId}`);
      const result = await response.json();
      if (result.code === 0) {
        setSubtitles(result.data.list || []);
        setPreUrl(result.data.preUrl);
        setEnv(result.data.env);
      }
    } catch (error) {
      console.error('获取字幕失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeLen = (str: string) => {
    if(str.length > 9) return str.split(',')[0];
    return str;
  };

  const handlePlayAudio = (id: string, type: 'gen' | 'tra') => {
    const userId = user?.id || '';
    const folder = type === 'gen' ? 'split_audio/audio' : 'adj_audio_time';
    const audioUrl =  `${preUrl}/${env}/${userId}/${taskId}/${folder}/${id}.wav`;
    console.log('audioUrl--->', audioUrl)

    if (playingAudio?.id === id && playingAudio?.type === type) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingAudio(null);
      audio.play();
      audioRef.current = audio;
      setPlayingAudio({ id, type });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="min-w-[800px] max-w-6xl max-h-[90vh] min-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-2xl">字幕翻译前后比较</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4 mb-4 font-semibold text-center">
                <div>视频原字幕</div>
                <div>翻译后字幕</div>
              </div>
              {[...Array(5)].map((_, index) => (
                <div key={index} className="grid grid-cols-2 gap-4">
                  <div className="border-2 rounded-lg p-4 bg-card">
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                  <div className="border-2 rounded-lg p-4 bg-card">
                    <Skeleton className="h-8 w-full mb-2" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4 mb-4 font-semibold text-center">
                <div>视频原字幕</div>
                <div>翻译后字幕</div>
              </div>

              {subtitles.map((item, index) => {
                const original = item?.gen_txt || '';
                const translated = item?.tra_txt || '';
                const isPlayingGen = playingAudio?.id === item.id && playingAudio?.type === 'gen';
                const isPlayingTra = playingAudio?.id === item.id && playingAudio?.type === 'tra';
                return (
                  <div key={index} className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4 bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handlePlayAudio(item.id, 'gen')}>
                          {isPlayingGen ? <Pause className="size-4 mr-1" /> : <Play className="size-4 mr-1" />}
                          {formatTimeLen(item.start)} - {formatTimeLen(item.end)}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Copy className="size-4" />
                        </Button>
                      </div>
                      <div className="text-sm leading-relaxed">{original}</div>
                    </div>

                    <div className="border rounded-lg p-4 bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handlePlayAudio(item.id, 'tra')}>
                          {isPlayingTra ? <Pause className="size-4 mr-1" /> : <Play className="size-4 mr-1" />}
                          {formatTimeLen(item.start)} - {formatTimeLen(item.end)}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Copy className="size-4" />
                        </Button>
                      </div>
                      <div className="text-sm leading-relaxed">{translated}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t pt-4 flex justify-end gap-6">
          <Button variant="outline" onClick={(e)=>{onDownBtnsClickRef.current?.(e, 'gen_srt');}}><Download className="size-4" />原字幕</Button>
          <Button variant="outline" onClick={(e)=>{onDownBtnsClickRef.current?.(e, 'translate_srt');}}><Download className="size-4" />翻译字幕</Button>
          <Button variant="outline" onClick={(e)=>{onDownBtnsClickRef.current?.(e, 'double_srt');}}><Download className="size-4" />双语字幕</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
