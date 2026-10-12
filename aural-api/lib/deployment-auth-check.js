async function checkAuthBoundary(request,apiUrl) {
  const response=await request(`${apiUrl}/api/auth/session`);
  const json=await response.json().catch(()=>null);
  return {ok:response.status===401 && json?.success===false, detail:`unauthenticated status=${response.status}`};
}
module.exports={checkAuthBoundary};
