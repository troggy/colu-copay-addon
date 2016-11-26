'use strict';

angular.module('copayAddon.colu')
  .service('coluSdk', function(profileService, $rootScope, $log, $q, coluConfig) {
    var root = {};

    var coluPromise = function(network) {
      return $q(function(resolve, reject) {
        if (coluConfig.mode !== 'sdk') {
          return resolve({});
        }
        if (!coluConfig.apiKey && network == 'livenet') {
          return reject("Must have apiKey for livenet");
        }

        var colu = new Colu({
          network: network,
          apiKey: network == 'livenet' ? coluConfig.apiKey : undefined
        });
        colu.on('connect', function () {
          resolve(colu);
        });
        colu.init();
      });
    };

    var handleColuError = function(err) {
      $log.error('Colu error: ' + err);
      return err;
    };

    var colu = {
      testnet: coluPromise('testnet').catch(handleColuError),
      livenet: coluPromise('livenet').catch(handleColuError)
    };

    var withColu = function(func) {
      var network = profileService.focusedClient.credentials.network;
      colu[network].then(func).catch(handleColuError);
    };

    var withLog = function(cb) {
      return function(err, body) {
        var errStr = err ? JSON.stringify(err) : err;
        var bodyStr = body ? JSON.stringify(body).substring(0, 3000) + ".." : body;
        $log.debug("Colu returned: [" + errStr + "] " + bodyStr);
        return cb(err, body);
      };
    };

    $rootScope.$on('ColoredCoins/BroadcastTxp', function(e, txp) {
      root.broadcastTx(txp.raw, txp.customData.financeTxId, function (err, body) {
        if (err) {
          return $rootScope.$emit('ColoredCoins/Broadcast:error', "Colu returns error");
        }

        $rootScope.$emit('ColoredCoins/Broadcast:success');
      });
    });

    root.broadcastTx = function(signedTxHex, lastTxId, cb) {
      withColu(function(colu) {
        $log.debug('Broadcasting tx via Colu: ' + JSON.stringify({
          last_txid: lastTxId,
          tx_hex: signedTxHex
        }));
        colu.transmit(signedTxHex, lastTxId, withLog(cb));
      });
    };

    root.getAssetMetadata = function(asset, cb) {
      withColu(function(colu) {
        colu.coloredCoins.getAssetMetadata(asset.assetId, asset.utxo.txid + ":" + asset.utxo.index, withLog(cb));
      });
    };

    root.getAddressInfo = function(address, cb) {
      withColu(function(colu) {
        colu.coloredCoins.getAddressInfo(address, withLog(cb));
      });
    };

    root.getAssetHolders = function(assetId, cb) {
      withColu(function(colu) {
        colu.coloredCoins.getStakeHolders(assetId, withLog(cb));
      });
    };

    root.issueAsset = function(args, cb) {
      withColu(function(colu) {
        $log.debug("Issuing asset via Colu: " + JSON.stringify(args));
        colu.issueAsset(args, withLog(cb));
      });

    };

    root.createTx = function(type, args, cb) {
      withColu(function(colu) {
        $log.debug("Creating " + type + " asset tx via Colu: " + JSON.stringify(args));
        colu.buildTransaction(type, args, withLog(cb));
      });
    };

    root.getTransactions = function(addresses, cb) {
      withColu(function(colu) {
        $log.debug("Getting transactions for addresses via Colu..");
        colu.getTransactions(addresses, withLog(cb));
      });
    };

    return root;
});
