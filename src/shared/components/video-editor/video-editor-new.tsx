"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Download, ZoomIn, ZoomOut, Type, Plus, Eye, EyeOff, Video, FoldHorizontal, FlipVertical } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { Timeline } from './timeline';
import { Track } from './track-new';
import { SubtitleTrack } from './subtitle-track';
import { TrackItem, SubtitleTrackItem, VideoEditorProps, ExportData } from './types';
import { loadSrtViaProxy } from '@/shared/lib/srt-parser';
import { toast } from 'sonner';


export function VideoEditor({ className, onExport, initialVideo, convertObj, onPlayingSubtitleChange, onSeekToTime }: VideoEditorProps) {
  // 基础状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(convertObj?.processDurationSeconds || 60);
  const [zoom, setZoom] = useState(1);
  const [volume, setVolume] = useState(80);

  // 四轨道数据
  const [videoTrack, setVideoTrack] = useState<TrackItem[]>([]);
  // const [audioTrack, setAudioTrack] = useState<TrackItem[]>([]);
  const [bgmTrack, setBgmTrack] = useState<TrackItem[]>([]);
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrackItem[]>([]);

  // 选中状态
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);

  // 字幕编辑状态
  const [editingSubtitle, setEditingSubtitle] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // 静音状态
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isSubtitleMuted, setIsSubtitleMuted] = useState(false);
  // 字幕音频轨道静音
  const isSubtitleMutedRef = useRef(false);

  // 当前播放的字幕索引
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number>(-1);
  const [isVideoTextShow, setIsVideoTextShow] = useState(true);
  // 播放指针可见跟随
  const [isPointerBarFollow, setIsPointerBarFollow] = useState(true);
  // 是否正在拖拽时间轴指针
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  // 红指针拖拽结束，和时间轴点击后重新定位后，播放需要加载第一条字幕音频
  const [needLoadFirstAudio, setNeedLoadFirstAudio] = useState(true);

  // 引用
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgmAudioRef = useRef<HTMLAudioElement>(null);
  const subtitleAudioRef = useRef<HTMLAudioElement>(null);
  const subtitleAudio2Ref = useRef<HTMLAudioElement>(null);
  const subtitleAudio3Ref = useRef<HTMLAudioElement>(null);
  const subtitleAudio4Ref = useRef<HTMLAudioElement>(null);
  const subtitleAudio5Ref = useRef<HTMLAudioElement>(null);
  const audioRefArr = [subtitleAudioRef, subtitleAudio2Ref, subtitleAudio3Ref, subtitleAudio4Ref, subtitleAudio5Ref];
  // 拖动红指针专用
  const isAudioRefArrPause = useRef(false);


  // 缓存当前时间
  const curTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const audioPlayPromiseRef = useRef<Promise<void> | null>(null);
  const lastPlayedSubtitleIndexRef = useRef<number>(-1);

  // 时间格式化
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 将SRT时间格式转换为秒（格式: HH:MM:SS,mmm 如 00:00:08,439 = 8.439秒）
  const parseTimeToSeconds = (timeStr: string): number => {
    // 分割时:分:秒
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    // 处理秒和毫秒部分（用逗号或点号分隔）
    let seconds = 0;
    let milliseconds = 0;

    if (parts[2].includes(',')) {
      // 标准SRT格式: SS,mmm
      const [sec, ms] = parts[2].split(',');
      seconds = parseInt(sec, 10);
      milliseconds = parseInt(ms, 10);
    } else if (parts[2].includes('.')) {
      // 点号格式: SS.mmm
      const [sec, ms] = parts[2].split('.');
      seconds = parseInt(sec, 10);
      milliseconds = parseInt(ms, 10);
    } else {
      // 只有秒，没有毫秒
      seconds = parseInt(parts[2], 10);
    }

    // 转换为总秒数
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  };

  // 播放控制 - 同步播放视频、背景音乐和字幕音频
  const togglePlay = async () => {
    if (!videoRef.current) return;

    // 检查是否有视频轨道
    if (videoTrack.length === 0) {
      // alert('请先添加视频到视频轨道');
      toast.error('请先添加视频到视频轨道');
      return;
    }

    try {
      if (isPlaying) {
        // 暂停所有轨道
        videoRef.current.pause();
        if (bgmAudioRef.current && !isBgmMuted) {
          bgmAudioRef.current.pause();
        }
        for (let i = 0; i < audioRefArr.length; i++) {
          const audioRef = audioRefArr[i];
          //  && !isSubtitleMuted
          if (audioRef.current) {
            audioRef.current.pause();
          }
        }
        // 停止 RAF 循环
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setIsPlaying(false);
      } else {
        // 播放所有轨道
        const firstVideo = videoTrack[0];

        // 如果当前没有视频源或视频源不匹配，重新设置
        if (!videoRef.current.src || !videoRef.current.src.includes(firstVideo.url)) {
          console.log('设置视频源:', firstVideo.url);
          videoRef.current.src = firstVideo.url;
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('视频加载超时')), 10000);
            videoRef.current!.onloadedmetadata = () => {
              clearTimeout(timeout);
              resolve(true);
            };
            videoRef.current!.onerror = () => {
              clearTimeout(timeout);
              reject(new Error('视频加载失败'));
            };
            videoRef.current!.load();
          });
        }

        // 同步播放视频
        await videoRef.current.play();

        // 同步播放背景音乐
        if (bgmAudioRef.current && bgmTrack.length > 0 && !isBgmMuted) {
          bgmAudioRef.current.currentTime = currentTime;
          bgmAudioRef.current.play().catch(err => console.error('背景音乐播放失败:', err));
        }

        // 清空字幕音频播放Promise和索引
        audioPlayPromiseRef.current = null;
        lastPlayedSubtitleIndexRef.current = -1;

        // 启动 RAF 循环
        rafIdRef.current = requestAnimationFrame(updateTimeWithRAF);

        setIsPlaying(true);
      }
    } catch (error) {
      console.error('播放失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      // alert(`播放失败: ${errorMessage}`);
      toast.error(`播放失败: ${errorMessage}`);
      setIsPlaying(false);
    }
  };

  // 计算最长轨道的实际宽度
  const calculateMaxTrackWidth = useCallback(() => {
    const allTracks = [
      ...videoTrack.map(item => item.startTime + item.duration),
      // ...audioTrack.map(item => item.startTime + item.duration),
      ...bgmTrack.map(item => item.startTime + item.duration),
      ...subtitleTrack.map(item => item.startTime + item.duration)
    ];
    // console.log('allTracks-->', allTracks);

    const maxContentTime = allTracks.length > 0 ? Math.max(...allTracks) : totalDuration;
    return Math.max(maxContentTime, totalDuration);
  }, [videoTrack, bgmTrack, subtitleTrack, totalDuration]);// audioTrack, 

  const maxTrackWidth = calculateMaxTrackWidth();

  // 跳转控制
  const skipTime = (seconds: number) => {
    const newTime = Math.max(0, Math.min(currentTime + seconds, totalDuration));
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }

    // 显示红指针位置
    scrollPointerVisible();
  };

  // 缩放控制
  const handleZoom = (direction: 'in' | 'out') => {
    setZoom(prev => {
      const newZoom = direction === 'in' ? prev * 1.5 : prev / 1.5;
      const finalZoom = Math.max(0.5, Math.min(newZoom, 5));

      // 显示红指针位置
      scrollPointerVisible();

      return finalZoom;
    });
  };

  // 显示红指针位置
  const scrollPointerVisible = useCallback((curTime = currentTime) => {
    // 缩放后将红色指针滚动到可见范围
    setTimeout(() => {
      const scrollContainer = document.getElementById('unified-scroll-container');
      if (!scrollContainer) return;

      const containerWidth = scrollContainer.clientWidth;
      const contentWidth = scrollContainer.scrollWidth;
      const pointerPercent = (curTime / maxTrackWidth) * 100;
      const pointerLeft = (pointerPercent / 100) * contentWidth;
      console.log('scrollPointerVisible--curTime--->', curTime, 'pointerLeft:', pointerLeft, 'containerWidth:', containerWidth, 'contentWidth:', contentWidth, 'maxWidth:', maxTrackWidth);

      const scrollLeft = scrollContainer.scrollLeft;
      const scrollRight = scrollLeft + containerWidth;
      const padding = 50;

      if (pointerLeft < scrollLeft + padding || pointerLeft > scrollRight - padding) {
        scrollContainer.scrollLeft = Math.max(0, pointerLeft - containerWidth / 2);
        // 带动画的滚动（可选）
        scrollContainer.scrollTo({
          left: Math.max(0, pointerLeft - containerWidth / 2),
          behavior: 'smooth'
        });
      }
    }, 10);
  }, [currentTime, maxTrackWidth]);

  // 音量控制
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    console.log('新音量--->', newVolume);
    setVolume(newVolume);
    const bi = newVolume / 100;
    if (videoRef.current) {
      videoRef.current.volume = bi;
    }
    // 5个字幕音频音量统一调整
    for (let i = 0; i < audioRefArr.length; i++) {
      const audioRef = audioRefArr[i];
      if (audioRef.current) {
        audioRef.current.volume = bi;
      }
    }
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = bi;
    }
  };


  // 视频上的字幕是否显示开关
  const toggleVideoTextClick = () => {
    setIsVideoTextShow(!isVideoTextShow);
  };
  // 播放指针可见跟随
  const togglePointerBarFollow = () => {
    setIsPointerBarFollow(!isPointerBarFollow);
    !isPointerBarFollow && toast.info('播放指针可见跟随');
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
      // audioTrack,
      bgmTrack,
      subtitleTrack,
      subtitles: null,
      totalDuration
    };
    onExport?.(exportData);
    toast.info('开发中，敬请期待！');
  };


  /**
   * 逐帧回调，通常60次/秒（16.67ms）根据newTime时间切换播放字幕语音
   * @param newTime 当前时间 10.332秒
   */
  const doUpdateAudioPlayPause = useCallback((newTime: number) => {
    // console.log('doUpdateAudioPlayPause isSubtitleMuted---->', isSubtitleMutedRef.current);
    // 查找当前时间对应的字幕，拖拽红指针过程中禁用掉所有播放
    if (subtitleTrack.length > 0 && !isSubtitleMutedRef.current && !isAudioRefArrPause.current) {
      const currentSubtitleIndex = subtitleTrack.findIndex(subtitle => {
        const endTime = subtitle.startTime + subtitle.duration;
        // 单位是秒
        return newTime >= (subtitle.startTime - 0.1) && newTime < endTime;
      });

      // 如果字幕索引发生变化，播放新的字幕音频
      // 关键：使用 ref 而不是 state 来判断，避免异步状态更新导致的重复触发
      if (currentSubtitleIndex !== -1 && currentSubtitleIndex !== lastPlayedSubtitleIndexRef.current) {
        // console.log('updateTimeWithRAF---currentSubtitleIndex---->', currentSubtitleIndex, 'newTime:', newTime);

        // 立即更新 ref，防止下一帧重复触发
        lastPlayedSubtitleIndexRef.current = currentSubtitleIndex;
        setPlayingSubtitleIndex(currentSubtitleIndex);

        const subtitleCur = subtitleTrack[currentSubtitleIndex];
        const subtitleNext = subtitleTrack[currentSubtitleIndex + 1];
        // cha最小值为0
        let cha = newTime - subtitleCur.startTime;
        let offset = cha >= 0 ? cha : 0;
        console.log('currentTime--->', newTime, 'offset-->', offset);
        console.log('字幕开始------>', subtitleCur?.startTime,
          'duration:', subtitleCur?.duration,
          'endTime', subtitleCur?.startTime + subtitleCur?.duration,
          'text:', subtitleCur?.text
        );
        // 5个audio交替播放逻辑
        // 0: audio1播放0, audio2预加载1
        // 1: audio2播放1, audio3预加载2
        // 2: audio3播放2, audio4预加载3
        // 3: audio4播放3, audio5预加载4
        // 4: audio5播放4, audio1预加载5
        // 5: audio1播放5, audio2预加载6

        const audioRefs = [subtitleAudioRef, subtitleAudio2Ref, subtitleAudio3Ref, subtitleAudio4Ref, subtitleAudio5Ref];
        const audioIndex = currentSubtitleIndex % 5;
        const nextAudioIndex = (currentSubtitleIndex + 1) % 5;

        const audio = audioRefs[audioIndex].current;
        // 播放当前字幕音频
        if (subtitleCur?.audioUrl && audio) {
          // 第一条需要先加载，红指针拖拽结束，和时间轴点击后重新定位后，播放需要加载第一条字幕音频
          if (currentSubtitleIndex === 0 || needLoadFirstAudio) {
            audio.src = subtitleCur.audioUrl;
            audio.load();
          }
          // 每段语音从指定偏移开始播放
          audio.currentTime = offset;
          audioPlayPromiseRef.current = audio.play().catch(err => {
            console.error('字幕音频播放失败:', err);
          });
        }

        // 预加载下一条字幕音频
        if (subtitleNext?.audioUrl && audioRefs[nextAudioIndex].current) {
          // console.warn(`audio${nextAudioIndex}预加载下一条字幕音频--curAudioIndex--->${audioIndex}`, subtitleNext.text);
          console.warn('audioIndex->', audioIndex, 'nextAudioIndex预加载下一条字幕音频-->', nextAudioIndex, 'text->', subtitleNext.text);
          audioRefs[nextAudioIndex].current.pause();
          audioRefs[nextAudioIndex].current.src = subtitleNext.audioUrl;
          audioRefs[nextAudioIndex].current.load();
        }
        // 右侧面板滚动到响应字幕位置
        onPlayingSubtitleChange?.(currentSubtitleIndex);

      } else if (currentSubtitleIndex === -1 && lastPlayedSubtitleIndexRef.current !== -1) {
        // 当前没有字幕，停止播放
        lastPlayedSubtitleIndexRef.current = -1;
        // if (subtitleAudioRef.current) {
        //   subtitleAudioRef.current.pause();
        // }
        // if (subtitleAudio2Ref.current) {
        //   subtitleAudio2Ref.current.pause();
        // }
        // if (subtitleAudio3Ref.current) {
        //   subtitleAudio3Ref.current.pause();
        // }
        audioPlayPromiseRef.current = null;
        setPlayingSubtitleIndex(-1);
        onPlayingSubtitleChange?.(-1);
      }
    }
  }, [subtitleTrack, onPlayingSubtitleChange, needLoadFirstAudio]);

  /**
   * 250秒左右一次回调，视频时间更新 - 同时处理字幕音频播放
   * @param e 
   */
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const newTime = e.currentTarget.currentTime;
    setCurrentTime(newTime);
  };


  // 使用 requestAnimationFrame 更新时间 - 更精确的同步
  const updateTimeWithRAF = useCallback(() => {
    if (!videoRef.current) return;
    if (isTimelineDragging) return;

    const newTime = videoRef.current.currentTime;
    // console.log('updateTimeWithRAF Current time---->', newTime);
    // setCurrentTime(newTime);
    // if(true) return;
    doUpdateAudioPlayPause(newTime);

    // 继续下一帧
    if (videoRef.current && !videoRef.current.paused) {
      rafIdRef.current = requestAnimationFrame(updateTimeWithRAF);
    }
  }, [subtitleTrack, onPlayingSubtitleChange]);

  // 监听播放状态，启动或停止 RAF
  useEffect(() => {
    if (isPlaying && videoRef.current && !videoRef.current.paused) {
      rafIdRef.current = requestAnimationFrame(updateTimeWithRAF);
    }
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [isPlaying, updateTimeWithRAF]);

  // 视频加载完成
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    console.log('video--视频加载完成--->', e.currentTarget.duration);
    setTotalDuration(e.currentTarget.duration);
    // setTotalDuration(60);

    // 更新视频轨道长度
    let temp: TrackItem = {
      ...videoTrack[0],
      duration: e.currentTarget.duration,
    }
    setVideoTrack([temp]);

    // 更新背景音乐轨道长度
    let temp2: TrackItem = {
      ...bgmTrack[0],
      duration: e.currentTarget.duration,
    }
    setBgmTrack([temp2]);
  };

  /**
   * 回调事件【红指针点击时间轴切换时间事件】
   * @param newTime 时间轴点最新时间
   */
  const handleTimeLineClick = (newTime: number) => {
    console.log('handleTimeLineClick--->', newTime);
    setCurrentTime(newTime);
    // 红指针拖拽结束，和时间轴点击后重新定位后，播放需要加载第一条字幕音频
    setNeedLoadFirstAudio(true);

    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }

    // 暂停播放时
    if (!isPlaying) {
      console.warn('时间轴点击后寻找字幕音频索引--->');
      const currentSubtitleIndex = subtitleTrack.findIndex(subtitle => {
        const endTime = subtitle.startTime + subtitle.duration;
        return newTime >= subtitle.startTime && newTime < endTime;
      });
      if (currentSubtitleIndex !== -1 && currentSubtitleIndex !== playingSubtitleIndex) {
        // const subtitle = subtitleTrack[currentSubtitleIndex];
        setPlayingSubtitleIndex(currentSubtitleIndex);
        // TODO【有此行拖动红指针会卡】 右侧面板滚动到响应字幕位置
        !isTimelineDragging && onPlayingSubtitleChange?.(currentSubtitleIndex);
      }
      if (currentSubtitleIndex === -1) {
        // 指针在间隙上，查找下一条字幕并预加载
        handlerPointerInMiddle(newTime);
      }
    }
    // 播放中，红指针点击时间轴
    else {
      console.log('handleTimeLineClick--暂停所有字幕音频--->');
      // 是否已经全部把audioArr暂停了
      for (let i = 0; i < audioRefArr.length; i++) {
        const audioRef = audioRefArr[i];
        if (audioRef.current) {
          audioRef.current.pause();
        }
      }
      lastPlayedSubtitleIndexRef.current = -1;
      audioPlayPromiseRef.current = null;
      setPlayingSubtitleIndex(-1);
      // 右侧面板滚动到响应字幕位置
      // onPlayingSubtitleChange?.(-1);
    }
  };
  /**
   * 回调事件【红指针拖动过程】
   * @param newTime 时间轴点最新时间
   */
  const handleTimeChange = (newTime: number) => {
    console.log('handleTimeChange--->', newTime);
    // 设置当前时间，没有这一行红指针不动
    setCurrentTime(newTime);
    // 红指针拖拽结束，和时间轴点击后重新定位后，播放需要加载第一条字幕音频
    setNeedLoadFirstAudio(true);

    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }

    // 拖动时暂停所有字幕音频
    if (isPlaying && isAudioRefArrPause.current === false) {
      console.log('handleTimeChange--暂停所有字幕音频--->');
      // 是否已经全部把audioArr暂停了
      isAudioRefArrPause.current = true;

      // 暂停视频
      videoRef.current && videoRef.current.pause();

      // 暂停所有字幕音频
      for (let i = 0; i < audioRefArr.length; i++) {
        const audioRef = audioRefArr[i];
        if (audioRef.current) {
          audioRef.current.pause();
        }
      }
      // 临时暂停背景音乐播放
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
      }
    }


    // 计算时间差，降低频度
    // let cha = newTime - curTimeRef.current;
    // // TODO 点击时间轴，切换右侧面板联动定位到待播放的字幕
    // if (!isPlaying && (cha > 1 || cha < -1)) {
    //   console.warn('寻找字幕音频索引--cha-->', cha);
    //   curTimeRef.current = newTime;

    //   const currentSubtitleIndex = subtitleTrack.findIndex(subtitle => {
    //     const endTime = subtitle.startTime + subtitle.duration;
    //     return newTime >= subtitle.startTime && newTime < endTime;
    //   });
    //   if (currentSubtitleIndex !== -1 && currentSubtitleIndex !== playingSubtitleIndex) {
    //     // const subtitle = subtitleTrack[currentSubtitleIndex];
    //     // setPlayingSubtitleIndex(currentSubtitleIndex);
    //     // TODO【有此行拖动红指针会卡】 右侧面板滚动到响应字幕位置
    //     // onPlayingSubtitleChange?.(currentSubtitleIndex);
    //   }
    // }

  };

  /**
   * 回调事件【红指针拖动结束】拖拽停止后重新预加载和播放音频
   * @param newTime 时间轴点最新时间
   */
  const handleDragStop = useCallback((newTime: number) => {
    if (isSubtitleMutedRef.current || subtitleTrack.length === 0) return;
    console.log('handleDragStop--->', newTime);

    // setCurrentTime(newTime);

    if (isAudioRefArrPause.current === true) {
      // 是否已经全部把audioArr暂停了
      isAudioRefArrPause.current = false;
      // 暂停视频
      videoRef.current && videoRef.current.play();

      // 解决多次拖到到同一个字幕不播放问题
      lastPlayedSubtitleIndexRef.current = -1;

      // 启动bgmAudioRef播放
      if (bgmAudioRef.current && bgmTrack.length > 0 && !isBgmMuted) {
        bgmAudioRef.current.currentTime = newTime;
        bgmAudioRef.current.play().catch(err => console.error('背景音乐播放失败:', err));
      }
    }


    // 查找当前时间对应的字幕 findLastIndex findIndex
    const currentSubtitleIndex = subtitleTrack.findIndex(subtitle => {
      const endTime = subtitle.startTime + subtitle.duration;
      return newTime >= subtitle.startTime && newTime < endTime;
    });

    if (currentSubtitleIndex !== -1) {
      // 指针在字幕上，重新加载并播放当前字幕音频
      // isPlaying && doUpdateAudioPlayPause(newTime);
      // 不正在播放时，拖拽结束要右侧面板滚动到响应字幕位置，正在播放时，会在 RAF 里滚动
      !isPlaying && onPlayingSubtitleChange?.(currentSubtitleIndex);
    } else {
      // 指针在间隙上，查找下一条字幕并预加载
      handlerPointerInMiddle(newTime);
    }
  }, [subtitleTrack, isPlaying, onPlayingSubtitleChange]);


  /**
   * 指针在间隙上，查找下一条字幕并预加载
   * @param newTime 
   */
  const handlerPointerInMiddle = (newTime: number) => {

    // 指针在空白处，查找下一条字幕并预加载
    const nextSubtitleIndex = subtitleTrack.findIndex(subtitle => subtitle.startTime > newTime);
    // 找到下一条字幕，预加载音频
    if (nextSubtitleIndex !== -1) {
      const nextSubtitle = subtitleTrack[nextSubtitleIndex];
      const audioIndex = nextSubtitleIndex % 5;
      const audio = audioRefArr[audioIndex].current;
      console.log(`拖拽停止or点击到间隙：预加载下一条字幕 ${nextSubtitleIndex}`);

      if (nextSubtitle.audioUrl && audio) {
        audio.src = nextSubtitle.audioUrl;
        audio.load();
      }

      let tempIdx = nextSubtitleIndex;
      tempIdx = tempIdx < 0 ? 0 : tempIdx;
      lastPlayedSubtitleIndexRef.current = -1;
      setPlayingSubtitleIndex(-1);

      // 右侧面板滚动到响应字幕位置
      onPlayingSubtitleChange?.(tempIdx);
    }
  };

  // 初始化视频
  useEffect(() => {
    if (initialVideo && videoRef.current) {
      videoRef.current.src = initialVideo;
    }
  }, [initialVideo]);

  // 从 convertObj 加载资源
  useEffect(() => {
    if (!convertObj) return;

    const loadResources = async () => {
      try {
        // 默认视频时长
        setTotalDuration(convertObj.processDurationSeconds);

        // 1. 加载视频轨道（无声视频）
        if (convertObj.noSoundVideoUrl) {
          const videoItem: TrackItem = {
            id: 'video-main',
            type: 'video',
            name: '主视频',
            url: convertObj.noSoundVideoUrl,
            startTime: 0,
            duration: convertObj.processDurationSeconds, // 默认60秒，实际加载后会更新
            volume: 100
          };
          setVideoTrack([videoItem]);

          // 设置视频源
          if (videoRef.current) {
            videoRef.current.src = convertObj.noSoundVideoUrl;
            videoRef.current.load();
          }
        }

        // 2. 加载背景音乐轨道
        if (convertObj.backgroundAudioUrl) {
          const bgmItem: TrackItem = {
            id: 'bgm-main',
            type: 'bgm',
            name: '背景音乐',
            url: convertObj.backgroundAudioUrl,
            startTime: 0,
            duration: convertObj.processDurationSeconds, // 默认60秒，实际加载后会更新
            volume: 80
          };
          setBgmTrack([bgmItem]);

          // 设置背景音乐源
          if (bgmAudioRef.current) {
            bgmAudioRef.current.src = convertObj.backgroundAudioUrl;
            bgmAudioRef.current.load();
          }
        }

        // 3. 加载SRT字幕并生成字幕轨道
        if (convertObj.srt_convert_arr && convertObj.srt_convert_arr.length > 0) {
          const subtitleItems: SubtitleTrackItem[] = convertObj.srt_convert_arr.map((entry, index) => {
            // 将SRT时间转换为秒
            const startTime = parseTimeToSeconds(entry.start);
            const endTime = parseTimeToSeconds(entry.end);
            const duration = parseFloat((endTime - startTime).toFixed(3));

            if (index < 10) {
              console.log(`字幕 ${index + 1}: ${entry.start} -> ${startTime}s, ${entry.end} -> ${endTime}s, 时长: ${duration}s`);
            }

            const userId = convertObj.userId || '';
            const audioUrl = `${convertObj.r2preUrl}/dev/${userId}/${convertObj.id}/adj_audio_time/${entry.id}.wav`;

            return {
              id: entry.id,
              type: 'video',
              name: `字幕 ${index + 1}`,
              startTime,
              duration,
              text: entry.txt,
              fontSize: 16,
              color: '#ffffff',
              audioUrl
            };
          });
          setSubtitleTrack(subtitleItems);
          console.log(`成功加载 ${subtitleItems.length} 条字幕到轨道`);
        }
      } catch (error) {
        console.error('加载资源失败:', error);
      }
    };

    loadResources();
  }, [convertObj]);

  // 监听背景音乐静音状态变化
  useEffect(() => {
    if (bgmAudioRef.current && isPlaying) {
      // 正在播放时切换静音状态
      if (isBgmMuted) {
        bgmAudioRef.current.pause();
      }
      // 正在播放时取消静音
      else if (bgmTrack.length > 0) {
        bgmAudioRef.current.currentTime = currentTime;
        bgmAudioRef.current.play().catch(err => console.error('背景音乐播放失败:', err));
      }
    }
  }, [isBgmMuted]);

  // 监听字幕静音状态变化
  useEffect(() => {
    isSubtitleMutedRef.current = isSubtitleMuted;
    console.log('字幕静音状态变化isSubtitleMuted--->', isSubtitleMuted, 'isPlaying--->', isPlaying);
    if (isPlaying) {
      // 正在播放时切换静音状态
      if (isSubtitleMuted) {
        for (let i = 0; i < audioRefArr.length; i++) {
          const audioRef = audioRefArr[i];
          if (audioRef.current) {
            audioRef.current.pause();
          }
        }
        // audioPlayPromiseRef.current = null;
        // lastPlayedSubtitleIndexRef.current = -1;
        // setPlayingSubtitleIndex(-1);
        // onPlayingSubtitleChange?.(-1);
      }
      // 正在播放时取消静音=继续有声播放
      else {
        console.log('取消字幕静音，继续播放字幕音频--->', currentTime);
        // 重新查找当前时间对应的字幕
        // doUpdateAudioPlayPause(currentTime);
      }
    }
  }, [isSubtitleMuted]);

  const scrollPointer2VisibleByRightPanel = useCallback((time: number) => {
    // 根据右侧面板请求的时间定位红指针 并滚动到可见范
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    lastPlayedSubtitleIndexRef.current = -1;
    audioPlayPromiseRef.current = null;
    setPlayingSubtitleIndex(-1);
    console.log('scrollPointer2VisibleByRightPanel--time--->', time, 'maxTrackWidth: ', maxTrackWidth);
    scrollPointerVisible(time);

  }, [currentTime, maxTrackWidth]);



  // 注册外部定位回调
  useEffect(() => {
    onSeekToTime?.((time: number) => {
      scrollPointer2VisibleByRightPanel(time);
    });
  }, [onSeekToTime, scrollPointer2VisibleByRightPanel]);

  // 监听字幕播放索引变化，自动滚动到可见区域
  useEffect(() => {
    // 播放指针可见跟随
    if (!isPointerBarFollow) return;
    // 正在拖拽时间轴指针时不要自动滚动
    if (isTimelineDragging) return;

    if (playingSubtitleIndex === -1 || subtitleTrack.length === 0) return;

    const scrollContainer = document.getElementById('unified-scroll-container');
    if (!scrollContainer) return;

    const subtitle = subtitleTrack[playingSubtitleIndex];
    if (!subtitle) return;

    // 计算字幕元素的位置（百分比转换为像素）
    const containerWidth = scrollContainer.clientWidth;
    const contentWidth = scrollContainer.scrollWidth;
    const leftPercent = (subtitle.startTime / totalDuration) * 100;
    const widthPercent = (subtitle.duration / totalDuration) * 100;

    // 计算实际像素位置
    const elementLeft = (leftPercent / 100) * contentWidth;
    const elementWidth = (widthPercent / 100) * contentWidth;
    const elementRight = elementLeft + elementWidth;

    // 获取当前滚动位置
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollRight = scrollLeft + containerWidth;

    // 如果元素在可视区域左侧或右侧之外，则滚动
    const padding = 20; // 留一些边距

    // console.log('scrollLeft--->', scrollLeft)
    // console.log('elementLeft--->', elementLeft)
    // console.log('containerWidth--->', containerWidth)

    // TODO 水平拖动时不顺畅，需要优化
    if (elementLeft < scrollLeft + padding) {
      // 元素在左侦外，滚动到左侧
      scrollContainer.scrollTo({
        left: Math.max(0, elementLeft - padding),
        behavior: 'smooth'
      });
    } else if (elementRight > scrollRight - padding) {
      // 元素在右侦外，滚动到右侧
      scrollContainer.scrollTo({
        left: elementRight - containerWidth + padding,
        behavior: 'smooth'
      });
    }
  }, [playingSubtitleIndex, subtitleTrack, totalDuration]);

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

  // 监听空格键切换播放/暂停
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, videoTrack]);

  // console.log('maxTrackWidth-->', maxTrackWidth);  
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
    // console.log('- 音频轨道:', audioTrack.length, '个项目');
    console.log('- 背景音乐轨道:', bgmTrack.length, '个项目');
    console.log('- 字幕轨道:', subtitleTrack.length, '个项目');
    console.log('- 当前时间轴长度:', totalDuration, '秒');
    console.log('- 最大内容宽度:', maxTrackWidth, '秒');
  }, [videoTrack, bgmTrack, subtitleTrack, totalDuration, maxTrackWidth]);// audioTrack, 

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

            {/* 隐藏的背景音乐播放器 loop*/}
            <audio
              ref={bgmAudioRef}
              className="hidden"
            />

            {/* 隐藏的字幕音频播放器 */}
            <audio
              ref={subtitleAudioRef}
              className="hidden"
            />
            <audio
              ref={subtitleAudio2Ref}
              className="hidden"
            />
            <audio
              ref={subtitleAudio3Ref}
              className="hidden"
            />
            <audio
              ref={subtitleAudio4Ref}
              className="hidden"
            />
            <audio
              ref={subtitleAudio5Ref}
              className="hidden"
            />

            {/* 字幕叠加显示 */}
            {subtitleTrack.map(subtitle => {
              const endTime = subtitle.startTime + subtitle.duration;
              if (currentTime >= subtitle.startTime && currentTime <= endTime) {
                let isEditing = editingSubtitle === subtitle.id;
                // 锁定，不可编辑字幕
                isEditing = false;

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
                      top: '5%',
                      transform: 'translateX(-50%)',
                      fontSize: `${subtitle.fontSize || 16}px`,
                      color: subtitle.color || '#ffffff',
                      display: isVideoTextShow ? 'block' : 'none'
                    }}
                    // onClick={() => setSelectedSubtitle(subtitle.id)}
                    // onDoubleClick={() => {
                    //   if (!isEditing) {
                    //     setEditingSubtitle(subtitle.id);
                    //     setEditingText(subtitle.text);
                    //   }
                    // }}
                    title="单击选择，双击编辑字幕内容"
                  >
                    {/* 视频中字幕可编辑和展示 */}
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

          {/* 编辑工具组 addSubtitle*/}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleVideoTextClick}
              className="text-white hover:bg-gray-700"
              title="添加字幕"
            >
              <Type className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={togglePointerBarFollow}
              className="text-white hover:bg-gray-700"
              title="播放指针可见"
            >
              {isPointerBarFollow ? <FoldHorizontal className="w-4 h-4" /> :
                <FlipVertical className="w-4 h-4" />
              }

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
                {/* <Type className="w-3 h-3 text-gray-400" /> */}
              </div>
              <div className="flex items-center gap-1">
                {/* 轨道开关，隐藏视频中字幕 */}
                <Button
                  variant="ghost"
                  size="sm"
                  // onClick={addSubtitle}
                  onClick={toggleVideoTextClick}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title="添加字幕"
                >
                  {/* <Plus className="w-3 h-3" /> */}
                  {isVideoTextShow ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                </Button>

                {/* 轨道开关，静音控制 */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSubtitleMuted(!isSubtitleMuted)}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title={isSubtitleMuted ? "取消静音" : "静音"}
                >
                  {isSubtitleMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </Button>

              </div>
            </div>

            {/* 背景音乐轨道标签 */}
            <div className="h-16 flex items-center justify-between px-3 bg-gray-750 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">背景音乐</span>
                {/* <Volume2 className="w-3 h-3 text-gray-400" /> */}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsBgmMuted(!isBgmMuted)}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title={isBgmMuted ? "取消静音" : "静音"}
                >
                  {isBgmMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </Button>
                {/* <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTrackItem('bgm')}
                  className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
                  title="添加背景音乐"
                >
                  <Plus className="w-3 h-3" />
                </Button> */}
              </div>
            </div>

            {/* 视频轨道标签 */}
            <div className="h-16 flex items-center justify-between px-3 bg-gray-750 border-b border-gray-700">

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">背景视频</span>
              </div>

              {/* title="添加视频" onClick={() => addTrackItem('video')} */}
              <Button
                variant="ghost"
                size="sm"
                className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
              >
                {/* <Plus className="w-3 h-3" /> */}
                <Video className="w-4 h-4 text-gray-400" />
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
                width: `${Math.max((maxTrackWidth / 60) * 100 * zoom, 100)}%`,
                minWidth: '100%'
              }}
            >
              {/* 时间轴内容 */}
              <div className="h-12 bg-gray-850 relative">
                <Timeline
                  currentTime={currentTime}
                  totalDuration={maxTrackWidth}
                  zoom={zoom}
                  onTimeLineClick={handleTimeLineClick}
                  onTimeChange={handleTimeChange}
                  onDragging={(isDragging) => setIsTimelineDragging(isDragging)}
                  onDragStop={handleDragStop}
                />
              </div>

              {/* 字幕轨道内容 
                onAddItem={addSubtitle}
              */}
              <SubtitleTrack
                items={subtitleTrack}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                selectedItem={selectedSubtitle || undefined}
                // onSelectItem={setSelectedSubtitle}
                // onUpdateItem={updateSubtitleItem}
                // onDeleteItem={deleteSubtitleItem}
                playingIndex={playingSubtitleIndex}
              />

              {/* 
                背景音乐轨道内容 
                onAddItem={() => addTrackItem('bgm')}
              */}
              <Track
                title="背景音乐"
                items={bgmTrack}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                selectedItem={selectedItem || undefined}
              // onSelectItem={setSelectedItem}
              // onUpdateItem={(id, updates) => updateTrackItem('bgm', id, updates)}
              // onDeleteItem={(id) => deleteTrackItem('bgm', id)}
              />

              {/* 
                视频轨道内容 
                onAddItem={() => addTrackItem('video')}
              */}
              <Track
                title="视频"
                items={videoTrack}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                selectedItem={selectedItem || undefined}
              // onSelectItem={setSelectedItem}
              // onUpdateItem={(id, updates) => updateTrackItem('video', id, updates)}
              // onDeleteItem={(id) => deleteTrackItem('video', id)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoEditor;
