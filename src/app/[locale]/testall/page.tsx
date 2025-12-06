'use client';

import { useEffect, useState } from 'react';
import { generateVisitorId, getVisitorInfo, getFingerprintAgent } from '@/shared/lib/fingerprint';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';
import EncryptionUtil from '@/shared/lib/EncryptionUtil'
import EncryptionUtilSimple from '@/shared/lib/EncryptionUtilSimple'
import RequestUtils from '@/shared/lib/RequestUtils'

export default function TestFingerprintPage() {
  const [visitorId, setVisitorId] = useState<string>('');
  const [components, setComponents] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 邮箱测试相关状态
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('测试邮件');
  const [sendingEmail, setSendingEmail] = useState(false);

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

  // 请求测试相关状态
  const [requestUrl, setRequestUrl] = useState<string>('http://sr.xuww.cn:8080/jeecg-boot/test/getWeather?cityId=101190101');
  const [requestParams, setRequestParams] = useState<string>('');
  const [requestMethod, setRequestMethod] = useState<'GET' | 'POST'>('GET');
  const [requestResponse, setRequestResponse] = useState<string>('');
  const [requesting, setRequesting] = useState(false);

  // 加解密相关状态
  const [encryptionInput, setEncryptionInput] = useState<string>(JSON.stringify({
    code: 200,
    status: 'success',
    message: '请求处理成功',
    data: {
      key: 121,
      key2: '中文value测试'
    },
  }));
  const [encryptedOutput, setEncryptedOutput] = useState<string>('');
  const [decryptedOutput, setDecryptedOutput] = useState<string>('');
  const [encryptionType, setEncryptionType] = useState<'util' | 'simple'>('util');


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

  const handleEncrypt = () => {
    try {
      const data = JSON.parse(encryptionInput);
      const encrypted = encryptionType === 'util'
        ? EncryptionUtil.encryptRequest(data)
        : EncryptionUtilSimple.encryptRequest(data);
      // 保存加密结果
      setEncryptedOutput(encrypted);
      // 清空解密结果
      setDecryptedOutput('');
      toast.success('加密成功！');
    } catch (error: any) {
      toast.error('加密失败：' + error.message);
    }
  };

  const handleDecrypt = () => {
    try {
      if (!encryptedOutput) {
        toast.error('请先加密数据');
        return;
      }
      const decrypted = encryptionType === 'util'
        ? EncryptionUtil.decryptRequest(encryptedOutput)
        : EncryptionUtilSimple.decryptRequest(encryptedOutput);
      setDecryptedOutput(JSON.stringify(decrypted, null, 2));
      toast.success('解密成功！');
    } catch (error: any) {
      toast.error('解密失败：' + error.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
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

  const sendTestEmail = async () => {
    if (!emailTo.trim()) {
      toast.error('请输入收件人邮箱');
      return;
    }

    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTo)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch('/api/email/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emails: [emailTo],
          subject: emailSubject || '测试邮件',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('邮件发送成功！');
        console.log('Email sent:', data);
      } else {
        toast.error(`发送失败：${data.error || '未知错误'}`);
        console.error('Email send failed:', data);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('发送邮件时出错，请查看控制台');
    } finally {
      setSendingEmail(false);
    }
  };

  useEffect(() => {
    testFingerprint();

    // 请求数据测试
    const requestDataPre = {
      code: 200,
      status: 'success',
      message: '请求处理成功',
      data: {
        key: 121,
        key2: '中文value测试'
      },
    };

    // 加密响应
    const encryptedRequestData = EncryptionUtil.encryptRequest(requestDataPre);
    console.log('加密密文--->', encryptedRequestData);
    // 解密并验证请求
    const requestData = EncryptionUtil.decryptRequest(encryptedRequestData);
    console.log('解密明文--->', requestData);

    // 加密响应
    const encryptedRequestData2 = EncryptionUtilSimple.encryptRequest(requestDataPre);
    console.log('加密密文--->', encryptedRequestData2);
    // 解密并验证请求
    const requestData2 = EncryptionUtilSimple.decryptRequest(encryptedRequestData2);
    console.log('解密明文--->', requestData);


  }, []);

  return (
    <div className="container w-full  p-8">
      <h1 className="text-3xl font-bold mb-8">跨浏览器指纹测试</h1>

      <div className="grid gap-3">

        {/* 请求测试 */}
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

        {/* 加解密测试 */}
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => toggleCard('encryption')}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>加解密测试</CardTitle>
                <CardDescription>
                  测试数据加密和解密功能
                </CardDescription>
              </div>
              {expandedCards.encryption ? <ChevronUp className="h-5 w-5" /> :
                <ChevronDown className="h-5 w-5" />}
            </div>
          </CardHeader>
          {expandedCards.encryption && <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">加密类型</label>
                <div className="flex gap-2">
                  <Button
                    variant={encryptionType === 'util' ? 'default' : 'outline'}
                    onClick={() => setEncryptionType('util')}
                    size="sm"
                  >
                    EncryptionUtil
                  </Button>
                  <Button
                    variant={encryptionType === 'simple' ? 'default' : 'outline'}
                    onClick={() => setEncryptionType('simple')}
                    size="sm"
                  >
                    EncryptionUtilSimple
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">输入 JSON 数据</label>
                <Textarea
                  placeholder='{"code": 200, "message": "测试数据"}'
                  value={encryptionInput}
                  onChange={(e) => setEncryptionInput(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleEncrypt} disabled={!encryptionInput.trim()}>
                  加密
                </Button>
                <Button onClick={handleDecrypt} variant="outline" disabled={!encryptedOutput}>
                  解密
                </Button>
              </div>

              {encryptedOutput && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">加密密文</label>
                  <div className="relative">
                    <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all pr-10">
                      {encryptedOutput}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(encryptedOutput)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {decryptedOutput && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">解密明文</label>
                  <pre className="p-3 bg-muted rounded-lg font-mono text-xs overflow-auto">
                    {decryptedOutput}
                  </pre>
                </div>
              )}
            </div>
          </CardContent>}
        </Card>
        {/* 邮箱发送测试 */}
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => toggleCard('email')}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>邮箱发送测试</CardTitle>
                <CardDescription>
                  测试邮箱服务配置是否正确
                </CardDescription>
              </div>
              {expandedCards.email ? <ChevronUp className="h-5 w-5" /> :
                <ChevronDown className="h-5 w-5" />}
            </div>
          </CardHeader>
          {expandedCards.email && <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email-to" className="text-sm font-medium">
                  收件人邮箱
                </label>
                <Input
                  id="email-to"
                  type="email"
                  placeholder="example@email.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  disabled={sendingEmail}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email-subject" className="text-sm font-medium">
                  邮件主题
                </label>
                <Input
                  id="email-subject"
                  type="text"
                  placeholder="测试邮件"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  disabled={sendingEmail}
                />
              </div>

              <Button
                onClick={sendTestEmail}
                disabled={sendingEmail || !emailTo.trim()}
                className="w-full"
              >
                {sendingEmail ? '发送中...' : '发送测试邮件'}
              </Button>

              <div
                className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>提示：</strong>邮件将发送一个包含验证码 "123455" 的测试邮件。
                  请检查收件箱（可能在垃圾邮件中）。
                </p>
              </div>
            </div>
          </CardContent>}
        </Card>

        {/* 访客 ID 卡片 */}
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => toggleCard('visitor')}
          >
            <div className="flex items-center justify-between">
              <div>
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
          </CardContent>}
        </Card>


        {/* 使用的组件 */}
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => toggleCard('hardware')}
          >
            <div className="flex items-center justify-between">
              <div>
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
              <div>
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
