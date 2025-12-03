"use client";

// 右侧字幕音频对照表
import React, { useState, useRef, useEffect } from 'react';
import { SubtitleComparisonItem, SubtitleComparisonData } from './subtitle-comparison-item';
import { Button } from '@/shared/components/ui/button';
import { RefreshCw, Loader2, Headphones, HeadphoneOff } from 'lucide-react';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { loadSrtViaProxy, SrtEntry } from '@/shared/lib/srt-parser';
import { ConvertObj } from '@/app/[locale]/(landing)/video_convert/video-editor/[id]/page';

interface AudioListPanelProps {
  onPlayingIndexChange?: (index: number) => void;
  convertObj: ConvertObj;
  playingSubtitleIndex?: number; // 左侧视频编辑器当前播放的字幕索引
}

/**
 * 根据索引从数组中获取音频URL
 */
function getAudioUrl(audioArr: string[], index: number): string {
  if (index >= 0 && index < audioArr.length) {
    return audioArr[index];
  }
  // 如果索引超出范围，返回空字符串
  return '';
}

export function AudioListPanel({ onPlayingIndexChange, convertObj, playingSubtitleIndex = -1 }: AudioListPanelProps) {
  const [subtitleItems, setSubtitleItems] = useState<SubtitleComparisonData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number>(-1);
  const [playingType, setPlayingType] = useState<'source' | 'convert' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // 监听playingSubtitleIndex变化，自动滚动到对应项
  useEffect(() => {
    if (playingSubtitleIndex === -1 || !itemRefs.current[playingSubtitleIndex]) return;
    
    const itemElement = itemRefs.current[playingSubtitleIndex];
    if (!itemElement) return;
    
    // 查找ScrollArea的viewport元素
    const scrollViewport = itemElement.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!scrollViewport) return;
    
    // 获取元素和容器的位置信息
    const itemRect = itemElement.getBoundingClientRect();
    const containerRect = scrollViewport.getBoundingClientRect();
    
    // 计算元素相对于容器的位置
    const itemTop = itemElement.offsetTop;
    const itemBottom = itemTop + itemElement.offsetHeight;
    const scrollTop = scrollViewport.scrollTop;
    const containerHeight = scrollViewport.clientHeight;
    
    // 如果元素在可视区域之外，则滚动
    const padding = 20; // 留一些边距
    
    if (itemTop < scrollTop + padding) {
      // 元素在上方，滚动到顶部
      scrollViewport.scrollTo({
        top: Math.max(0, itemTop - padding),
        behavior: 'smooth'
      });
    } else if (itemBottom > scrollTop + containerHeight - padding) {
      // 元素在下方，滚动到底部
      scrollViewport.scrollTo({
        top: itemBottom - containerHeight + padding,
        behavior: 'smooth'
      });
    }
  }, [playingSubtitleIndex]);
  
  // 加载SRT文件
  const loadSrtFiles = async () => {
    if (!convertObj) {
      setError('缺少转换对象数据');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const [sourceEntries, convertEntries] = await Promise.all([
        loadSrtViaProxy(convertObj.srt_source),
        loadSrtViaProxy(convertObj.srt_convert),
      ]);

      // 合并两个SRT文件的数据
      const maxLength = Math.max(sourceEntries.length, convertEntries.length);
      const items: SubtitleComparisonData[] = [];

      for (let i = 0; i < maxLength; i++) {
        const sourceEntry = sourceEntries[i] || { index: i + 1, startTime: '00:00:00', endTime: '00:00:00', text: '', text2: null };
        const convertEntry = convertEntries[i] || { index: i + 1, startTime: '00:00:00', endTime: '00:00:00', text: '', text2: null };

        items.push({
          id: String(i + 1),
          startTime_source: sourceEntry.startTime,
          endTime_source: sourceEntry.endTime,
          text_source: sourceEntry.text,
          audioUrl_source: getAudioUrl(convertObj.srt_source_arr, i),
          
          startTime_convert: convertEntry.startTime,
          endTime_convert: convertEntry.endTime,
          text_convert: convertEntry.text2 ? convertEntry.text2 : convertEntry.text,
          audioUrl_convert: getAudioUrl(convertObj.srt_convert_arr, i),
        });
      }

      setSubtitleItems(items);
      console.log(`成功加载 ${items.length} 条字幕对照`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载失败';
      setError(errorMessage);
      console.error('加载SRT文件失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 组件挂载时或convertObj变化时加载SRT文件
  useEffect(() => {
    if (convertObj) {
      loadSrtFiles();
    }
  }, [convertObj]);

  // 当播放索引改变时，通知父组件并自动选中当前播放行
  useEffect(() => {
    if (onPlayingIndexChange) {
      onPlayingIndexChange(playingIndex);
    }
    
    // 自动选中正在播放的行
    if (playingIndex >= 0 && subtitleItems[playingIndex]) {
      setSelectedId(subtitleItems[playingIndex].id);
      
      // 自动滚动到正在播放的行，保持可见
      const currentItemRef = itemRefs.current[playingIndex];
      if (currentItemRef) {
        currentItemRef.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      }
    }
  }, [playingIndex, onPlayingIndexChange, subtitleItems]);

  // 播放指定索引和类型的音频
  const playAudioAtIndex = (index: number, type: 'source' | 'convert') => {
    if (index < 0 || index >= subtitleItems.length || !audioRef.current) return;

    const item = subtitleItems[index];
    const audioUrl = type === 'source' ? item.audioUrl_source : item.audioUrl_convert;
    
    audioRef.current.src = audioUrl;
    audioRef.current.play().catch((error) => {
      console.error('播放音频失败:', error);
      // 如果播放失败，尝试播放下一个
      // playNextAudio();
    });
    
    setPlayingIndex(index);
    setPlayingType(type);
  };

  // 播放下一个音频（同一类型）
  const playNextAudio = () => {
    if (playingType === null) return;
    
    const nextIndex = playingIndex + 1;
    if (nextIndex < subtitleItems.length) {
      playAudioAtIndex(nextIndex, playingType);
    } else {
      // 列表播放完毕
      setPlayingIndex(-1);
      setPlayingType(null);
    }
  };

  // 音频播放结束时自动播放下一个
  const handleAudioEnded = () => {
    // 顶部菜单按钮控制是否自动播放
    isAutoPlayNext && playNextAudio();
  };

  // 切换播放/暂停（原字幕）
  const handlePlayPauseSource = (index: number) => {
    if (!audioRef.current) return;

    if (playingIndex === index && playingType === 'source') {
      // 当前正在播放，暂停
      audioRef.current.pause();
      setPlayingIndex(-1);
      setPlayingType(null);
    } else {
      // 播放新的音频
      playAudioAtIndex(index, 'source');
    }
  };

  // 切换播放/暂停（转换后字幕）
  const handlePlayPauseConvert = (index: number) => {
    if (!audioRef.current) return;

    if (playingIndex === index && playingType === 'convert') {
      // 当前正在播放，暂停
      audioRef.current.pause();
      setPlayingIndex(-1);
      setPlayingType(null);
    } else {
      // 播放新的音频
      playAudioAtIndex(index, 'convert');
    }
  };

  // 更新字幕项
  const handleUpdateItem = (updatedItem: SubtitleComparisonData) => {
    setSubtitleItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  };

  // 转换处理
  const handleConvert = (item: SubtitleComparisonData) => {
    console.log('转换字幕:', item);
    // TODO: 实现转换逻辑
  };

  // 保存处理
  const handleSave = (item: SubtitleComparisonData) => {
    console.log('保存字幕:', item);
    // TODO: 实现保存逻辑
  };

  return (
    <div className="h-full gap-2 pb-10 flex flex-col bg-background">
      {/* 隐藏的音频播放器 */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        className="hidden"
      />

      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">字幕音频对照表</h2>
        <div className='flex flex-row gap-2 text-white'>
            {isAutoPlayNext? (
            <Headphones className='w-4 h-4 mr-1' onClick={() => setIsAutoPlayNext(false)}/>
          ) : (
            <HeadphoneOff className='w-4 h-4 mr-1' onClick={() => setIsAutoPlayNext(true)}/>
          )}
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              {/* 加载中 */}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-1" onClick={loadSrtFiles}/>
              {/* 重新加载 */}
            </>
          )}
        </div>
      </div>

      {/* 字幕列表 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">正在加载字幕文件...</span>
            </div>
          )}
          
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
              <p className="font-medium">加载失败</p>
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          {!isLoading && !error && subtitleItems.map((item, index) => (
            <SubtitleComparisonItem
              key={item.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              item={item}
              isSelected={selectedId === item.id}
              isPlayingSource={playingIndex === index && playingType === 'source'}
              isPlayingConvert={playingIndex === index && playingType === 'convert'}
              isPlayingFromVideo={playingSubtitleIndex === index}
              onSelect={() => setSelectedId(item.id)}
              onUpdate={handleUpdateItem}
              onPlayPauseSource={() => handlePlayPauseSource(index)}
              onPlayPauseConvert={() => handlePlayPauseConvert(index)}
              onConvert={() => handleConvert(item)}
              onSave={() => handleSave(item)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* 底部状态栏 */}
      <div className="p-3 border-t bg-muted/30">
        <div className="text-sm text-muted-foreground">
          共 {subtitleItems.length} 条字幕
          {playingIndex >= 0 && playingType && (
            <span className="ml-2 text-primary font-medium">
              正在播放: 第 {playingIndex + 1} 项 ({playingType === 'source' ? '原字幕' : '转换后'})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
