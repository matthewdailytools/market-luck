# Market Luck

[中文](README.md) · [English](README.en.md) · 日本語

Cloudflare Workers・D1・R2を使った仮想ポイント抽選実験。16か国の番号形式、中国語・英語・日本語UI、登録ポイント、チケット購入、繰越プール、公開当選一覧、再計算用の証拠ファイルを提供します。

公式宝くじではありません。入金・出金・現金や物品への交換はありません。完全な改ざん防止は保証しません。MD5は指紋として、SHA-256はコミットメントと抽選シードに使用します。

## 実データ版と現在の抽選回

[実データ抽選サイト](https://luck.onlinefreetools.org) · [独立したデモサイト](https://luck-test.onlinefreetools.org) · [LIVE接続・オンライン検証報告](LIVE接入与线上验收.md)

実データ版には、**APIキー不要のYahoo FinanceとNasdaq**を固定した `PUBLIC-NOKEY-v1` を導入済みです。指定取引日の終値が両方から取得でき、正規化した価格が一致することが条件です。**2社中2社の一致が必須**で、欠損・制限・通信障害・不一致があれば待機します。平均値の採用、日付の差し替え、前日の価格への代替は行いません。

現在の回は **2026年11月2日**のAAPL・MSFT・IBMを入力とします。販売終了は `America/New_York` の **03:30**で、04:00のプレマーケット開始より前です。最も早い抽選時刻は通常取引終了の24時間後となります。

| イベント | ニューヨーク時間（EST） | UTC | 北京時間 |
|---|---|---|---|
| 販売終了 | 11月2日03:30 | 11月2日08:30 | **11月2日16:30** |
| 通常取引終了 | 11月2日16:00 | 11月2日21:00 | 11月3日05:00 |
| 最も早い抽選試行 | 11月3日16:00 | 11月3日21:00 | **11月4日05:00** |

日本時間では、販売終了は11月2日17:30、最も早い抽選試行は11月4日06:00です。価格の一致が確認できなければ、さらに待機します。表示時刻ちょうどの抽選完了を保証するものではありません。

サーバーは確認済みの**2026年NYSE/Nasdaq取引日カレンダー**から、`America/New_York` を用いて夏時間・休場日・短縮取引日を含むUTC時刻を算出します。未確認の年は受け付けません。D1も現在のミリ秒時刻で販売終了と抽選可能時刻を検査するため、受付待ち中に締切を越えた購入も拒否されます。公開した実データ回のルールと時刻は後から変更できません。

実時計での事前公開・販売・早期抽選拒否・データベース保護をオンライン検証済みです。購入から正数ポイント配分までの全経路は、実際の過去データを使い、**専用Worker・D1・R2に隔離したリプレイ環境**で検証しました。リプレイの模擬時計は明示されています。将来の11月2日の回が既に自然な時間経過で抽選完了した、という意味ではありません。詳しくは検証報告を参照してください。

## ローカル実行

Node.js 22以上が必要です。

```sh
git clone https://github.com/matthewdailytools/market-luck.git
cd market-luck
npm ci
npm run db:migrate
npm run dev
```

`http://127.0.0.1:8787` を開きます。既定のローカル設定はデモです。デモ回を作成し、登録・番号選択・購入を行い、模擬時計を進めて抽選すると証拠を保存できます。デモ価格は予測可能な固定データで、実データ版とは分離されています。

```sh
npm test
# 開発サーバーの起動中に実行
npm run test:integration
```

## Cloudflareへの設置

`wrangler.live.example.jsonc` を `wrangler.live.jsonc` にコピーします。自分のWorker・D1・R2を用意し、設定内のアカウントID、D1 ID、バケット名、ドメインを置き換えてください。

```sh
cp wrangler.live.example.jsonc wrangler.live.jsonc
npx wrangler login
npx wrangler d1 create market-luck-live
npx wrangler r2 bucket create market-luck-live-evidence
# 自分のリソースIDとドメインを設定してから続行
npx wrangler d1 migrations apply DB --remote --config wrangler.live.jsonc
npx wrangler secret put ADMIN_TOKEN --config wrangler.live.jsonc
npx wrangler deploy --config wrangler.live.jsonc
```

実データ版では `DEMO_MODE=false` を使います。**`PUBLIC-NOKEY-v1` に市場データのAPIキーは不要です。** 自分のGitHubリポジトリは `COMMITMENT_REPOSITORY=owner/repo` で指定します。未指定時は本プロジェクトの既定リポジトリだけが承認されます。管理トークンはWorkers secretsに保存し、画面やGitに含めないでください。

`/api/admin/prepare` で将来の回を準備すると、標準銘柄の対応付けと取引時刻はサーバーが算出します。販売終了は確認済みカレンダーとプレマーケット前の制約に従う必要があります。返されたmanifestの原文バイトを設定済みのGitHubリポジトリへ保存・コミットし、40桁コミットSHAに固定された原文URLを `/api/admin/publish` へ渡します。Workerが原文をダウンロードしてハッシュを確認した後に販売を開きます。確認期間終了後はCronが収集を試行し、管理者は手動collectやpauseも利用できますが、確定済みルールは変更できません。

実データ版・デモ・リプレイは、**別々のWorker・D1・R2**を使ってください。本番は `migrations/` を使用し、**`tests/replay-migrations/` を実データ用データベースへ適用してはいけません。** 実データ版には模擬時計を進めるエンドポイントやリプレイ時計テーブルはありません。

デモを設置する場合は、自分用に `wrangler.test.example.jsonc` をコピーします。`DEMO_MODE=true` と `DEMO_AUTO_DRAW=true` で定期的な模擬抽選を行えます。運営者固有の設置設定はGitの追跡対象外です。

無料の匿名アクセスは、無制限利用・安定稼働・取引所の終局データ・公開再配布権を保証しません。価格修訂や上流データの共有もあり得ます。設置時には適用されるデータ利用権限と運用対策を確認してください。

登録時に1,000ポイントを1回だけ発行します。1口10ポイントで100口分、16形式を各6回試す96口と自由選択4口の予算です。当選や利益は保証しません。

詳細：[アルゴリズム](ALGORITHM.md)、[API](API.md)、[16か国の形式](各国玩法说明.md)、[セキュリティ](SECURITY.md)、[MITライセンス](LICENSE)。

## 検証と任意のAPIキー方式

過去データの診断にはキーを使いません。

```sh
node scripts/check-public-sources.js 2026-10-29 AAPL
```

この診断コマンドは購入や抽選精算を行いません。同じYahoo/Nasdaq方式が、カレンダー・事前公開・時刻制約を追加した実データ回にも接続されています。

`node tests/live-online.js` は実時計で公開・販売を検査し、`LIVE_ADMIN_TOKEN` が必要です。時刻前の抽選は強制できません。`node scripts/run-live-replay.js` は独立したリプレイ設置専用で、`REPLAY_ADMIN_TOKEN` を使います。これらはテストアカウントとチケットを作るため、実行前に検証報告を読んでください。

従来のEODHD・Alpha Vantage・Twelve Dataアダプターは、キーを使用する別方式の評価用に残しています。これらのキーは**現在のYahoo/Nasdaq実データ版の必須条件ではありません**。利用する場合は[任意のAPIキー取得手順](免费行情API申请与配置-逐步操作.md)を参照し、販売開始後に公開済み回のデータソースを差し替えないでください。

詳細：[LIVE接続とオンライン検証](LIVE接入与线上验收.md)、[キー不要の実測](免Key行情源实测.md)、[テーマ設計の評価](主题设计评估.md)。テーマ選定は専門的な設計判断で、ユーザーA/Bテストの結果ではありません。
