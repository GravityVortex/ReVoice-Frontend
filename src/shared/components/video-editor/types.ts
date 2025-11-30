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
}

// 视频编辑器属性
export interface VideoEditorProps {
  className?: string;
  onExport?: (data: ExportData) => void;
  initialVideo?: string;
}

// 导出数据接口
export interface ExportData {
  videoTrack: TrackItem[];
  audioTrack: TrackItem[];
  bgmTrack: TrackItem[];
  subtitleTrack: SubtitleTrackItem[] | null;
  subtitles: SubtitleItem[] | null;
  totalDuration: number;
}
