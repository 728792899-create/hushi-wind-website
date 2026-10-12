const providerName = value => ({wechat:'wecom',qywx:'wecom',lark:'feishu'}[value] || value || 'generic');
function notificationPayload(provider, payload) {
  const kind=providerName(provider);
  if (kind==='generic' || !['wecom','dingtalk','feishu'].includes(kind)) return payload;
  if (payload.msgtype || payload.msg_type) return payload;
  // Business reminders contain only a type and record reference. Private customer
  // details remain in the authenticated admin interface.
  const label={inquiry:'新客户咨询',inquiry_created:'新客户咨询',artist_application:'新艺术家合作申请',artist_application_created:'新艺术家合作申请'}[payload.type] || '网站业务通知';
  const raw=`胡氏管乐 · ${label}\n请登录管理后台查看并跟进。`;
  return kind==='feishu' ? {msg_type:'text',content:{text:raw}} : {msgtype:'text',text:{content:raw}};
}
async function assertWebhookAccepted(response, provider) {
  if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
  const kind=providerName(provider);
  if (!['wecom','dingtalk','feishu'].includes(kind)) { await response.body?.cancel(); return; }
  const body=await response.json().catch(()=>null);
  const code=kind==='feishu' ? body?.code ?? body?.StatusCode : body?.errcode;
  if (code!==0) throw new Error(`通知平台未确认接收 (${kind}, code=${typeof code==='number'?code:'invalid_response'})`);
}
module.exports={notificationPayload,assertWebhookAccepted};
