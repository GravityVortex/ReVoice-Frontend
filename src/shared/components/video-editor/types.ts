// 轨道项目接口
export interface TrackItem {
  id: string;
  type: 'video' | 'audio' | 'bgm';
  name: string;
  url: string;
  startTime: number;
  duration: number;
  volume?: number;
  color?: string;
}

// 字幕项目接口 - 现在作为轨道项目
export interface SubtitleItem {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  duration: number; // 改为duration以匹配TrackItem
  x?: number;
  y?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
}

// 字幕轨道项目接口
export interface SubtitleTrackItem {
  id: string;
  type: 'video' | 'audio' | 'bgm';
  name: string;
  startTime: number;
  duration: number;
  text: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  audioUrl?: string; // 字幕对应的音频URL
}

// 转换对象类型
export interface ConvertObj {
  id: string;
  userId: string;
  originalFileId: string;
  status: string;
  priority: string;
  progress: string;
  currentStep: string;
  sourceLanguage: string;
  targetLanguage: string;
  speakerCount: string;
  processDurationSeconds: number;
  startedAt: string;
  completedAt: string;
  metadata: string;
  noSoundVideoUrl: string;
  backgroundAudioUrl: string;
  srt_source_arr: any[];
  srt_convert_arr: any[];

  srt_double_arr: any[];// 两个字幕合成的字段
  r2preUrl?:string; // 组装进来的，公桶前缀
  env?:string; // 组装进来的，dev、pro

  dayMaxNum?:string;// 组装进来的，每日合并限制次数
  dayPayCredit?:string;// 组装进来的，超次合并扣积分

  // convertId: string;
  // video_nosound: string;
  // sound_bg: string;
  // srt_source: string;
  // srt_convert: string;
  // srt_source_arr: string[];
  // srt_convert_arr: string[];
}

// 视频编辑器属性
export interface VideoEditorProps {
  className?: string;
  onExport?: (data: ExportData) => void;
  initialVideo?: string;
  convertObj?: ConvertObj;
  onPlayingSubtitleChange?: (index: number) => void; // 字幕播放索引变化回调，右侧面板联动
  onSeekToTime?: (callback: (time: number) => void) => void; // 注册外部定位回调
  onRegisterUpdateAudioUrl?: (callback: (id: string, audioUrl: string) => void) => void; // 注册更新字幕音频URL回调
}

// 导出数据接口
export interface ExportData {
  videoTrack: TrackItem[];
  // audioTrack: TrackItem[];
  bgmTrack: TrackItem[];
  subtitleTrack: SubtitleTrackItem[] | null;
  subtitles: SubtitleItem[] | null;
  totalDuration: number;
}
