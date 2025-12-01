// "use client";

// import React, { useState, useEffect, useCallback } from 'react';
// import { Volume2, Plus, VolumeX } from 'lucide-react';
// import { Button } from '@/shared/components/ui/button';
// import { cn } from '@/shared/lib/utils';
// import { TrackItem } from './types';

// interface TrackProps {
//   title: string;
//   items: TrackItem[];
//   onAddItem: () => void;
//   totalDuration: number;
//   zoom: number;
//   selectedItem?: string | null;
//   onSelectItem: (id: string) => void;
//   onUpdateItem: (id: string, updates: Partial<TrackItem>) => void;
//   onDeleteItem: (id: string) => void;
//   className?: string;
//   hideLabel?: boolean;
// }

// const TrackHeader = ({ title, onAddItem }: { title: string; onAddItem: () => void }) => {
//   return (
//     <div className="w-32 flex items-center justify-between px-3 bg-gray-750 border-r border-gray-700">
//       <div className="flex items-center gap-2">
//         <span className="text-sm font-medium text-white">{title}</span>
//         {title === '音频' || title === '背景音乐' ? (
//           <Volume2 className="w-3 h-3 text-gray-400" />
//         ) : null}
//       </div>
//       <Button
//         variant="ghost"
//         size="sm"
//         onClick={onAddItem}
//         className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
//         title={`添加${title}`}
//       >
//         <Plus className="w-3 h-3" />
//       </Button>
//     </div>
//   );
// };

// const TrackItemComponent = ({
//   item,
//   totalDuration,
//   isSelected,
//   handleMouseDown,
//   handleDoubleClick,
// }: {
//   item: TrackItem;
//   totalDuration: number;
//   isSelected: boolean;
//   handleMouseDown: (e: React.MouseEvent, itemId: string, type: 'move' | 'resize-left' | 'resize-right') => void;
//   handleDoubleClick: (itemId: string) => void;
// }) => {
//   const leftPercent = (item.startTime / totalDuration) * 100;
//   const widthPercent = (item.duration / totalDuration) * 100;

//   // 获取轨道颜色
//   const getTrackColor = (type: string) => {
//     switch (type) {
//       case 'video': return 'bg-blue-600 border-blue-500';
//       case 'audio': return 'bg-green-600 border-green-500';
//       case 'bgm': return 'bg-purple-600 border-purple-500';
//       default: return 'bg-gray-600 border-gray-500';
//     }
//   };

//   return (
//     <div
//       className={cn(
//         "absolute top-1 h-14 rounded cursor-pointer border-2 flex items-center px-2 transition-all duration-200 hover:brightness-110",
//         getTrackColor(item.type),
//         isSelected ? "border-yellow-400 shadow-lg shadow-yellow-400/30" : "border-transparent"
//       )}
//       style={{
//         left: `${leftPercent}%`,
//         width: `${Math.max(widthPercent, 2)}%`, // 最小宽度2%
//         minWidth: '40px'
//       }}
//       onMouseDown={(e) => handleMouseDown(e, item.id, 'move')}
//       onDoubleClick={() => handleDoubleClick(item.id)}
//       title={`${item.name} (${item.startTime.toFixed(1)}s - ${(item.startTime + item.duration).toFixed(1)}s)`}
//     >
//       {/* 左侧调整手柄 */}
//       <div
//         className="absolute left-0 top-0 w-2 h-full bg-white/20 cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity"
//         onMouseDown={(e) => {
//           e.stopPropagation();
//           handleMouseDown(e, item.id, 'resize-left');
//         }}
//         title="调整开始时间"
//       />
      
//       {/* 项目内容 */}
//       <div className="flex-1 flex items-center justify-between text-white overflow-hidden">
//         <div className="flex-1 min-w-0">
//           <div className="text-xs font-medium truncate">
//             {item.name}
//           </div>
//           <div className="text-xs opacity-75">
//             {item.duration.toFixed(1)}s
//           </div>
//         </div>
        
//         {/* 音量指示器 */}
//         {(item.type === 'audio' || item.type === 'bgm') && (
//           <div className="ml-2 flex items-center">
//             {item.volume && item.volume > 0 ? (
//               <Volume2 className="w-3 h-3 opacity-60" />
//             ) : (
//               <VolumeX className="w-3 h-3 opacity-60" />
//             )}
//           </div>
//         )}
//       </div>
      
//       {/* 右侧调整手柄 - 更宽更明显 */}
//       <div
//         className="absolute right-0 top-0 w-4 h-full cursor-ew-resize transition-colors"
//         style={{
//           background: item.type === 'video' ? 'rgba(59, 130, 246, 0.4)' : 
//                              item.type === 'audio' ? 'rgba(34, 197, 94, 0.4)' : 
//                              'rgba(168, 85, 247, 0.4)'
//         }}
//         onMouseDown={(e) => {
//           e.stopPropagation();
//           handleMouseDown(e, item.id, 'resize-right');
//         }}
//         onMouseEnter={(e) => {
//           e.currentTarget.style.background = item.type === 'video' ? 'rgba(59, 130, 246, 0.6)' : 
//                                                     item.type === 'audio' ? 'rgba(34, 197, 94, 0.6)' : 
//                                                     'rgba(168, 85, 247, 0.6)';
//         }}
//         onMouseLeave={(e) => {
//           e.currentTarget.style.background = item.type === 'video' ? 'rgba(59, 130, 246, 0.4)' : 
//                                                     item.type === 'audio' ? 'rgba(34, 197, 94, 0.4)' : 
//                                                     'rgba(168, 85, 247, 0.4)';
//         }}
//         title="调整持续时间"
//       >
//         {/* 拖动指示器 */}
//         <div className="absolute right-1 top-1/2 transform -translate-y-1/2 w-0.5 h-8 bg-white/60 rounded-full" />
//         <div className="absolute right-2 top-1/2 transform -translate-y-1/2 w-0.5 h-6 bg-white/40 rounded-full" />
//       </div>
//     </div>
//   );
// };

// const TrackContent = ({
//   items,
//   selectedItem,
//   handleMouseDown,
//   handleDoubleClick,
//   totalDuration,
//   zoom,
//   title,
// }: {
//   items: TrackItem[];
//   selectedItem: string | null | undefined;
//   handleMouseDown: (e: React.MouseEvent, itemId: string, type: 'move' | 'resize-left' | 'resize-right') => void;
//   handleDoubleClick: (itemId: string) => void;
//   totalDuration: number;
//   zoom: number;
//   title?: string;
// }) => {
//   return (
//     <div className="flex-1 relative bg-gray-850" style={{ zIndex: 0 }}>
//       <div 
//         className="relative h-full" 
//         style={{ 
//           width: `${100 * zoom}%`,
//           minWidth: '100%'
//         }}
//       >
//         {items.map(item => (
//           <TrackItemComponent
//             key={item.id}
//             item={item}
//             isSelected={selectedItem === item.id}
//             totalDuration={totalDuration}
//             handleMouseDown={handleMouseDown}
//             handleDoubleClick={handleDoubleClick}
//           />
//         ))}
        
//         {/* 空轨道提示 */}
//         {items.length === 0 && title && (
//           <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none">
//             点击 + 添加{title}文件
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export function Track({
//   title,
//   items,
//   onAddItem,
//   totalDuration,
//   zoom,
//   selectedItem,
//   onSelectItem,
//   onUpdateItem,
//   onDeleteItem,
//   className,
//   hideLabel = false
// }: TrackProps) {
//   const [dragItem, setDragItem] = useState<string | null>(null);
//   const [dragType, setDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
//   const [dragStart, setDragStart] = useState({ x: 0, startTime: 0, duration: 0 });

//   // 获取轨道颜色
//   const getTrackColor = (type: string) => {
//     switch (type) {
//       case 'video': return 'bg-blue-600 border-blue-500';
//       case 'audio': return 'bg-green-600 border-green-500';
//       case 'bgm': return 'bg-purple-600 border-purple-500';
//       default: return 'bg-gray-600 border-gray-500';
//     }
//   };

//   // 处理鼠标按下事件
//   const handleMouseDown = useCallback((e: React.MouseEvent, itemId: string, type: 'move' | 'resize-left' | 'resize-right') => {
//     e.preventDefault();
//     setDragItem(itemId);
//     setDragType(type);
    
//     const item = items.find(i => i.id === itemId);
//     if (item) {
//       setDragStart({
//         x: e.clientX,
//         startTime: item.startTime,
//         duration: item.duration
//       });
//     }
    
//     onSelectItem(itemId);
//   }, [items, onSelectItem]);

//   // 处理鼠标移动事件
//   const handleMouseMove = useCallback((e: MouseEvent) => {
//     if (!dragItem || !dragType) return;
    
//     const deltaX = e.clientX - dragStart.x;
//     const deltaTime = (deltaX / (window.innerWidth * 0.6)) * totalDuration / zoom;
    
//     switch (dragType) {
//       case 'move': {
//         const newStartTime = Math.max(0, Math.min(dragStart.startTime + deltaTime, totalDuration - dragStart.duration));
//         onUpdateItem(dragItem, { startTime: newStartTime });
//         break;
//       }
//       case 'resize-left': {
//         const newStartTime = Math.max(0, Math.min(dragStart.startTime + deltaTime, dragStart.startTime + dragStart.duration - 0.1));
//         const newDuration = dragStart.duration - (newStartTime - dragStart.startTime);
//         onUpdateItem(dragItem, {
//           startTime: newStartTime,
//           duration: newDuration
//         });
//         break;
//       }
//       case 'resize-right': {
//         const newDuration = Math.max(0.1, dragStart.duration + deltaTime);
//         const maxDuration = totalDuration - dragStart.startTime;
//         onUpdateItem(dragItem, {
//           duration: Math.min(newDuration, maxDuration)
//         });
//         break;
//       }
//     }
//   }, [dragItem, dragType, dragStart, totalDuration, zoom, onUpdateItem]);

//   // 处理鼠标释放事件
//   const handleMouseUp = useCallback(() => {
//     setDragItem(null);
//     setDragType(null);
//   }, []);

//   // 处理双击删除
//   const handleDoubleClick = (itemId: string) => {
//     if (confirm('确定要删除这个项目吗？')) {
//       onDeleteItem(itemId);
//     }
//   };

//   // 添加全局事件监听器
//   useEffect(() => {
//     if (dragItem) {
//       document.addEventListener('mousemove', handleMouseMove);
//       document.addEventListener('mouseup', handleMouseUp);
      
//       return () => {
//         document.removeEventListener('mousemove', handleMouseMove);
//         document.removeEventListener('mouseup', handleMouseUp);
//       };
//     }
//   }, [dragItem, handleMouseMove, handleMouseUp]);

//   if (hideLabel) {
//     // 只显示轨道内容，不显示标签
//     return (
//       <div className={cn("h-16 bg-gray-800 border-b border-gray-700 relative", className)} style={{ zIndex: 1 }}>
//         <div 
//           className="relative h-full bg-gray-850" 
//           style={{ 
//             width: `${100 * zoom}%`,
//             minWidth: '100%'
//           }}
//         >
//           <TrackContent
//             items={items}
//             selectedItem={selectedItem}
//             handleMouseDown={handleMouseDown}
//             handleDoubleClick={handleDoubleClick}
//             totalDuration={totalDuration}
//             zoom={zoom}
//             title={title}
//           />
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className={cn("h-16 bg-gray-800 border-b border-gray-700 flex relative", className)} style={{ zIndex: 1 }}>
//       <TrackHeader title={title} onAddItem={onAddItem} />
//       <TrackContent
//         items={items}
//         selectedItem={selectedItem}
//         handleMouseDown={handleMouseDown}
//         handleDoubleClick={handleDoubleClick}
//         totalDuration={totalDuration}
//         zoom={zoom}
//         title={title}
//       />
//     </div>
//   );
// }
