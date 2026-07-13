const fs = require('fs')
const path = require('path')
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3')

const joinUrl = (base, key) => `${String(base || '').replace(/\/$/, '')}/${String(key || '').replace(/^\//, '')}`

const createLocalStorage = ({ publicBase = '' } = {}) => ({
  mode: 'local',
  async publish(file) {
    const url = `/uploads/${file.filename}`
    return { url, publicUrl: publicBase ? joinUrl(publicBase, url) : url }
  },
  async close() {}
})

const createS3Storage = (options) => {
  const required = ['bucket', 'region', 'publicBase']
  const missing = required.filter((key) => !options[key])
  if (missing.length) throw new Error(`UPLOAD_STORAGE=s3 requires ${missing.join(', ')}`)
  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint || undefined,
    forcePathStyle: options.forcePathStyle,
    credentials: options.accessKeyId && options.secretAccessKey
      ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
      : undefined
  })
  return {
    mode: 's3',
    async publish(file) {
      const prefix = String(options.prefix || 'uploads').replace(/^\/+|\/+$/g, '')
      const key = `${prefix}/${path.basename(file.filename)}`
      await client.send(new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
        CacheControl: options.cacheControl || 'public, max-age=31536000, immutable'
      }))
      fs.rmSync(file.path, { force: true })
      const publicUrl = joinUrl(options.publicBase, key)
      return { url: publicUrl, publicUrl }
    },
    async close() { client.destroy() }
  }
}

const createAssetStorage = (options = {}) => options.mode === 's3'
  ? createS3Storage(options)
  : createLocalStorage(options)

module.exports = { createAssetStorage }
