'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface Video {
  id: string;
  fileName: string;
  userId: string;
  createdAt: string;
  uploadStatus: number;
  delStatus: number;
}

export default function ClientUserVideo() {
  const [users, setUsers] = useState<User[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [emailSearch, setEmailSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteVideo, setDeleteVideo] = useState<Video | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 30;

  useEffect(() => {
    fetchUsers();
  }, [pageNum]);

  useEffect(() => {
    if (selectedUserId) {
      fetchVideos(selectedUserId);
    }
  }, [selectedUserId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (emailSearch) params.append('email', emailSearch);
      params.append('pageNum', pageNum.toString());
      params.append('pageSize', pageSize.toString());
      const res = await fetch(`/api/user/get-user-list?${params}`);
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (error) {
      toast.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchVideos = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/video-task/list?userId=${userId}&delFlag=all&limit=200`);
      const dataJO = await res.json();
      setVideos(dataJO.data.list || []);
    } catch (error) {
      toast.error('获取视频列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/video-task/delete-real?originalFileId=${deleteVideo?.id}&userId=${deleteVideo?.userId}`);
      const data = await res.json();
      if (data.code === 0) {
        toast.success('删除成功');
        fetchVideos(selectedUserId);
      } else {
        toast.error(data.message || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setDeleteDialogOpen(false);
      setDeleteVideo(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="搜索邮箱"
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
              />
              <Button onClick={() => { setPageNum(1); fetchUsers(); }}>搜索</Button>
            </div>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`p-3 border-2 rounded cursor-pointer hover:bg-muted ${selectedUserId === user.id ? 'border-primary bg-muted' : 'border-transparent'
                    }`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  {user.name && <div className="medium">用户名：{user.name}</div>}
                  <div className="text-sm text-muted-foreground">用户ID：{user.id}</div>
                  <div className="font-medium">用户邮箱：{user.email}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">共 {total} 个用户</div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum === 1}>上一页</Button>
                <div className="text-sm py-2">第 {pageNum} 页</div>
                <Button size="sm" onClick={() => setPageNum(p => p + 1)} disabled={pageNum * pageSize >= total}>下一页</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {videos.map((video) => (
              <div key={video.id} className="p-3 border rounded flex justify-between items-center">
                <div className="flex-1">
                  <div className="font-medium">{video.fileName}</div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>视频ID: {video.id}</div>
                    <div>创建时间: {new Date(video.createdAt).toLocaleString()}</div>
                    <div>上传状态: {video.uploadStatus}</div>
                    <div>
                      删除状态：
                      <span className={video.delStatus === 1 ? 'text-red-500' : 'text-green-500'}>
                        {video.delStatus === 0 ? '未删除' : '已删除'}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeleteVideo(video);
                    setDeleteDialogOpen(true);
                  }}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


      {/* 删除确认弹框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>此操作将永久删除该视频及相关任务，无法恢复。确定要继续吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>确定删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
