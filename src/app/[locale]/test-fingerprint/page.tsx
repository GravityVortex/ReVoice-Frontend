'use client';

import { useEffect, useState } from 'react';
import { generateVisitorId, getVisitorInfo, getFingerprintAgent } from '@/shared/lib/fingerprint';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { toast } from 'sonner';

export default function TestFingerprintPage() {
  const [visitorId, setVisitorId] = useState<string>('');
  const [components, setComponents] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    testFingerprint();
  }, []);

  return (
    <div className="container w-full  p-8">
      <h1 className="text-3xl font-bold mb-8">跨浏览器指纹测试</h1>

      <div className="grid gap-6">
        {/* 访客 ID 卡片 */}
        <Card>
          <CardHeader>
            <CardTitle>访客 ID（Visitor ID）</CardTitle>
            <CardDescription>
              同一台电脑的不同浏览器应该生成相同的 ID
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg font-mono text-sm break-all">
                {loading ? '生成中...' : visitorId || '未生成'}
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
          </CardContent>
        </Card>

        {/* 使用的组件 */}
        <Card>
          <CardHeader>
            <CardTitle>用于生成指纹的硬件组件</CardTitle>
            <CardDescription>
              只使用跨浏览器一致的硬件特征
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* 测试说明 */}
        <Card>
          <CardHeader>
            <CardTitle>测试步骤</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* 所有组件（调试用） */}
        <Card>
          <CardHeader>
            <CardTitle>所有浏览器组件（调试）</CardTitle>
            <CardDescription>
              查看所有可用的浏览器指纹组件
            </CardDescription>
          </CardHeader>
          <CardContent>
            {components && (
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96 max-w-[70vw]">
                {JSON.stringify(components, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
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
