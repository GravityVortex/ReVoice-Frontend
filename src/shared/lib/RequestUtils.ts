/**
 * 前端代理请求，解决跨域问题
 */
class RequestUtils {
  static async get(url: string, params?: Record<string, any>): Promise<any> {
    const queryParams = new URLSearchParams({ url });
    if (params) {
      queryParams.append('params', JSON.stringify(params));
    }
    const response = await fetch(`/api/request-proxy?${queryParams}`);
    return response.json();
  }

  static async post(url: string, data?: any): Promise<any> {
    const response = await fetch('/api/request-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, data }),
    });
    return response.json();
  }
}

export default RequestUtils;
