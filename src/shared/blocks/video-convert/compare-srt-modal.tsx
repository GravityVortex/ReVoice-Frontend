'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Play, Copy } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface CompareSrtModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
}

interface SubtitleItem {
  start: number;
  end: number;
  text: string;
}

export function CompareSrtModal({ isOpen, onClose, taskId }: CompareSrtModalProps) {
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && taskId) {
      fetchSubtitles();
    }
  }, [isOpen, taskId]);

  const fetchSubtitles = async () => {
    setLoading(true);
    try {
      let tempId = 'b09ff18a-c03d-4a27-9f41-6fa5d33fdb9b';
      // const response = await fetch(`/api/video-convert/getCompareSrtList?taskId=${taskId}`);
      const response = await fetch(`/api/video-convert/getCompareSrtList?taskId=${tempId}`);
      const result = await response.json();
      if (result.code === 0) {
        setSubtitles(result.data || []);
      }
    } catch (error) {
      console.error('获取字幕失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
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
                <div key={index} className="grid grid-cols-2 gap-4 animate-pulse">
                  <div className="border-2 rounded-lg p-4 bg-card">
                    <div className="h-8 bg-muted border rounded mb-2"></div>
                    <div className="h-16 bg-muted border rounded"></div>
                  </div>
                  <div className="border-2 rounded-lg p-4 bg-card">
                    <div className="h-8 bg-muted border rounded mb-2"></div>
                    <div className="h-16 bg-muted border rounded"></div>
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
                const [original, translated] = item.text.split('\n');
                return (
                  <div key={index} className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4 bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          <Play className="size-4 mr-1" />
                          {formatTime(item.start)} - {formatTime(item.end)}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Copy className="size-4" />
                        </Button>
                      </div>
                      <div className="text-sm leading-relaxed">{original}</div>
                    </div>

                    <div className="border rounded-lg p-4 bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          <Play className="size-4 mr-1" />
                          {formatTime(item.start)} - {formatTime(item.end)}
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

        {/* <div className="border-t pt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>保存</Button>
        </div> */}
      </DialogContent>
    </Dialog>
  );
}
