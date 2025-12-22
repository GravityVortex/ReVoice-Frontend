"use client";

// 右侧字幕音频对照表
import React, { useState, useRef, useEffect } from 'react';
import { SubtitleRowItem, SubtitleRowData } from './subtitle-row-item';
import { Button } from '@/shared/components/ui/button';
import { Loader2, Headphones, HeadphoneOff } from 'lucide-react';
import { Play, Pause, RefreshCw, Save, ArrowDownToDot, Sparkles, Wand2, Zap, Stars, Cpu, Bot, Rocket, Lightbulb, Pencil, Layers, Package } from 'lucide-react';

import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { toast } from 'sonner';
import { ConvertObj } from '../../../../../../shared/components/video-editor';
import { useAppContext } from '../../../../../../shared/contexts/app';

interface AudioListPanelProps {
  onPlayingIndexChange?: (index: number) => void;
  convertObj: ConvertObj;
  playingSubtitleIndex?: number; // 左侧视频编辑器当前播放的字幕索引
  onSeekToSubtitle?: (time: number) => void; // 请求左侧定位到指定时间
  onShowTip?: () => void; // 触发提示弹框
}

export function AudioListPanel({ onPlayingIndexChange, convertObj, playingSubtitleIndex = -1, onSeekToSubtitle, onShowTip }: AudioListPanelProps) {
  const [subtitleItems, setSubtitleItems] = useState<SubtitleRowData[]>([]);
  // 记录修改的字幕音频列表集合
  const [updateItemList, setUpdateItemList] = useState<SubtitleRowData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number>(-1);
  const [playingType, setPlayingType] = useState<'source' | 'convert' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);
  // 单条播放结束
  const [isAudioPlayEnded, setIsAudioPlayEnded] = useState(false);
  const [doubleClickIdx, setDoubleClickIdx] = useState(-1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useAppContext();


  // 监听左侧当前播放字幕索引，滚动右侧列表到对应位置
  useEffect(() => {
    setDoubleClickIdx(-1);
    console.log('右侧面板-寻找字幕位置--->', playingSubtitleIndex);
    // if (playingSubtitleIndex === -1 || !itemRefs.current[playingSubtitleIndex]) return;


    // const itemElement = itemRefs.current[playingSubtitleIndex];
    // if (!itemElement) return;

    // // 查找ScrollArea的viewport元素
    // const scrollViewport = itemElement.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
    // if (!scrollViewport) return;

    // // 获取元素和容器的位置信息
    // const itemRect = itemElement.getBoundingClientRect();
    // const containerRect = scrollViewport.getBoundingClientRect();

    // // 计算元素相对于容器的位置
    // const itemTop = itemElement.offsetTop;
    // const itemBottom = itemTop + itemElement.offsetHeight;
    // const scrollTop = scrollViewport.scrollTop;
    // const containerHeight = scrollViewport.clientHeight;

    // // 如果元素在可视区域之外，则滚动
    // const padding = 20; // 留一些边距

    // if (itemTop < scrollTop + padding) {
    //   // 元素在上方，滚动到顶部
    //   scrollViewport.scrollTo({
    //     top: Math.max(0, itemTop - padding),
    //     behavior: 'smooth'
    //   });
    // } else if (itemBottom > scrollTop + containerHeight - padding) {
    //   // 元素在下方，滚动到底部
    //   scrollViewport.scrollTo({
    //     top: itemBottom - containerHeight + padding,
    //     behavior: 'smooth'
    //   });
    // }
    if (playingSubtitleIndex == null || playingSubtitleIndex < 0) return;
    const el = itemRefs.current[playingSubtitleIndex];
    if (!el) return;
    // 在下一帧执行，避免和布局抖动竞争
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  }, [playingSubtitleIndex]);

  // 将SRT时间格式转换为秒
  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    let seconds = 0;
    let milliseconds = 0;

    if (parts[2].includes(',')) {
      const [sec, ms] = parts[2].split(',');
      seconds = parseInt(sec, 10);
      milliseconds = parseInt(ms, 10);
    } else if (parts[2].includes('.')) {
      const [sec, ms] = parts[2].split('.');
      seconds = parseInt(sec, 10);
      milliseconds = parseInt(ms, 10);
    } else {
      seconds = parseInt(parts[2], 10);
    }

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  };

  // 加载SRT文件
  const loadSrtFiles = async () => {
    if (!convertObj) {
      setError('缺少转换对象数据');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sourceArr = convertObj.srt_source_arr || [];
      const convertArr = convertObj.srt_convert_arr || [];

      // 合并两个JSON数组
      const maxLength = Math.max(sourceArr.length, convertArr.length);
      const items: SubtitleRowData[] = [];

      for (let i = 0; i < maxLength; i++) {
        const sourceItem = sourceArr[i];
        const convertItem = convertArr[i];

        items.push({
          id: sourceItem?.id || convertItem?.id || String(i + 1),
          startTime_source: sourceItem?.start || '00:00:00,000',
          endTime_source: sourceItem?.end || '00:00:00,000',
          text_source: sourceItem?.txt || '',
          audioUrl_source: sourceItem?.audio_url || '',

          startTime_convert: convertItem?.start || '00:00:00,000',
          endTime_convert: convertItem?.end || '00:00:00,000',
          text_convert: convertItem?.txt || '',
          audioUrl_convert: convertItem?.audio_url || '',
        });
      }
      // 合成双语字幕实体列表
      convertObj.srt_double_arr = items;

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

  const letPointerToPlace = (index: number) => {
    const item = subtitleItems[index];
    // 通知左侧视频编辑器定位到该字幕的开始时间（但不播放）
    if (onSeekToSubtitle) {
      const timeStr = item.startTime_convert;
      const timeInSeconds = parseTimeToSeconds(timeStr);
      onSeekToSubtitle(timeInSeconds);

      // 无用，不知道为何
      // playingSubtitleIndex = -1;
      setDoubleClickIdx(index);
      // playingSubtitleIndex = index;
      // console.log('右侧面板--letPointerToPlace--->', playingSubtitleIndex);
    }
  };

  // 播放指定索引和类型的音频
  const playAudioAtIndex = (index: number, type: 'source' | 'convert') => {
    if (index < 0 || index >= subtitleItems.length || !audioRef.current) return;

    const item = subtitleItems[index];
    // const audioUrl = type === 'source' ? item.audioUrl_source : item.audioUrl_convert;

    const userId = user?.id || '';
    // let folder = type === 'source' ? 'split_audio/audio' : 'adj_audio_time';
    let folder = '';
    // 视频原字幕
    if (type === 'source') {
      folder = item.audioUrl_source_custom ? 'split_audio/audio_temp' : 'split_audio/audio';
    }
    // 翻译后的字幕
    else {
      folder = item.audioUrl_convert_custom ? 'adj_audio_time_temp' : 'adj_audio_time';
    }

    const audioUrl = `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/${folder}/${item.id}.wav`;
    console.log('audioUrl--->', audioUrl)



    audioRef.current.src = audioUrl;
    audioRef.current.play().catch((error) => {
      console.error('播放音频失败:', error);
      // 重置播放按钮状态
      setIsAudioPlayEnded(true);
      toast.error('播放音频失败，请重试！');
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
    setIsAudioPlayEnded(true);
    // 顶部菜单按钮控制是否自动播放
    isAutoPlayNext && playNextAudio();
  };

  // 切换播放/暂停（原字幕）
  const handlePlayPauseSource = (index: number) => {
    if (!audioRef.current) return;

    if (playingIndex === index && playingType === 'source' && !isAudioPlayEnded) {
      // 当前正在播放，暂停
      audioRef.current.pause();
      setPlayingIndex(-1);
      setPlayingType(null);
    } else {
      // 播放新的音频
      playAudioAtIndex(index, 'source');
      setIsAudioPlayEnded(false);
    }
  };

  // 切换播放/暂停（转换后字幕）
  const handlePlayPauseConvert = (index: number) => {
    // debugger
    if (!audioRef.current) return;

    if (playingIndex === index && playingType === 'convert' && !isAudioPlayEnded) {
      // 当前正在播放，暂停
      audioRef.current.pause();
      setPlayingIndex(-1);
      setPlayingType(null);
    } else {
      // 播放新的音频
      playAudioAtIndex(index, 'convert');
      setIsAudioPlayEnded(false);
    }
  };

  // 更新字幕项
  const handleUpdateItem = (updatedItem: SubtitleRowData) => {
    setSubtitleItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
  };

  // 转换处理
  const handleConvert = async (item: SubtitleRowData, type: string, index: number) => {
    console.log('转换字幕:', item);
    // DOEND: 实现字幕转语音逻辑
    // toast.info('调用宝python生成语音试听...')
    let preText = '';
    if (index > 0) {
      const preItem = subtitleItems[index - 1];
      preText = type === 'gen_srt' ? preItem.text_source : preItem.text_convert;
    }
    // debugger
    const url = `/api/video-task/generate-subtitle-voice`
    const params = {
      // gen_srt、translate_srt
      text: type === 'gen_srt' ? item.text_source : item.text_convert,
      preText: preText,
      type: type,
      subtitleName: item.id,
      taskId: convertObj.id,
      languageTarget: convertObj.targetLanguage,
    }
    const resp = await fetch(url, {
      method: "POST",
      body: JSON.stringify(params)
    });
    const { code, message, data } = await resp.json();
    if (code === 0) {
      console.log('生成语音成功--->', data.path_name)
      toast.success('生成语音成功，可以点击试听！')
      // 更新数组中音频地址，触发保存按钮渲染
      setSubtitleItems((prev) =>
        prev.map((itm) =>
          itm.id === item.id
            ? {
              ...itm,
              ...(type === 'gen_srt'
                ? { text_convert: data.text_translated }
                : { audioUrl_convert_custom: data.path_name }),
            }
            : itm
        )
      );
    } else {
      toast.error(message || '生成语音失败')
    }
  };

  const onVideoSaveClick = async () => {
    console.log('保存按钮--->');
    // DOEND: 实现视频合成保存
    const resp = await fetch('/api/video-task/generate-video?taskId=' + convertObj.id);
    const { code, message } = await resp.json();
    if (code === 0) {
      toast.success('合成视频成功');
    } else {
      toast.error('合成视频失败');
    }
  };

  // 字幕保存
  const handleSave = async (item: SubtitleRowData, type: string) => {
    try {
      const sourceArr = convertObj.srt_source_arr || [];
      const convertArr = convertObj.srt_convert_arr || [];

      let targetItem;
      if (type === 'gen_srt') {
        targetItem = sourceArr.find((itm: any) => itm.id === item.id);
        if (targetItem) {
          targetItem.txt = item.text_source;
        }
      } else if (type === 'translate_srt') {
        targetItem = convertArr.find((itm: any) => itm.id === item.id);
        if (targetItem) {
          targetItem.txt = item.text_convert;
        }
      }

      if (!targetItem) {
        toast.error('未找到要更新的字幕项');
        return;
      }
      // 保存json表数据，同时调java移动文件
      const resp = await fetch('/api/video-task/update-subtitle-item', {
        method: 'POST',
        body: JSON.stringify({
          userId: convertObj.userId,
          taskId: convertObj.id,
          type: type,
          seq: targetItem.seq,
          item: targetItem
        }),
      });

      if (!resp.ok) {
        throw new Error(`request failed with status: ${resp.status}`);
      }

      const { code, message } = await resp.json();

      if (code === 0) {
        // 更新数组中音频地址，触发保存按钮渲染
        setSubtitleItems((prev) =>
          prev.map((itm) =>
            itm.id === item.id
              ? {
                ...itm,
                ...(type === 'gen_srt'
                  ? { audioUrl_source_custom: '' }
                  : { audioUrl_convert_custom: '' }),
              }
              : itm
          )
        );
        // 添加item到updateItemList集合
        setUpdateItemList((prev) => {
          const updatedList = [...prev];
          const existingIndex = updatedList.findIndex((i) => i.id === item.id);
          if (existingIndex !== -1) {
            updatedList[existingIndex] = item;
          } else {
            updatedList.push(item);
          }
          console.log('updateItemList--->', updatedList);
          return updatedList;
        })

        toast.success('保存成功！');
        onShowTip?.();
      } else {
        toast.error(message || '保存失败！');
      }
    } catch (error) {
      console.error('保存字幕失败:', error);
      toast.error('保存失败！');
    }
  };

  return (
    <div className="h-full gap-2 pb-1 flex flex-col bg-muted/30">
      {/* 隐藏的音频播放器 */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        className="hidden"
      />

      {/* 头部 */}
      <div className="px-4 pt-4 pb-2 border-b bg-card">
        <div className="flex items-center justify-between pl-4">
          <h2 className="text-lg font-semibold"
            onClick={() => { }}>字幕音频对照表</h2>
          <div className='flex flex-row gap-0 text-sm font-semibold'>
            <Button
              variant="destructive"
              disabled={updateItemList.length === 0}
              size="sm"
              title="重新合成视频"
              onClick={onVideoSaveClick}
            >
              <Save className="size-4" />
              保存
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-around p-1 text-sm font-bold mt-2">
          <div>原字幕</div>
          <div>转换后字幕</div>
        </div>
      </div>

      {/* 字幕列表 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3 bg-muted/90">
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
            <SubtitleRowItem
              key={item.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              item={item}
              isSelected={selectedId === item.id}
              isDoubleClick={doubleClickIdx === index}
              isPlayingSource={playingIndex === index && playingType === 'source' && !isAudioPlayEnded}
              isPlayingConvert={playingIndex === index && playingType === 'convert' && !isAudioPlayEnded}
              isPlayingFromVideo={playingSubtitleIndex === index}
              onSelect={() => setSelectedId(item.id)}
              onUpdate={handleUpdateItem}
              onPlayPauseSource={() => handlePlayPauseSource(index)}
              onPlayPauseConvert={() => handlePlayPauseConvert(index)}
              onPointerToPlaceClick={() => letPointerToPlace(index)}
              onConvert={(itm, type) => handleConvert(item, type, index)}
              onSave={(type) => handleSave(item, type)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* 底部状态栏 */}
      <div className="bg-card flex flex-row justify-between p-3 border-t">
        <div className="text-sm text-muted-foreground">
          共 {subtitleItems.length} 条字幕
          {playingIndex >= 0 && playingType && (
            <span className="ml-2 text-primary font-medium">
              正在播放: {playingType === 'source' ? '原字幕' : '转换后字幕'}第 {playingIndex + 1} 项
            </span>
          )}
        </div>
        <div className='flex flex-row gap-2 text-white'>
          {isAutoPlayNext ? (
            <Headphones className='w-4 h-4 mr-1' onClick={() => setIsAutoPlayNext(false)} />
          ) : (
            <HeadphoneOff className='w-4 h-4 mr-1' onClick={() => setIsAutoPlayNext(true)} />
          )}
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              {/* 加载中 */}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-1" onClick={loadSrtFiles} />
              {/* <Sparkles className="w-4 h-4" /> */}
              {/* <Wand2 className="w-4 h-4" />
              <Zap className="w-4 h-4" />
              <Stars className="w-4 h-4" />
              <Cpu className="w-4 h-4" />
              <Bot className="w-4 h-4" />
              <Rocket className="w-4 h-4" />
              <Lightbulb className="w-4 h-4" />
              <Pencil className="w-4 h-4" />
              <Layers className="w-4 h-4" />
              <Package className="w-4 h-4" /> */}
              {/* 重新加载 */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
