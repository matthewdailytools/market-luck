# Market Luck

[中文](README.md) · [English](README.en.md) · 日本語

Cloudflare Workers・D1・R2を使った仮想ポイント抽選実験。16か国の番号形式、中国語・英語・日本語UI、登録ポイント、チケット購入、繰越プール、公開当選一覧、再計算用の証拠ファイルを提供します。

公式宝くじではありません。入金・出金・現金や物品への交換はありません。完全な改ざん防止は保証しません。MD5は指紋として、SHA-256はコミットメントと抽選シードに使用します。

## ローカル実行

Node.js 22以上が必要です。

```sh
git clone https://github.com/matthewdailytools/market-luck.git
cd market-luck
npm ci
npm run db:migrate
npm run dev
```

`http://127.0.0.1:8787` を開きます。デモ回を作成し、登録・番号選択・購入を行います。模擬時計を進めて抽選すると証拠を保存できます。デモ価格は予測可能な固定データです。

```sh
npm test
# 開発サーバーの起動中に実行
npm run test:integration
```

## Cloudflareへの設置

自分のアカウントでD1とR2を作り、`wrangler.jsonc` のID・バケット名を置き換えます。`wrangler.test.jsonc` は本プロジェクトのテスト環境用で、自分の環境にそのまま使用しないでください。

```sh
npx wrangler login
npx wrangler d1 create market-luck
npx wrangler r2 bucket create market-luck-evidence
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

実データには無料アカウントの EODHD、Alpha Vantage、Twelve Data キーが必要です。2社以上の終値が一致し、有効な不一致がない場合にのみ抽選します。無料アクセスと公開再配布の権利は別です。取引日カレンダーの確認と外部への事前コミットメント公開も必要です。現在、実アカウントによるオンライン行情テストは未実施です。

登録時に1,000ポイントを1回だけ発行します。1口10ポイントで100口分、16形式を各6回試す96口と自由選択4口の予算です。当選や利益は保証しません。

詳細：[アルゴリズム](ALGORITHM.md)、[API](API.md)、[16か国の形式](各国玩法说明.md)、[セキュリティ](SECURITY.md)、[MITライセンス](LICENSE)。
