# 首发管乐内容与素材

首发复用现有官网设计：原 NuxtLayout、AppHeader、AppFooter、首页与资讯页面、字体、黑白配色、照片大图、卡片和 GSAP 动效保持原有方案。starter 模式只展示首页与管乐知识，收起尚无正式资料的产品、制造技术、服务生态、艺术家背书、公司历史、预约表单与搜索入口。默认 full 模式保留原站。

机器可读种子：[starter-content.json](../aural-website/starter-content.json)。由已授权的管理员通过现有管理 API 写入，保留审计。不得把这个文件当作自动连接生产数据库的脚本。

- SystemConfig：写入 aboutTitle、aboutText；把 config.assetBasename 与正式官网的 `/launch-assets/` 拼成绝对 URL，写入 heroImageUrl。匿名 starter 仅投影这些字段。
- Article：写入 title、slug、category、description、status、seoDescription；把 assetBasename 与正式官网 `/launch-assets/` 拼成绝对 URL，写入 imageUrl / ogImageUrl。date 使用实际发布当天；seoTitle 可用标题加“胡氏管乐”。
- assetBasename、source、assets 是种子元数据，不是数据库字段。域名由部署配置提供，本文件与 JSON 不硬编码生产域名。

文章与 SVG 为本仓库原创，不是第三方转载，也不声称第三方 CC0 授权。三篇文章仅包含管乐入门、练习准备与日常照护知识，未虚构产品参数、人物背书、公司历史、经营资质或服务承诺。手写 SVG 是通用示意插画，非产品实拍或在售型号图。

首页暂用许可已核实的旧照片：`aural-api/uploads/real-assets/audio-hero-recording-studio.jpg` 原样复制为 `aural-website/public/launch-assets/music-studio.jpg`。原作品为 Lucas Porras 的 [Audio Engineer Mixing in Professional Studio](https://www.pexels.com/photo/audio-engineer-mixing-in-professional-studio-36269938/)，遵守 [Pexels License](https://www.pexels.com/license/)。照片仅作通用音乐场景配图，不代表本品牌录音棚、制造场地、真实商品或人物背书；页面明确标注此用途。来源、许可地址与文件 SHA-256 同时保存在机器种子 assets 项。未核实的旧图不会自动作为 starter 后备图片。

四张 SVG 位于 `aural-website/public/launch-assets/`：wind-ensemble.svg、trumpet.svg、clarinet.svg、saxophone.svg。文章默认使用对应原创管乐插画。照片及插画随代码版本保存、备份；CMS 保存官网绝对地址后后台可预览。后续替换正式素材继续使用既有 CMS 图片字段，并复核相应用途和授权。

公开首发由 `NUXT_PUBLIC_SITE_MODE=starter` 启用，API 须匹配 `PUBLIC_SITE_MODE=starter`。只开放首页、知识列表、数字 ID 的公开文章详情以及明确允许的静态/搜索引擎资源；服务器入口与客户端路由都设边界。NuxtPage 保留原生导航完成和滚动流程，不另做页面壳。浏览器埋点及访客/会话标识创建停用，不向内容 API 转发预览票据；技术访问日志仍属于服务运行记录，不等同于匿名化承诺。

正文沿用既有安全的段落、标题、引用和媒体块渲染，不执行文章 HTML 或内嵌脚本。未提交个人信息的首发模式不展示原支持表单和相关服务承诺。首页文案和公开文章均可通过现有后台维护。
