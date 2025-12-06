export interface SrtEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
  text2: string | null;
}

/**
 * 解析SRT时间格式 (HH:MM:SS,mmm) 转换为标准格式 (HH:MM:SS.mmm)
 * 保留毫秒部分以确保精确的时间解析
 */
function parseTimeCode(timeCode: string): string {
  // SRT格式: 00:00:00,000
  // 转换为: 00:00:00.000 (保留毫秒)
  return timeCode.replace(',', '.');
  // return timeCode.replace(',', '.').substring(0, 8);
}

/**
 * 解析SRT字幕文件内容
 */
export function parseSrt(srtContent: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const srtList = [];
  

  // 按空行分割字幕块
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');

    if (lines.length < 3) continue;

    // 第一行是序号
    const index = parseInt(lines[0].trim(), 10);

    // 第二行是时间轴
    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

    if (!timeMatch) continue;

    const startTime = parseTimeCode(timeMatch[1]);
    const endTime = parseTimeCode(timeMatch[2]);

    // 剩余行是字幕文本
    let text = '', text2 = null;
    // 若有两行字幕文本，则分别赋值给text和text2
    if (lines.length >= 4) {
      text = lines[2];
      text2 = lines[3];
    } 
    // 若只有三行字幕文本，则将第三行作为text
    else {
      text = lines.slice(2).join('\n').trim();
      text2 = text;
    }

    


    entries.push({
      index,
      startTime,
      endTime,
      text,
      text2,
    });
  }

  return entries;
}

/**
 * 从URL加载SRT文件（直接请求）
 */
export async function loadSrtFromUrl(url: string): Promise<SrtEntry[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load SRT: ${response.statusText}`);
    }
    const content = await response.text();
    return parseSrt(content);
  } catch (error) {
    console.error('Error loading SRT:', error);
    throw error;
  }
}

/**
 * 通过API代理加载SRT文件（解决CORS问题）
 */
export async function loadSrtViaProxy(url: string): Promise<SrtEntry[]> {
  try {
    // console.log('srt url--->', url);
    const proxyUrl = `/api/proxy-srt?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to load SRT: ${response.statusText}`);
    }

    const content = await response.text();
    return parseSrt(content);
  } catch (error) {
    console.error('Error loading SRT via proxy:', error);
    throw error;
  }
}
