---
title: 'Karpenter v1.0 で Expiration が Graceful から Forceful になった'
date: '2024-11-15'
category: 'ソフトウェアエンジニアリング'
thumbnail: '/thumbnails/karpenter-expiration-forceful.png'
---

## ３行で

- Karpenter v1 では expiration の方式が Forceful に変更され、drifted や consolidation と同様の PDB や do-not-disrupt の考慮がなくなりました
- これにより、クラスタ管理者はノードを一定期間で強制的に削除できるようになり、高いセキュリティを維持しやすくなりました
- この変更を踏まえ、`expireAfter` の設定を再検討することが重要そうです

## そもそも Karpenter の Expiration とは

Karpenter の expiration は、alpha 版の Provisoner リソースで導入された `spec.ttlSecondsUntilExpired` から始まった機能です 。
その後、beta 版で NodePool リソースの `spec.disruption.expireAfter` に名称変更され[^1]、GA では階層が変わり `spec.disruption.template.spec.expireAfter` となりました [^2]。

名称や階層の変更はあったものの、機能の本質は「ノードの最大稼働時間を設定し、それを超えたノードを削除する」という点で一貫しています。この仕組みにより、長期間稼働するノードを適切にリフレッシュし、セキュリティリスクを軽減することが目的とされています。

初期の alpha 版では consolidation 機能がまだ存在せず、`ttlSecondsUntilExpired` の設定がリソース効率化やコスト削減にも活用されていました。また、当時は drift 検知やノード更新の仕組みがなかったため、expiration のセキュリティ的な意義がより強かったと記憶しています。

## v0.37 以前の Graceful Expiration

Karpenter は [karpenter #59](https://github.com/kubernetes-sigs/karpenter/pull/59) から v0.37 まで Graceful Expiration を採用していました。この名称は、v1 で採用された Forceful Expiration と区別するため、便宜的に使われています [^3] 。

以下の図は [forceful-expiration の design doc](https://github.com/kubernetes-sigs/karpenter/blob/main/designs/forceful-expiration.md) からの引用です。図の中に `Expired` というラベルの付いた矢印があり、State1 (Running) から State2 (Disruption Candidate) に遷移することが示されています。これは Drift や Consolidation のノード termination と同様の処理フローです。

[f:id:jrywm121:20241115010458p:plain]

State2 (Disruption Candidate) に遷移する際、以下の条件がチェックされます（[pkg/controllers/disruption/controller.go#L147-L150](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/disruption/controller.go#L147-L150), [pkg/controllers/disruption/types.go#L63-L144](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/disruption/types.go#L63-L144)）：

- NDB (Node Disruption Budget) が許容されているか 
- ノードや pod に do-not-disrupt の annotation が付いていないか
- PDB によるブロックが行われていないか

Graceful Expiration の利点は、ノードが expiration に達しても pod を安全に退去させることができる点です。一方、セキュリティ面では、EKS AMI が drift している場合などに対応が滞る可能性がありました。一定のセキュリティ要件が求められる環境では、この挙動が課題となることがあったと思います。

## v1 以降の Forceful Expiration

以下の図は、v1 以降における expiration を含むノード termination フローを示したものです。こちらも [forceful-expiration の design doc](https://github.com/kubernetes-sigs/karpenter/blob/main/designs/forceful-expiration.md) から引用しています。

[f:id:jrywm121:20241115010612p:plain]

図を見ると、`Expired` の位置が State1 (Running) から State4 (Gracefully Terminating) に移動していることが分かります。この変更により、v1 では Interrupted や Unhealthy と同様のハンドリングが行われるようになりました。

具体的なコード変更 [^4] について、v0.37.6 と v1.0.5 の流れを比較します：

**v0.37.6**

- NodeClaim が expired になっている場合は、NodeClaim に `Expired` というConditionが設定されます ([pkg/controllers/nodeclaim/disruption/expiration.go#L62](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/nodeclaim/disruption/expiration.go#L62))
- `Expired` というconditionがある場合に、`shouldDisrupt()` という関数が `true` で返りdisruptionの候補ノードとなります  ([pkg/controllers/disruption/controller.go#L147](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/disruption/controller.go#L147))
	- この候補ノードのリストアップの処理は、例えば `Drifted` や `Empty` といった各メソッド([pkg/controllers/disruption/controller.go#L77-L90](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/disruption/controller.go#L77-L90)) ごとに行われます
	- 先ほど言及したように、この候補ノードを決めるときに「PDBによるblockingがされていないか」などのチェックが走ります
- 他のmethodとも共通しているDisruptの処理に進みます（[pkg/controllers/disruption/controller.go#L174-L177](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/disruption/controller.go#L174-L177)）
	- Replacementのnodeを作ったりもする ([pkg/controllers/disruption/controller.go#L200-L206](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/disruption/controller.go#L200-L206), [pkg/controllers/disruption/expiration.go#L116-L119](https://github.com/kubernetes-sigs/karpenter/blob/v0.37.6/pkg/controllers/disruption/expiration.go#L116-L119))

**v1.0.5**

- NodeClaim が expired になっている場合は、NodeClaimを削除する ([pkg/controllers/nodeclaim/expiration/controller.go#L60-L63](https://github.com/kubernetes-sigs/karpenter/blob/v1.0.5/pkg/controllers/nodeclaim/expiration/controller.go#L60-L63))
	- 通常のdrain処理が開始されるが、v1.0 からNodePool の `spec.template.spec` に導入されたterminationGracePeriod [^5] を超過した時点でpdbやprestopなどを bypass して強制的にdrainされます

この変更により、v1 の Forceful Expiration ではセキュリティ要件を満たしやすくなる一方で、pod の安全な退去が保証されないリスクが生じます。

## まとめ

Karpenter v1 で Expiration の挙動が変わったことを踏まえ、`expireAfter` パラメータの再検討が推奨されると思います。たとえば：

- `expireAfter: never` に設定すると、中断を防げますが、EKS の AMI 更新に伴う drift の解消ができなくなります。
- 一方で、`expireAfter` を極端に短くすると、頻繁な pod 中断やノードの無駄な削除/起動が発生する可能性があります。

それぞれの環境に求められる要件をベースに適切な値を設定することが重要そうです。


[^1]: <https://karpenter.sh/v0.32/upgrading/v1beta1-migration/#ttlsecondsuntilexpired>
[^2]: [v1 Migration](https://karpenter.sh/v1.0/upgrading/v1-migration/#:~:text=ExpireAfter%20has%20moved%20from%20the%20NodePool.Spec.Disruption%20block%20to%20NodePool.Spec.Template.Spec%2C%20and%20is%20now%20a%20drift%2Dable%20field)
[^3]: [forceful-expiration](https://github.com/kubernetes-sigs/karpenter/blob/main/designs/forceful-expiration.md:title)
[^4]: [BREAKING: revert back to forceful expiration by default #1333](https://github.com/kubernetes-sigs/karpenter/pull/1333)
[^5]: [nodeclaim-termination-grace-period](https://github.com/kubernetes-sigs/karpenter/blob/main/designs/nodeclaim-termination-grace-period.md)
