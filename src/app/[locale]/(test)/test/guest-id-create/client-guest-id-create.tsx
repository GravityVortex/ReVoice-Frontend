'use client';

import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';
import { generateVisitorId, getFingerprintAgent } from '@/shared/lib/fingerprint';

export default function ClientGuestIdCreate() {

  const [visitorId, setVisitorId] = useState<string>('');
  const [components, setComponents] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 折叠状态
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    request: false,
    email: false,
    visitor: false,
    encryption: false,
    hardware: false,
    steps: false,
    debug: false,
  });


  const testFingerprint = async () => {
    setLoading(true);
    try {
      // 生成访客 ID
      const id = await generateVisitorId();
      setVisitorId(id);

      // 获取详细组件信息
      const fp = await getFingerprintAgent();
      const result = await fp.get();
      setComponents(result.components);

      console.log('Visitor ID:', id);
      console.log('All components:', result.components);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearStorage = () => {
    localStorage.clear();
    setVisitorId('');
    setComponents(null);
    toast.success('localStorage 已清除，请重新测试');
  };

  const toggleCard = (cardId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };


  return (

    <div className="grid gap-3">
      {/* 访客 ID 卡片 */}
      <Card className='gap-0'>
        <CardHeader
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleCard('visitor')}
        >
          <div className="flex items-center justify-between">
            <div className='space-y-2'>
              <CardTitle>访客 ID（Visitor ID）</CardTitle>
              <CardDescription>
                同一台电脑的不同浏览器应该生成相同的 ID
              </CardDescription>
            </div>
            {expandedCards.visitor ? <ChevronUp className="h-5 w-5" /> :
              <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedCards.visitor && <CardContent>
          <div className="pb-0">
            <div className="p-4 bg-muted rounded-lg font-mono text-sm break-all">
              指纹ID：{loading ? '生成中...' : visitorId || '未生成'}
            </div>
            <div className="flex gap-2">
              <Button onClick={testFingerprint} disabled={loading}>
                重新生成
              </Button>
              <Button onClick={clearStorage} variant="outline">
                清除缓存
              </Button>
              <Button
                onClick={() => navigator.clipboard.writeText(visitorId)}
                variant="outline"
                disabled={!visitorId}
              >
                复制 ID
              </Button>
            </div>
          </div>
        </CardContent>}
      </Card>


      {/* 使用的组件 */}
      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleCard('hardware')}
        >
          <div className="flex items-center justify-between">
            <div className='space-y-2'>
              <CardTitle>用于生成指纹的硬件组件</CardTitle>
              <CardDescription>
                只使用跨浏览器一致的硬件特征
              </CardDescription>
            </div>
            {expandedCards.hardware ? <ChevronUp className="h-5 w-5" /> :
              <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedCards.hardware && <CardContent>
          {components && (
            <div className="space-y-2">
              <ComponentItem
                label="屏幕分辨率"
                value={JSON.stringify(components.screenResolution?.value)}
              />
              <ComponentItem
                label="屏幕帧"
                value={JSON.stringify(components.screenFrame?.value)}
              />
              <ComponentItem
                label="颜色深度"
                value={JSON.stringify(components.colorDepth?.value)}
              />
              <ComponentItem
                label="CPU 核心数"
                value={JSON.stringify(components.hardwareConcurrency?.value)}
              />
              <ComponentItem
                label="设备内存"
                value={JSON.stringify(components.deviceMemory?.value)}
              />
              <ComponentItem
                label="时区"
                value={JSON.stringify(components.timezone?.value)}
              />
              <ComponentItem
                label="平台"
                value={JSON.stringify(components.platform?.value)}
              />
              <ComponentItem
                label="触摸支持"
                value={JSON.stringify(components.touchSupport?.value)}
              />
              <ComponentItem
                label="语言"
                value={JSON.stringify(components.languages?.value)}
              />
            </div>
          )}
        </CardContent>}
      </Card>

      {/* 测试说明 */}
      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleCard('steps')}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>测试步骤</CardTitle>
            </div>
            {expandedCards.steps ? <ChevronUp className="h-5 w-5" /> :
              <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedCards.steps && <CardContent>
          <ol className="list-decimal list-inside space-y-2">
            <li>在 Chrome 中打开此页面，复制生成的访客 ID</li>
            <li>在 Safari 中打开此页面，对比访客 ID</li>
            <li>如果两个 ID 相同，说明跨浏览器指纹生成成功 ✅</li>
            <li>如果两个 ID 不同，检查控制台输出的组件信息</li>
          </ol>
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>注意：</strong>如果清除了 localStorage，会重新生成指纹。
              但只要硬件组件相同，生成的指纹就应该一致。
            </p>
          </div>
        </CardContent>}
      </Card>

      {/* 所有组件（调试用） */}
      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleCard('debug')}
        >
          <div className="flex items-center justify-between">
            <div className='space-y-2'>
              <CardTitle>所有浏览器组件（调试）</CardTitle>
              <CardDescription>
                查看所有可用的浏览器指纹组件
              </CardDescription>
            </div>
            {expandedCards.debug ? <ChevronUp className="h-5 w-5" /> :
              <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedCards.debug && <CardContent>
          {components && (
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 max-w-[70vw]">
              {JSON.stringify(components, null, 2)}
            </pre>
          )}
        </CardContent>}
      </Card>

    </div>

  );
}


function ComponentItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
      <span className="font-medium text-sm">{label}</span>
      <span className="text-sm font-mono text-muted-foreground">{value}</span>
    </div>
  );
}