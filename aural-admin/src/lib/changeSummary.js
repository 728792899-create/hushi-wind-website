const normalizeValue = (value) => {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeValue(value[key])
      return acc
    }, {})
  }
  return value
}

const valueKey = (value) => JSON.stringify(normalizeValue(value))

export const changedFieldLabels = (before = {}, after = {}, labels = {}) => {
  const keys = Object.keys(labels)
  return keys.filter((key) => valueKey(before?.[key]) !== valueKey(after?.[key])).map((key) => labels[key])
}

export const hasFieldChanges = (before = {}, after = {}, labels = {}) => changedFieldLabels(before, after, labels).length > 0

export const changedFieldSentence = (before = {}, after = {}, labels = {}, emptyText = '暂无未保存修改') => {
  const fields = changedFieldLabels(before, after, labels)
  return fields.length ? `未保存修改：${fields.join('、')}` : emptyText
}
