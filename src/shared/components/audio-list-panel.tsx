"use client";

import React, { useState, useRef, useEffect } from 'react';
import { SubtitleComparisonItem, SubtitleComparisonData } from './subtitle-comparison-item';
import { Button } from '@/shared/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { loadSrtViaProxy, SrtEntry } from '@/shared/lib/srt-parser';
import { ConvertObj } from '@/app/[locale]/(landing)/video_convert/video-editor/[id]/page';

interface AudioListPanelProps {
  onPlayingIndexChange?: (index: number) => void;
  convertObj: ConvertObj;
  playingSubtitleIndex?: number; // 左侧视频编辑器当前播放的字幕索引
}

// 音频URL基础路径（用于兼容旧的音频文件名格式）
const AUDIO_BASE_URL = 'https://pub-df378f36240d4648afc4ca279c89cd0c.r2.dev/sound-text';
const audio_conver_arr = [
  'segment_0001_00-00-00-000_00-00-08-439_gen.wav', 'segment_0002_00-00-08-439_00-00-14-200_gen.wav', 'segment_0003_00-00-14-200_00-00-21-120_gen.wav', 'segment_0004_00-00-22-440_00-00-23-980_gen.wav', 'segment_0005_00-00-24-320_00-00-26-140_gen.wav', 'segment_0006_00-00-26-140_00-00-28-640_gen.wav', 'segment_0007_00-00-28-920_00-00-29-640_gen.wav', 'segment_0008_00-00-29-859_00-00-30-600_gen.wav', 'segment_0009_00-00-30-820_00-00-32-280_gen.wav', 'segment_0010_00-00-32-565_00-00-37-815_gen.wav', 'segment_0011_00-00-37-815_00-00-40-390_gen.wav', 'segment_0012_00-00-40-789_00-00-43-789_gen.wav', 'segment_0013_00-00-43-789_00-00-45-789_gen.wav', 'segment_0014_00-00-45-789_00-00-47-789_gen.wav', 'segment_0015_00-00-47-789_00-00-48-789_gen.wav', 'segment_0016_00-00-48-789_00-00-50-789_gen.wav', 'segment_0017_00-00-50-789_00-00-53-789_gen.wav', 'segment_0018_00-00-53-789_00-00-57-664_gen.wav', 'segment_0019_00-00-57-665_00-01-03-665_gen.wav', 'segment_0020_00-01-03-665_00-01-10-415_gen.wav', 'segment_0021_00-01-10-415_00-01-13-415_gen.wav', 'segment_0022_00-01-13-415_00-01-21-330_gen.wav', 'segment_0023_00-01-22-040_00-01-24-740_gen.wav', 'segment_0024_00-01-25-019_00-01-27-439_gen.wav', 'segment_0025_00-01-27-519_00-01-30-799_gen.wav', 'segment_0026_00-01-30-879_00-01-32-420_gen.wav', 'segment_0027_00-01-32-739_00-01-35-640_gen.wav', 'segment_0028_00-01-35-739_00-01-38-560_gen.wav', 'segment_0029_00-01-38-679_00-01-41-280_gen.wav', 'segment_0030_00-01-41-459_00-01-44-340_gen.wav', 'segment_0031_00-01-44-399_00-01-47-539_gen.wav', 'segment_0032_00-01-47-895_00-01-52-395_gen.wav', 'segment_0033_00-01-52-395_00-02-01-395_gen.wav', 'segment_0034_00-02-01-395_00-02-03-645_gen.wav', 'segment_0035_00-02-03-645_00-02-05-145_gen.wav', 'segment_0036_00-02-05-145_00-02-06-645_gen.wav', 'segment_0037_00-02-06-645_00-02-13-395_gen.wav', 'segment_0038_00-02-13-395_00-02-14-145_gen.wav', 'segment_0039_00-02-14-145_00-02-16-225_gen.wav', 'segment_0040_00-02-16-405_00-02-17-765_gen.wav', 'segment_0041_00-02-17-844_00-02-20-485_gen.wav', 'segment_0042_00-02-20-665_00-02-23-425_gen.wav', 'segment_0043_00-02-23-465_00-02-26-525_gen.wav', 'segment_0044_00-02-26-605_00-02-29-025_gen.wav', 'segment_0045_00-02-31-260_00-02-39-885_gen.wav', 'segment_0046_00-02-39-885_00-02-42-885_gen.wav', 'segment_0047_00-02-42-884_00-02-44-424_gen.wav', 'segment_0048_00-02-44-944_00-02-47-524_gen.wav', 'segment_0049_00-02-47-704_00-02-50-164_gen.wav', 'segment_0050_00-02-51-185_00-02-51-664_gen.wav',
  'segment_0051_00-02-52-024_00-02-52-504_gen.wav', 'segment_0052_00-02-52-864_00-02-53-104_gen.wav', 'segment_0053_00-02-53-284_00-02-54-104_gen.wav', 'segment_0054_00-02-54-224_00-02-54-944_gen.wav', 'segment_0055_00-02-55-104_00-02-56-004_gen.wav', 'segment_0056_00-02-56-185_00-02-57-185_gen.wav', 'segment_0057_00-02-57-364_00-02-58-685_gen.wav', 'segment_0058_00-02-58-804_00-03-00-024_gen.wav', 'segment_0059_00-03-00-135_00-03-01-635_gen.wav', 'segment_0060_00-03-01-634_00-03-02-414_gen.wav', 'segment_0061_00-03-02-694_00-03-06-954_gen.wav', 'segment_0062_00-03-07-274_00-03-08-974_gen.wav', 'segment_0063_00-03-09-314_00-03-11-634_gen.wav', 'segment_0064_00-03-11-935_00-03-14-514_gen.wav', 'segment_0065_00-03-14-814_00-03-16-454_gen.wav', 'segment_0066_00-03-16-634_00-03-18-655_gen.wav', 'segment_0067_00-03-18-885_00-03-25-710_gen.wav', 'segment_0068_00-03-26-360_00-03-29-860_gen.wav', 'segment_0069_00-03-29-860_00-03-35-260_gen.wav', 'segment_0070_00-03-35-260_00-03-38-720_gen.wav', 'segment_0071_00-03-38-735_00-03-40-235_gen.wav', 'segment_0072_00-03-40-235_00-03-45-655_gen.wav', 'segment_0073_00-03-45-735_00-03-50-355_gen.wav', 'segment_0074_00-03-50-820_00-03-55-560_gen.wav', 'segment_0075_00-03-56-099_00-03-58-099_gen.wav', 'segment_0076_00-03-58-099_00-04-00-099_gen.wav', 'segment_0077_00-04-00-099_00-04-02-099_gen.wav', 'segment_0078_00-04-02-099_00-04-04-099_gen.wav', 'segment_0079_00-04-04-099_00-04-06-099_gen.wav', 'segment_0080_00-04-06-099_00-04-10-099_gen.wav', 'segment_0081_00-04-10-099_00-04-11-659_gen.wav', 'segment_0082_00-04-13-400_00-04-14-240_gen.wav', 'segment_0083_00-04-14-360_00-04-15-219_gen.wav', 'segment_0084_00-04-15-360_00-04-16-420_gen.wav', 'segment_0085_00-04-16-560_00-04-16-879_gen.wav', 'segment_0086_00-04-16-920_00-04-17-660_gen.wav', 'segment_0087_00-04-18-040_00-04-19-740_gen.wav', 'segment_0088_00-04-20-560_00-04-22-180_gen.wav', 'segment_0089_00-04-22-399_00-04-24-139_gen.wav', 'segment_0090_00-04-24-199_00-04-26-500_gen.wav', 'segment_0091_00-04-26-620_00-04-29-600_gen.wav', 'segment_0092_00-04-29-600_00-04-31-899_gen.wav', 'segment_0093_00-04-34-310_00-04-39-260_gen.wav', 'segment_0094_00-04-39-579_00-04-42-060_gen.wav', 'segment_0095_00-04-42-199_00-04-45-620_gen.wav', 'segment_0096_00-04-45-800_00-04-46-759_gen.wav', 'segment_0097_00-04-47-120_00-04-47-859_gen.wav', 'segment_0098_00-04-47-979_00-04-49-000_gen.wav', 'segment_0099_00-04-49-259_00-04-53-199_gen.wav', 'segment_0100_00-04-53-439_00-04-54-139_gen.wav',
  'segment_0101_00-04-54-205_00-04-54-955_gen.wav', 'segment_0102_00-04-54-955_00-04-59-210_gen.wav', 'segment_0103_00-05-00-300_00-05-05-300_gen.wav', 'segment_0104_00-05-05-360_00-05-09-660_gen.wav', 'segment_0105_00-05-09-840_00-05-10-860_gen.wav', 'segment_0106_00-05-11-000_00-05-12-920_gen.wav', 'segment_0107_00-05-13-080_00-05-16-259_gen.wav', 'segment_0108_00-05-16-319_00-05-17-639_gen.wav', 'segment_0109_00-05-19-089_00-05-20-049_gen.wav', 'segment_0110_00-05-20-049_00-05-23-149_gen.wav', 'segment_0111_00-05-23-269_00-05-26-489_gen.wav', 'segment_0112_00-05-26-609_00-05-28-769_gen.wav', 'segment_0113_00-05-28-829_00-05-31-529_gen.wav', 'segment_0114_00-05-31-609_00-05-33-209_gen.wav', 'segment_0115_00-05-33-649_00-05-36-269_gen.wav', 'segment_0116_00-05-36-449_00-05-36-809_gen.wav', 'segment_0117_00-05-36-870_00-05-37-250_gen.wav', 'segment_0118_00-05-37-429_00-05-39-509_gen.wav', 'segment_0119_00-05-39-769_00-05-42-669_gen.wav', 'segment_0120_00-05-42-789_00-05-43-809_gen.wav', 'segment_0121_00-05-43-909_00-05-45-209_gen.wav', 'segment_0122_00-05-45-209_00-05-47-589_gen.wav', 'segment_0123_00-05-47-829_00-05-48-909_gen.wav', 'segment_0124_00-05-49-089_00-05-49-870_gen.wav', 'segment_0125_00-05-50-029_00-05-52-250_gen.wav', 'segment_0126_00-05-52-589_00-05-55-329_gen.wav', 'segment_0127_00-05-55-569_00-05-57-469_gen.wav', 'segment_0128_00-05-57-609_00-05-59-549_gen.wav', 'segment_0129_00-06-00-170_00-06-01-180_gen.wav', 'segment_0130_00-06-01-460_00-06-03-970_gen.wav', 'segment_0131_00-06-04-279_00-06-13-519_gen.wav', 'segment_0132_00-06-13-519_00-06-17-679_gen.wav', 'segment_0133_00-06-17-679_00-06-22-719_gen.wav', 'segment_0134_00-06-22-719_00-06-28-839_gen.wav', 'segment_0135_00-06-28-839_00-06-33-559_gen.wav', 'segment_0136_00-06-33-559_00-06-35-399_gen.wav', 'segment_0137_00-06-37-580_00-06-43-205_gen.wav', 'segment_0138_00-06-43-205_00-06-43-955_gen.wav', 'segment_0139_00-06-43-955_00-06-53-705_gen.wav', 'segment_0140_00-06-53-705_00-06-58-880_gen.wav', 'segment_0141_00-06-59-500_00-07-00-660_gen.wav', 'segment_0142_00-07-00-879_00-07-04-199_gen.wav', 'segment_0143_00-07-04-319_00-07-07-480_gen.wav', 'segment_0144_00-07-07-660_00-07-10-420_gen.wav', 'segment_0145_00-07-10-620_00-07-13-180_gen.wav', 'segment_0146_00-07-13-420_00-07-14-459_gen.wav', 'segment_0147_00-07-14-699_00-07-16-959_gen.wav', 'segment_0148_00-07-17-120_00-07-17-399_gen.wav', 'segment_0149_00-07-18-660_00-07-20-180_gen.wav', 'segment_0150_00-07-20-339_00-07-23-339_gen.wav',
  'segment_0151_00-07-23-579_00-07-25-720_gen.wav', 'segment_0152_00-07-26-180_00-07-26-779_gen.wav', 'segment_0153_00-07-32-330_00-07-35-650_gen.wav', 'segment_0154_00-07-37-890_00-07-38-980_gen.wav', 'segment_0155_00-07-39-569_00-07-46-069_gen.wav', 'segment_0156_00-07-46-589_00-07-51-189_gen.wav', 'segment_0157_00-07-51-760_00-07-54-385_gen.wav', 'segment_0158_00-07-54-385_00-07-56-635_gen.wav', 'segment_0159_00-07-56-634_00-07-59-714_gen.wav', 'segment_0160_00-07-59-795_00-08-03-034_gen.wav', 'segment_0161_00-08-03-214_00-08-05-154_gen.wav', 'segment_0162_00-08-05-254_00-08-06-654_gen.wav', 'segment_0163_00-08-06-774_00-08-09-534_gen.wav', 'segment_0164_00-08-09-594_00-08-12-954_gen.wav', 'segment_0165_00-08-13-014_00-08-13-574_gen.wav', 'segment_0166_00-08-13-735_00-08-14-334_gen.wav', 'segment_0167_00-08-14-394_00-08-15-134_gen.wav', 'segment_0168_00-08-15-194_00-08-15-574_gen.wav', 'segment_0169_00-08-15-574_00-08-18-954_gen.wav', 'segment_0170_00-08-18-954_00-08-21-914_gen.wav', 'segment_0171_00-08-21-974_00-08-23-954_gen.wav', 'segment_0172_00-08-24-055_00-08-25-034_gen.wav', 'segment_0173_00-08-25-154_00-08-25-514_gen.wav', 'segment_0174_00-08-25-514_00-08-27-615_gen.wav', 'segment_0175_00-08-28-134_00-08-28-634_gen.wav', 'segment_0176_00-08-28-694_00-08-29-235_gen.wav', 'segment_0177_00-08-29-355_00-08-30-094_gen.wav', 'segment_0178_00-08-30-385_00-08-33-385_gen.wav', 'segment_0179_00-08-33-385_00-08-38-635_gen.wav', 'segment_0180_00-08-38-635_00-08-40-135_gen.wav', 'segment_0181_00-08-40-135_00-08-49-135_gen.wav', 'segment_0182_00-08-49-135_00-08-51-770_gen.wav', 'segment_0183_00-08-51-770_00-08-54-395_gen.wav', 'segment_0184_00-08-54-395_00-08-56-645_gen.wav', 'segment_0185_00-08-56-645_00-08-58-895_gen.wav', 'segment_0186_00-08-58-895_00-09-00-395_gen.wav', 'segment_0187_00-09-00-394_00-09-02-914_gen.wav', 'segment_0188_00-09-03-694_00-09-04-355_gen.wav', 'segment_0189_00-09-04-574_00-09-06-054_gen.wav', 'segment_0190_00-09-06-235_00-09-07-934_gen.wav', 'segment_0191_00-09-08-194_00-09-08-414_gen.wav', 'segment_0192_00-09-08-835_00-09-09-134_gen.wav', 'segment_0193_00-09-09-475_00-09-09-835_gen.wav', 'segment_0194_00-09-09-914_00-09-10-115_gen.wav', 'segment_0195_00-09-10-254_00-09-11-194_gen.wav', 'segment_0196_00-09-11-194_00-09-11-644_gen.wav', 'segment_0197_00-09-11-645_00-09-16-895_gen.wav', 'segment_0198_00-09-16-895_00-09-23-645_gen.wav', 'segment_0199_00-09-23-645_00-09-25-145_gen.wav', 'segment_0200_00-09-25-145_00-09-33-090_gen.wav',
  'segment_0201_00-09-33-370_00-09-36-870_gen.wav', 'segment_0202_00-09-37-129_00-09-40-370_gen.wav', 'segment_0203_00-09-40-730_00-09-42-389_gen.wav', 'segment_0204_00-09-42-429_00-09-43-549_gen.wav', 'segment_0205_00-09-43-909_00-09-45-310_gen.wav', 'segment_0206_00-09-45-610_00-09-46-990_gen.wav', 'segment_0207_00-09-47-245_00-09-49-495_gen.wav', 'segment_0208_00-09-49-495_00-09-54-914_gen.wav', 'segment_0209_00-09-54-914_00-09-59-835_gen.wav', 'segment_0210_00-10-00-000_00-10-04-640_gen.wav', 'segment_0211_00-10-05-980_00-10-07-855_gen.wav', 'segment_0212_00-10-07-855_00-10-08-605_gen.wav', 'segment_0213_00-10-08-605_00-10-09-355_gen.wav', 'segment_0214_00-10-09-355_00-10-10-105_gen.wav', 'segment_0215_00-10-10-105_00-10-11-605_gen.wav', 'segment_0216_00-10-11-605_00-10-12-355_gen.wav', 'segment_0217_00-10-12-355_00-10-19-105_gen.wav', 'segment_0218_00-10-19-105_00-10-22-105_gen.wav', 'segment_0219_00-10-22-105_00-10-27-090_gen.wav', 'segment_0220_00-10-27-370_00-10-34-495_gen.wav', 'segment_0221_00-10-34-495_00-10-36-745_gen.wav', 'segment_0222_00-10-36-745_00-10-46-495_gen.wav', 'segment_0223_00-10-46-495_00-10-50-245_gen.wav', 'segment_0224_00-10-50-245_00-10-52-495_gen.wav', 'segment_0225_00-10-52-495_00-10-53-245_gen.wav', 'segment_0226_00-10-53-245_00-10-55-495_gen.wav', 'segment_0227_00-10-55-495_00-10-56-245_gen.wav', 'segment_0228_00-10-56-245_00-11-02-144_gen.wav', 'segment_0229_00-11-02-384_00-11-06-904_gen.wav', 'segment_0230_00-11-07-245_00-11-09-565_gen.wav', 'segment_0231_00-11-09-745_00-11-17-995_gen.wav', 'segment_0232_00-11-17-995_00-11-20-245_gen.wav', 'segment_0233_00-11-20-245_00-11-20-970_gen.wav', 'segment_0234_00-11-21-360_00-11-23-235_gen.wav', 'segment_0235_00-11-23-235_00-11-24-735_gen.wav', 'segment_0236_00-11-24-735_00-11-25-485_gen.wav', 'segment_0237_00-11-25-485_00-11-26-985_gen.wav', 'segment_0238_00-11-26-985_00-11-27-735_gen.wav', 'segment_0239_00-11-27-735_00-11-35-985_gen.wav', 'segment_0240_00-11-35-985_00-11-39-770_gen.wav', 'segment_0241_00-11-40-549_00-11-46-569_gen.wav', 'segment_0242_00-11-46-709_00-11-54-669_gen.wav', 'segment_0243_00-11-54-789_00-11-58-149_gen.wav', 'segment_0244_00-11-58-175_00-11-58-925_gen.wav', 'segment_0245_00-11-58-925_00-12-01-175_gen.wav', 'segment_0246_00-12-01-175_00-12-02-675_gen.wav', 'segment_0247_00-12-02-675_00-12-06-425_gen.wav', 'segment_0248_00-12-06-425_00-12-07-925_gen.wav', 'segment_0249_00-12-07-925_00-12-12-425_gen.wav', 'segment_0250_00-12-12-425_00-12-14-675_gen.wav',
  'segment_0251_00-12-14-675_00-12-15-425_gen.wav', 'segment_0252_00-12-15-424_00-12-19-704_gen.wav', 'segment_0253_00-12-19-704_00-12-25-224_gen.wav', 'segment_0254_00-12-25-224_00-12-27-424_gen.wav', 'segment_0255_00-12-27-425_00-12-31-175_gen.wav', 'segment_0256_00-12-31-175_00-12-33-425_gen.wav', 'segment_0257_00-12-33-425_00-12-34-925_gen.wav', 'segment_0258_00-12-34-925_00-12-40-560_gen.wav', 'segment_0259_00-12-40-560_00-12-41-685_gen.wav', 'segment_0260_00-12-41-684_00-12-46-044_gen.wav', 'segment_0261_00-12-46-244_00-12-52-164_gen.wav', 'segment_0262_00-12-52-185_00-12-58-935_gen.wav', 'segment_0263_00-12-58-935_00-13-01-185_gen.wav', 'segment_0264_00-13-01-185_00-13-04-185_gen.wav', 'segment_0265_00-13-04-185_00-13-10-935_gen.wav', 'segment_0266_00-13-10-935_00-13-11-685_gen.wav', 'segment_0267_00-13-11-685_00-13-14-120_gen.wav', 'segment_0268_00-13-14-400_00-13-22-275_gen.wav', 'segment_0269_00-13-22-275_00-13-23-025_gen.wav', 'segment_0270_00-13-23-025_00-13-26-775_gen.wav', 'segment_0271_00-13-26-775_00-13-30-000_gen.wav', 'segment_0272_00-13-30-280_00-13-32-010_gen.wav', 'segment_0273_00-13-32-920_00-13-34-340_gen.wav', 'segment_0274_00-13-34-950_00-13-36-825_gen.wav', 'segment_0275_00-13-36-825_00-13-43-575_gen.wav', 'segment_0276_00-13-43-575_00-13-44-540_gen.wav', 'segment_0277_00-13-45-970_00-13-51-595_gen.wav', 'segment_0278_00-13-51-595_00-13-53-000_gen.wav', 'segment_0279_00-13-54-410_00-13-55-535_gen.wav', 'segment_0280_00-13-55-534_00-13-56-495_gen.wav', 'segment_0281_00-13-56-495_00-14-02-334_gen.wav', 'segment_0282_00-14-02-334_00-14-06-894_gen.wav', 'segment_0283_00-14-06-894_00-14-08-334_gen.wav', 'segment_0284_00-14-08-814_00-14-09-774_gen.wav', 'segment_0285_00-14-09-785_00-14-10-535_gen.wav', 'segment_0286_00-14-10-535_00-14-12-785_gen.wav', 'segment_0287_00-14-12-785_00-14-15-035_gen.wav', 'segment_0288_00-14-15-035_00-14-19-535_gen.wav', 'segment_0289_00-14-19-535_00-14-22-260_gen.wav', 'segment_0290_00-14-23-100_00-14-29-220_gen.wav', 'segment_0291_00-14-29-399_00-14-32-120_gen.wav', 'segment_0292_00-14-32-399_00-14-35-320_gen.wav', 'segment_0293_00-14-35-320_00-14-35-460_gen.wav', 'segment_0294_00-14-35-475_00-14-42-225_gen.wav', 'segment_0295_00-14-42-225_00-14-48-225_gen.wav', 'segment_0296_00-14-48-225_00-14-49-725_gen.wav', 'segment_0297_00-14-49-725_00-14-54-225_gen.wav', 'segment_0298_00-14-54-225_00-14-55-725_gen.wav', 'segment_0299_00-14-55-725_00-14-58-850_gen.wav', 'segment_0300_00-15-02-760_00-15-03-885_gen.wav',
  'segment_0301_00-15-03-885_00-15-05-470_gen.wav', 'segment_0302_00-15-06-040_00-15-06-930_gen.wav', 'segment_0303_00-15-07-420_00-15-10-795_gen.wav', 'segment_0304_00-15-10-795_00-15-12-840_gen.wav', 'segment_0305_00-15-14-070_00-15-16-695_gen.wav', 'segment_0306_00-15-16-695_00-15-19-695_gen.wav', 'segment_0307_00-15-19-695_00-15-21-195_gen.wav', 'segment_0308_00-15-21-195_00-15-22-730_gen.wav', 'segment_0309_00-15-23-330_00-15-27-670_gen.wav', 'segment_0310_00-15-28-710_00-15-34-335_gen.wav', 'segment_0311_00-15-34-335_00-15-35-835_gen.wav', 'segment_0312_00-15-35-835_00-15-38-795_gen.wav', 'segment_0313_00-15-38-795_00-15-41-375_gen.wav', 'segment_0314_00-15-41-375_00-15-42-375_gen.wav', 'segment_0315_00-15-42-375_00-15-43-375_gen.wav', 'segment_0316_00-15-43-375_00-15-46-975_gen.wav', 'segment_0317_00-15-46-975_00-15-49-075_gen.wav', 'segment_0318_00-15-49-075_00-15-50-075_gen.wav', 'segment_0319_00-15-50-085_00-15-51-585_gen.wav', 'segment_0320_00-15-51-585_00-15-53-085_gen.wav', 'segment_0321_00-15-53-085_00-15-55-660_gen.wav', 'segment_0322_00-15-59-830_00-16-01-705_gen.wav', 'segment_0323_00-16-01-705_00-16-02-455_gen.wav', 'segment_0324_00-16-02-455_00-16-05-220_gen.wav', 'segment_0325_00-16-11-840_00-16-12-780_gen.wav', 'segment_0326_00-16-13-390_00-16-16-765_gen.wav', 'segment_0327_00-16-16-765_00-16-17-515_gen.wav', 'segment_0328_00-16-17-515_00-16-19-015_gen.wav', 'segment_0329_00-16-19-015_00-16-24-265_gen.wav', 'segment_0330_00-16-24-265_00-16-25-765_gen.wav', 'segment_0331_00-16-25-765_00-16-28-015_gen.wav', 'segment_0332_00-16-28-015_00-16-31-080_gen.wav', 'segment_0333_00-16-31-360_00-16-39-235_gen.wav', 'segment_0334_00-16-39-235_00-16-39-985_gen.wav', 'segment_0335_00-16-39-985_00-16-40-735_gen.wav', 'segment_0336_00-16-40-735_00-16-45-985_gen.wav', 'segment_0337_00-16-45-985_00-16-47-310_gen.wav', 'segment_0338_00-16-48-930_00-16-53-055_gen.wav', 'segment_0339_00-16-53-055_00-16-55-550_gen.wav'
];

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
    playNextAudio();
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
        <Button 
          size="sm" 
          className='text-white'
          onClick={loadSrtFiles}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              加载中
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-1" />
              重新加载
            </>
          )}
        </Button>
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
