class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const createError = (status, code, message) => new HttpError(status, code, message)
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

module.exports = { HttpError, createError, asyncHandler }
