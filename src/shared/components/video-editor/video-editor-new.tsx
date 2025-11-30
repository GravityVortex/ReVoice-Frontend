"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Download, ZoomIn, ZoomOut, Type, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { Timeline } from './timeline';
import { Track } from './track-new';
import { SubtitleTrack } from './subtitle-track';
import { TrackItem, SubtitleTrackItem, VideoEditorProps, ExportData } from './types';

export function VideoEditor({ className, onExport, initialVideo }: VideoEditorProps) {
  // 基础状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60);
  const [zoom, setZoom] = useState(1);
  const [volume, setVolume] = useState(80);
  
  // 四轨道数据
  const [videoTrack, setVideoTrack] = useState<TrackItem[]>([]);
  const [audioTrack, setAudioTrack] = useState<TrackItem[]>([]);
  const [bgmTrack, setBgmTrack] = useState<TrackItem[]>([]);
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrackItem[]>([]);
  
  // 选中状态
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);
  
  // 字幕编辑状态
  const [editingSubtitle, setEditingSubtitle] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // 引用
  const videoRef = useRef<HTMLVideoElement>(null);

  // 时间格式化
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 播放控制 - 播放视频轨道中的第一个视频
  const togglePlay = async () => {
    if (!videoRef.current) return;
    
    // 检查是否有视频轨道
    if (videoTrack.length === 0) {
      alert('请先添加视频到视频轨道');
      return;
    }
    
    try {
      const firstVideo = videoTrack[0];
      
      // 如果当前没有视频源或视频源不匹配，重新设置
      if (!videoRef.current.src || !videoRef.current.src.includes(firstVideo.url)) {
        console.log('设置视频源:', firstVideo.url);
        videoRef.current.src = firstVideo.url;
        
        // 等待视频元数据加载
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('视频加载超时'));
          }, 10000); // 10秒超时
          
          videoRef.current!.onloadedmetadata = () => {
            clearTimeout(timeout);
            console.log('视频元数据加载完成');
            resolve(true);
          };
          
          videoRef.current!.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('视频加载失败'));
          };
          
          // 强制加载
          videoRef.current!.load();
        });
      }
      
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        console.log('开始播放视频');
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('播放失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`播放失败: ${errorMessage}`);
      setIsPlaying(false);
    }
  };

  // 跳转控制
  const skipTime = (seconds: number) => {
    const newTime = Math.max(0, Math.min(currentTime + seconds, totalDuration));
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // 缩放控制
  const handleZoom = (direction: 'in' | 'out') => {
    setZoom(prev => {
      const newZoom = direction === 'in' ? prev * 1.5 : prev / 1.5;
      return Math.max(0.5, Math.min(newZoom, 5));
    });
  };

  // 音量控制
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume / 100;
    }
  };

  // 添加轨道项目
  const addTrackItem = (type: 'video' | 'audio' | 'bgm') => {
    const input = document.createElement('input');
    input.type = 'file';
    // 指定支持的视频和音频格式
    input.accept = type === 'video' 
      ? 'video/mp4,video/webm,video/ogg,video/avi,video/mov,video/wmv' 
      : 'audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log('选择的文件:', file.name, '类型:', file.type, '大小:', file.size);
        
        // 验证文件类型
        const isValidVideo = type === 'video' && file.type.startsWith('video/');
        const isValidAudio = (type === 'audio' || type === 'bgm') && file.type.startsWith('audio/');
        
        if (!isValidVideo && !isValidAudio) {
          alert(`请选择正确的${type === 'video' ? '视频' : '音频'}文件格式`);
          return;
        }
        
        const url = URL.createObjectURL(file);
        console.log('创建的URL:', url);
        
        // 对于音频文件，先立即添加到轨道，然后尝试获取真实时长
        if (type === 'audio' || type === 'bgm') {
          // 先获取音频真实时长，然后根据时间轴比例计算宽度插入
          const mediaElement = document.createElement('audio');
          mediaElement.src = url;
          mediaElement.preload = 'metadata';
          
          mediaElement.onloadedmetadata = () => {
            const realDuration = mediaElement.duration && mediaElement.duration > 0 ? mediaElement.duration : 30;
            
            const newItem: TrackItem = {
              id: Date.now().toString(),
              type,
              name: file.name,
              url,
              startTime: currentTime, // 以红色刻度线为起始点
              duration: realDuration, // 使用真实音频长度
              volume: 80
            };

            // 计算音频/BGM元素在当前比例尺下的显示宽度
            const currentZoom = zoom; // 当前比例尺（默认1.0）
            const elementWidthPercent = (realDuration / maxTrackWidth) * 100;
            const actualDisplayWidth = elementWidthPercent * currentZoom;
            
            console.log(`添加${type}项目 - 比例尺: ${currentZoom}, 时长: ${realDuration}s, 轨道总长: ${maxTrackWidth}s`);
            console.log(`计算宽度: ${elementWidthPercent.toFixed(2)}% (基础) × ${currentZoom} (比例尺) = ${actualDisplayWidth.toFixed(2)}% (实际显示)`);
            console.log(`${type}项目详情:`, newItem);

            // 检查是否需要扩展时间轴最大宽度（严格保持zoom比例尺不变）
            const itemEndTime = newItem.startTime + newItem.duration;
            if (itemEndTime > maxTrackWidth) {
              // 扩充时间轴最大宽度到下一个10秒倍数
              const newMaxWidth = Math.ceil(itemEndTime / 10) * 10;
              console.log(`${type}超出轨道宽度，扩充时间轴最大宽度: ${maxTrackWidth} -> ${newMaxWidth}`);
              console.log(`重要：zoom比例尺保持不变 (${zoom})，只扩展显示范围`);
              // 注意：这里不修改zoom和totalDuration，只让maxTrackWidth自动重新计算
            }

            if (type === 'audio') {
              setAudioTrack(prev => {
                const newTrack = [...prev, newItem];
                console.log('音频轨道更新:', newTrack);
                return newTrack;
              });
            } else if (type === 'bgm') {
              setBgmTrack(prev => {
                const newTrack = [...prev, newItem];
                console.log('背景音乐轨道更新:', newTrack);
                return newTrack;
              });
            }
          };

          mediaElement.onerror = () => {
            console.error(`无法加载${type}文件:`, file.name);
            // 如果加载失败，使用默认30秒时长
            const fallbackItem: TrackItem = {
              id: Date.now().toString(),
              type,
              name: file.name,
              url,
              startTime: currentTime,
              duration: 30,
              volume: 80
            };

            if (type === 'audio') {
              setAudioTrack(prev => [...prev, fallbackItem]);
            } else if (type === 'bgm') {
              setBgmTrack(prev => [...prev, fallbackItem]);
            }
          };

          return; // 对于音频文件，直接返回，不执行下面的视频处理逻辑
        }
        
        // 视频文件处理逻辑
        const mediaElement = document.createElement('video');
        mediaElement.src = url;
        
        // 视频文件加载处理
        const handleVideoLoaded = () => {
          const videoDuration = mediaElement.duration || 10;
          console.log(`视频文件加载完成:`, file.name, '时长:', videoDuration);
          
          const newItem: TrackItem = {
            id: Date.now().toString(),
            type: 'video',
            name: file.name,
            url,
            startTime: currentTime, // 以红色刻度线为起始点
            duration: videoDuration, // 使用真实视频长度
            volume: 80
          };

          // 计算视频元素在当前比例尺下的显示宽度
          const currentZoom = zoom; // 当前比例尺（默认1.0）
          const elementWidthPercent = (videoDuration / maxTrackWidth) * 100;
          const actualDisplayWidth = elementWidthPercent * currentZoom;
          
          console.log(`添加视频项目 - 比例尺: ${currentZoom}, 视频时长: ${videoDuration}s, 轨道总长: ${maxTrackWidth}s`);
          console.log(`计算宽度: ${elementWidthPercent.toFixed(2)}% (基础) × ${currentZoom} (比例尺) = ${actualDisplayWidth.toFixed(2)}% (实际显示)`);
          console.log(`视频项目详情:`, newItem);

          // 检查是否需要扩充时间轴最大宽度（严格保持zoom比例尺不变）
          const itemEndTime = newItem.startTime + newItem.duration;
          if (itemEndTime > maxTrackWidth) {
            // 扩充时间轴最大宽度到下一个10秒倍数
            const newMaxWidth = Math.ceil(itemEndTime / 10) * 10;
            console.log(`视频超出轨道宽度，扩充时间轴最大宽度: ${maxTrackWidth} -> ${newMaxWidth}`);
            console.log(`重要：zoom比例尺保持不变 (${zoom})，只扩展显示范围`);
            // 注意：这里不修改zoom和totalDuration，只让maxTrackWidth自动重新计算
            // 视频元素宽度 = (视频时长 / 轨道总长) × 100% × zoom比例尺
          }

          setVideoTrack(prev => {
            const newTrack = [...prev, newItem];
            console.log('视频轨道更新:', newTrack);
            
            // 如果是第一个视频，设置为主视频
            if (prev.length === 0 && videoRef.current) {
              console.log('设置主视频:', url);
              videoRef.current.src = url;
              // 预加载视频
              videoRef.current.load();
            }
            
            return newTrack;
          });
          
          // 清理事件监听器
          mediaElement.removeEventListener('loadedmetadata', handleVideoLoaded);
          mediaElement.removeEventListener('canplaythrough', handleVideoLoaded);
          mediaElement.removeEventListener('loadeddata', handleVideoLoaded);
        };

        const handleMediaError = (error: Event) => {
          console.error('媒体文件加载失败:', file.name, error);
          alert(`文件加载失败: ${file.name}`);
          URL.revokeObjectURL(url);
          
          // 清理事件监听器
          mediaElement.removeEventListener('error', handleMediaError);
        };
        
        // 为视频文件添加事件监听器
        mediaElement.addEventListener('loadedmetadata', handleVideoLoaded);
        mediaElement.addEventListener('canplaythrough', handleVideoLoaded);
        mediaElement.addEventListener('loadeddata', handleVideoLoaded);
        mediaElement.addEventListener('error', handleMediaError);
        
        // 强制加载视频
        mediaElement.load();
      }
    };
    
    input.click();
  };

  // 更新轨道项目
  const updateTrackItem = (trackType: 'video' | 'audio' | 'bgm', id: string, updates: Partial<TrackItem>) => {
    const updateItem = (prev: TrackItem[]) => {
      return prev.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, ...updates };
          
          // 如果更新了位置或时长，检查是否需要扩展时间轴
          if (updates.startTime !== undefined || updates.duration !== undefined) {
            const itemEndTime = updatedItem.startTime + updatedItem.duration;
            expandTimelineIfNeeded(itemEndTime);
          }
          
          return updatedItem;
        }
        return item;
      });
    };

    switch (trackType) {
      case 'video':
        setVideoTrack(updateItem);
        break;
      case 'audio':
        setAudioTrack(updateItem);
        break;
      case 'bgm':
        setBgmTrack(updateItem);
        break;
    }
  };

  // 删除轨道项目
  const deleteTrackItem = (trackType: 'video' | 'audio' | 'bgm', id: string) => {
    switch (trackType) {
      case 'video':
        setVideoTrack(prev => prev.filter(item => item.id !== id));
        break;
      case 'audio':
        setAudioTrack(prev => prev.filter(item => item.id !== id));
        break;
      case 'bgm':
        setBgmTrack(prev => prev.filter(item => item.id !== id));
        break;
    }
  };

  // 添加字幕
  const addSubtitle = () => {
    const newSubtitle: SubtitleTrackItem = {
      id: Date.now().toString(),
      type: 'video', // 字幕类型设为video以复用TrackItem接口
      name: '新字幕',
      startTime: currentTime, // 使用时间轴红线位置作为起始位置
      duration: 2, // 默认2秒
      text: '新字幕',
      fontSize: 16,
      color: '#ffffff'
    };
    
    console.log('添加字幕项目:', newSubtitle);
    
    setSubtitleTrack(prev => {
      const newTrack = [...prev, newSubtitle];
      console.log('字幕轨道更新:', newTrack);
      
      // 检查是否需要扩展时间轴
      const itemEndTime = newSubtitle.startTime + newSubtitle.duration;
      expandTimelineIfNeeded(itemEndTime);
      
      return newTrack;
    });
    
    setSelectedSubtitle(newSubtitle.id);
  };

  // 更新字幕项目
  const updateSubtitleItem = (id: string, updates: Partial<SubtitleTrackItem>) => {
    setSubtitleTrack(prev => {
      return prev.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, ...updates };
          
          // 如果更新了位置或时长，检查是否需要扩展时间轴
          if (updates.startTime !== undefined || updates.duration !== undefined) {
            const itemEndTime = updatedItem.startTime + updatedItem.duration;
            expandTimelineIfNeeded(itemEndTime);
          }
          
          return updatedItem;
        }
        return item;
      });
    });
  };

  // 删除字幕项目
  const deleteSubtitleItem = (id: string) => {
    setSubtitleTrack(prev => prev.filter(item => item.id !== id));
    if (selectedSubtitle === id) {
      setSelectedSubtitle(null);
    }
  };

  // 导出项目
  const handleExport = () => {
    const exportData: ExportData = {
      videoTrack,
      audioTrack,
      bgmTrack,
      subtitleTrack,
      subtitles: null,
      totalDuration
    };
    onExport?.(exportData);
  };

  // 视频时间更新
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  // 视频加载完成
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    // setTotalDuration(e.currentTarget.duration);
  };

  // 时间轴点击处理
  const handleTimeChange = (newTime: number) => {
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // 初始化视频
  useEffect(() => {
    if (initialVideo && videoRef.current) {
      videoRef.current.src = initialVideo;
    }
  }, [initialVideo]);

  // 监听视频轨道变化，确保有视频时能正常播放
  useEffect(() => {
    if (videoTrack.length > 0 && videoRef.current) {
      const firstVideo = videoTrack[0];
      if (!videoRef.current.src || videoRef.current.src !== firstVideo.url) {
        videoRef.current.src = firstVideo.url;
        videoRef.current.load();
      }
    }
  }, [videoTrack]);

  // 计算最长轨道的实际宽度
  const calculateMaxTrackWidth = useCallback(() => {
    const allTracks = [
      ...videoTrack.map(item => item.startTime + item.duration),
      ...audioTrack.map(item => item.startTime + item.duration),
      ...bgmTrack.map(item => item.startTime + item.duration),
      ...subtitleTrack.map(item => item.startTime + item.duration)
    ];
    
    const maxContentTime = allTracks.length > 0 ? Math.max(...allTracks) : totalDuration;
    return Math.max(maxContentTime, totalDuration);
  }, [videoTrack, audioTrack, bgmTrack, subtitleTrack, totalDuration]);

  const maxTrackWidth = calculateMaxTrackWidth();

  // 智能扩展时间轴函数 - 不改变刻度比例，只记录日志
  const expandTimelineIfNeeded = useCallback((itemEndTime: number) => {
    if (itemEndTime > maxTrackWidth) {
      const newMaxWidth = Math.ceil(itemEndTime / 10) * 10; // 向上取整到10的倍数
      console.log('轨道内容扩展，最大宽度将自动计算:', maxTrackWidth, '->', newMaxWidth, '秒');
      // 注意：不直接修改totalDuration，maxTrackWidth会自动重新计算
      // 这样可以确保不改变时间轴刻度比例，只是扩充显示范围
    }
  }, [maxTrackWidth]);

  // 统一滚动功能 - 现在只有一个滚动容器
  useEffect(() => {
    const unifiedContainer = document.getElementById('unified-scroll-container');
    
    if (!unifiedContainer) return;
    
    // 添加CSS样式来隐藏滚动条
    const style = document.createElement('style');
    style.textContent = `
      #unified-scroll-container::-webkit-scrollbar {
        display: none;
      }
      .scrollbar-hide {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .scrollbar-hide::-webkit-scrollbar {
        display: none;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // 调试：监听各轨道变化，确保独立性
  useEffect(() => {
    console.log('轨道状态更新:');
    console.log('- 视频轨道:', videoTrack.length, '个项目');
    console.log('- 音频轨道:', audioTrack.length, '个项目');
    console.log('- 背景音乐轨道:', bgmTrack.length, '个项目');
    console.log('- 字幕轨道:', subtitleTrack.length, '个项目');
    console.log('- 当前时间轴长度:', totalDuration, '秒');
    console.log('- 最大内容宽度:', maxTrackWidth, '秒');
  }, [videoTrack, audioTrack, bgmTrack, subtitleTrack, totalDuration, maxTrackWidth]);

  return (
    <div className={cn("w-full h-screen bg-gray-900 text-white flex flex-col overflow-hidden", className)}>
      {/* 视频预览区域 - 占据更多空间 */}
      <div className="flex-1 p-4 min-h-0">
        <Card className="bg-black h-full">
          <CardContent className="p-0 relative h-full">
            <video
              ref={videoRef}
              className="w-full h-full bg-black object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              controls={false}
            >
              您的浏览器不支持视频播放
            </video>
            
            {/* 字幕叠加显示 */}
            {subtitleTrack.map(subtitle => {
              const endTime = subtitle.startTime + subtitle.duration;
              if (currentTime >= subtitle.startTime && currentTime <= endTime) {
                const isEditing = editingSubtitle === subtitle.id;
                
                return (
                  <div
                    key={subtitle.id}
                    className={cn(
                      "absolute cursor-pointer px-3 py-1 rounded backdrop-blur-sm transition-all duration-200",
                      selectedSubtitle === subtitle.id && "ring-2 ring-yellow-400",
                      isEditing ? "bg-black/90" : "bg-black/70"
                    )}
                    style={{
                      left: '50%',
                      bottom: '10%',
                      transform: 'translateX(-50%)',
                      fontSize: `${subtitle.fontSize || 16}px`,
                      color: subtitle.color || '#ffffff'
                    }}
                    onClick={() => setSelectedSubtitle(subtitle.id)}
                    onDoubleClick={() => {
                      if (!isEditing) {
                        setEditingSubtitle(subtitle.id);
                        setEditingText(subtitle.text);
                      }
                    }}
                    title="单击选择，双击编辑字幕内容"
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={() => {
                          if (editingText.trim() !== '') {
                            updateSubtitleItem(subtitle.id, { text: editingText.trim() });
                          }
                          setEditingSubtitle(null);
                          setEditingText('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (editingText.trim() !== '') {
                              updateSubtitleItem(subtitle.id, { text: editingText.trim() });
                            }
                            setEditingSubtitle(null);
                            setEditingText('');
                          } else if (e.key === 'Escape') {
                            setEditingSubtitle(null);
                            setEditingText('');
                          }
                        }}
                        autoFocus
                        className="bg-transparent border-none outline-none text-white font-bold drop-shadow-lg"
                        style={{
                          fontSize: 'inherit',
                          color: 'inherit',
                          width: `${Math.max(editingText.length * 0.6, 4)}em`
                        }}
                      />
                    ) : (
                      <span className="font-bold text-white drop-shadow-lg">
                        {subtitle.text}
                      </span>
                    )}
                  </div>
                );
              }
              return null;
            })}
            
            {/* 如果没有视频，显示提示 */}
            {videoTrack.length === 0 && (
              <div className="absolute top-1/3 bottom-1/3 inset-0 flex items-center justify-center text-gray-400 text-lg">
                请在视频轨道中添加视频文件
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 综合控制栏 - 包含所有功能 */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          {/* 播放控制组 */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlay}
              className="text-white hover:bg-gray-700"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => skipTime(-5)}
              className="text-white hover:bg-gray-700"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => skipTime(5)}
              className="text-white hover:bg-gray-700"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          {/* 分隔线 */}
          <div className="w-px h-6 bg-gray-600"></div>

          {/* 音量控制组 */}
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-thumb"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume}%, #4b5563 ${volume}%, #4b5563 100%)`
              }}
            />
            <span className="text-xs text-gray-300 w-8">{volume}%</span>
          </div>

          {/* 分隔线 */}
          <div className="w-px h-6 bg-gray-600"></div>

          {/* 时间显示 */}
          <span className="text-sm text-gray-300">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 缩放控制组 */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleZoom('out')}
              className="text-white hover:bg-gray-700"
              title="缩小时间轴"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-gray-400 min-w-[32px] text-center">{zoom.toFixed(1)}x</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleZoom('in')}
              className="text-white hover:bg-gray-700"
              title="放大时间轴"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          {/* 分隔线 */}
          <div className="w-px h-6 bg-gray-600"></div>

          {/* 编辑工具组 */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={addSubtitle}
              className="text-white hover:bg-gray-700"
              title="添加字幕"
            >
              <Type className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="text-white hover:bg-gray-700"
              title="导出项目"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 底部四轨制编辑区域 - 固定高度，底部对齐 */}
      <div className="h-80 flex flex-col bg-gray-850 shrink-0 relative" style={{ zIndex: 10 }}>
        {/* 统一滚动布局：左侧固定标签，右侧整体滚动内容 */}
        <div className="flex-1 flex">
          {/* 左侧固定标签区域 - 包含时间轴标签和轨道标签 */}
          <div className="w-32 flex flex-col bg-gray-750 border-r border-gray-700 shrink-0">
            {/* 时间轴标签 */}
            <div className="h-12 flex items-center justify-center border-b border-gray-700">
              <span className="text-xs text-gray-400 font-medium">时间轴</span>
            </div>
              {/* 字幕轨道标签 */}
              <div className="h-16 flex items-center justify-between px-3 bg-gray-750 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">字幕</span>
                  <Type className="w-3 h-3 text-gray-400" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addSubtitle}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title="添加字幕"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>

              {/* 视频轨道标签 */}
              <div className="h-16 flex items-center justify-between px-3 bg-gray-750 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">视频</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTrackItem('video')}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title="添加视频"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>

              {/* 音频轨道标签 */}
              <div className="h-16 flex items-center justify-between px-3 bg-gray-750 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">音频</span>
                  <Volume2 className="w-3 h-3 text-gray-400" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTrackItem('audio')}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title="添加音频"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>

              {/* 背景音乐轨道标签 */}
              <div className="h-16 flex items-center justify-between px-3 bg-gray-750 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">背景音乐</span>
                  <Volume2 className="w-3 h-3 text-gray-400" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTrackItem('bgm')}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title="添加背景音乐"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>

          {/* 右侧统一滚动内容区域 - 隐藏滚动条 */}
          <div 
            className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide"
            id="unified-scroll-container"
            style={{
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none'  /* IE and Edge */
            }}
          >
            <div 
              className="flex flex-col"
              style={{ 
                width: `${Math.max((maxTrackWidth / totalDuration) * 100 * zoom, 100)}%`,
                minWidth: '100%'
              }}
            >
              {/* 时间轴内容 */}
              <div className="h-12 bg-gray-850 relative">
                <Timeline
                  currentTime={currentTime}
                  totalDuration={maxTrackWidth}
                  zoom={zoom}
                  onTimeChange={handleTimeChange}
                  hideLeftLabel={true}
                />
              </div>
              
              {/* 字幕轨道内容 */}
              <SubtitleTrack
                items={subtitleTrack}
                onAddItem={addSubtitle}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                selectedItem={selectedSubtitle || undefined}
                onSelectItem={setSelectedSubtitle}
                onUpdateItem={updateSubtitleItem}
                onDeleteItem={deleteSubtitleItem}
                hideLabel={true}
              />
              
              {/* 视频轨道内容 */}
              <Track
                title="视频"
                items={videoTrack}
                onAddItem={() => addTrackItem('video')}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                selectedItem={selectedItem || undefined}
                onSelectItem={setSelectedItem}
                onUpdateItem={(id, updates) => updateTrackItem('video', id, updates)}
                onDeleteItem={(id) => deleteTrackItem('video', id)}
                hideLabel={true}
              />
              
              {/* 音频轨道内容 */}
              <Track
                title="音频"
                items={audioTrack}
                onAddItem={() => addTrackItem('audio')}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                selectedItem={selectedItem || undefined}
                onSelectItem={setSelectedItem}
                onUpdateItem={(id, updates) => updateTrackItem('audio', id, updates)}
                onDeleteItem={(id) => deleteTrackItem('audio', id)}
                hideLabel={true}
              />
              
              {/* 背景音乐轨道内容 */}
              <Track
                title="背景音乐"
                items={bgmTrack}
                onAddItem={() => addTrackItem('bgm')}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                selectedItem={selectedItem || undefined}
                onSelectItem={setSelectedItem}
                onUpdateItem={(id, updates) => updateTrackItem('bgm', id, updates)}
                onDeleteItem={(id) => deleteTrackItem('bgm', id)}
                hideLabel={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoEditor;
