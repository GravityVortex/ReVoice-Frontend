// "use client";

// // 右侧字幕音频对照表
// import React, { useState, useRef, useEffect } from 'react';
// import { SubtitleComparisonItem, SubtitleRowData } from './subtitle-comparison-item';
// import { Button } from '@/shared/components/ui/button';
// import { RefreshCw, Loader2, Headphones, HeadphoneOff } from 'lucide-react';
// import { ScrollArea } from '@/shared/components/ui/scroll-area';
// import { loadSrtViaProxy, SrtEntry } from '@/shared/lib/srt-parser';
// import { ConvertObj } from '@/app/[locale]/(landing)/video_convert/video-editor/[id]/page';
// import { fa } from 'zod/v4/locales';
// import { toast } from 'sonner';

// interface AudioListPanelProps {
//   onPlayingIndexChange?: (index: number) => void;
//   convertObj: ConvertObj;
//   playingSubtitleIndex?: number; // 左侧视频编辑器当前播放的字幕索引
//   onSeekToSubtitle?: (time: number) => void; // 请求左侧定位到指定时间
// }

// /**
//  * 根据索引从数组中获取音频URL
//  */
// function getAudioUrl(audioArr: string[], index: number): string {
//   if (index >= 0 && index < audioArr.length) {
//     return audioArr[index];
//   }
//   // 如果索引超出范围，返回空字符串
//   return '';
// }

// export function AudioListPanel({ onPlayingIndexChange, convertObj, playingSubtitleIndex = -1, onSeekToSubtitle }: AudioListPanelProps) {
//   const [subtitleItems, setSubtitleItems] = useState<SubtitleRowData[]>([]);
//   const [selectedId, setSelectedId] = useState<string | null>(null);
//   const [playingIndex, setPlayingIndex] = useState<number>(-1);
//   const [playingType, setPlayingType] = useState<'source' | 'convert' | null>(null);
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);
//   // 单条播放结束
//   const [isAudioPlayEnded, setIsAudioPlayEnded] = useState(false);
//   const [doubleClickIdx, setDoubleClickIdx] = useState(-1);

//   const audioRef = useRef<HTMLAudioElement>(null);
//   const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
//   const scrollAreaRef = useRef<HTMLDivElement>(null);

//   // 监听左侧当前播放字幕索引，滚动右侧列表到对应位置
//   useEffect(() => {
//     setDoubleClickIdx(-1);
//     console.log('右侧面板-寻找字幕位置--->', playingSubtitleIndex);
//     // if (playingSubtitleIndex === -1 || !itemRefs.current[playingSubtitleIndex]) return;


//     // const itemElement = itemRefs.current[playingSubtitleIndex];
//     // if (!itemElement) return;

//     // // 查找ScrollArea的viewport元素
//     // const scrollViewport = itemElement.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
//     // if (!scrollViewport) return;

//     // // 获取元素和容器的位置信息
//     // const itemRect = itemElement.getBoundingClientRect();
//     // const containerRect = scrollViewport.getBoundingClientRect();

//     // // 计算元素相对于容器的位置
//     // const itemTop = itemElement.offsetTop;
//     // const itemBottom = itemTop + itemElement.offsetHeight;
//     // const scrollTop = scrollViewport.scrollTop;
//     // const containerHeight = scrollViewport.clientHeight;

//     // // 如果元素在可视区域之外，则滚动
//     // const padding = 20; // 留一些边距

//     // if (itemTop < scrollTop + padding) {
//     //   // 元素在上方，滚动到顶部
//     //   scrollViewport.scrollTo({
//     //     top: Math.max(0, itemTop - padding),
//     //     behavior: 'smooth'
//     //   });
//     // } else if (itemBottom > scrollTop + containerHeight - padding) {
//     //   // 元素在下方，滚动到底部
//     //   scrollViewport.scrollTo({
//     //     top: itemBottom - containerHeight + padding,
//     //     behavior: 'smooth'
//     //   });
//     // }
//     if (playingSubtitleIndex == null || playingSubtitleIndex < 0) return;
//     const el = itemRefs.current[playingSubtitleIndex];
//     if (!el) return;
//     // 在下一帧执行，避免和布局抖动竞争
//     requestAnimationFrame(() => {
//       el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
//     });
//   }, [playingSubtitleIndex]);

//   // 将SRT时间格式转换为秒
//   const parseTimeToSeconds = (timeStr: string): number => {
//     const parts = timeStr.split(':');
//     if (parts.length !== 3) return 0;

//     const hours = parseInt(parts[0], 10);
//     const minutes = parseInt(parts[1], 10);

//     let seconds = 0;
//     let milliseconds = 0;

//     if (parts[2].includes(',')) {
//       const [sec, ms] = parts[2].split(',');
//       seconds = parseInt(sec, 10);
//       milliseconds = parseInt(ms, 10);
//     } else if (parts[2].includes('.')) {
//       const [sec, ms] = parts[2].split('.');
//       seconds = parseInt(sec, 10);
//       milliseconds = parseInt(ms, 10);
//     } else {
//       seconds = parseInt(parts[2], 10);
//     }

//     return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
//   };

//   // 加载SRT文件
//   const loadSrtFiles = async () => {
//     if (!convertObj) {
//       setError('缺少转换对象数据');
//       return;
//     }

//     setIsLoading(true);
//     setError(null);

//     try {
//       const [sourceEntries, convertEntries] = await Promise.all([
//         loadSrtViaProxy(convertObj.srt_source),
//         loadSrtViaProxy(convertObj.srt_convert),
//       ]);

//       // 合并两个SRT文件的数据
//       const maxLength = Math.max(sourceEntries.length, convertEntries.length);
//       const items: SubtitleRowData[] = [];

//       for (let i = 0; i < maxLength; i++) {
//         const sourceEntry = sourceEntries[i] || { index: i + 1, startTime: '00:00:00', endTime: '00:00:00', text: '', text2: null };
//         const convertEntry = convertEntries[i] || { index: i + 1, startTime: '00:00:00', endTime: '00:00:00', text: '', text2: null };

//         items.push({
//           id: String(i + 1),
//           startTime_source: sourceEntry.startTime,
//           endTime_source: sourceEntry.endTime,
//           text_source: sourceEntry.text,
//           audioUrl_source: getAudioUrl(convertObj.srt_source_arr, i),

//           startTime_convert: convertEntry.startTime,
//           endTime_convert: convertEntry.endTime,
//           text_convert: convertEntry.text2 ? convertEntry.text2 : convertEntry.text,
//           audioUrl_convert: getAudioUrl(convertObj.srt_convert_arr, i),
//         });
//       }

//       setSubtitleItems(items);
//       console.log(`成功加载 ${items.length} 条字幕对照`);
//     } catch (err) {
//       const errorMessage = err instanceof Error ? err.message : '加载失败';
//       setError(errorMessage);
//       console.error('加载SRT文件失败:', err);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   // 组件挂载时或convertObj变化时加载SRT文件
//   useEffect(() => {
//     if (convertObj) {
//       loadSrtFiles();
//     }
//   }, [convertObj]);

//   // 当播放索引改变时，通知父组件并自动选中当前播放行
//   useEffect(() => {
//     if (onPlayingIndexChange) {
//       onPlayingIndexChange(playingIndex);
//     }

//     // 自动选中正在播放的行
//     if (playingIndex >= 0 && subtitleItems[playingIndex]) {
//       setSelectedId(subtitleItems[playingIndex].id);

//       // 自动滚动到正在播放的行，保持可见
//       const currentItemRef = itemRefs.current[playingIndex];
//       if (currentItemRef) {
//         currentItemRef.scrollIntoView({
//           behavior: 'smooth',
//           block: 'nearest',
//           inline: 'nearest',
//         });
//       }
//     }
//   }, [playingIndex, onPlayingIndexChange, subtitleItems]);

//   const letPointerToPlace = (index: number) => {
//     const item = subtitleItems[index];
//     // 通知左侧视频编辑器定位到该字幕的开始时间（但不播放）
//     if (onSeekToSubtitle) {
//       const timeStr = item.startTime_convert;
//       const timeInSeconds = parseTimeToSeconds(timeStr);
//       onSeekToSubtitle(timeInSeconds);
      
//       // 无用，不知道为何
//       // playingSubtitleIndex = -1;
//       setDoubleClickIdx(index);
//       // playingSubtitleIndex = index;
//       // console.log('右侧面板--letPointerToPlace--->', playingSubtitleIndex);
//     }
//   };

//   // 播放指定索引和类型的音频
//   const playAudioAtIndex = (index: number, type: 'source' | 'convert') => {
//     if (index < 0 || index >= subtitleItems.length || !audioRef.current) return;

//     const item = subtitleItems[index];
//     const audioUrl = type === 'source' ? item.audioUrl_source : item.audioUrl_convert;



//     audioRef.current.src = audioUrl;
//     audioRef.current.play().catch((error) => {
//       console.error('播放音频失败:', error);
//       // 重置播放按钮状态
//       setIsAudioPlayEnded(true);
//       toast.error('播放音频失败，请重试！');
//     });

//     setPlayingIndex(index);
//     setPlayingType(type);
//   };

//   // 播放下一个音频（同一类型）
//   const playNextAudio = () => {
//     if (playingType === null) return;

//     const nextIndex = playingIndex + 1;
//     if (nextIndex < subtitleItems.length) {
//       playAudioAtIndex(nextIndex, playingType);
//     } else {
//       // 列表播放完毕
//       setPlayingIndex(-1);
//       setPlayingType(null);
//     }
//   };

//   // 音频播放结束时自动播放下一个
//   const handleAudioEnded = () => {
//     setIsAudioPlayEnded(true);
//     // 顶部菜单按钮控制是否自动播放
//     isAutoPlayNext && playNextAudio();
//   };

//   // 切换播放/暂停（原字幕）
//   const handlePlayPauseSource = (index: number) => {
//     if (!audioRef.current) return;

//     if (playingIndex === index && playingType === 'source') {
//       // 当前正在播放，暂停
//       audioRef.current.pause();
//       setPlayingIndex(-1);
//       setPlayingType(null);
//     } else {
//       // 播放新的音频
//       playAudioAtIndex(index, 'source');
//       setIsAudioPlayEnded(false);
//     }
//   };

//   // 切换播放/暂停（转换后字幕）
//   const handlePlayPauseConvert = (index: number) => {
//     if (!audioRef.current) return;

//     if (playingIndex === index && playingType === 'convert') {
//       // 当前正在播放，暂停
//       audioRef.current.pause();
//       setPlayingIndex(-1);
//       setPlayingType(null);
//     } else {
//       // 播放新的音频
//       playAudioAtIndex(index, 'convert');
//       setIsAudioPlayEnded(false);
//     }
//   };

//   // 更新字幕项
//   const handleUpdateItem = (updatedItem: SubtitleRowData) => {
//     setSubtitleItems((prev) =>
//       prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
//     );
//   };

//   // 转换处理
//   const handleConvert = (item: SubtitleRowData) => {
//     console.log('转换字幕:', item);
//     // TODO: 实现字幕转语音逻辑
//   };

//   // 保存处理
//   const handleSave = (item: SubtitleRowData, type: string) => {
//     console.log(`保存${type}字幕--->`, item);
//     // TODO: 实现字幕保存逻辑
//   };

//   return (
//     <div className="h-full gap-2 pb-1 flex flex-col bg-background">
//       {/* 隐藏的音频播放器 */}
//       <audio
//         ref={audioRef}
//         onEnded={handleAudioEnded}
//         className="hidden"
//       />

//       {/* 头部 */}
//       <div className="px-4 pt-4 pb-2 border-b">
//         <div className="flex items-center justify-between pl-4">
//           <h2 className="text-lg font-semibold"
//             onClick={() => {}}>字幕音频对照表</h2>
//           <div className='flex flex-row gap-0 text-white'>
//             <Button
//               variant="outline"
//               size="sm"
//               onClick={loadSrtFiles}
//             >
//               保存
//             </Button>
//           </div>
//         </div>
//         <div className="flex items-center justify-around p-1 text-sm font-bold">
//           <div>原字幕</div>
//           <div>转换后字幕</div>
//         </div>
//       </div>

//       {/* 字幕列表 */}
//       <ScrollArea className="flex-1">
//         <div className="p-4 space-y-3">
//           {isLoading && (
//             <div className="flex items-center justify-center py-8">
//               <Loader2 className="w-8 h-8 animate-spin text-primary" />
//               <span className="ml-2 text-muted-foreground">正在加载字幕文件...</span>
//             </div>
//           )}

//           {error && (
//             <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
//               <p className="font-medium">加载失败</p>
//               <p className="text-sm">{error}</p>
//             </div>
//           )}

//           {!isLoading && !error && subtitleItems.map((item, index) => (
//             <SubtitleComparisonItem
//               key={item.id}
//               ref={(el) => { itemRefs.current[index] = el; }}
//               item={item}
//               isSelected={selectedId === item.id}
//               isDoubleClick={doubleClickIdx === index}
//               isPlayingSource={playingIndex === index && playingType === 'source' && !isAudioPlayEnded}
//               isPlayingConvert={playingIndex === index && playingType === 'convert' && !isAudioPlayEnded}
//               isPlayingFromVideo={playingSubtitleIndex === index}
//               onSelect={() => setSelectedId(item.id)}
//               onUpdate={handleUpdateItem}
//               onPlayPauseSource={() => handlePlayPauseSource(index)}
//               onPlayPauseConvert={() => handlePlayPauseConvert(index)}
//               onPointerToPlaceClick={() => letPointerToPlace(index)}
//               onConvert={() => handleConvert(item)}
//               onSave={(type) => handleSave(item, type)}
//             />
//           ))}
//         </div>
//       </ScrollArea>

//       {/* 底部状态栏 */}
//       <div className="flex flex-row justify-between p-3 border-t bg-muted/30">
//         <div className="text-sm text-muted-foreground">
//           共 {subtitleItems.length} 条字幕
//           {playingIndex >= 0 && playingType && (
//             <span className="ml-2 text-primary font-medium">
//               正在播放: {playingType === 'source' ? '原字幕' : '转换后字幕'}第 {playingIndex + 1} 项
//             </span>
//           )}
//         </div>
//         <div className='flex flex-row gap-2 text-white'>
//             {isAutoPlayNext ? (
//               <Headphones className='w-4 h-4 mr-1' onClick={() => setIsAutoPlayNext(false)} />
//             ) : (
//               <HeadphoneOff className='w-4 h-4 mr-1' onClick={() => setIsAutoPlayNext(true)} />
//             )}
//             {isLoading ? (
//               <>
//                 <Loader2 className="w-4 h-4 mr-1 animate-spin" />
//                 {/* 加载中 */}
//               </>
//             ) : (
//               <>
//                 <RefreshCw className="w-4 h-4 mr-1" onClick={loadSrtFiles} />
//                 {/* 重新加载 */}
//               </>
//             )}
//           </div>
//       </div>
//     </div>
//   );
// }
