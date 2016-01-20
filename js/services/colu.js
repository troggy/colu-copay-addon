'use strict';


angular.module('copayAddon.colu').service('colu', function (profileService, $rootScope, feeService, $log, $q) {

  var root = {},
      COLU_API_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI3cjBnZ3lAZ21haWwuY29tIiwiZXhwIjoiMjAxNS0xMS0wOVQwMTozMToxMC45MzNaIiwidHlwZSI6ImFwaV9rZXkifQ.VnT2HH2rl1DBJQ3rwZRjh1vPhNoNjesYfAg07yq0OU8';

  var coluPromise = function(network) {
    return $q(function(resolve, reject) {
      var colu = new Colu({
        network: network,
        apiKey: network == 'livenet' ? COLU_API_KEY : undefined
      });
      colu.on('connect', function () {
        resolve(colu);
      });
      colu.init();
    });
  };

  var colu = {
    testnet: coluPromise('testnet'),
    livenet: coluPromise('livenet')
  };

  var withColu = function(func) {
    var network = profileService.focusedClient.credentials.network;
    colu[network].then(func);
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
