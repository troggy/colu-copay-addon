'use strict';

function ColoredCoins($rootScope, profileService, addressService, colu, $log,
                      $q, $timeout, lodash, configService, bitcore) {
  var root = {},
      lockedUtxos = [],
      self = this;


  self.txs = $q.defer(),
  self.assets = $q.defer();
  self._queued = {};
  self.isAvailable = false;
  self.supportedAssets = [];

  // UTXOs "cache"
  root.txidToUTXO = {};
  root.assets = null;
  root.txs = null;
  root.assetsMap = {};
  root.error = null;

  root.setSupportedAssets = function(supportedAssets) {
    self.supportedAssets = supportedAssets;
  };

  $rootScope.$on('Local/NewFocusedWallet', function() {
    root.assets = null;
    root.assetsMap = {};
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
    self.isAvailable = false;
  });

  var _setOngoingProcess = function(name) {
    $rootScope.$emit('Addon/OngoingProcess', name);
    root.onGoingProcess = name;
  };

  var getAssetsFromAddresses = function() {
    root.assets = null;
    root.assetsMap = null;
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
    self.isAvailable = false;
    $rootScope.$emit('ColoredCoins/Error', null);

    $q.all([root.getAssets(), root.getColorTransactions()]).then(function(result) {
      self.isAvailable = true;
      lodash.values(self._queued).forEach(function(callback) {
        $timeout(function() {
          callback(result[0], result[1]);
        }, 1);
      });
      self._queued = {};
    });

    if (self.addresses.length) {
      colu.getTransactions(self.addresses, function(err, body) {
        if (err) {
          self.txs.reject(err);
        } else {
          var txMap = lodash.reduce(body, function(map, tx) {
            map[tx.txid] = tx;
            return map;
          }, {});
          root.txs = txMap;
          self.txs.resolve(txMap);
        }
      });
    } else {
      self.txs.resolve({});
    }

    _setOngoingProcess('Getting assets');
    _fetchAssets(self.addresses, function (err, assetsMap) {
      if (err) {
        var msg = err.error || err.message || err.code;
        root.error = msg;
        self.assets.reject(msg);
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
  };

  $rootScope.$on('Local/BalanceUpdated', function (event, balance) {
    self.addresses = lodash.pluck(balance.byAddress, 'address');
    getAssetsFromAddresses();
  });

  $rootScope.$on('Local/RefreshAssets', function () {
    getAssetsFromAddresses();
  });

  root.whenAvailable = function(cb) {
    if (self.isAvailable) {
      $timeout(function() {
        cb(root.assets, root.txs);
      }, 1);
    } else {
      self._queued[cb] = cb;
    }
  };

  var extractAssets = function(addressInfo) {
    var assets = [];
    if (!addressInfo.utxos || addressInfo.utxos.length == 0) return assets;

    addressInfo.utxos.forEach(function(utxo) {
      if (utxo.assets && utxo.assets.length > 0) {
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

  root.getAssetData = function(assetId, cb) {
    return colu.getAssetHolders(assetId, function(err, data) {
      if (err) return cb(err);
      var args = {
        assetId: assetId,
        utxo: {
          txid: data.someUtxo.split(':')[0],
          index: data.someUtxo.split(':')[1]
        }
      };
      return colu.getAssetMetadata(args, cb);
    });
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
            asset.unitSymbol = root.getAssetSymbol(asset.assetId, asset);
            asset.balanceStr = root.formatAssetAmount(asset.amount, asset);
            asset.lockedBalanceStr = root.formatAssetAmount(asset.lockedAmount, asset);
            asset.availableBalance = asset.amount - asset.lockedAmount;
            asset.availableBalanceStr = root.formatAssetAmount(asset.availableBalance, asset);
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
      groupedAsset = {
                      assetId: asset.assetId,
                      assetName: metadata.assetName,
                      amount: 0,
                      network: network,
                      divisibility: metadata.divisibility,
                      reissuable: metadata.lockStatus == false,
                      icon: _extractAssetIcon(metadata),
                      issuanceTxid: metadata.issuanceTxid,
                      metadata: metadata.metadataOfIssuence.data,
                      lockedAmount: 0,
                      utxos: []
                   };
      assetsMap[asset.assetId] = groupedAsset;
    }
    var isLocked = lodash.includes(self.lockedUtxos, asset.utxo.txid + ":" + asset.utxo.index);
    if (isLocked) {
      groupedAsset.lockedAmount += asset.amount;
    }
    lodash.assign(asset.utxo, { assetAmount: asset.amount, address: address, isLocked: isLocked })
    groupedAsset.utxos.push(asset.utxo);
    groupedAsset.amount += asset.amount;
  };

  var _filterSupportedAssets = function(assetsInfo) {
    var supportedAssets = lodash.pluck(self.supportedAssets, 'assetId');
    assetsInfo = lodash.reject(assetsInfo, function(i) {
      return supportedAssets.indexOf(i.assetId) == -1;
    });
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
      utxos = lodash.chain(utxos)
        .sortBy('assetAmount')
        .reject('isLocked')
        .value();

      // first, let's try to use single utxo with exact amount,
      // then try to use smaller utxos to collect required amount (to reduce fragmentation)
      var totalAmount = 0,
          firstUsedIndex = -1,
          selected = [];

      for (var i = utxos.length - 1; i >= 0; i--) {
        if (utxos[i].assetAmount > amount) continue;
        if (firstUsedIndex < 0) {
          firstUsedIndex = i;
        }
        totalAmount += utxos[i].assetAmount;
        selected.push(utxos[i].txid + ":" + utxos[i].index);
        if (totalAmount >= amount) {
          return { utxos: selected, amount: totalAmount };
        }
      }

      // not enough smaller utxos, use the one bigger, if any
      if (firstUsedIndex < utxos.length - 1) {
        return {
          utxos: [utxos[firstUsedIndex + 1].txid + ":" + utxos[firstUsedIndex + 1].index],
          amount: utxos[firstUsedIndex + 1].assetAmount
        };
      }

      return null;
  };

  var createTransferTx = function(asset, amount, toAddress, cb) {
    var fc = profileService.focusedClient;

    if (amount > asset.availableBalance) {
      return cb({ error: "Cannot transfer more assets then available" }, null);
    }

    var to = [{
      "address": toAddress,
      "amount": amount,
      "assetId": asset.assetId
    }];

    var selectedUtxos = _selectUtxos(asset.utxos, amount);
    if (!selectedUtxos) {
      return cb({ message: 'Not enough assets' });
    }

    var transfer = {
      sendutxo: selectedUtxos.utxos,
      to: to,
      flags: {
        injectPreviousOutput: true
      }
    };

    // we have change. Transfer the rest of asset back to our address
    if (amount < selectedUtxos.amount) {
      fc.getNextChangeAddress({}, function(err, changeAddress) {
        if (err) return cb(err);
        to.push({
          "address": changeAddress.address,
          "amount": selectedUtxos.amount - amount,
          "assetId": asset.assetId
        });
        transfer.to = to;
        colu.createTx('send', transfer, cb);
      });
    } else {
      colu.createTx('send', transfer, cb);
    }
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

  var getSymbolFromConfig = function(assetId) {
    try {
      var asset = lodash.find(self.supportedAssets, function(a) {
        return a.assetId === assetId;
      });
      return { symbol: asset.symbol, pluralSymbol: asset.pluralSymbol };
    } catch (e) {
    }

    return null;
  };

  root.getAssetSymbol = function(assetId, asset) {
    var symbolData = getSymbolFromConfig(assetId);
    return UnitSymbol.create(symbolData) || UnitSymbol.DEFAULT;
  };

  root.formatAssetAmount = function(amount, asset, unitSymbol) {
    asset = asset || {};

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

    if (!asset.unitSymbol) {
      asset.unitSymbol = unitSymbol || root.getAssetSymbol(asset.assetId, asset);
    }

    return formatAssetValue(amount, asset ? asset.divisibility: 0) + ' ' + asset.unitSymbol.forAmount(amount);
  };

  root.broadcastTx = function(rawTx, financeTxId, cb) {
    return colu.broadcastTx(rawTx, financeTxId, cb);
  };

  root.makeTransferTxProposal = function (amount, toAddress, comment, asset, cb) {
    $log.debug("Transfering " + amount + " units(s) of asset " + asset.assetId + " to " + toAddress);

    var fc = profileService.focusedClient;

    createTransferTx(asset, amount, toAddress, function (err, result) {
      if (err) {
        return cb(err.error || err);
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
      makeTxProposal(result.txHex, toAddress, comment, customData, cb);
    });
  };

  var makeTxProposal = function (txHex, toAddress, comment, customData, cb) {
    var fc = profileService.focusedClient;
    var tx = new bitcore.Transaction(txHex);
    $log.debug(JSON.stringify(tx.toObject(), null, 2));

    var inputs = lodash.map(tx.inputs, function (input) {
      input = input.toObject();
      var storedInput = root.txidToUTXO[input.prevTxId + ":" + input.outputIndex]
          || root.scriptToUTXO[input.script || input.scriptPubKey];
      input.publicKeys = storedInput.publicKeys;
      input.path = storedInput.path;
      input.vout = input.vout || input.outputIndex;

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

    cb(null, {
      inputs: inputs,
      outputs: outputs,
      noShuffleOutputs: true,
      validateOutputs: false,
      message: comment,
      payProUrl: null,
      fee: 5000, //todo: hack for BWS not to estimate fee for us
      customData: customData,
      utxosToExclude: root.getColoredUtxos()
    });
  };

  return root;
}


angular.module('copayAddon.colu').provider('coloredCoins', function() {

  this.$get = function($rootScope, profileService, addressService, colu, $log,
                        $q, $timeout, lodash, configService, bitcore) {
      return new ColoredCoins($rootScope, profileService, addressService, colu, $log,
                            $q, $timeout, lodash, configService, bitcore);
  };
});
