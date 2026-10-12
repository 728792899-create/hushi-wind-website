export function resetSubmittedFields(form, submitted) {
  for (const [key, value] of Object.entries(submitted)) {
    if (form[key] === value) form[key] = key === 'serviceType' ? 'repair' : '';
  }
}
