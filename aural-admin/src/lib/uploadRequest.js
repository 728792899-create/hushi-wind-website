// Element Plus request adapter: bounded upload lifetime, abort support and progress.
export function uploadRequest(options) {
  const xhr = new XMLHttpRequest(),
    form = new FormData()
  xhr.open(options.method || 'POST', options.action, true)
  xhr.timeout = 120000
  for (const [key, value] of Object.entries(options.headers || {}))
    if (value != null) xhr.setRequestHeader(key, String(value))
  for (const [key, value] of Object.entries(options.data || {}))
    form.append(key, value)
  form.append(options.filename || 'file', options.file, options.file.name)
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable)
      options.onProgress({
        percent: (event.loaded / event.total) * 100,
        loaded: event.loaded,
        total: event.total,
      })
  }
  const fail = (message) =>
    options.onError(Object.assign(new Error(message), { status: xhr.status }))
  xhr.onerror = () => fail('网络中断，上传失败，请重试')
  xhr.ontimeout = () => fail('上传超过两分钟，请压缩文件或检查网络后重试')
  xhr.onload = () => {
    let body
    try {
      body = JSON.parse(xhr.responseText)
    } catch {
      return fail('上传服务返回格式不正确')
    }
    if (xhr.status >= 200 && xhr.status < 300 && body.url)
      options.onSuccess(body)
    else fail(body.error?.message || '上传失败，请重试')
  }
  xhr.send(form)
  return xhr
}
