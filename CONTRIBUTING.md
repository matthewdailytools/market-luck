# Contributing / 贡献指南

Use Node.js 22 or newer. Run `npm ci`, `npm run db:migrate`, `npm test`, then start `npm run dev` in another terminal and run `npm run test:integration`.

Contributions should include a concrete problem, resulting behavior, and relevant validation. Do not change v1 canonical serialization, sampling or prize rules for published rounds. New algorithms require a versioned migration and independent test vectors. Do not silently modify provider lists, symbol mappings, dates or decimal scales after ticket sales open.

UI languages are `zh-CN`, `en`, and `ja`; add translations in `public/i18n.js`. No external font or analytics dependency is required. Check all languages on desktop and mobile after layout changes.

Never commit `.dev.vars`, `.env`, provider keys, session cookies, `.wrangler`, personal data or database exports. Use fixtures with fake credentials. See SECURITY.md for disclosure guidance. Market data is not covered by the code license: confirm source-specific rights separately.

请保持已公布期次的算法与输入不变。新增行情源必须明确日期、币种、交易所、复权口径及精度，并增加失败场景测试。任何有效行情分歧均等待，不按多数票丢弃异议。提交前完成上述测试，且不要提交密钥或本地数据。
