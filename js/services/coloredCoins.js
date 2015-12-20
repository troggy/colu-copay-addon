'use strict';

function ColoredCoins($rootScope, profileService, addressService, colu, $log,
                      $q, lodash, configService, bitcore) {
  var root = {},
      lockedUtxos = [],
      self = this;
      
      
  self.txs = $q.defer(),
  self.assets = $q.defer();

  // UTXOs "cache"
  root.txidToUTXO = {};
  root.assets = null;
  root.assetsMap = {};
  root.error = null;

  var disableFocusListener = $rootScope.$on('Local/NewFocusedWallet', function() {
    root.assets = null;
    root.assetsMap = {};
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
  });

  var _setOngoingProcess = function(name) {
    $rootScope.$emit('Addon/OngoingProcess', name);
    root.onGoingProcess = name;
  };

  var disableBalanceListener = $rootScope.$on('Local/BalanceUpdated', function (event, balance) {
    root.assets = null;
    root.assetsMap = null;
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
    $rootScope.$emit('ColoredCoins/Error', null);
    var addresses = lodash.pluck(balance.byAddress, 'address');
    
    colu.getTransactions(addresses, function(err, body) {
      if (err) {
        self.txs.reject(err);
      } else {
        var txMap = lodash.reduce(body, function(map, tx) {
          map[tx.txid] = tx;
          return map;
        }, {});

        self.txs.resolve(txMap);
      }
    });

    _setOngoingProcess('Getting assets');
    _fetchAssets(addresses, function (err, assetsMap) {
      if (err) {
        var msg = err.error || err.message;
        root.error = msg;
        root.assets.reject(msg);
        $rootScope.$emit('ColoredCoins/Error', msg);
        $log.error(msg);
      } else {
        root.assets = lodash.values(assetsMap);
        self.assets.resolve(root.assets);
        root.assetsMap = assetsMap;
        $rootScope.$emit('ColoredCoins/AssetsUpdated', root.assets);
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
        var utxoToKeep = lodash.pick(utxo, [ 'txid', 'index', 'value', 'scriptPubKey'])
        var utxoAssets = lodash
          .chain(utxo.assets)
          .reduce( function(map, asset) {
            var assetSummary = map[asset.assetId];
            if (!assetSummary) {
              map[asset.assetId] = assetSummary = { 
                amount: 0, 
                assetId: asset.assetId,
                utxo: utxoToKeep
              };
            }
            assetSummary.amount += asset.amount;
            return map;
          }, {})
          .values()
          .value();
        assets = assets.concat(utxoAssets);
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

  root.getColorTransactions = function() {
    return self.txs.promise;
  };
  
  root.getAssets = function() {
    return self.assets.promise;
  };

  root.getColoredUtxos = function() {
    return lodash.map(lodash.flatten(lodash.pluck(root.assets, 'utxos')), function(utxo) { return utxo.txid + ":" + utxo.index; });
  };

  var _fetchAssets = function(addresses, cb) {
    if (addresses.length == 0) {
      return cb(null, {});
    }
    _updateLockedUtxos(function(err) {
      if (err) { return cb(err); }

      var assetsMap = {},
          assetPromises = lodash.map(addresses, function (address) {
            return _getAssetsForAddress(address, assetsMap);
          });
      
      $q.all(assetPromises).then(function() {
        lodash.each(lodash.values(assetsMap), function(asset) {
            asset.balanceStr = root.formatAssetAmount(asset.amount, asset);
        });
        cb(null, assetsMap);
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
  
  var _selectUtxos = function(utxos, amount) {
      utxos = lodash.sortBy(utxos, 'assetAmount');
      
      // first, let's try to use single utxo with exact amount,
      // then try to use smaller utxos to collect required amount (to reduce fragmentation)
      var totalAmount = 0,
          firstUsedIndex = -1,
          addresses = [];
      for (var i = utxos.length - 1; i >= 0; i--) {
        if (utxos[i].assetAmount > amount) continue;
        if (!firstUsedIndex) { 
          firstUsedIndex = i;
        }
        totalAmount += utxos[i].assetAmount;
        addresses.push(utxos[i].address);
        if (totalAmount >= amount) {
          return { addresses: addresses, amount: totalAmount };
        }
      }

      // not enough smaller utxos, use the one bigger, if any
      if (firstUsedIndex < utxos.length - 1) {
        return { 
          addresses: [utxos[firstUsedIndex + 1].address], 
          amount: utxos[firstUsedIndex + 1].assetAmount
        };
      }
      
      return null;
  };

  var createTransferTx = function(asset, amount, toAddress, cb) {
    if (amount > asset.amount) {
      return cb({ error: "Cannot transfer more assets then available" }, null);
    }

    var to = [{
      "address": toAddress,
      "amount": amount,
      "assetId": asset.assetId
    }];
    
    var utxos = _selectUtxos(asset.utxos, amount);
    if (!utxos) {
      return cb({ message: 'Not enough assets' });
    }

    // transfer the rest of asset back to our address
    if (amount < utxos.amount) {
      to.push({
        "address": utxos.addresses[0],
        "amount": utxos.amount - amount,
        "assetId": asset.assetId
      });
    }

    var transfer = {
      from: utxos.addresses,
      to: to,
      flags: {
        injectPreviousOutput: true
      }
    };

    colu.createTx(utxos.addresses[0], 'send', transfer, cb);
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
  
  root.sendTransferTxProposal = function (amount, toAddress, asset, cb) {
    if (asset.locked) {
      return cb({ message: "Cannot transfer locked asset" });
    }
    $log.debug("Transfering " + amount + " units(s) of asset " + asset.assetId + " to " + toAddress);

    var fc = profileService.focusedClient;
    if (fc.isPrivKeyEncrypted()) {
      profileService.unlockFC(function (err) {
        if (err) return cb(err);
        return transferAsset(amount, toAddress, asset, cb);
      });
      return;
    }

    createTransferTx(asset, amount, toAddress, function (err, result) {
      if (err) { 
        return cb(err);
      }

      var customData = {
        asset: {
          action: 'transfer',
          assetId: asset.assetId,
          assetName: asset.metadata.assetName,
          icon: asset.icon,
          amount: amount,
          balanceStr: root.formatAssetAmount(amount, asset)
        },
        financeTxId: result.financeTxid
      };
      sendTxProposal(result.txHex, toAddress, customData, cb);
    });
  };

  var sendTxProposal = function (txHex, toAddress, customData, cb) {
    var fc = profileService.focusedClient;
    var tx = new bitcore.Transaction(txHex);
    $log.debug(JSON.stringify(tx.toObject(), null, 2));

    var inputs = lodash.map(tx.inputs, function (input) {
      input = input.toObject();
      var storedInput = root.txidToUTXO[input.prevTxId + ":" + input.outputIndex]
          || root.scriptToUTXO[input.script || input.scriptPubKey];
      input.publicKeys = storedInput.publicKeys;
      input.path = storedInput.path;

      if (!input.txid) {
        input.txid = input.prevTxId;
      }
      if (!input.satoshis) {
        input.satoshis = 0;
      }
      return input;
    });

    var outputs = lodash.chain(tx.outputs)
        .map(function (o) {
          return { script: o.script.toString(), amount: o.satoshis };
        })
        .value();

    // for Copay to show recipient properly
    outputs[0].toAddress = toAddress;

    fc.sendTxProposal({
      type: 'external',
      inputs: inputs,
      outputs: outputs,
      noOutputsShuffle: true,
      message: '',
      payProUrl: null,
      feePerKb: 43978,
      fee: 5000,
      customData: customData,
      utxosToExclude: root.getColoredUtxos()
    }, function (err, txp) {
      if (err) {
        return cb(err);
      }
      txp.changeAddress = inputs[0].address;
      return cb(null, txp);
    });
  };


  return root;
}


angular.module('copayAddon.coloredCoins').service('coloredCoins', ColoredCoins);
