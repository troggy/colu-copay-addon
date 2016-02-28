'use strict';

angular.module('copayAddon.colu')
  .provider('coluRpc', function () {

  var that = this;

  this.rpcConfig = {
    livenet: {
      rpcHost: '',      // Colu JSON RPC host
      rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth 
      rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth 
    },
    testnet: {
      rpcHost: '',      // Colu JSON RPC host
      rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth 
      rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth 
    }
  };
    
  this.configure = function(config) {
    this.rpcConfig = config;
  }

  this.$get = function(profileService, $rootScope, $log, $http) {
    var root = {};
    
    that._handleDataResponse = function(response, cb) {
      var data = response.data;
      if (data.error) {
        cb(data.error);
      } else if (data.errorMessage) {
        cb(data.errorMessage);
      } else {
        cb(null, data.result);
      }
    };

    that._handleErrorResponse = function(response, cb) {
      $log.error(response.status + ': ' + JSON.stringify(response.data));
      cb(response.status == 500 ? 'Server error' : response.data);
    };

    var withLog = function(cb) {
      return function(err, body) {
        var errStr = err ? JSON.stringify(err) : err;
        var bodyStr = body ? JSON.stringify(body).substring(0, 3000) + ".." : body;
        $log.debug("Colu returned: [" + errStr + "] " + bodyStr);
        return cb(err, body);
      };
    };
    
    var _request = function(method, data, cb) {
      var network = profileService.focusedClient.credentials.network,
          rpcConfig = that.rpcConfig[network];
      

      if (rpcConfig.authName) {
        config.headers = {
          Authorization: 'Basic ' + $base64.encode(rpcConfig.authName + ':' + rpcConfig.authSecret)
        };
      }
      
      var request = {
        url: rpcConfig.baseUrl,
        method: 'POST',
        data: {
          method: method,
          jsonrpc: "2.0",
          id: "1",
          params: data
        }
      };
      $http(request).then(function successCallback(response) {
        that._handleDataResponse(response, withLog(cb));
      }, function errorCallback(response) {
        that._handleErrorResponse(response, withLog(cb));
      });
    };
    
    $rootScope.$on('ColoredCoins/BroadcastTxp', function(e, txp) {
      root.broadcastTx(txp.raw, txp.customData.financeTxId, function (err, body) {
        if (err) {
          return $rootScope.$emit('ColoredCoins/Broadcast:error', { name: 'ERROR', message: "Colu returns error" });
        }

        $rootScope.$emit('ColoredCoins/Broadcast:success');
      });
    });

    root.broadcastTx = function(signedTxHex, lastTxId, cb) {
      $log.debug('Broadcasting tx via Colu: ' + JSON.stringify({
        last_txid: lastTxId,
        tx_hex: signedTxHex
      }));
      var params = {
        signedTxHex: signedTxHex,
        lastTxid: lastTxId
      };  
            
      _request("transmit", params, cb);  
    };

    root.getAssetMetadata = function(asset, cb) {
      var params = {
        assetId: asset.assetId,
        utxo: asset.utxo.txid + ":" + asset.utxo.index
      };
            
      _request("getAssetMetadata", params, cb);  
    };

    root.getAddressInfo = function(address, cb) {
      _request("coloredCoins.getAddressInfo", { address: address }, cb);  
    };

    root.issueAsset = function(params, cb) {
      $log.debug("Issuing asset via Colu: " + JSON.stringify(params));
            
      _request("issueAsset", { params : params }, cb);  
    };

    root.createTx = function(type, args, cb) {
      $log.debug("Creating " + type + " asset tx via Colu: " + JSON.stringify(args));
      var params = {
        type: type,
        args: args
      };  
            
      _request("buildTransaction", params, cb);  
    };
    
    root.getTransactions = function(addresses, cb) {
      $log.debug("Getting transactions for addresses via Colu..");
      var params = {
        addresses: addresses
      };
            
      _request("getTransactions", params, cb);  
    };

    return root;
  }
  
});
