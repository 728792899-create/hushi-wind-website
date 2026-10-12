export const supportDestination = type => ({experience:'experience',dealer:'experience',download:'download',quickstart:'quickstart',contact:'contact',repair:'contact'}[type] || null)
export function supportCopy(type) {
  if(type==='experience')return {title:'预约试奏与门店咨询',subtitle:'留下城市和意向乐器，顾问将与您确认可预约地点及时间。',message:'补充需求',placeholder:'例如希望试奏的型号、使用场景或到店时间（选填）',button:'提交预约咨询',success:'预约咨询已提交，顾问将与您确认安排。',error:''}
  if(type==='maintenance')return {title:'保养与维护咨询',subtitle:'说明您的乐器与维护需求。',message:'维护需求',placeholder:'请描述需要调律、保养或检查的内容。',button:'提交维护咨询',success:'维护咨询已提交，服务人员将跟进。',error:'请至少填写 5 个字说明维护需求。'}
  if(type==='software')return {title:'固件与软件支持',subtitle:'描述设备型号、版本与遇到的问题。',message:'问题描述',placeholder:'请描述软件版本、操作过程和错误现象。',button:'提交支持请求',success:'软件支持请求已提交。',error:'请至少填写 5 个字说明软件问题。'}
  return {title:'保修与维修服务',subtitle:'提交维修需求，由服务人员跟进处理。',message:'故障描述',placeholder:'请描述现象、发生频率、是否影响演奏或连接。',button:'提交维修工单',success:'维修申请已提交，服务人员将跟进处理。',error:'请至少填写 5 个字描述故障问题。'}
}
