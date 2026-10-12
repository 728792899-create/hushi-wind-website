// A failed later page must never become a successful, incomplete collection.
export async function fetchCompleteList(url, fetcher, { signal } = {}) {
  const data = [], ids = new Set();
  let pageCount = 1;
  for (let page = 1; page <= pageCount; page++) {
    const response = await fetcher(url, { query: { page, pageSize: 100 }, signal });
    if (!Array.isArray(response?.data)) throw new Error('Invalid collection response');
    const pagination = response.meta?.pagination;
    pageCount = pagination?.pageCount ?? 1;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 10000 ||
        (pagination?.page !== undefined && pagination.page !== page) ||
        (page < pageCount && response.data.length === 0)) throw new Error('Incomplete collection response');
    for (const row of response.data) {
      if (row.id != null && ids.has(row.id)) continue;
      if (row.id != null) ids.add(row.id);
      data.push(row);
    }
  }
  return { data };
}
