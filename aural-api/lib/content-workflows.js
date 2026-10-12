const { reconcileCatalogSnapshot, contentHistory } = require('./content-history');
const crypto = require('node:crypto');
const { validationError } = require('./security');
const hash = (value) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defaults = [
  ['piano', '钢琴', ['键数', '音板', '尺寸', '重量']],
  ['guitar', '吉他与贝斯', ['琴体', '琴颈', '拾音器', '弦数']],
  ['synth', '电子键盘', ['键数', '复音数', '音色', '接口']],
  ['woodwind', '木管乐器', ['调性', '管体材质', '按键系统', '附件']],
  ['brass', '铜管乐器', ['调性', '管径', '喇叭口', '表面处理']],
  ['percussion', '打击乐器', ['鼓腔材质', '规格', '配置', '附件']],
  ['audio', '专业音响', ['功率', '频响', '输入输出', '尺寸']],
].map(([slug, name, keys], sortOrder) => ({
  slug,
  name,
  sortOrder,
  specTemplate: JSON.stringify(keys),
}));

function registerContentWorkflows({
  app,
  prisma,
  read,
  write,
  requireAdmin,
  requirePermission,
  canAdmin,
  specs,
  auditOperation,
  saveContentVersion,
  secret,
  createError,
}) {
  const previewSecret = crypto
    .createHmac('sha256', secret)
    .update('hushi:content-preview:v1')
    .digest();
  const getSpec = (module, req, operation = 'read', allowCrm = false) => {
    const spec = specs[module];
    if (!spec || (spec.permission === 'crm' && !allowCrm))
      throw createError(404, 'NOT_FOUND', '此类型不支持内容草稿或预览');
    if (!canAdmin(req.admin, `${spec.permission}:${operation}`))
      throw createError(403, 'FORBIDDEN', '没有此内容的操作权限');
    return spec;
  };
  const draftVersion = draft => draft ? hash({ id: draft.id, payload: draft.payload, baseHash: draft.baseHash, updatedAt: draft.updatedAt }) : 'none';
  const matchDraft = (req, draft) => {
    const expected = req.headers['if-match'];
    if (expected !== draftVersion(draft) && !(expected === undefined && !draft))
      throw createError(409, 'DRAFT_CHANGED', '修改草稿已变化，请重新加载草稿并核对后再操作；当前表单尚未保存');
  };
  const idOf = (value) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw validationError('ID 不合法');
    return id;
  };
  app.get(
    '/api/catalog',
    read(async (req, res) => {
      const categories = await prisma.productCategory.findMany({
        orderBy: { sortOrder: 'asc' },
      });
      const series = await prisma.productSeries.findMany({
        orderBy: { sortOrder: 'asc' },
      });
      res.json({
        categories: categories.length ? categories : defaults,
        series,
      });
    }),
  );
  app.post(
    '/api/admin/catalog/:kind',
    requireAdmin,
    requirePermission('products:write'),
    write(async (req, res) => {
      const kind = req.params.kind;
      if (!['categories', 'series'].includes(kind))
        throw validationError('目录类型不合法');
      if (!(await prisma.productCategory.count()))
        await prisma.productCategory.createMany({ data: defaults });
      const name =
        typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name || name.length > 80)
        throw validationError('名称长度应为 1–80 字符');
      const sortOrder = Number(req.body.sortOrder || 0);
      if (!Number.isSafeInteger(sortOrder))
        throw validationError('排序必须为整数');
      let data, model;
      if (kind === 'categories') {
        const slug = req.body.slug;
        if (typeof slug !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(slug))
          throw validationError('分类标识应为 2–40 位小写英文、数字和短横线');
        let keys;
        try {
          keys = JSON.parse(req.body.specTemplate || '[]');
        } catch {
          throw validationError('参数模板格式不正确');
        }
        if (
          !Array.isArray(keys) ||
          keys.length > 30 ||
          keys.some((k) => typeof k !== 'string' || k.length > 80)
        )
          throw validationError('参数模板最多 30 个文本项');
        model = 'productCategory';
        data = { name, slug, sortOrder, specTemplate: JSON.stringify(keys) };
      } else {
        if (
          !(await prisma.productCategory.findUnique({
            where: { slug: req.body.categorySlug },
          }))
        )
          throw validationError('请先选择有效分类');
        model = 'productSeries';
        data = { name, categorySlug: req.body.categorySlug, sortOrder };
      }
      const existing = req.body.id
        ? await prisma[model].findUnique({ where: { id: idOf(req.body.id) } })
        : req.body.editDefault && kind === 'categories'
          ? await prisma.productCategory.findUnique({
              where: { slug: data.slug },
            })
          : null;
      if (req.body.id && !existing)
        throw createError(404, 'NOT_FOUND', '目录记录不存在');
      if (existing && kind === 'categories' && existing.slug !== data.slug)
        throw validationError('已有分类标识不可修改');
      if (
        existing &&
        kind === 'series' &&
        existing.categorySlug !== data.categorySlug &&
        (await prisma.product.count({ where: { series: existing.name } }))
      )
        throw createError(
          409,
          'IN_USE',
          '使用中的系列不能更改所属分类，请先调整关联产品',
        );
      if (existing && kind === 'series' && existing.name !== name)
        for (const table of [
          'product',
          'supportFaq',
          'supportDownload',
          'quickGuide',
        ])
          await prisma[table].updateMany({
            where: { series: existing.name },
            data: { series: name },
          });
      const row = existing
        ? await prisma[model].update({ where: { id: existing.id }, data })
        : await prisma[model].create({ data });
      await auditOperation(req, {
        action: existing ? 'UPDATE' : 'CREATE',
        module: 'products',
        target: name,
        summary: '维护产品分类与系列',
        beforeData: existing,
        afterData: row,
      });
      res.json({ data: row });
    }),
  );
  app.delete(
    '/api/admin/catalog/:kind/:id',
    requireAdmin,
    requirePermission('products:write'),
    write(async (req, res) => {
      const model =
        req.params.kind === 'categories'
          ? 'productCategory'
          : req.params.kind === 'series'
            ? 'productSeries'
            : null;
      if (!model) throw validationError('目录类型不合法');
      const row = await prisma[model].findUnique({
        where: { id: idOf(req.params.id) },
      });
      if (!row) throw createError(404, 'NOT_FOUND', '目录不存在');
      const used = await prisma.product.count({
        where:
          model === 'productCategory'
            ? { type: row.slug }
            : { series: row.name },
      });
      const child =
        model === 'productCategory'
          ? await prisma.productSeries.count({
              where: { categorySlug: row.slug },
            })
          : 0;
      if (used || child)
        throw createError(409, 'IN_USE', '该分类或系列仍被使用，不能删除');
      await prisma[model].delete({ where: { id: row.id } });
      await auditOperation(req, {
        action: 'DELETE',
        module: 'products',
        target: row.name,
        summary: '删除未使用目录',
      });
      res.json({ success: true });
    }),
  );
  app.get(
    '/api/admin/content-drafts/:module/:id',
    requireAdmin,
    read(async (req, res) => {
      getSpec(req.params.module, req);
      const recordId = idOf(req.params.id);
      const data = await prisma.contentDraft.findUnique({
        where: { module_recordId: { module: req.params.module, recordId } },
      });
      res.json({
        data: data ? { ...data, version: draftVersion(data), payload: JSON.parse(data.payload) } : null,
      });
    }),
  );
  app.put(
    '/api/admin/content-drafts/:module/:id',
    requireAdmin,
    write(async (req, res) => {
      const module = req.params.module,
        spec = getSpec(module, req, 'write'),
        recordId = idOf(req.params.id);
      const current = await prisma[spec.model].findUnique({
        where: { id: recordId },
      });
      if (!current) throw createError(404, 'NOT_FOUND', '内容不存在');
      const payload = spec.validate({ ...current, ...req.body });
      const prior = await prisma.contentDraft.findUnique({
        where: { module_recordId: { module, recordId } },
      });
      matchDraft(req, prior);
      const data = await prisma.contentDraft.upsert({
        where: { module_recordId: { module, recordId } },
        create: {
          module,
          recordId,
          payload: JSON.stringify(payload),
          baseHash: hash(current),
          operator: req.admin.username,
        },
        update: {
          payload: JSON.stringify(payload),
          operator: req.admin.username,
          baseHash: prior?.baseHash || hash(current),
        },
      });
      await auditOperation(req, {
        action: 'DRAFT',
        module: spec.permission,
        targetId: recordId,
        summary: '保存修改草稿，官网尚未更新',
      });
      res.json({ data: { ...data, version: draftVersion(data), payload } });
    }),
  );
  app.post(
    '/api/admin/content-drafts/:module/:id/publish',
    requireAdmin,
    write(async (req, res) => {
      const module = req.params.module,
        spec = getSpec(module, req, 'write'),
        recordId = idOf(req.params.id);
      const draft = await prisma.contentDraft.findUnique({
        where: { module_recordId: { module, recordId } },
      });
      const current = await prisma[spec.model].findUnique({
        where: { id: recordId },
      });
      if (!draft || !current)
        throw createError(404, 'NOT_FOUND', '修改草稿不存在');
      matchDraft(req, draft);
      if (hash(current) !== draft.baseHash)
        throw createError(
          409,
          'DRAFT_CONFLICT',
          '官网内容已被其他操作更新，请放弃旧草稿并重新加载官网最新内容后再编辑',
        );
      const payload = spec.validate({
        ...JSON.parse(draft.payload),
        ...(module === 'config' ? {} : { status: 'published' }),
      });
      await saveContentVersion(req, module, current);
      const data = await prisma[spec.model].update({
        where: { id: recordId },
        data: payload,
      });
      await prisma.contentDraft.delete({ where: { id: draft.id } });
      await auditOperation(req, {
        action: 'PUBLISH',
        module: spec.permission,
        targetId: recordId,
        summary: '发布修改草稿',
        beforeData: current,
        afterData: data,
      });
      res.json({ data });
    }),
  );
  app.delete(
    '/api/admin/content-drafts/:module/:id',
    requireAdmin,
    write(async (req, res) => {
      const spec = getSpec(req.params.module, req, 'write');
      const prior = await prisma.contentDraft.findUnique({where:{module_recordId:{module:req.params.module,recordId:idOf(req.params.id)}}});
      matchDraft(req, prior);
      await prisma.contentDraft.deleteMany({
        where: { module: req.params.module, recordId: idOf(req.params.id) },
      });
      await auditOperation(req, {
        action: 'DISCARD_DRAFT',
        module: spec.permission,
        targetId: req.params.id,
        summary: '放弃修改草稿',
      });
      res.json({ success: true });
    }),
  );
  app.post(
    '/api/admin/preview-ticket/:module/:id',
    requireAdmin,
    read(async (req, res) => {
      const spec = getSpec(req.params.module, req);
      const current = await prisma[spec.model].findUnique({where:{id:idOf(req.params.id)}});
      if (!current) throw createError(404,'NOT_FOUND','内容不存在');
      const draft = await prisma.contentDraft.findUnique({where:{module_recordId:{module:req.params.module,recordId:idOf(req.params.id)}}});
      matchDraft(req,draft);
      const payload = Buffer.from(
        JSON.stringify({
          kind: 'content-preview',
          draftVersion: draftVersion(draft),
          currentHash: hash(current),
          module: req.params.module,
          id: idOf(req.params.id),
          uid: req.admin.id,
          tv: req.admin.tokenVersion,
          exp: Date.now() + 15 * 60000,
        }),
      ).toString('base64url');
      res.json({
        token:
          payload +
          '.' +
          crypto
            .createHmac('sha256', previewSecret)
            .update(payload)
            .digest('base64url'),
        expiresIn: 900,
      });
    }),
  );
  app.get(
    '/api/admin/content-history/:module/:id',
    requireAdmin,
    read(async (req, res) => {
      getSpec(req.params.module, req);
      res.json(await contentHistory(prisma, req.params.module, idOf(req.params.id), req.query));
    }),
  );
  app.post(
    '/api/admin/content-history/:module/:id/:versionId/restore',
    requireAdmin,
    write(async (req, res) => {
      const module = req.params.module,
        spec = getSpec(module, req, 'write'),
        id = idOf(req.params.id);
      const version = await prisma.contentVersion.findUnique({
        where: { id: idOf(req.params.versionId) },
      });
      const current = await prisma[spec.model].findUnique({ where: { id } });
      if (
        !version ||
        version.module !== module ||
        version.recordId !== id ||
        !current
      )
        throw createError(404, 'NOT_FOUND', '版本或当前内容不存在');
      let snapshot;
      try {
        snapshot = JSON.parse(version.snapshot);
      } catch {
        throw createError(
          422,
          'DAMAGED_VERSION',
          '历史快照损坏，当前内容保持不变',
        );
      }
      await saveContentVersion(req, module, current);
      const data = await prisma[spec.model].update({
        where: { id },
        data: spec.validate(await reconcileCatalogSnapshot(prisma, snapshot, current)),
      });
      await auditOperation(req, {
        action: 'RESTORE',
        module: spec.permission,
        targetId: id,
        summary: '恢复历史版本',
        beforeData: current,
        afterData: data,
      });
      res.json({ data });
    }),
  );
  app.get(
    '/api/admin/recycle-bin',
    requireAdmin,
    read(async (req, res) => {
      const modules = Object.keys(specs).filter((m) =>
        canAdmin(req.admin, `${specs[m].permission}:write`),
      );
      const page = Math.max(1, Number(req.query.page) || 1),
        where = { module: { in: modules } };
      const [total, rows] = await Promise.all([
        prisma.recycleEntry.count({ where }),
        prisma.recycleEntry.findMany({
          where,
          take: 20,
          skip: (page - 1) * 20,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      res.json({
        data: rows.map(({ payload, ...row }) => row),
        meta: {
          pagination: {
            page,
            pageSize: 20,
            total,
            pageCount: Math.ceil(total / 20),
          },
        },
      });
    }),
  );
  app.post(
    '/api/admin/recycle-bin/:id/restore',
    requireAdmin,
    write(async (req, res) => {
      const row = await prisma.recycleEntry.findUnique({
        where: { id: idOf(req.params.id) },
      });
      if (!row) throw createError(404, 'NOT_FOUND', '回收记录不存在');
      const spec = getSpec(row.module, req, 'write', true);
      if (await prisma[spec.model].findUnique({ where: { id: row.recordId } }))
        throw createError(409, 'CONFLICT', '原记录编号已被使用');
      const payload = JSON.parse(row.payload);
      const data = await prisma[spec.model].create({
        data: {
          ...(spec.restore ? spec.restore(payload) : spec.validate(payload)),
          id: row.recordId,
        },
      });
      await prisma.recycleEntry.delete({ where: { id: row.id } });
      await auditOperation(req, {
        action: 'RESTORE_DELETED',
        module: spec.permission,
        target: row.title,
        targetId: row.recordId,
        summary: '从回收站恢复内容',
      });
      res.json({ data });
    }),
  );
  return {
    async archive(req, module, record) {
      await prisma.recycleEntry.upsert({
        where: { module_recordId: { module, recordId: record.id } },
        create: {
          module,
          recordId: record.id,
          payload: JSON.stringify(record),
          title:
            record.title ||
            record.name ||
            record.question ||
            record.customerName ||
            '内容',
          operator: req.admin.username,
        },
        update: {
          payload: JSON.stringify(record),
          operator: req.admin.username,
          createdAt: new Date(),
        },
      });
      await prisma.contentDraft.deleteMany({
        where: { module, recordId: record.id },
      });
    },
    async preview(req, res, next) {
      if (req.method !== 'GET' || !req.query.previewToken) return next();
      try {
        const [body, signature] = String(req.query.previewToken).split('.');
        const expected = crypto
          .createHmac('sha256', previewSecret)
          .update(body || '')
          .digest('base64url');
        if (
          !signature ||
          signature.length !== expected.length ||
          !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        )
          throw new Error();
        const ticket = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (
          ticket.kind !== 'content-preview' ||
          !Number.isFinite(ticket.exp) ||
          ticket.exp < Date.now()
        )
          throw new Error();
        const user = await prisma.adminUser.findUnique({
            where: { id: ticket.uid },
          }),
          spec = specs[ticket.module];
        if (
          !spec ||
          spec.permission === 'crm' ||
          !user ||
          user.status !== 'active' ||
          user.tokenVersion !== ticket.tv ||
          !canAdmin(user, `${spec.permission}:read`)
        )
          throw new Error();
        const requestPath = req.originalUrl.split('?')[0];
        if (
          requestPath !== spec.endpoint &&
          !requestPath.startsWith(spec.endpoint + '/')
        )
          return next();
        const current = await prisma[spec.model].findUnique({
          where: { id: ticket.id },
        });
        if (!current) throw new Error();
        const draft = await prisma.contentDraft.findUnique({
          where: {
            module_recordId: { module: ticket.module, recordId: ticket.id },
          },
        });
        if (ticket.draftVersion !== draftVersion(draft) || ticket.currentHash !== hash(current)) throw new Error();
        const record = {
          ...current,
          ...(draft ? JSON.parse(draft.payload) : {}),
        };
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        const wrapped = spec.wrapped
          ? {
              id: record.id,
              attributes: {
                ...record,
                image: record.imageUrl
                  ? { data: { attributes: { url: record.imageUrl } } }
                  : null,
              },
            }
          : record;
        if (ticket.module === 'config') return res.json(record);
        return res.json(
          requestPath === spec.endpoint
            ? {
                data: [wrapped],
                meta: {
                  pagination: { page: 1, pageSize: 1, total: 1, pageCount: 1 },
                },
              }
            : { data: wrapped },
        );
      } catch {
        return next(
          createError(
            403,
            'PREVIEW_EXPIRED',
            '预览已过期或没有访问权限，请从后台重新打开',
          ),
        );
      }
    },
  };
}
async function initializeCatalog(db) {
  await db.$transaction(async (tx) => {
    if (await tx.productCategory.count()) return;
    await tx.productCategory.createMany({ data: defaults });
    for (const product of await tx.product.findMany({
      select: { type: true, categoryName: true, series: true },
    })) {
      const slug = product.type;
      if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) continue;
      await tx.productCategory.upsert({
        where: { slug },
        create: {
          slug,
          name: product.categoryName || slug,
          specTemplate: '[]',
        },
        update: {},
      });
      if (product.series?.trim())
        await tx.productSeries.upsert({
          where: { name: product.series },
          create: { name: product.series, categorySlug: slug },
          update: {},
        });
    }
  });
}

module.exports = {
  registerContentWorkflows,
  defaults,
  hash,
  initializeCatalog,
};
