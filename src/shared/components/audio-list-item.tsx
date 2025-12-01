// "use client";

// import React, { useState, useRef, useEffect } from 'react';
// import { Play, Pause, RefreshCw, Save } from 'lucide-react';
// import { Button } from '@/shared/components/ui/button';
// import { Input } from '@/shared/components/ui/input';
// import { cn } from '@/shared/lib/utils';

// export interface AudioItem {
//   id: string;
//   startTime: string;
//   endTime: string;
//   text: string;
//   audioUrl: string;
// }

// interface AudioListItemProps {
//   item: AudioItem;
//   isSelected: boolean;
//   isPlaying: boolean;
//   onSelect: () => void;
//   onUpdate: (item: AudioItem) => void;
//   onPlayPause: () => void;
//   onConvert: () => void;
//   onSave: () => void;
// }

// export function AudioListItem({
//   item,
//   isSelected,
//   isPlaying,
//   onSelect,
//   onUpdate,
//   onPlayPause,
//   onConvert,
//   onSave,
// }: AudioListItemProps) {
//   const [localItem, setLocalItem] = useState(item);

//   useEffect(() => {
//     setLocalItem(item);
//   }, [item]);

//   const handleFieldChange = (field: keyof AudioItem, value: string) => {
//     const updatedItem = { ...localItem, [field]: value };
//     setLocalItem(updatedItem);
//     onUpdate(updatedItem);
//   };

//   return (
//     <div
//       onClick={onSelect}
//       className={cn(
//         "border rounded-lg p-4 cursor-pointer transition-all",
//         isSelected
//           ? "border-primary bg-primary/5 shadow-md"
//           : "border-border hover:border-primary/50 hover:bg-accent/50"
//       )}
//     >
//       <div className="flex gap-4">
//         {/* 左侧板块 */}
//         <div className="flex-1 space-y-3">
//           <div className="flex items-center gap-2">
//             <label className="text-sm font-medium text-muted-foreground min-w-[60px]">
//               开始时间
//             </label>
//             <Input
//               type="text"
//               value={localItem.startTime}
//               onChange={(e) => handleFieldChange('startTime', e.target.value)}
//               placeholder="00:00:00"
//               className="flex-1"
//               onClick={(e) => e.stopPropagation()}
//             />
//           </div>
//           <div className="flex items-center gap-2">
//             <label className="text-sm font-medium text-muted-foreground min-w-[60px]">
//               结束时间
//             </label>
//             <Input
//               type="text"
//               value={localItem.endTime}
//               onChange={(e) => handleFieldChange('endTime', e.target.value)}
//               placeholder="00:00:00"
//               className="flex-1"
//               onClick={(e) => e.stopPropagation()}
//             />
//           </div>
//           <div className="flex items-center gap-2">
//             <label className="text-sm font-medium text-muted-foreground min-w-[60px]">
//               文本
//             </label>
//             <Input
//               type="text"
//               value={localItem.text}
//               onChange={(e) => handleFieldChange('text', e.target.value)}
//               placeholder="输入文本内容"
//               className="flex-1"
//               onClick={(e) => e.stopPropagation()}
//             />
//           </div>
//           <div className="flex items-center gap-2 pt-2">
//             <Button
//               size="sm"
//               variant={isPlaying ? "default" : "outline"}
//               onClick={(e) => {
//                 e.stopPropagation();
//                 onPlayPause();
//               }}
//               className="flex-1"
//             >
//               {isPlaying ? (
//                 <>
//                   <Pause className="w-4 h-4 mr-1" />
//                   暂停
//                 </>
//               ) : (
//                 <>
//                   <Play className="w-4 h-4 mr-1" />
//                   播放
//                 </>
//               )}
//             </Button>
//           </div>
//         </div>

//         {/* 右侧板块 */}
//         <div className="flex-1 space-y-3">
//           <div className="flex items-center gap-2">
//             <label className="text-sm font-medium text-muted-foreground min-w-[60px]">
//               音频URL
//             </label>
//             <Input
//               type="text"
//               value={localItem.audioUrl}
//               onChange={(e) => handleFieldChange('audioUrl', e.target.value)}
//               placeholder="Cloudflare R2 音频地址"
//               className="flex-1"
//               onClick={(e) => e.stopPropagation()}
//             />
//           </div>
//           <div className="flex flex-col gap-2 pt-8">
//             <Button
//               size="sm"
//               variant="outline"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 onConvert();
//               }}
//               className="w-full"
//             >
//               <RefreshCw className="w-4 h-4 mr-1" />
//               转换
//             </Button>
//             <Button
//               size="sm"
//               variant="outline"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 onSave();
//               }}
//               className="w-full"
//             >
//               <Save className="w-4 h-4 mr-1" />
//               保存
//             </Button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
