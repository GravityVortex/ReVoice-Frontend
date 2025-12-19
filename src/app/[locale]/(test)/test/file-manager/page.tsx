'use client';

import { useState, useEffect } from 'react';
import { Folder, File, Trash2 } from 'lucide-react';

export default function FileManager() {
  const [currentPath, setCurrentPath] = useState('');
  const [fileList, setFileList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [bucketName, setBucketName] = useState('');

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath]);

  const loadFiles = async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/storage/get-pathfile-list?r2Path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.code === 0) {
        setFileList(data.data.fileList);
        setBucketName(data.data.bucketName);
      }
    } catch (error) {
      console.error('加载文件列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm('确定要删除吗？')) return;
    try {
      await fetch(`/api/storage/delete-pathandfiles?r2Path=${encodeURIComponent(path)}`);
      loadFiles(currentPath);
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const pathSegments = currentPath.split('/').filter(Boolean);

  return (
    <div className="p-6 w-full">
      <div>
        <h1 className="text-2xl font-bold mb-4">轻量级R2文件管理器【私桶：{bucketName}】</h1>
      </div>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setCurrentPath('')} className="hover:underline">根目录</button>
          {pathSegments.map((segment, index) => (
            <span key={index} className="flex items-center gap-2">
              <span>/</span>
              <button
                onClick={() => setCurrentPath(pathSegments.slice(0, index + 1).join('/') + '/')}
                className="hover:underline"
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="border rounded-lg">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 bg-gray-300 dark:bg-gray-700 rounded animate-pulse" />
                <div className="w-48 h-4 bg-gray-300 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="w-8 h-8 bg-gray-300 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))
        ) : (
          <>
          {fileList.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 border-b last:border-b-0 hover:bg-black/9"
            >
              <div className="flex items-center gap-3">
                {item.type === 'folder' ? (
                  <Folder className="w-5 h-5 text-blue-500" />
                ) : (
                  <File className="w-5 h-5 text-gray-500" />
                )}
                {item.type === 'folder' ? (
                  <button onClick={() => setCurrentPath(item.path)} className="hover:underline">
                    {item.name}
                  </button>
                ) : (
                  <span>{item.name}</span>
                )}
              </div>
              <button
                onClick={() => handleDelete(item.path)}
                className="p-2 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ))}
          {fileList.length === 0 && <div className="p-4 text-center text-gray-500">空文件夹</div>}
          </>
        )}
      </div>
    </div>
  );
}
