'use client';

import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { useState } from 'react';
import { toast } from 'sonner';
import RequestUtils from '@/shared/lib/RequestUtils';

export default function RequestTestClient() {
  // 请求测试相关状态
  const [requestUrl, setRequestUrl] = useState<string>('http://sr.xuww.cn:8080/jeecg-boot/test/getWeather?cityId=101190101');
  const [requestParams, setRequestParams] = useState<string>('');
  const [requestMethod, setRequestMethod] = useState<'GET' | 'POST'>('GET');
  const [requestResponse, setRequestResponse] = useState<string>('');
  const [requesting, setRequesting] = useState(false);

  // 折叠状态
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    request: true,
  });

  const toggleCard = (cardId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // 测试 /api/request-test 接口
  const handleRequestTest = async () => {
    setRequesting(true);
    setRequestResponse('');
    try {
      const response = await fetch('/api/request-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'test', contentType: 'test' }),
      });
      const result = await response.json();
      setRequestResponse(JSON.stringify(result, null, 2));
      toast.success('请求成功！');
    } catch (error: any) {
      setRequestResponse(JSON.stringify({ error: error.message }, null, 2));
      toast.error('请求失败：' + error.message);
    } finally {
      setRequesting(false);
    }
  };

  const handleRequest = async () => {
    if (!requestUrl.trim()) {
      toast.error('请输入请求URL');
      return;
    }

    setRequesting(true);
    setRequestResponse('');
    try {
      let result;
      const params = requestParams.trim() ? JSON.parse(requestParams) : undefined;
      if (requestMethod === 'GET') {
        // 法一：使用 RequestUtils
        result = await RequestUtils.get(requestUrl, params);
      } else {
        // 法一：使用 RequestUtils
        result = await RequestUtils.post(requestUrl, params);
      }
      console.log('RequestUtils返回result--->', result);

      // 法二：使用代理模式，post调用方便传入url和params
      // const tempUrl = '/api/request-proxy';
      // const tempPm = {
      //   url: requestUrl,
      //   data: params,
      //   method: requestMethod// GET, POST
      // }
      // result = await fetch(tempUrl, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(tempPm),
      // });
      // result = await result.json();
      // console.log('代理返回result--->', result);

      setRequestResponse(JSON.stringify(result, null, 2));
      toast.success('请求成功！');
    } catch (error: any) {
      setRequestResponse(JSON.stringify({ error: error.message }, null, 2));
      toast.error('请求失败：' + error.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card className='gap-0 py-4'>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors gap-0"
        onClick={() => toggleCard('request')}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>请求测试</CardTitle>
            <CardDescription className='mt-2'>
              测试GET/POST请求转发功能
            </CardDescription>
          </div>
          {expandedCards.request ? <ChevronUp className="h-5 w-5" /> :
            <ChevronDown className="h-5 w-5" />}
        </div>
      </CardHeader>
      {expandedCards.request && <CardContent>
        <div className="space-y-2">
          <div className="flex flex-row gap-2 mt-2 items-end">
            {/* post\get */}
            <div className="">
              <label className="block text-sm font-medium mb-1">请求方法</label>
              <div className="flex gap-1">
                <Button
                  variant={requestMethod === 'GET' ? 'default' : 'outline'}
                  onClick={() => setRequestMethod('GET')}
                  size="sm"
                  className='h-8'>
                  GET
                </Button>
                <Button
                  variant={requestMethod === 'POST' ? 'default' : 'outline'}
                  onClick={() => setRequestMethod('POST')}
                  size="sm"
                  className='h-8'>
                  POST
                </Button>
              </div>
            </div>

            <div className="grow">
              <label className="block text-sm font-medium mb-1">请求URL</label>
              <Input
                className='h-8'
                placeholder="http://example.com/api"
                value={requestUrl}
                onChange={(e) => setRequestUrl(e.target.value)}
              />
            </div>
            <Button
              className="w-14 h-8 align-bottom"
              onClick={handleRequest} disabled={requesting || !requestUrl.trim()} >
              {requesting ? '请求中...' : '调用'}
            </Button>
            {/* 触发 /api/request-test 接口 */}
            <Button
              className="h-8"
              onClick={handleRequestTest} disabled={requesting} variant="outline">
              测试接口
            </Button>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium mb-1">请求参数（JSON格式）</label>
            <Textarea
              placeholder='{"key": "value"}'
              value={requestParams}
              onChange={(e) => setRequestParams(e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          {requestResponse && (
            <div className="space-y-2">
              <label className="text-sm font-medium">返回结果</label>
              <pre className="p-3 bg-muted rounded-lg font-mono text-xs overflow-auto max-h-96">
                {requestResponse}
              </pre>
            </div>
          )}
        </div>
      </CardContent>}
    </Card>
  );
}
