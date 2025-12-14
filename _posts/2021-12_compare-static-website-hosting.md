---
title: '静的ウェブサイトホスティングにおけるCloudFront+S3 vs S3単体で比較'
date: '2021-12-27'
category: 'Software Engineering'
thumbnail: '/thumbnails/compare-static-website-hosting.png'
---

「S3の静的ウェブサイトホスティングするなら、CloudFront使ったほうが色んな面で良い」という何となくの意識はありつつも、コストはどのくらい違うんだっけ？という点や利用者にとって何が嬉しいんだっけという部分を明確に説明できない自分がいることに気が付きました。  

もやもやを解消したくて調べてまとめてみました。  
コストなどは2021年12月末時点のものです。

[:contents]

以前の自分のブログから転記しました。

[https://44smkn.hatenadiary.com/entry/2021/12/27/163710:card]

## CloudFront+S3 vs S3 Only

まず前提を置きましょう。  
S3はともかく、CloudFront + S3側の構成は下記とします。

<https://www.youtube.com/watch?v=N0nhkyhaqyw:title> から引用させていただきました。めっちゃ分かりやすくて良い動画です。

![image](https://cdn-ak.f.st-hatena.com/images/fotolife/j/jrywm121/20211223/20211223234307.png)

これから4つの観点で比較していきますが、背景で書いたように「CloudFront使ったほうが色んな面で良い」というなんとなくの意識が自分の中にあるせいで、若干CloudFront+S3構成に寄った取り上げ方になってしまっている可能性があります。

### コスト

リージョンはap-northeast-1(Tokyo)で、S3のtierはStandardとします。  
また、CloudFrontですべてのファイルをデフォルトTTLが1ヶ月でキャッシュすることにします。  
[CloudFront Security Savings Bundle](https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/savings-bundle.html) を利用すると更にCloudFrontは安くなることが見込まれますが、今回は利用しないことを前提とします。  

結論としては、CloudFront+S3の方が1000リクエストあたりの価格がS3単体に比べて0.0012/0.00037=3.24倍ほどと高価なためにコストは上がります。  
しかしながら、すべてキャッシュ可能なコンテンツと前提を置いているので、CloudFront+S3におけるS3へのGETリクエストをほぼ無視できることを考えると、差はその部分でしか生まれません。データ通信量に関しては、500TBまでは同じレートですが、そこを超えるとCloudFrontのGBあたりの通信料は減っていくのでアクセス量が多いサイトであるほど価格差は縮まっていく傾向にあるようです。  

そのため、ファイルが細かく分割されていてファイルのfetch数がやたら多いサイトでない限りは、大きい価格差は生まれないように思えます。

#### S3単体にかかるコスト

S3において静的ウェブサイトホスティングでファイルの配信にかかるコストで考えると、GETリクエストの料金とS3からインターネットに出ていくときのデータ転送料がかかってきます。  
S3のGETリクエスト料金はstandard tierだと `0.00037USD/1,000req`です。データ転送量はどこまで使ったかによって料金が変わってきます。

| データ転送量/月 | USD/GB | 
|-------------|-------|
| 10TBまで | 0.114 | 
| 次の40TB | 0.089 |
| 次の100TB | 0.086 |
| 150TBから | 0.084 |

#### S3+CloudFrontにかかるコスト

CloudFrontとS3の間に通信コストはかからないので、通信コストはCloudFrontからインターネットに出ていくときのデータ転送量のみです。  
CloudFrontのリクエスト料金は0.0120USD/10,000reqです。 S3は1,000reqごとの課金だったので桁が違うことに注意です。  
あとはオリジンのFetchでS3のGETリクエスト料金も払うことになる。

| データ転送量/月 | USD/GB | 
|-------------|-------|
| 10TBまで | 0.114 | 
| 次の40TB | 0.089 |
| 次の100TB | 0.086 |
| 次の350TB | 0.084 |
| 次の524TB | 0.080 |
| 次の4PB | 0.070 |
| 5PBから | 0.060 |

#### ユースケースごとの課金

Case1,2に関してはなんとなく肌感でこのくらいのリクエスト量と通信量が妥当かなという感覚がありますが、Case3に関しては完全に想像です。  
CloudFront+S3構成の方は厳密には、originのFetchでS3のGETリクエスト料金も払うことになりますが、全ファイルをキャッシュすることを考えると微々たるものと想定し計算から外しています。  


**Case1. 100GB/月の通信量・100万件/月のHTTPSリクエスト**

S3onlyに比べ、CF+S3 の方が`0.83USD`(7%)高い結果となった

```

(データ通信) 100 * 0.114USD + （リクエスト） 0.00037USD / 1000req * 1,000,000req = 11.77 USD/月
---
CF+S3
(データ通信) 100 * 0.114USD + （リクエスト）0.0120USD / 10,000req * 1,000,000req = 12.6 USD/月
``` 

**Case2. 15TB/月の通信量・1億件/月のHTTPSリクエスト**

S3onlyに比べ、CF+S3 の方が`83USD`(5%)高い結果となった  
10TB/月を超えているとカスタム料金設定ができるとあったので、もっと安くなるのかも

```
S3only
(データ通信) 10000 * 0.114USD + 5000 * 0.089USD + （リクエスト） 0.00037USD / 1000req * 100,000,000req = 1622 USD/月
---
CF+S3
(データ通信) 10000 * 0.114USD + 5000 * 0.089USD + （リクエスト）0.0120USD / 10,000req * 100,000,000req = 1705 USD/月
```

**Case3. 2PB/月の通信量・150億件/月のHTTPSリクエスト**

S3onlyに比べ、CF+S3 の方が`2610 USD`(1.5%)安い結果となった  


```
S3only
(データ通信) 10000 * 0.114USD + 40000 * 0.089USD + 100,000 * 0.086USD + 1,850,000 * 0.084USD +（リクエスト） 0.00037USD / 1000req * 15,000,000,000req = 174250 USD/月
---
CF+S3
(データ通信) 10000 * 0.114USD + 40000 * 0.089USD + 100,000 * 0.086USD + 350,000 * 0.086USD + 524,000 * 0.080USD + 976,000 * 0.070USD +（リクエスト）0.0120USD / 10,000req * 15,000,000,000req = 171640 USD/月
```

### セキュリティ

ここでは、CloudFrontはOrigin Access Identity(OAI)を利用してアクセスするものとします。  

もしS3静的ウェブサイトホスティング特有の機能である[サブディレクトリでのインデックスドキュメントの設定](https://docs.aws.amazon.com/ja_jp/AmazonS3/latest/userguide/IndexDocumentSupport.html#configuring-index-document)とOAIを併用したい場合には、Lambda@EdgeもしくはCloudFront Functionsを利用する必要があり、その場合には追加で課金が必要になります。  

CloudFrontからキャッシュを返すようにするためには、origin requestをtriggerにしてリクエストパスの末尾に `index.html` を付けてあげるのが良さそうです（[参考](https://dev.classmethod.jp/articles/directory-indexes-in-s3-origin-backed-cloudfront/)）。なお、CloudFront Functionsはorigin requestのtriggerでは動かないので、ここではLambda@Edgeを使うのが推奨されそう。  

[Origin Access Identityを利用したS3コンテンツへのアクセス制限](https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)を利用することで、S3バケットへのアクセスをCloudFrontからの通信に限定することも出来る。  
CloudFrontを介さないS3バケットへのアクセスを禁止することでoriginを保護できますし、CloudFrontはWAFと統合できるのでIPアクセスを指定したブロックなどを行うことができるようになります。


### パフォーマンス

CloudFrontはEdgeロケーションからキャッシュされたレスポンスを配信するので当然のことながらパフォーマンスは良くなります。  
ちなみに、ap-northeast-1に[エッジロケーションは22個](https://aws.amazon.com/jp/cloudfront/features/?whats-new-cloudfront.sort-by=item.additionalFields.postDateTime&whats-new-cloudfront.sort-order=desc)あるらしいです。なんだか前に見たときよりめっちゃ増えている気がします。  

キャッシュが無い場合にも、originがAWSにある場合には[AWS global networkを利用して高速になる](https://d1.awsstatic.com/webinars/jp/pdf/services/20201028_BlackBelt_Amazon_CloudFront_deep_dive.pdf)らしい…。  

S3ウェブサイトホスティングではコンテンツを圧縮して配信することができませんが、[CloudFrontではオブジェクト圧縮が可能](https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html)なので、そういった面でもパフォーマンス面においてCloudFront+S3の方が優れると言えます。  

### Maintenability

この言葉が当てはまるのかは少し微妙ですが、主にどちらが構成の変更に強いかというニュアンスで用いています。  
例えば、今は静的なコンテンツを返していますが、同じリクエストパスで動的なレスポンスを生成して返したくなるケースや、S3バケットを2つに分割してそれぞれにownerを持たせたくなるケースが考えられると思います。あとはメンテナンス時間にメンテ対象のパスに対して固定レスポンスを返したり。  

例で出したようなケースは、やはりパスごとにoriginを変更できるCloudFrontを利用しないと難しい面があると思います。  
また、カスタムドメインを設定できるのも魅力的ですね。あんまり無さそうですが、完全にGCPに移行してGCSとCloud CDNが利用するというふうに構成を変えても、ドメインを変更する必要がありません。  

保守性という意味で言うと、例えば多言語化であったり別の理由でキャッシュキーの考慮がCloudFront+S3では必要になってしまったり、キャッシュを管理するCache-Controlヘッダだったりで変わる挙動について認識しておく必要性があるので、複雑さは増すとも言える気がします。シンプルに保つという部分ではS3でのウェブサイトホスティングが良いのかもしれません。

### デプロイ

どちらの方法でもS3へのアップロードが必要になりますが、[キャッシュポリシー](https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html#cache-key-understand-cache-policy)の設定次第かもしれませんが、CloudFront+S3の場合には、[Invalidation](https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html)が必要になります。  
デプロイ時の考慮はS3単体時に比べて増えます。

## まとめ

「一時的なサイトなのでシンプルに作りたい」「コストをなるべく切り詰めたい」というようなケースである場合には、S3単体でウェブサイトホスティングするのが良さそうという印象を受けましたが、そうでない場合にはCloudFront+S3構成にするのが色んな観点でのメリットが得られやすいという感覚を持ちました。  
CloudFront+S3構成が自分が思っていた感覚よりも安いなというのが大きな驚きでした。ここではキャッシュの条件などを安くなる方に倒しているので当たり前といえば当たり前なのですが、予想以上にS3単体でのコストに近づいたので…。
