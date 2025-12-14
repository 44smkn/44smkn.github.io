---
title: 'Fluent BitのLua PluginとLuaの単体テスト含むCIを試してみた'
date: '2022-05-22'
category: 'Software Engineering'
thumbnail: '/thumbnails/try-out-fluent-bit-with-lua.png'
---

fluent-bitには[modify](https://docs.fluentbit.io/manual/pipeline/filters/modify)や[record_modifier](https://docs.fluentbit.io/manual/pipeline/filters/record-modifier)というFilterが用意されており、Record/Eventsの変更ができるようになっていますが、複雑なことをやらせようと思うと[lua](https://docs.fluentbit.io/manual/pipeline/filters/lua) filterが必要になってくると思います。  
例えば、[kubernetes](https://docs.fluentbit.io/manual/pipeline/filters/kubernetes) filterを利用し、metadataを付与した後に、`namespace`や`labels`、`container_name`などを組み合わせて文字列を作り更に条件分岐も組み合わせたい、となることがありました。

[:contents]

以前の自分のブログから転記しました。

[https://44smkn.hatenadiary.com/entry/2022/05/22/204710:card]

## Fluent BitのLua Pluginを試す

今回使ったコードはここにまとめてあります。

[https://github.com/44smkn/fluent-bit-lua-example:card]

### 実現したい処理

[stackdriver](https://docs.fluentbit.io/manual/pipeline/outputs/stackdriver) pluginで送信するときに logNameフィールドとして抽出される値をLua pluginを利用しrecordに追加する

- logNameフィールドとして抽出されるときにデフォルトで参照されるkey名は`logging.googleapis.com/logName`である
- valueとしては `<namespace>_<appラベル or pod_nameからrandom stringを除いたもの>_<container>` としたい 
- kubernetes filterで付与されたmetadataを利用する

今回はKuberntesクラスタで動かさずローカルで試すことを目標とします。  
そのため、[tail](https://docs.fluentbit.io/manual/pipeline/inputs/tail) pluginやkubernetes filterは利用せず、[dummy](https://docs.fluentbit.io/manual/pipeline/inputs/dummy) pluginを利用して、metadataが付与された状態のrecordを注入することとします。  

<details>

<summary>dummyに設定したrecord</summary>

```json
{
   "timestamp":"2022-05-09T23:56:33.044423373Z",
   "stream":"stderr",
   "log":"some messages",
   "kubernetes":{
      "pod_name":"test-server-75675f5897-7ci7o",
      "namespace_name":"test-ns",
      "pod_id":"60578e5f-e5bb-4388-be57-9de01c8a4b79",
      "labels":{
         "apps":"test"
      },
      "annotations":{
         "kubernetes.io/psp":"default"
      },
      "host":"some.host",
      "container_name":"test-server",
      "docker_id":"1d79200d4e60bb7f58b2e464e22a82d5d3bf694ebf334b3757bbdb0ce25353aa",
      "container_hash":"container.registry/test-server/test-server@sha256:bfd1a73b6d342a9dd5325c88ebd5b61b7eaeb1c8a3327c3d7342028a33b89fe0",
      "container_image":"container.registry/test-server/test-server:0.0.82"
   }
}
```

</details>

### Luaで実装しFilterから呼び出す

<https://docs.fluentbit.io/manual/pipeline/filters/lua#callback-prototype> 

引数として、`tag`, `timestamp`, `record`の3つを取り、かならず3つの値をretrunする必要があります。それが `code`, `timestamp`, `record`であり、`code`の値によって後ろ2つの返却値の扱いが変わってきます。`1`のときには2つとも利用されますが、それ以外のときは `timestamp`は利用されませんし、`record`も`1`に加えて`2`のときしか利用されません。

- -1: recordはdropされる
- 0: recordは変更されない
- 1: timestampとrecordが変更される
- 2: recordのみ変更される

それも踏まえて処理を実装したのが下記です。

```lua
function append_k8s_logname(tag, timestamp, record)
    local new_record = record

    local app = record["kubernetes"]["labels"]["app"]
    if app == nil then
        local pod_name = record["kubernetes"]["pod_name"]
        _, _, app = string.find(pod_name, "([%w-]+)%-%w+%-%w+")
    end
    local namespace = record["kubernetes"]["namespace_name"]
    local container_name = record["kubernetes"]["container_name"]

    local log_name = string.format("%s_%s_%s", namespace, app, container_name)
    new_record["logging.googleapis.com/logName"] = log_name

    return 2, 0, new_record
end
```

Luaは初めて書いたのですが下記が参考になりました。  
正規表現はPOSIX準拠ではないようでしたが、機能としては十分でハマることはほぼありませんでした。

- <https://www.lua.org/manual/5.4/> 
- <https://www.lua.org/demo.html>
- <https://github.com/fluent/fluent-bit/tree/master/scripts>

では、Filterから呼び出してみたいと思います。最低限、必要なのはscriptへのパスと呼び出す関数名になります。パスはmainの設定ファイルからの相対パスもサポートされているようです。productionでは絶対パスで指定したほうが良いと思いますが、今回はテストなので相対パスで書いています。  
stdoutをOUTPUTに指定し動作確認したところ、期待通りの出力を得ることができました。

```
[FILTER]
    Name    lua
    Match   *
    script  ./append_k8s_logname.lua
    call    append_k8s_logname

[OUTPUT]
    Name stdout
```

```console
$ fluent-bit -c fluent-bit.conf
[0] kube.var.log.containers.test-server_test-ns_test-server-aeeccc7a9f00f6e4e066aeff0434cf80621215071f1b20a51e8340aa7c35eac6.log: [1653143473.074878000, {"kubernetes"=>{"labels"=>{"app"=>"test"}, "pod_name"=>"test-server-75675f5897-7ci7o", "annotations"=>{"kubernetes.io/psp"=>"default"}, "namespace_name"=>"test-ns", "container_name"=>"test-server", "docker_id"=>"1d79200d4e60bb7f58b2e464e22a82d5d3bf694ebf334b3757bbdb0ce25353aa", "container_hash"=>"container.registry/test-server/test-server@sha256:bfd1a73b6d342a9dd5325c88ebd5b61b7eaeb1c8a3327c3d7342028a33b89fe0", "host"=>"some.host", "container_image"=>"container.registry/test-server/test-server:0.0.82", "pod_id"=>"60578e5f-e5bb-4388-be57-9de01c8a4b79"}, "log"=>"some messages", "logging.googleapis.com/logName"=>"test-ns_test_test-server", "timestamp"=>"2022-05-09T23:56:33.044423373Z", "stream"=>"stderr"}]
```

## Fluent Bitの設定に関するCIを作成する

Fluent Bitの運用を行っていく上で不安になる要素として2つあります。これらを解消するためのCIパイプラインを作成していきます。

- Fluent Bitの設定ミス
- Luaのコード変更によるデグレ

### Fluent Bitの設定をvalidate

[https://github.com/fluent/fluent-bit/issues/2178:card]

上記のIssueで設定のvalidateが入ったようです。`--dry-run`というoptionがあるようなのでそれを利用することで解決。

### LuaのUnit Testを書く

Luaのunit testのツールに関しては、<http://lua-users.org/wiki/UnitTesting> や <https://www.reddit.com/r/lua/comments/haih3z/what_unit_test_frameworks_are_people_using/> を参考にし、fluent-bit内で動くLuaJITで動きそう かつ 導入が簡単なものとして [luaunit](https://github.com/bluebird75/luaunit) というツールを選定しました。これは、 `luaunit.lua` というファイルを配置するだけで動くようになります。  

Luaのdocやサンプルコードを見ている限り、関数や変数にはsnake_caseが用いられているように見えていたのですが、`luaunit`ではcamelCaseやPascalCaseが使われていて、ちょっと違和感があります。
ざっと書いてみたのはこんな感じです。Luaっぽく書くにはどうすれば良いんだ…（頭抱え）。

```lua
local lu = require('luaunit')
local akl = require('append_k8s_logname')

TestAppendK8sLogname = {}
    function TestAppendK8sLogname:setUp()
        create_record = function(labels)
            return {
                kubernetes = {
                    pod_name = "test-server-75675f5897-7ci7o",
                    container_name = "envoy",
                    namespace_name = "test-ns",
                    labels = labels
                }
            }
        end
        self.create_record = create_record
        self.logname_key = "logging.googleapis.com/logName"
    end

    function TestAppendK8sLogname:testAppLabelExists()
        local record = self.create_record({ app = "app" })
        local _, _, got = akl.append_k8s_logname(nil, nil, record)
        lu.assertEquals(got[self.logname_key], "test-ns_app_envoy")
    end

    function TestAppendK8sLogname:testAppLabelNotExists()
        local record = self.create_record({ dummy = "dummy" })
        local _, _, got = akl.append_k8s_logname(nil, nil, record)
        lu.assertEquals(got[self.logname_key], "test-ns_test-server_envoy")
    end
-- end of table TestAppendK8sLogname

local runner = lu.LuaUnit.new()
runner:setOutputType("text")
os.exit( runner:runSuite() )
```

テスト対象の関数をテスト用のファイルから呼び出すためにexportする処理を追加してあげる必要がある。

```lua
local M = {}
M.append_k8s_logname = append_k8s_logname
return M
```

実行してみてテストが通ることを確認する。

```
$ luajit append_k8s_logname_test.lua
..
Ran 2 tests in 0.001 seconds, 2 successes, 0 failures
OK
```

### GHAに実装する

Fluent Bitとluajitをもっといい感じにインストールしたい…と思いつつ下記のように実装。  
後はrenovateを設定すればいい感じになるはず。

<https://github.com/44smkn/fluent-bit-lua-example/blob/main/.github/workflows/test-fluent-bit-config.yaml>

## まとめ

Luaを触ったこと無かったこともあり、Lua Filterは食わず嫌いをしていたけれど触ってみると意外となんとかなるかもなという所感を持ちました。  