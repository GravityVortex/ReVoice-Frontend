export function respData(data: any) {
  return respJson(0, 'ok', data || []);
}

export function respOk() {
  return respJson(0, 'ok');
}

export function respErr(message: string) {
  // Keep wrapper shape stable for callers that always read `resp.data`.
  return respJson(-1, message, null);
}

export function respJson(code: number, message: string, data?: any) {
  const json: any = {
    code: code,
    message: message,
    data: data,
  };
  if (data) {
    json['data'] = data;
  }

  return Response.json(json);
}
