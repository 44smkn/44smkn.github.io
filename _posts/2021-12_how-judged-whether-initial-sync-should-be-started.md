---
title: 'MongoDBのReplicaSetでInitial Syncを実行するか判断している処理を追う'
date: '2021-12-23'
category: 'Software Engineering'
thumbnail: '/thumbnails/how-judged-whether-initial-sync-should-be-started.png'
---

MongoDBサポートの方から、MongoDB ReplicaSetのSecondaryをリストアする方法は2つあると聞きました。  
1つはInitial Syncを利用してSecondayをseedする方法、もう1つはファイルを直接コピーしてSecondaryをseedする方法です。  
後者はネットワークを介さずに直接データをコピーしてくるので非常に高速です。AWSであれば、EBSスナップショットからボリュームを作りattachするだけで良いので楽ですしね。  
後者はInitial Syncが走らないわけですが、どのようにInitial Syncを行わない判定をしているのか非常に気になりました。  
雰囲気でしかC++を読めないですが、処理を追っていこうと思います。    

[https://docs.mongodb.com/v5.0/tutorial/restore-replica-set-from-backup/#restore-a-replica-set-from-mongodb-backups:card]

[:contents]

以前の自分のブログから転記しました。

[https://44smkn.hatenadiary.com/entry/2021/12/23/223010:card]

## Initial Syncとは

[https://docs.mongodb.com/manual/core/replica-set-sync/:card]

データセットを最新の状態に維持するために、ReplicaSetのSecondaryメンバは他のメンバからデータを同期・複製する必要があります。  
MongoDBでのデータの同期は2つの形式があります。1つが今回取り上げるInitial Syncで、もう一つがReplicationです。  
前者は、新しいメンバに対してすべてのデータセットを与えます。そしてデータセットに対して継続的に変更を適用するのが後者です。  

Initial Syncの実装方法は、`Logical Initial Sync`と`File Copy Based Initial Sync`の2つです。  
後者は、[SERVER-57803](https://jira.mongodb.org/browse/SERVER-57803) を見る限り、v5.1.0からEnterprise Serverのみに実装されたようです。feature flagが`true`になるのも[SERVER-52337](https://jira.mongodb.org/browse/SERVER-52337)から察するにv5.2.0からみたいなので、かなり新しい機能のようです。  

Initial Sync自体の処理に関しては、かなりドキュメントが整備されています。  

[https://github.com/mongodb/mongo/blob/master/src/mongo/db/repl/README.md#initial-sync:card]

今回のInitial Syncを行うかという判断に関しては、実装方法に関わらない共通の処理でしたので処理が非常に追いやすいはずでした。  
がC++をあまりに雰囲気で読みすぎて時間がかかってしまった…。

## データをコピーしてSecondaryのメンバをseedする処理

[https://docs.mongodb.com/v5.0/tutorial/restore-replica-set-from-backup/:title]

1. ファイルシステムのスナップショットからデータベースのファイル群を取得する
1. Standaloneでmongodを起動する
1. Local DBを削除して一度シャットダウンする
1. シングルノードの ReplicaSetとして起動する
1. PrimaryのdbPath配下のファイルをSecondaryにコピーする、つまりLocalDBを一度削除して新しく作成されたReplicaSetのメタデータを保持している状態
1. Secondaryを ReplicaSetに追加する

## Initial Syncを実行するか判断する処理を追う

コードは読みやすいようにいくつか改変を加えています。

### Initial Syncを実行するかどうかを明示的に判断している処理

Initial Syncを実行するかを判断しているのは[replication_coordinator_impl.cpp#L836-L852](https://github.com/mongodb/mongo/blob/6ef5da0c8cdce8a4398ad00ede82ffa674f4e62c/src/mongo/db/repl/replication_coordinator_impl.cpp#L836-L852)の中にある `const auto needsInitialSync = lastOpTime.isNull() || _externalState->isInitialSyncFlagSet(opCtx);` という条件ですが後者は実行時の設定次第で変わるようなので、`lastOpTime.isNull()`の結果が肝要ではと推測します。  
ではどのようにこの値を取得しているのかが気になってきます。

```cpp
// replication_coordinator_impl.cpp#L836-L852
void ReplicationCoordinatorImpl::_startDataReplication(OperationContext* opCtx) {
    // Check to see if we need to do an initial sync.
    const auto lastOpTime = getMyLastAppliedOpTime();
    const auto needsInitialSync =
        lastOpTime.isNull() || _externalState->isInitialSyncFlagSet(opCtx);
    if (!needsInitialSync) {
        LOGV2(4280512, "No initial sync required. Attempting to begin steady replication");
        // Start steady replication, since we already have data.
        // (omitted by author...)
        return;
    }
}
```

### エントリポイントから追っていき、どのようにlastOpTimeが設定されているか探る

まず `mongod`のエントリポイントを確認します。  
[mongod.cpp](https://github.com/mongodb/mongo/blob/c08a726e61157ae501c28cf7e222e16d49954fbf/src/mongo/db/mongod.cpp)で呼ばれている関数を追っていくと、[mongod_main.cpp#L707](https://github.com/mongodb/mongo/blob/3c2effceee65bbf6bcbfcd13a4d2087d15a81aa1/src/mongo/db/mongod_main.cpp#L707)にて、`replCoord->startup(startupOpCtx.get(), lastShutdownState);` という処理が見つかります。  
どうやらここで ReplicaSet関連の処理が呼ばれているようです。

```cpp
// mongod.cpp
int main(int argc, char* argv[]) {
    mongo::quickExit(mongo::mongod_main(argc, argv));
}
---
// mongod_main.cpp#L707
ExitCode _initAndListen(ServiceContext* serviceContext, int listenPort) {
   if (!storageGlobalParams.readOnly) {
        auto replCoord = repl::ReplicationCoordinator::get(startupOpCtx.get());
        replCoord->startup(startupOpCtx.get(), lastShutdownState);
    }
}
```

呼ばれている`startup`関数の中では[replication_coordinator_impl.cpp#L929](https://github.com/mongodb/mongo/blob/1f29a83d4cfd61e9d724633532d55b67bbc60148/src/mongo/db/repl/replication_coordinator_impl.cpp#L929)にてローカルストレージからレプリケーション設定の読み込みが宣言されているようです。  
もし有効な設定であれば、[replication_coordinator_impl.cpp#L683](https://github.com/mongodb/mongo/blob/1f29a83d4cfd61e9d724633532d55b67bbc60148/src/mongo/db/repl/replication_coordinator_impl.cpp#L683)のようにコールバックでスケジュールされる `_finishLoadLocalConfig` 関数の中で、`_setMyLastAppliedOpTimeAndWallTime()`が呼ばれてoptimeを設定しています。  
ただし、これが設定されるのはoptimeのエントリがLocalDBにある場合のみです。  
[replication_coordinator_external_state_impl.cpp#L786-L813](https://github.com/mongodb/mongo/blob/909c30b0ff8488299215ccd5ea96d6e3b625433d/src/mongo/db/repl/replication_coordinator_external_state_impl.cpp#L786-L813) の関数が呼ばれていて、それを見るとLocalDBの`oplog.rs`の最新のエントリを取得していることが分かります。

```cpp
// replication_coordinator_impl.cpp#L866-L867
void ReplicationCoordinatorImpl::startup(OperationContext* opCtx,
                                         StorageEngine::LastShutdownState lastShutdownState) {
    bool doneLoadingConfig = _startLoadLocalConfig(opCtx, lastShutdownState);
}
---
// replication_coordinator_impl.cpp#L683
void ReplicationCoordinatorImpl::_finishLoadLocalConfig(
    const executor::TaskExecutor::CallbackArgs& cbData,
    const ReplSetConfig& localConfig,
    const StatusWith<OpTimeAndWallTime>& lastOpTimeAndWallTimeStatus,
    const StatusWith<LastVote>& lastVoteStatus) {

    OpTimeAndWallTime lastOpTimeAndWallTime = OpTimeAndWallTime();
    if (!isArbiter) {
        if (lastOpTimeAndWallTimeStatus.isOK()) {
            lastOpTimeAndWallTime = lastOpTimeAndWallTimeStatus.getValue();
        }
    }

    const auto lastOpTime = lastOpTimeAndWallTime.opTime;
    // Set our last applied and durable optimes to the top of the oplog, if we have one.
    if (!lastOpTime.isNull()) {
        _setMyLastAppliedOpTimeAndWallTime(lock, lastOpTimeAndWallTime, isRollbackAllowed);
    } 
}
---
// replication_coordinator_external_state_impl.cpp#L786-L813
StatusWith<OpTimeAndWallTime> ReplicationCoordinatorExternalStateImpl::loadLastOpTimeAndWallTime(
    OperationContext* opCtx) {
    try {
if (!writeConflictRetry(
                opCtx, "Load last opTime", NamespaceString::kRsOplogNamespace.ns().c_str(), [&] {
                    return Helpers::getLast(
                        opCtx, NamespaceString::kRsOplogNamespace.ns().c_str(), oplogEntry);
                })) { /* ... */ }
    }
}
---
// namespace_string.cpp
const NamespaceString NamespaceString::kRsOplogNamespace(NamespaceString::kLocalDb, "oplog.rs");
---
// namespace_string.h
class NamespaceString {
    // Namespace for the local database
    static constexpr StringData kLocalDb = "local"_sd;
}
```


## まとめ

実際にコードを追っていくと、ドキュメントに書いてある手順も非常に腑に落ちていいですね。  
ファイルの読み込みをしてオブジェクトにmapして、そのメンバの値によって処理を行うという一連の流れを追えたのも良かったです。