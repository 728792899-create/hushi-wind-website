// Parse only: importing or validating this module performs no I/O or environment mutation.
function deploymentReadinessConfig(env = process.env) {
  const milliseconds = (name, fallback, maximum) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      throw new Error(`${name} must be an integer from 1 to ${maximum}`);
    return value;
  };
  return {
    requestTimeout: milliseconds('POST_DEPLOY_TIMEOUT_MS', 10000, 60000),
    readyTimeout: milliseconds('POST_DEPLOY_READY_TIMEOUT_MS', 60000, 300000),
    readyInterval: milliseconds('POST_DEPLOY_READY_INTERVAL_MS', 1000, 10000),
  };
}
module.exports = { deploymentReadinessConfig };
