// "use client";

// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { Play, Pause, SkipBack, SkipForward, Volume2, Download, ZoomIn, ZoomOut, Type, Settings } from 'lucide-react';
// import { Button } from '@/shared/components/ui/button';
// import { Card, CardContent } from '@/shared/components/ui/card';
// import { cn } from '@/shared/lib/utils';
// import { Timeline } from './timeline';
// import { Track } from './track';
// import { TrackItem, SubtitleItem, VideoEditorProps, ExportData, SubtitleTrackItem } from './types';

// export function VideoEditor({ className, onExport, initialVideo }: VideoEditorProps) {
//   // 基础状态
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [currentTime, setCurrentTime] = useState(0);
//   const [totalDuration, setTotalDuration] = useState(60);
//   const [zoom, setZoom] = useState(1);
//   const [volume, setVolume] = useState(80);
  
//   // 轨道数据
//   const [videoTrack, setVideoTrack] = useState<TrackItem[]>([]);
//   const [audioTrack, setAudioTrack] = useState<TrackItem[]>([]);
//   const [bgmTrack, setBgmTrack] = useState<TrackItem[]>([]);
//   const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  
//   // 选中状态
//   const [selectedItem, setSelectedItem] = useState<string | null>(null);
//   const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);
  
//   // 引用
//   const videoRef = useRef<HTMLVideoElement>(null);

//   // 时间格式化
//   const formatTime = (seconds: number) => {
//     const mins = Math.floor(seconds / 60);
//     const secs = Math.floor(seconds % 60);
//     return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
//   };

//   // 播放控制
//   const togglePlay = () => {
//     if (videoRef.current) {
//       if (isPlaying) {
//         videoRef.current.pause();
//       } else {
//         videoRef.current.play();
//       }
//       setIsPlaying(!isPlaying);
//     }
//   };

//   // 跳转控制
//   const skipTime = (seconds: number) => {
//     const newTime = Math.max(0, Math.min(currentTime + seconds, totalDuration));
//     setCurrentTime(newTime);
//     if (videoRef.current) {
//       videoRef.current.currentTime = newTime;
//     }
//   };

//   // 缩放控制
//   const handleZoom = (direction: 'in' | 'out') => {
//     setZoom(prev => {
//       const newZoom = direction === 'in' ? prev * 1.5 : prev / 1.5;
//       return Math.max(0.5, Math.min(newZoom, 5));
//     });
//   };

//   // 音量控制
//   const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const newVolume = parseInt(e.target.value);
//     setVolume(newVolume);
//     if (videoRef.current) {
//       videoRef.current.volume = newVolume / 100;
//     }
//   };

//   // 添加轨道项目
//   const addTrackItem = (type: 'video' | 'audio' | 'bgm') => {
//     const input = document.createElement('input');
//     input.type = 'file';
//     input.accept = type === 'video' ? 'video/*' : 'audio/*';
    
//     input.onchange = (e) => {
//       const file = (e.target as HTMLInputElement).files?.[0];
//       if (file) {
//         const url = URL.createObjectURL(file);
        
//         // 创建临时媒体元素获取时长
//         const mediaElement = type === 'video' ? document.createElement('video') : document.createElement('audio');
//         mediaElement.src = url;
        
//         mediaElement.onloadedmetadata = () => {
//           const newItem: TrackItem = {
//             id: Date.now().toString(),
//             type,
//             name: file.name,
//             url,
//             startTime: currentTime,
//             duration: mediaElement.duration || 10,
//             volume: 80
//           };

//           switch (type) {
//             case 'video':
//               setVideoTrack(prev => [...prev, newItem]);
//               // 如果是第一个视频，设置为主视频
//               if (videoTrack.length === 0 && videoRef.current) {
//                 videoRef.current.src = url;
//                 setTotalDuration(mediaElement.duration || 60);
//               }
//               break;
//             case 'audio':
//               setAudioTrack(prev => [...prev, newItem]);
//               break;
//             case 'bgm':
//               setBgmTrack(prev => [...prev, newItem]);
//               break;
//           }
          
//           URL.revokeObjectURL(mediaElement.src);
//         };
//       }
//     };
    
//     input.click();
//   };

//   // 更新轨道项目
//   const updateTrackItem = (trackType: 'video' | 'audio' | 'bgm', id: string, updates: Partial<TrackItem>) => {
//     switch (trackType) {
//       case 'video':
//         setVideoTrack(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
//         break;
//       case 'audio':
//         setAudioTrack(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
//         break;
//       case 'bgm':
//         setBgmTrack(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
//         break;
//     }
//   };

//   // 删除轨道项目
//   const deleteTrackItem = (trackType: 'video' | 'audio' | 'bgm', id: string) => {
//     switch (trackType) {
//       case 'video':
//         setVideoTrack(prev => prev.filter(item => item.id !== id));
//         break;
//       case 'audio':
//         setAudioTrack(prev => prev.filter(item => item.id !== id));
//         break;
//       case 'bgm':
//         setBgmTrack(prev => prev.filter(item => item.id !== id));
//         break;
//     }
//   };

//   // 添加字幕
//   const addSubtitle = () => {
//     const newSubtitle: SubtitleItem = {
//       id: Date.now().toString(),
//       text: '新字幕',
//       startTime: currentTime,
//       endTime: currentTime + 3,
//       duration: 0,
//       x: 50,
//       y: 80,
//       fontSize: 16,
//       color: '#ffffff'
//     };
//     setSubtitles(prev => [...prev, newSubtitle]);
//     setSelectedSubtitle(newSubtitle.id);
//   };

//   // 导出项目
//   const handleExport = () => {
//     const exportData: ExportData = {
//       videoTrack,
//       audioTrack,
//       bgmTrack,
//       subtitles,
//       subtitleTrack: null,
//       totalDuration
//     };
//     onExport?.(exportData);
//   };

//   // 视频时间更新
//   const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
//     setCurrentTime(e.currentTarget.currentTime);
//   };

//   // 视频加载完成
//   const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
//     setTotalDuration(e.currentTarget.duration);
//   };

//   // 初始化视频
//   useEffect(() => {
//     if (initialVideo && videoRef.current) {
//       videoRef.current.src = initialVideo;
//     }
//   }, [initialVideo]);

//   return (
//     <div className={cn("w-full h-full bg-gray-900 text-white flex flex-col", className)}>
//       {/* 顶部工具栏 */}
//       <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
//         <div className="flex items-center gap-2">
//           {/* 播放控制 */}
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={togglePlay}
//             className="text-white hover:bg-gray-700"
//           >
//             {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
//           </Button>
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={() => skipTime(-5)}
//             className="text-white hover:bg-gray-700"
//           >
//             <SkipBack className="w-4 h-4" />
//           </Button>
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={() => skipTime(5)}
//             className="text-white hover:bg-gray-700"
//           >
//             <SkipForward className="w-4 h-4" />
//           </Button>
          
//           {/* 音量控制 */}
//           <div className="flex items-center gap-2 ml-4">
//             <Volume2 className="w-4 h-4" />
//             <input
//               type="range"
//               min="0"
//               max="100"
//               value={volume}
//               onChange={handleVolumeChange}
//               className="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
//             />
//             <span className="text-xs text-gray-300 w-8">{volume}%</span>
//           </div>
//         </div>

//         <div className="flex items-center gap-2">
//           {/* 时间显示 */}
//           <span className="text-sm text-gray-300">
//             {formatTime(currentTime)} / {formatTime(totalDuration)}
//           </span>
          
//           {/* 缩放控制 */}
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={() => handleZoom('out')}
//             className="text-white hover:bg-gray-700"
//             title="缩小时间轴"
//           >
//             <ZoomOut className="w-4 h-4" />
//           </Button>
//           <span className="text-xs text-gray-400">{zoom.toFixed(1)}x</span>
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={() => handleZoom('in')}
//             className="text-white hover:bg-gray-700"
//             title="放大时间轴"
//           >
//             <ZoomIn className="w-4 h-4" />
//           </Button>
          
//           {/* 字幕控制 */}
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={addSubtitle}
//             className="text-white hover:bg-gray-700"
//             title="添加字幕"
//           >
//             <Type className="w-4 h-4" />
//           </Button>
          
//           {/* 导出 */}
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={handleExport}
//             className="text-white hover:bg-gray-700"
//             title="导出项目"
//           >
//             <Download className="w-4 h-4" />
//           </Button>
//         </div>
//       </div>

//       {/* 主要编辑区域 */}
//       <div className="flex-1 flex">
//         {/* 预览区域 */}
//         <div className="w-1/2 p-4 border-r border-gray-700">
//           <Card className="bg-black mb-4">
//             <CardContent className="p-0 relative">
//               <video
//                 ref={videoRef}
//                 className="w-full aspect-video bg-black"
//                 onTimeUpdate={handleTimeUpdate}
//                 onLoadedMetadata={handleLoadedMetadata}
//                 controls={false}
//               >
//                 您的浏览器不支持视频播放
//               </video>
              
//               {/* 字幕叠加 */}
//               {subtitles.map(subtitle => {
//                 if (currentTime >= subtitle.startTime && currentTime <= subtitle.endTime) {
//                   return (
//                     <div
//                       key={subtitle.id}
//                       className={cn(
//                         "absolute text-white font-bold cursor-pointer px-2 py-1 rounded bg-black/50",
//                         selectedSubtitle === subtitle.id && "ring-2 ring-blue-500"
//                       )}
//                       style={{
//                         left: `${subtitle.x}%`,
//                         top: `${subtitle.y}%`,
//                         transform: 'translate(-50%, -50%)',
//                         fontSize: `${subtitle.fontSize}px`,
//                         color: subtitle.color
//                       }}
//                       onClick={() => setSelectedSubtitle(subtitle.id)}
//                     >
//                       {subtitle.text}
//                     </div>
//                   );
//                 }
//                 return null;
//               })}
//             </CardContent>
//           </Card>
          
//           {/* 字幕编辑面板 */}
//           {selectedSubtitle && (
//             <Card className="bg-gray-800">
//               <CardContent className="p-4">
//                 <h3 className="text-sm font-medium mb-3">字幕编辑</h3>
//                 {subtitles.map(subtitle => {
//                   if (subtitle.id === selectedSubtitle) {
//                     return (
//                       <div key={subtitle.id} className="space-y-3">
//                         <input
//                           type="text"
//                           value={subtitle.text}
//                           onChange={(e) => {
//                             setSubtitles(prev => prev.map(s => 
//                               s.id === subtitle.id ? { ...s, text: e.target.value } : s
//                             ));
//                           }}
//                           className="w-full bg-gray-700 text-white p-2 rounded text-sm"
//                           placeholder="输入字幕文字"
//                         />
//                         <div className="grid grid-cols-2 gap-2">
//                           <div>
//                             <label className="text-xs text-gray-400">开始时间</label>
//                             <input
//                               type="number"
//                               value={subtitle.startTime.toFixed(1)}
//                               onChange={(e) => {
//                                 setSubtitles(prev => prev.map(s => 
//                                   s.id === subtitle.id ? { ...s, startTime: parseFloat(e.target.value) } : s
//                                 ));
//                               }}
//                               className="w-full bg-gray-700 text-white p-1 rounded text-xs"
//                               step="0.1"
//                             />
//                           </div>
//                           <div>
//                             <label className="text-xs text-gray-400">结束时间</label>
//                             <input
//                               type="number"
//                               value={subtitle.endTime.toFixed(1)}
//                               onChange={(e) => {
//                                 setSubtitles(prev => prev.map(s => 
//                                   s.id === subtitle.id ? { ...s, endTime: parseFloat(e.target.value) } : s
//                                 ));
//                               }}
//                               className="w-full bg-gray-700 text-white p-1 rounded text-xs"
//                               step="0.1"
//                             />
//                           </div>
//                         </div>
//                         <div className="flex gap-2">
//                           <Button
//                             variant="outline"
//                             size="sm"
//                             onClick={() => {
//                               setSubtitles(prev => prev.filter(s => s.id !== subtitle.id));
//                               setSelectedSubtitle(null);
//                             }}
//                             className="text-red-400 border-red-400 hover:bg-red-400 hover:text-white"
//                           >
//                             删除
//                           </Button>
//                         </div>
//                       </div>
//                     );
//                   }
//                   return null;
//                 })}
//               </CardContent>
//             </Card>
//           )}
//         </div>

//         {/* 时间轴和轨道区域 */}
//         <div className="w-1/2 flex flex-col">
//           {/* 时间轴 */}
//           <Timeline
//             currentTime={currentTime}
//             totalDuration={totalDuration}
//             zoom={zoom}
//             onTimeChange={setCurrentTime}
//           />

//           {/* 轨道区域 */}
//           <div className="flex-1 overflow-y-auto">
//             <Track
//               title="视频"
//               items={videoTrack}
//               onAddItem={() => addTrackItem('video')}
//               totalDuration={totalDuration}
//               zoom={zoom}
//               selectedItem={selectedItem}
//               onSelectItem={setSelectedItem}
//               onUpdateItem={(id, updates) => updateTrackItem('video', id, updates)}
//               onDeleteItem={(id) => deleteTrackItem('video', id)}
//             />
            
//             <Track
//               title="音频"
//               items={audioTrack}
//               onAddItem={() => addTrackItem('audio')}
//               totalDuration={totalDuration}
//               zoom={zoom}
//               selectedItem={selectedItem}
//               onSelectItem={setSelectedItem}
//               onUpdateItem={(id, updates) => updateTrackItem('audio', id, updates)}
//               onDeleteItem={(id) => deleteTrackItem('audio', id)}
//             />
            
//             <Track
//               title="背景音乐"
//               items={bgmTrack}
//               onAddItem={() => addTrackItem('bgm')}
//               totalDuration={totalDuration}
//               zoom={zoom}
//               selectedItem={selectedItem}
//               onSelectItem={setSelectedItem}
//               onUpdateItem={(id, updates) => updateTrackItem('bgm', id, updates)}
//               onDeleteItem={(id) => deleteTrackItem('bgm', id)}
//             />
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default VideoEditor;
