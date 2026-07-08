import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

process.chdir(rootDir)

console.log('📦 开始创建部署包...\n')

const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '')
const packageName = `aural-website-optimized-${timestamp}.zip`

const filesToInclude = [
  'server/middleware/logger.ts',
  'server/middleware/rate-limit.ts',
  'server/routes/sitemap.xml.js',
  'app/config/site.config.ts',
  'app/composables/useBrandAssets.js',
  'app/plugins/performance-monitor.client.js',
  'docs/DEPLOYMENT.md',
  '.github/workflows/deploy.yml',
  '.github/workflows/test.yml',
  '.github/dependabot.yml',
  '.eslintrc.js',
  '.prettierrc',
  '.env.production.example',
  'nuxt.config.ts',
  'package.json',
  'CHANGELOG.md',
  'DEPLOY_README.md'
]

console.log('✅ 检查文件是否存在...')
const missingFiles = []
filesToInclude.forEach(file => {
  if (!fs.existsSync(file)) {
    missingFiles.push(file)
    console.log(`   ❌ 缺失: ${file}`)
  } else {
    console.log(`   ✓ ${file}`)
  }
})

if (missingFiles.length > 0) {
  console.error(`\n❌ 错误: ${missingFiles.length} 个文件缺失`)
  process.exit(1)
}

console.log('\n🗜️  压缩文件...')
try {
  const fileList = filesToInclude.map(f => `"${f}"`).join(',')
  execSync(`powershell Compress-Archive -Path ${fileList} -DestinationPath "${packageName}" -Force`, {
    stdio: 'inherit'
  })

  const stats = fs.statSync(packageName)
  const fileSizeInKB = (stats.size / 1024).toFixed(2)

  console.log(`\n✅ 部署包创建成功!`)
  console.log(`   📦 文件名: ${packageName}`)
  console.log(`   📊 大小: ${fileSizeInKB} KB`)
  console.log(`   📁 包含文件: ${filesToInclude.length} 个`)
  console.log(`\n📋 下一步:`)
  console.log(`   1. 上传 ${packageName} 到服务器`)
  console.log(`   2. 阅读 DEPLOY_README.md 了解部署步骤`)
  console.log(`   3. 执行部署命令`)

} catch (error) {
  console.error('\n❌ 压缩失败:', error.message)
  process.exit(1)
}
