'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';

import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Calendar } from '@/shared/components/ui/calendar';

const EXPIRY_PRESETS = [
  { label: '一个月', days: 30 },
  { label: '两个月', days: 60 },
  { label: '三个月', days: 90 },
  { label: '半年', days: 180 },
  { label: '一年', days: 365 },
];

export function GrantCreditsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [credits, setCredits] = useState(10);
  const [description, setDescription] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customDate, setCustomDate] = useState<Date>();
  const [showCustomCalendar, setShowCustomCalendar] = useState(false);

  const getExpiryDate = () => {
    if (selectedPreset === -1 && customDate) {
      return customDate;
    }
    const days = EXPIRY_PRESETS[selectedPreset]?.days || 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  };

  const handleSubmit = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    if (credits <= 0) {
      toast.error('积分必须大于0');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/credit/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          credits,
          description,
          expiresAt: getExpiryDate().toISOString(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('积分赠送成功');
        onOpenChange(false);
        router.refresh();
        setEmail('');
        setCredits(10);
        setDescription('');
        setSelectedPreset(0);
        setCustomDate(undefined);
      } else {
        toast.error(data.error || '赠送失败');
      }
    } catch (error) {
      toast.error('赠送失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent className="sm:max-w-[600px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>赠送积分</DialogTitle>
          <DialogDescription>向用户赠送积分</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="请输入用户邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="credits">积分</Label>
            <Input
              id="credits"
              type="number"
              min="1"
              value={credits}
              onChange={(e) => setCredits(parseInt(e.target.value) || 10)}
            />
          </div>

          <div className="grid gap-2">
            <Label>有效期</Label>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_PRESETS.map((preset, index) => (
                <Button
                  key={index}
                  type="button"
                  variant={selectedPreset === index && !showCustomCalendar ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedPreset(index);
                    setShowCustomCalendar(false);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                type="button"
                variant={showCustomCalendar ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setShowCustomCalendar(!showCustomCalendar);
                  setSelectedPreset(-1);
                }}
              >
                {customDate ? format(customDate, 'yyyy年MM月dd日', { locale: zhCN }) : '自定义'}
              </Button>
            </div>
            {showCustomCalendar && (
              <div className="mt-2">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={(date) => {
                    console.log('date-->', date)
                    if (date) {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (date < today) {
                        toast.error('请选择今天之后的日期');
                        return;
                      }
                      const fullDate = new Date(date);
                      fullDate.setHours(23, 59, 59, 999);
                      setCustomDate(fullDate);
                    }
                  }}
                  startMonth={new Date()}
                  locale={zhCN}
                  className="w-full"
                  classNames={{
                    months: "w-full",
                    caption: "flex justify-between items-center mb-2",
                    caption_label: "text-sm font-medium",
                    nav: "flex items-center gap-1",
                    nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100 border rounded",
                    table: "w-full border-collapse",
                    head_row: "flex w-full justify-between",
                    head_cell: "w-8 text-muted-foreground text-center text-xs font-normal",
                    row: "flex w-full justify-between",
                    cell: "w-8 h-8 text-center text-sm p-0 relative flex items-center justify-center",
                    day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                  }}
                />
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">赠送说明</Label>
            <Textarea
              id="description"
              placeholder="请输入赠送说明"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? '赠送中...' : '赠送'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
