---
title: 'karpenterのOD Fallbackを試してみた'
date: '2022-03-13'
category: 'Software Engineering'
thumbnail: '/thumbnails/try-out-karpenter-od-fallback.png'
---

こちらの記事は、2022/3/13に大幅に修正いたしました。  
<https://github.com/aws/karpenter/issues/714> のIssueから、OD Fallbackを行う方法は、nodeAffinityのprefferredを利用しか無いと思っていたのですが、v0.6.0から <https://karpenter.sh/v0.6.5/faq/#what-if-there-is-no-spot-capacity-will-karpenter-fallback-to-on-demand> にて下記のように記載されるようになり、より良い方法があることがわかりました。  
そのため書き直しました。

> Karpenter will fallback to on-demand, if your provisioner specifies both spot and on-demand.

[:contents]

以前の自分のブログから転記しました。

[https://44smkn.hatenadiary.com/entry/2022/03/13/235602:card]

## 背景・モチベーション

[https://aws.amazon.com/blogs/aws/introducing-karpenter-an-open-source-high-performance-kubernetes-cluster-autoscaler/:card]

karpenterのGAがアナウンスされて、[クラスメソッドさんの記事](https://dev.classmethod.jp/articles/karpenter-ga/)や[スタディサプリENGLISHのSREさんが書いた記事](https://tech.recruit-mp.co.jp/infrastructure/aws-oss-cluster-autoscaler-karpenter/)を読んで、とても良さそうだし業務にも活かせそうと思ったので触りたくなりました。

本番環境で運用する上では、スポットが起動しなくなったときにオンデマンドを起動する（OD Fallback）仕組みを考えておかねばと思っています。  
多様なインスタンスタイプを起動する候補にしていれば、昨今の安定したスポットインスタンス供給でそのような自体はあんまり考えられませんが、備えあれば憂いなしとも言いますし。


## Karpenterの概要

[https://karpenter.sh/docs/concepts/#kubernetes-cluster-autoscaler:card]

個人的には公式Docの `Concept` のページにある `Kubernetes cluster autoscaler`という項目に書いてある3つが非常にKarpenterの特徴がわかりやすい記述になっているのではないかと思っています。

> - Designed to handle the full flexibility of the cloud
> - Group-less node provisioning
> - Scheduling enforcement

特によく言及されるスケジューリングの速さに関しては、下2つの項目が関わっていると思います。  
AutoScalingGroupやManagedNodeGroupといったGroupのメカニズムを使用せず直接インスタンスを起動していること。EC2Fleetを利用して必要なcapasityを満たすようにEC2インスタンスを起動する仕組みになっているようです。  
また、Podスケジューリングを`kube-scheduler`に頼らず、karpenterが作成したノードにpodをbindするようです。そのためkubeletはノードの起動やkube-schedulerを待つ必要がなく、コンテナイメージのPullなどコンテナランタイムの準備をすぐに行うことが可能なようです。

## Karpenterの環境構築

[https://karpenter.sh/docs/getting-started-with-terraform/:card]

通常のEKSクラスタ構築に加えて行う必要があるのは下記かと思います。

- PrivateサブネットとSecurityGroupに`"karpenter.sh/discovery" = var.cluster_name`とタグ付与して、karpenterがdiscoveryできるようにする
- Karpenterが起動するノードに紐付けるInstanceProfileの作成
   - defaultのInstanceProfileをHelm経由で設定する or ProvisionerというCRD内で宣言する必要がある
- IRSAでkarpenterのcontrollerのpodが利用するIAMロール

ちなみにeksのmoduleをv1.18に設定したら、やたらとハマったのでこちらのIssueが役に立ちました：<https://github.com/aws/karpenter/issues/1165>  
EKSクラスタの構築が完了したら、下記のようにHelmを利用してインストールしていきました。

```sh
$ helm repo add karpenter https://charts.karpenter.sh
$ helm repo update
$ helm upgrade --install karpenter karpenter/karpenter --namespace karpenter \
  --create-namespace --version 0.6.5 \
  --set clusterName=${CLUSTER_NAME} \
  --set clusterEndpoint=$(aws eks describe-cluster --name ${CLUSTER_NAME} --query "cluster.endpoint" --output json) \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=${KARPENTER_IAM_ROLE_ARN} \
  --set aws.defaultInstanceProfile=KarpenterNodeInstanceProfile-${CLUSTER_NAME} \
  --wait
```

## OD Fallbackを行うためのマニフェスト指定

> Karpenter will fallback to on-demand, if your provisioner specifies both spot and on-demand.
>
> More specifically, Karpenter maintains a concept of “offerings” for each instance type, which is a combination of zone and capacity type (equivalent in the AWS cloud provider to an EC2 purchase option).
> 
> Spot offerings are prioritized, if they’re available. Whenever the Fleet API returns an insufficient capacity error for Spot instances, those particular offerings are temporarily removed from consideration (across the entire provisioner) so that Karpenter can make forward progress through fallback. The retry will happen immediately within milliseconds.
> 
> [https://karpenter.sh/v0.6.5/faq/#what-if-there-is-no-spot-capacity-will-karpenter-fallback-to-on-demand]

冒頭で紹介したとおり、OD Fallbackする方法はProvisionerの `.spec. requirements` 内の `karpenter.sh/capacity-type` keyに対して `on-demand`と`spot`の両方を指定すれば良いようです。  
基本的にはspotを優先的に起動し、もし不足していたらon-demandをprovisionするようです。
ということで、`default`という名称のproviderを用意します。`default`という名称のproviderは [faq#if-multiple-provisioners-are-defined-which-will-my-pod-use](https://karpenter.sh/v0.6.5/faq/#if-multiple-provisioners-are-defined-which-will-my-pod-use) にあるように特別扱いされます。  
ちなみに後続のテストのために、インスタンスタイプを `c4.xlarge` 絞っています。

```yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: default
  namespace: karpenter
spec:
  requirements:
    - key: "node.kubernetes.io/instance-type"
      operator: In
      values: ["c4.xlarge"]
    - key: karpenter.sh/capacity-type
      operator: In
      values: ["spot", "on-demand"] # ここで双方を指定する
  provider:
    subnetSelector:
      karpenter.sh/discovery/44smkn-test: "*"
    securityGroupSelector:
      karpenter.sh/discovery/44smkn-test: "*"
  ttlSecondsAfterEmpty: 30
```

## OD Fallbackのテスト

この後のセクションで触れますが、karpneterはFallbackするときの条件としてEC2 Fleet作成リクエストのエラーコードが `InsufficientInstanceCapacity` である必要があります。  
これを自分で再現するのは難しいので、エラーコードが `SpotMaxPriceTooLow` も同じような挙動を取るように変更してイメージを作り直します。  

```go
func (p *InstanceProvider) updateUnavailableOfferingsCache(ctx context.Context, errors []*ec2.CreateFleetError, capacityType string) {
	for _, err := range errors {
		if InsufficientCapacityErrorCode == aws.StringValue(err.ErrorCode) || "SpotMaxPriceTooLow" == aws.StringValue(err.ErrorCode) {
			p.instanceTypeProvider.CacheUnavailable(ctx, aws.StringValue(err.LaunchTemplateAndOverrides.Overrides.InstanceType), aws.StringValue(err.LaunchTemplateAndOverrides.Overrides.AvailabilityZone), capacityType)
		}
	}
}
```

[f:id:jrywm121:20220313221459p:plain]


```sh
# karpenter's root dir
$ GOFLAGS=-tags=aws ko build -L ./cmd/controller
$ docker tag <loaded image> ${ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com/karpenter/controller:latest
$ docker push ${ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com/karpenter/controller:latest

$ kubectl edit deploy karpenter -n karpenter  # update container image and imagePullPolicy
```

`SpotMaxPriceTooLow`を起こすように、spotのmax-priceを下げてスポットインスタンスが起動できないというシチュエーションを作ります。  
karpenterはLaunch Templateを生成し、それをインスタンス起動するためのEC2Fleet作成リクエスト時に渡しています。なので、作成されたLaunch Templateを直接マネジメントコンソールから編集してmax-priceを変更しちゃいます。直接Launch TemplateをProvisionerに指定することも出来るのですが、編集して対応することにしました。  
というのも、karpenterはkarpenterが持ちうる[Launch Templateの設定値セットのHashを取って同一であれば、同じLaunch Templateを再利用](https://github.com/aws/karpenter/blob/4daa335cef0da866dc2912b4e7dcc8eecc910807/pkg/cloudprovider/aws/launchtemplate.go#L125-L157)します。そのため編集してしまったほうが手間が少なく済んだのです。

`c4.xlarge`のスポット価格が `0.0634`くらいだったので `0.06` に設定して、ノードのprovisionを試みます。  
すると、下記のように`InsufficientInstanceCapacity for offering `というログが発生して一度ERRORとなった後に、再試行し `on-demand`のノードが起動することが分かりました。  
秒単位でFallbackしていて非常に速いですね。次のセクションで仕組みについて見ていきたいと思います。


```log
2022-03-13T13:02:18.067Z	INFO	controller.provisioning	Waiting for unschedulable pods	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:35.367Z	INFO	controller.provisioning	Batched 2 pods in 1.022647416s	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:35.374Z	INFO	controller.provisioning	Computed packing of 1 node(s) for 2 pod(s) with instance type option(s) [c4.xlarge]	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:39.916Z	DEBUG	controller.provisioning	InsufficientInstanceCapacity for offering { instanceType: c4.xlarge, zone: ap-northeast-1a, capacityType: spot }, avoiding for 45s	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:39.916Z	DEBUG	controller.provisioning	InsufficientInstanceCapacity for offering { instanceType: c4.xlarge, zone: ap-northeast-1c, capacityType: spot }, avoiding for 45s	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:39.916Z	DEBUG	controller.provisioning	InsufficientInstanceCapacity for offering { instanceType: c4.xlarge, zone: ap-northeast-1d, capacityType: spot }, avoiding for 45s	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:39.916Z	ERROR	controller.provisioning	Could not launch node, launching instances, with fleet error(s), SpotMaxPriceTooLow: Your Spot request price of 0.06 is lower than the minimum required Spot request fulfillment price of 0.0634.; SpotMaxPriceTooLow: Your Spot request price of 0.06 is lower than the minimum required Spot request fulfillment price of 0.0647.	{"commit": "6180dc3", "provisioner": "default"}

2022-03-13T13:02:39.916Z	INFO	controller.provisioning	Waiting for unschedulable pods	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:46.150Z	DEBUG	controller.provisioning	Created launch template, Karpenter-44smkn-test-9056194203411996147	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:48.361Z	INFO	controller.provisioning	Launched instance: i-05c437e761fec9383, hostname: ip-10-0-1-223.ap-northeast-1.compute.internal, type: c4.xlarge, zone: ap-northeast-1a, capacityType: on-demand	{"commit": "6180dc3", "provisioner": "default"}
2022-03-13T13:02:48.391Z	INFO	controller.provisioning	Bound 2 pod(s) to node ip-10-0-1-223.ap-northeast-1.compute.internal	{"commit": "6180dc3", "provisioner": "default"}
```

## Fallbackの仕組み

一部コードを載せていますが、ここでの説明に不要な部分は省略させていただいております。またインライン展開している箇所もあります。  

UnschdulableなPodをスケジューリングする際のエントリポイントから順を追ってみていきます。  
インスタンス作成の失敗などでPodのスケジューリングに失敗した場合には、この関数の単位でループすると認識しています。

[pkg/controllers/provisioning/provisioner.go#L85-L127](https://github.com/aws/karpenter/blob/5e8dc24f8cbd86e8440060b8961c07bc6d3dadf5/pkg/controllers/provisioning/provisioner.go#L85-L127)
```go
func (p *Provisioner) provision(ctx context.Context) error {
	logging.FromContext(ctx).Infof("Batched %d pods in %s", len(items), window)

	// Get instance type options
	vendorConstraints, err := v1alpha1.Deserialize(&v1alpha5.Constraints{Provider: p.Spec.Provider})
	if err != nil {
		return nil, apis.ErrGeneric(err.Error())
	}
	instanceTypes, err := p.cloudProvider.instanceTypeProvider.Get(ctx, vendorConstraints.AWS)

	// Launch capacity and bind pods
	workqueue.ParallelizeUntil(ctx, len(schedules), len(schedules), func(i int) { /* request ec2 fleet */ }
}
```

`instanceTypeProvider.Get(ctx, vendorConstraints.AWS)`での処理が重要です。以下の処理を呼び出しています。  
Offeringとは、インスタンスタイプ毎のcapacityTypeとzoneの組み合わせのことを指します。  
ちなみに、ここではProviderのrequimentsなどを考慮していないので、ほとんどのインスタンスタイプが返却されます。実際は、[binpacking](https://github.com/aws/karpenter/blob/5e8dc24f8cbd86e8440060b8961c07bc6d3dadf5/pkg/controllers/provisioning/binpacking/packable.go#L45) の処理にて考慮がされます。

[pkg/cloudprovider/aws/instancetypes.go#L63-L110](https://github.com/aws/karpenter/blob/5e8dc24f8cbd86e8440060b8961c07bc6d3dadf5/pkg/cloudprovider/aws/instancetypes.go#L63-L110)
```go
// Get all instance type options (the constraints are only used for tag filtering on subnets, not for Requirements filtering)
func (p *InstanceTypeProvider) Get(ctx context.Context, provider *v1alpha1.AWS) ([]cloudprovider.InstanceType, error) {
	for _, instanceType := range instanceTypes {
		offerings := []cloudprovider.Offering{}
                 for zone := range subnetZones.Intersection(availableZones) {
		// while usage classes should be a distinct set, there's no guarantee of that
		for capacityType := range sets.NewString(aws.StringValueSlice(instanceType.SupportedUsageClasses)...) {
			// exclude any offerings that have recently seen an insufficient capacity error from EC2  →  ここでInsufficientInstanceCapacityのエラーコードが返ってきたOfferingを候補から外す
			if _, isUnavailable := p.unavailableOfferings.Get(UnavailableOfferingsCacheKey(capacityType, instanceType.Name(), zone)); !isUnavailable {
				offerings = append(offerings, cloudprovider.Offering{Zone: zone, CapacityType: capacityType}) 
			}
		}
	}
}
```

`p.unavailableOfferings.Get(UnavailableOfferingsCacheKey(capacityType, instanceType.Name(), zone))` で返ってくる値はどのように決定されるのでしょうか。  
EC2 Fleet作成を試みた後にキャッシュに保持する処理があります。現状は45秒キャッシュするようです。  

一回目の処理では失敗したOfferingをcacheし、エラーログを出力して処理を終了します。呼び出し元はループしているので、その後に再度この処理が行われます。  
候補からspotは省かれています。候補のOfferingにspotが1つでもあれば、capacityTypeには`spot`となりますが、今回はないので`on-demand`になります。  
capacityTypeはノードのlabelに付与されるため、userDataがspotのときと異なることになります。そのため、既存のLaunchTemplateを利用できず新しくLaunchTemplateを作成します。ログを見ると作成されていることが確認できます。  

そしてCreateFleetInputにもon-demandのOptionが追加されることで `on-demand` のノードが起動するようです。

[pkg/cloudprovider/aws/instance.go#L147](https://github.com/aws/karpenter/blob/7b5afee383048b42091acf625039ea1173852c5e/pkg/cloudprovider/aws/instance.go#L147)
```go
func (p *InstanceProvider) launchInstances(ctx context.Context, constraints *v1alpha1.Constraints, instanceTypes []cloudprovider.InstanceType, quantity int) ([]*string, error) {
	capacityType := p.getCapacityType(constraints, instanceTypes)

	// Get Launch Template Configs, which may differ due to GPU or Architecture requirements
	launchTemplateConfigs, err := p.getLaunchTemplateConfigs(ctx, constraints, instanceTypes, capacityType)

	createFleetInput := &ec2.CreateFleetInput{ /* ... */ }
	if capacityType == v1alpha1.CapacityTypeSpot {
		createFleetInput.SpotOptions = &ec2.SpotOptionsRequest{AllocationStrategy: aws.String(ec2.SpotAllocationStrategyCapacityOptimizedPrioritized)}
	} else {
		createFleetInput.OnDemandOptions = &ec2.OnDemandOptionsRequest{AllocationStrategy: aws.String(ec2.FleetOnDemandAllocationStrategyLowestPrice)}
	}
	createFleetOutput, err := p.ec2api.CreateFleetWithContext(ctx, createFleetInput)

         // ここで InsufficientInstanceCapacity だったOfferingをcacheしています。現状は45秒キャッシュするようです。
	for _, err := range errors {
		if InsufficientCapacityErrorCode == aws.StringValue(err.ErrorCode) {
			p.instanceTypeProvider.CacheUnavailable(ctx, aws.StringValue(err.LaunchTemplateAndOverrides.Overrides.InstanceType), aws.StringValue(err.LaunchTemplateAndOverrides.Overrides.AvailabilityZone), capacityType)
		}
	}
}
```

## まとめ

一度、2021年12月に書いた内容が間違っていたため書き直したのですが、当時のv0.5.1と細部が違っていて非常に学べることが多かったです。  
eks moduleのv18でとてもハマったのは想定外でしたが…。  

下記のようにBlockDeviceMappingのサポートが次回リリースのバージョンが入りそうなので、やっと20GiBのRoot volumeの制限から抜け出せそうですね。

[https://t.co/ABUXhneLn7:card]


