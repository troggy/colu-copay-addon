'use strict';

function ColoredCoins($rootScope, profileService, addressService, colu, $log,
                      $q, lodash, configService) {
  var root = {},
      lockedUtxos = [],
      self = this;

  // UTXOs "cache"
  root.txidToUTXO = {};
  root.assets = null;
  root.error = null;

  var disableFocusListener = $rootScope.$on('Local/NewFocusedWallet', function() {
    root.assets = null;
    root.error = null;
  });

  var _setOngoingProcess = function(name) {
    $rootScope.$emit('Addon/OngoingProcess', name);
    root.onGoingProcess = name;
  };

  var disableBalanceListener = $rootScope.$on('Local/BalanceUpdated', function (event, balance) {
    root.assets = null;
    root.error = null;
    $rootScope.$emit('ColoredCoins/Error', null);
    var addresses = lodash.pluck(balance.byAddress, 'address');

    _setOngoingProcess('Getting assets');
    _fetchAssets(addresses, function (err, assets) {
      if (err) {
        var msg = err.error || err.message;
        root.error = msg;
        $rootScope.$emit('ColoredCoins/Error', msg);
        $log.error(msg);
      } else {
        root.assets = assets;
        $rootScope.$emit('ColoredCoins/AssetsUpdated', assets);
      }
      _setOngoingProcess();
    });
  });

  $rootScope.$on('$destroy', function() {
    disableBalanceListener();
    disableFocusListener();
  });

  var extractAssets = function(addressInfo) {
    var assets = [];
    if (!addressInfo.utxos || addressInfo.utxos.length == 0) return assets;

    addressInfo.utxos.forEach(function(utxo) {
      if (utxo.assets || utxo.assets.length > 0) {
        utxo.assets.forEach(function(asset) {
          assets.push({ 
            assetId: asset.assetId,
            amount: asset.amount,
            utxo: lodash.pick(utxo, [ 'txid', 'index', 'value', 'scriptPubKey']) 
          });
        });
      }
    });

    return assets;
  };

  var _updateLockedUtxos = function(cb) {
    var fc = profileService.focusedClient;
    fc.getUtxos({}, function(err, utxos) {
      if (err) { return cb(err); }
      _setLockedUtxos(utxos);

      root.txidToUTXO = {};
      root.scriptToUTXO = {};
      lodash.each(utxos, function(utxo) {
        root.txidToUTXO[utxo.txid + ":" + utxo.vout] = utxo;
        root.scriptToUTXO[utxo.scriptPubKey] = utxo;
      });
      cb();
    });
  };

  var _setLockedUtxos = function(utxos) {
    self.lockedUtxos = lodash.chain(utxos)
        .filter('locked')
        .map(function(utxo) { return utxo.txid + ":" + utxo.vout; })
        .value();
  };

  var _extractAssetIcon = function(metadata) {
    var icon = lodash.find(lodash.property('metadataOfIssuence.data.urls')(metadata) || [], function(url) { return url.name == 'icon'; });
    return icon ? icon.url : null;
  };

  root.init = function() {};

  root.getColoredUtxos = function() {
    return lodash.map(root.assets, function(asset) { return asset.utxo.txid + ":" + asset.utxo.index; });
  };

  var _fetchAssets = function(addresses, cb) {
    var assets = [];
    if (addresses.length == 0) {
      return cb(null, assets);
    }
    _updateLockedUtxos(function(err) {
      if (err) { return cb(err); }

      var assetsMap = {},
          assetPromises = lodash.map(addresses, function (address) {
            return _getAssetsForAddress(address, assetsMap);
          });
      
      $q.all(assetPromises).then(function() {
        cb(null, lodash.values(assetsMap));
      }, function(err) {
        cb(err);
      });
    });
  };
  
  var _addColoredUtxoToMap = function(asset, metadata, address, network, assetsMap) {
    var groupedAsset = assetsMap[asset.assetId];
    if (!groupedAsset) {
      var isLocked = lodash.includes(self.lockedUtxos, asset.utxo.txid + ":" + asset.utxo.index);
      groupedAsset = { 
                      assetId: asset.assetId,
                      amount: 0,
                      network: network,
                      divisible: metadata.divisibility,
                      reissuable: metadata.lockStatus == false,
                      icon: _extractAssetIcon(metadata),
                      issuanceTxid: metadata.issuanceTxid,
                      metadata: metadata.metadataOfIssuence.data,
                      locked: isLocked,
                      utxos: []
                   };
      assetsMap[asset.assetId] = groupedAsset;
    }
    lodash.assign(asset.utxo, { assetAmount: asset.amount, address: address })
    groupedAsset.utxos.push(asset.utxo);
    groupedAsset.amount += asset.amount;
  };
  
  var _filterSupportedAssets = function(assetsInfo) {
    var config = configService.getDefaults();
    if (config.assets && config.assets.supported) {
      var supportedAssets = lodash.pluck(config.assets.supported, 'assetId');
      assetsInfo = lodash.reject(assetsInfo, function(i) {
        return supportedAssets.indexOf(i.assetId) == -1;
      });
    }
    return assetsInfo;
  }

  var _getAssetsForAddress = function(address, assetsMap) {
    return $q(function(resolve, reject) {
      colu.getAddressInfo(address, function(err, addressInfo) {
        if (err) { return reject(err); }

        var assetsInfo = extractAssets(addressInfo);
        $log.debug("Assets for " + address + ": " + JSON.stringify(assetsInfo));
        assetsInfo = _filterSupportedAssets(assetsInfo);
        
        var network = profileService.focusedClient.credentials.network;
        assetData = assetsInfo.map(function(asset, i) {
          return $q(function(resolve, reject) {
            colu.getAssetMetadata(asset, function(err, metadata) {
              if (err) { return reject(err); }
              _addColoredUtxoToMap(asset, metadata, address, network, assetsMap);
              resolve();
            });
          });
        });

        $q.all(assetData).then(function() {
          resolve();
        }, function() {
          reject();
        });
      });
    });
  };

  root.createTransferTx = function(asset, amount, toAddress, cb) {
    if (amount > asset.amount) {
      return cb({ error: "Cannot transfer more assets then available" }, null);
    }

    var to = [{
      "address": toAddress,
      "amount": amount,
      "assetId": asset.assetId
    }];

    // transfer the rest of asset back to our address
    if (amount < asset.amount) {
      to.push({
        "address": asset.address,
        "amount": asset.amount - amount,
        "assetId": asset.assetId
      });
    }

    var transfer = {
      from: [asset.address],
      to: to,
      flags: {
        injectPreviousOutput: true
      }
    };

    colu.createTx(asset.address, 'send', transfer, cb);
  };

  root.createIssueTx = function(issuance, cb) {

    var fc = profileService.focusedClient;
    addressService.getAddress(fc.credentials.walletId, true, function(err, freshAddress) {
      if (err) { return cb(err); }

      var metadata = lodash.pick(issuance, ['assetName', 'description', 'issuer', 'urls', 'userData']);
      // convert { name: 'Color', value: 'Blue' } to { "Color" : "Blue" }
      metadata.userData = lodash.reduce(metadata.userData, function(result, field) {
        if (field.name !== '' && field.value !== '') {
          result[field.name] = field.value;
        }
        return result;
      }, {});

      var issuanceOpts = {
        divisibility: 0,
        amount: issuance.amount,
        reissueable: issuance.reissuable || false,
        transfer: [{
          'address': freshAddress,
          'amount': issuance.amount
        }],
        metadata: metadata
      };

      colu.issueAsset(issuanceOpts, cb);
    });
  };
  
  var getSymbolFromMetadata = function(asset) {
    try {
      return asset.metadata.userData.symbol;
    } catch (e) {
    }
    
    return null;
  };
  
  var getSymbolFromConfig = function(assetId) {
    try {
      return lodash.find(configService.getDefaults().assets.supported, function(a) {
        return a.assetId === assetId;
      }).symbol;
    } catch (e) {
    }
    
    return null;
  };

  root.getAssetSymbol = function(assetId, asset) {
    var symbolData = getSymbolFromMetadata(asset) || getSymbolFromConfig(assetId);
    return UnitSymbol.create(symbolData) || UnitSymbol.DEFAULT;
  };

  root.formatAssetAmount = function(amount, asset, unitSymbol) {

    function formatAssetValue(value, decimalPlaces) {
      if (!value) {
        return '0';
      }
      value = (value / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces);
      var x = value.split('.');
      var x0 = x[0];
      var x1 = x[1];

      x0 = x0.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return decimalPlaces > 0 ? x0 + '.' + x1 : x0;
    }
    
    unitSymbol = unitSymbol || root.getAssetSymbol(asset.assetId, asset);

    return formatAssetValue(amount, asset ? asset.divisible: 0) + ' ' + unitSymbol.forAmount(amount);
  };


  return root;
}


angular.module('copayAddon.coloredCoins').service('coloredCoins', ColoredCoins);
