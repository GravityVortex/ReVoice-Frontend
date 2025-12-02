'use client';

import { useState } from 'react';

export default function TestUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string>('');

  const [file2, setFile2] = useState<File | null>(null);
  const [uploading2, setUploading2] = useState(false);
  const [progress2, setProgress2] = useState(0);
  const [result2, setResult2] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult('');
    }
  };

  const handleFileChange2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile2(e.target.files[0]);
      setResult2('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setResult('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      const response = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));

        xhr.open('POST', '/api/storage/stream');
        xhr.send(formData);
      });

      setResult(`上传成功！\n文件 URL: ${response.url}`);
    } catch (error) {
      setResult(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDirectUpload = async () => {
    if (!file2) return;

    setUploading2(true);
    setProgress2(0);
    setResult2('');

    try {
      const res = await fetch('/api/storage/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file2.name, contentType: file2.type }),
      });

      if (!res.ok) throw new Error('Failed to get presigned URL');

      const { presignedUrl, publicUrl } = await res.json();

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress2(Math.round((e.loaded / e.total) * 100));
        }
      });

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) resolve(xhr.response);
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Upload failed'));

        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file2.type);
        xhr.send(file2);
      });

      setResult2(`上传成功！\n文件 URL: ${publicUrl}\n\n注意：需要在 R2 Bucket 设置 CORS 规则才能正常工作`);
    } catch (error) {
      setResult2(`上传失败: ${error instanceof Error ? error.message : '未知错误'}\n\n如果是 CORS 错误，请在 R2 控制台配置 CORS 规则`);
    } finally {
      setUploading2(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>R2 大文件上传测试</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '30px' }}>
        {/* 方式1：通过后端代理 */}
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px' }}>方式1：后端代理上传</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>通过 Next.js API 接收文件并转发到 R2</p>

          <div style={{ marginTop: '20px' }}>
            <input
              type="file"
              accept="video/mp4"
              onChange={handleFileChange}
              disabled={uploading}
              style={{ display: 'block', marginBottom: '10px' }}
            />
            {file && (
              <p style={{ fontSize: '14px', color: '#666' }}>
                已选择: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{
              padding: '10px 20px',
              backgroundColor: uploading ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: uploading ? 'not-allowed' : 'pointer',
              marginTop: '10px',
            }}
          >
            {uploading ? '上传中...' : '上传'}
          </button>

          {uploading && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ width: '100%', height: '20px', backgroundColor: '#f0f0f0', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#0070f3', transition: 'width 0.3s' }} />
              </div>
              <p style={{ textAlign: 'center', marginTop: '10px' }}>{progress}%</p>
            </div>
          )}

          {result && (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              backgroundColor: result.includes('成功') ? '#d4edda' : '#f8d7da',
              border: `1px solid ${result.includes('成功') ? '#c3e6cb' : '#f5c6cb'}`,
              color: result.includes('成功') ? '#155724' : '#721c24',
              borderRadius: '5px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: '14px',
            }}>
              {result}
            </div>
          )}
        </div>

        {/* 方式2：直接上传到 R2 */}
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px' }}>方式2：直接上传到 R2</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>使用预签名 URL 直接上传（需配置 CORS）</p>

          <div style={{ marginTop: '20px' }}>
            <input
              type="file"
              accept="video/mp4"
              onChange={handleFileChange2}
              disabled={uploading2}
              style={{ display: 'block', marginBottom: '10px' }}
            />
            {file2 && (
              <p style={{ fontSize: '14px', color: '#666' }}>
                已选择: {file2.name} ({(file2.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <button
            onClick={handleDirectUpload}
            disabled={!file2 || uploading2}
            style={{
              padding: '10px 20px',
              backgroundColor: uploading2 ? '#ccc' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: uploading2 ? 'not-allowed' : 'pointer',
              marginTop: '10px',
            }}
          >
            {uploading2 ? '上传中...' : '直接上传'}
          </button>

          {uploading2 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ width: '100%', height: '20px', backgroundColor: '#f0f0f0', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${progress2}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.3s' }} />
              </div>
              <p style={{ textAlign: 'center', marginTop: '10px' }}>{progress2}%</p>
            </div>
          )}

          {result2 && (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              backgroundColor: result2.includes('成功') ? '#d4edda' : '#f8d7da',
              border: `1px solid ${result2.includes('成功') ? '#c3e6cb' : '#f5c6cb'}`,
              color: result2.includes('成功') ? '#155724' : '#721c24',
              borderRadius: '5px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: '14px',
            }}>
              {result2}
            </div>
          )}

          <div style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '5px',
            fontSize: '13px',
            color: '#721c24'
          }}>
            <strong>CORS 配置说明：</strong>
            <pre style={{ marginTop: '10px', fontSize: '12px', overflow: 'auto' }}>
{`[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"]
  }
]`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
