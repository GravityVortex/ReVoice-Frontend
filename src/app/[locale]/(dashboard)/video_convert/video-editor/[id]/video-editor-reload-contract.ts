export type VideoEditorDetailReloadMode = 'blocking' | 'background';

export type VideoEditorDetailReloadOptions = {
  silent?: boolean;
};

export type VideoEditorDetailReloadResult = {
  ok: boolean;
  error: string | null;
  mode: VideoEditorDetailReloadMode;
};

export type VideoEditorDetailReloadAction = (
  options?: VideoEditorDetailReloadOptions
) => Promise<VideoEditorDetailReloadResult>;

export type VideoEditorBoundDetailReloadAction = () => Promise<VideoEditorDetailReloadResult>;
