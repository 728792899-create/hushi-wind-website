const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createDatabaseBackup,verifyBackupBundle,pruneBackups}=require('./database-backup');
function createBackupScheduler(db,{source,uploadsRoot,backupRoot,isPaused=()=>false,create=createDatabaseBackup,verify=verifyBackupBundle,prune=pruneBackups}) {
  let busy=false;
  async function run() {
    if(busy||isPaused())return {skipped:true};
    busy=true;
    try {
      const last=await db.backupRecord.findFirst({where:{status:'success',operator:'scheduled'},orderBy:{createdAt:'desc'}});
      if(last&&Date.now()-new Date(last.createdAt).getTime()<86400000) {
        try {await verify(path.join(backupRoot,last.filename),{requireAssets:true});return {skipped:true};}catch{/* Missing/corrupt recovery point: create a replacement now. */}
      }
      if(isPaused())return {skipped:true};
      const filename=`database.scheduled.${new Date().toISOString().replace(/[:.]/g,'-')}.${randomUUID()}.db`,destination=path.join(backupRoot,filename);
      const result=await create(source,destination,{uploadsRoot,requireAssets:true});
      await verify(destination,{requireAssets:true});
      await db.backupRecord.create({data:{filename,size:result.size,operator:'scheduled',status:'success',message:'每日自动备份，数据库与素材校验通过'}});
      if(!isPaused())await prune(backupRoot,Number(process.env.BACKUP_RETENTION_DAYS)||14);
      return {filename};
    }catch(error){
      await db.maintenanceRun.create({data:{task:'scheduled-backup',status:'failed',details:'自动备份失败，请检查磁盘空间、目录权限和素材完整性'}});
      throw error;
    }finally{busy=false;}
  }
  return {run};
}
module.exports={createBackupScheduler};
